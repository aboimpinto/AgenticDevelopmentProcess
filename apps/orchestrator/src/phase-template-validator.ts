/**
 * Versioned structural contract for the durable phase documents used by
 * Continue Implementation.  This module deliberately validates shape, not
 * whether a worker's prose or outcome is correct.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadPhaseExecutionContract,
  readPhaseDocumentNumber,
  validatePhaseTaskLedgerParity,
} from "./phase-execution-contract.js";

export const PHASE_TEMPLATE_VERSION = "hepha-phase-template/v1";
export const PHASE_TEMPLATE_INVALID_CODE = "phase_template_invalid" as const;

export const CANONICAL_PHASE_TEMPLATE = {
  version: PHASE_TEMPLATE_VERSION,
  featureTasks: [
    "| Phase | <phase work> | Status | <evidence / notes> |",
    "| --- | --- | --- | --- |",
    "| <number> | <phase work> | PENDING | <evidence / notes> |",
  ],
  phaseDocument: [
    "# Phase <number> - <title>",
    "**Status:** PENDING",
    "## Phase Task Ledger",
    "- [ ] <durable task>",
    "## Quality Gate Evidence",
    "| Gate | Decision | Evidence / Justification |",
    "| Changed files | missing | <reason> |",
    "| Tests | missing | <reason> |",
    "| Gherkin/Playwright E2E | not applicable | <reason> |",
    "| Code review | missing | <reason> |",
  ],
  skippedPhase: [
    "**Status:** SKIPPED",
    "## Phase Task Ledger",
    "- [ ] <scope-audit item preserved as durable evidence>",
    "## Skip Rationale",
    "<specific reason the phase is not applicable>",
  ],
} as const;

export interface PhaseTemplateDiagnostic {
  readonly code: typeof PHASE_TEMPLATE_INVALID_CODE;
  readonly file: string;
  readonly line: number;
  readonly expected: string;
  readonly actual: string;
  readonly message: string;
}

export interface PhaseTemplateValidationResult {
  readonly version: typeof PHASE_TEMPLATE_VERSION;
  readonly valid: boolean;
  readonly diagnostics: readonly PhaseTemplateDiagnostic[];
}

export interface PhaseTemplateDocuments {
  readonly featureTasks: string | null;
  readonly phaseDocuments: Readonly<Record<string, string | null>>;
}

export interface PhaseTemplateValidationScope {
  /** Omit for an explicit whole-feature audit; dispatch validates only its selected phase. */
  readonly phaseNumbers?: readonly number[];
}

interface PhaseTemplateDocumentIdentity {
  readonly file: string;
  readonly phaseNumber: number;
}

const STATUS_VALUES = new Set([
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
  "BLOCKED",
  "FAILED",
  "CHECKPOINT_IN_PROGRESS",
  "CODE_REVIEW_IN_PROGRESS",
  "AWAITING_REVIEW",
  "AWAITING_USER_ACCEPTANCE",
]);
const REQUIRED_GATES = ["changed files", "tests", "gherkin/playwright e2e", "code review"] as const;
const TASK_LEDGER_HEADINGS = new Set(["phase task ledger", "task ledger"]);
const MISSING = "<missing>";

/**
 * Pure validator. Callers that already have document content should use this
 * rather than the filesystem adapter so the same canonical rules are applied
 * in agent repair verification and normal dispatch.
 */
export function validatePhaseTemplateDocuments(
  input: PhaseTemplateDocuments,
  scope: PhaseTemplateValidationScope = {},
): PhaseTemplateValidationResult {
  const diagnostics: PhaseTemplateDiagnostic[] = [];
  const add = (file: string, line: number, expected: string, actual: string) => {
    diagnostics.push({
      code: PHASE_TEMPLATE_INVALID_CODE,
      file,
      line,
      expected,
      actual,
      message: `${file}:${line}: expected ${expected}; actual ${actual}.`,
    });
  };
  const identities = Object.keys(input.phaseDocuments)
    .map((file): PhaseTemplateDocumentIdentity | null => {
      const phaseNumber = readPhaseDocumentNumber(file);
      return phaseNumber === null ? null : { file, phaseNumber };
    })
    .filter((identity): identity is PhaseTemplateDocumentIdentity => identity !== null)
    .sort((left, right) => left.phaseNumber - right.phaseNumber || left.file.localeCompare(right.file));
  const discoveredPhaseNumbers = [...new Set(identities.map((identity) => identity.phaseNumber))];
  const phaseNumbers = scope.phaseNumbers ?? discoveredPhaseNumbers;

  for (const file of Object.keys(input.phaseDocuments).filter((file) => readPhaseDocumentNumber(file) === null)) {
    add(file, 1, "phase document path with a phase-<number> prefix", file);
  }
  if (identities.length === 0) {
    add("Phases", 1, "at least one phase document with a phase-<number> prefix", MISSING);
  }

  for (const phaseNumber of phaseNumbers) {
    const matches = identities.filter((identity) => identity.phaseNumber === phaseNumber);
    if (matches.length > 1) {
      for (const match of matches) {
        add(match.file, 1, `one document with phase-${phaseNumber} prefix`, `${matches.length} documents share phase-${phaseNumber}`);
      }
    }
  }

  const featureTasks = input.featureTasks;
  const featureTasksStatuses = new Map<number, { status: string; line: number; cells: string[] }>();
  if (featureTasks === null) {
    add("FeatureTasks.md", 1, "canonical phase inventory table with Phase and Status columns", MISSING);
  } else {
    validateFeatureTasks(featureTasks, featureTasksStatuses, phaseNumbers, add);
  }

  for (const phaseNumber of phaseNumbers) {
    const identity = identities.find((candidate) => candidate.phaseNumber === phaseNumber);
    const file = identity?.file ?? `Phases/phase-${phaseNumber}-<arbitrary-name>.md`;
    const markdown = input.phaseDocuments[file] ?? null;
    const featureTasksStatus = featureTasksStatuses.get(phaseNumber)?.status ?? null;
    validatePhaseDocument(markdown, file, phaseNumber, featureTasksStatus, add);
  }

  diagnostics.sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.expected.localeCompare(right.expected) ||
    left.actual.localeCompare(right.actual),
  );
  return { version: PHASE_TEMPLATE_VERSION, valid: diagnostics.length === 0, diagnostics };
}

/** Filesystem adapter for orchestrator commands and dispatch guards. */
export function validatePhaseTemplate(
  featureFolderPath: string,
  scope: PhaseTemplateValidationScope = {},
): PhaseTemplateValidationResult {
  const featureTasksPath = resolve(featureFolderPath, "FeatureTasks.md");
  const phaseDocuments: Record<string, string | null> = {};
  for (const file of listPhaseTemplateDocumentPaths(featureFolderPath)) {
    const path = resolve(featureFolderPath, file);
    phaseDocuments[file] = existsSync(path) ? readFileSync(path, "utf8") : null;
  }
  const result = validatePhaseTemplateDocuments({
    featureTasks: existsSync(featureTasksPath) ? readFileSync(featureTasksPath, "utf8") : null,
    phaseDocuments,
  }, scope);
  const executionContract = loadPhaseExecutionContract(featureFolderPath).contract;
  if (!executionContract) return result;

  const selectedNumbers = new Set(scope.phaseNumbers ?? executionContract.phases.map((phase) => phase.order));
  const diagnostics = [...result.diagnostics];
  for (const phase of executionContract.phases.filter((phase) => selectedNumbers.has(phase.order))) {
    const markdown = phaseDocuments[phase.document];
    if (markdown === null || markdown === undefined) continue;
    for (const diagnostic of validatePhaseTaskLedgerParity(markdown, phase)) {
      diagnostics.push({
        code: PHASE_TEMPLATE_INVALID_CODE,
        file: phase.document,
        line: diagnostic.line,
        expected: "exact contract-to-ledger parity",
        actual: diagnostic.message,
        message: `${phase.document}:${diagnostic.line}: expected exact contract-to-ledger parity; actual ${diagnostic.message}.`,
      });
    }
  }
  diagnostics.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.expected.localeCompare(right.expected) || left.actual.localeCompare(right.actual),
  );
  return { version: result.version, valid: diagnostics.length === 0, diagnostics };
}

/**
 * Resolves the refinement-owned phase interface. A valid execution contract is
 * authoritative; legacy features fall back to discovering every Markdown
 * document so malformed numeric prefixes are diagnosed rather than ignored.
 */
export function listPhaseTemplateDocumentPaths(featureFolderPath: string): string[] {
  const executionContract = loadPhaseExecutionContract(featureFolderPath).contract;
  if (executionContract) return executionContract.phases.map((phase) => phase.document);

  const phaseDirectory = resolve(featureFolderPath, "Phases");
  if (!existsSync(phaseDirectory)) return [];
  return readdirSync(phaseDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => `Phases/${entry.name}`)
    .sort((left, right) => {
      const leftNumber = readPhaseDocumentNumber(left);
      const rightNumber = readPhaseDocumentNumber(right);
      if (leftNumber === null && rightNumber !== null) return 1;
      if (leftNumber !== null && rightNumber === null) return -1;
      return (leftNumber ?? 0) - (rightNumber ?? 0) || left.localeCompare(right);
    });
}

function validateFeatureTasks(
  markdown: string,
  statuses: Map<number, { status: string; line: number; cells: string[] }>,
  phaseNumbers: readonly number[],
  add: (file: string, line: number, expected: string, actual: string) => void,
) {
  const lines = markdown.split(/\r?\n/);
  const contractHeaderLine = lines.findIndex((line) => {
    if (!line.trim().startsWith("|")) return false;
    const headers = parseTableCells(line).map((value) => value.toLowerCase());
    return ["contract id", "document", "role", "status"].every((header) => headers.includes(header));
  });
  if (contractHeaderLine !== -1) {
    validateContractFeatureTasks(lines, contractHeaderLine, statuses, phaseNumbers, add);
    return;
  }

  const headerLine = lines.findIndex((line) => /^\|/.test(line) && /\|\s*phase\s*\|/i.test(line));
  if (headerLine === -1) {
    add("FeatureTasks.md", 1, "canonical phase inventory table with Phase and Status columns", MISSING);
    return;
  }

  const headers = parseTableCells(lines[headerLine]!);
  const phaseColumn = headers.findIndex((value) => value.toLowerCase() === "phase");
  const statusColumn = headers.findIndex((value) => value.toLowerCase() === "status");
  if (phaseColumn === -1 || statusColumn === -1) {
    add("FeatureTasks.md", headerLine + 1, "Phase and Status columns", headers.join(" | ") || MISSING);
    return;
  }

  for (let index = headerLine + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim().startsWith("|")) {
      if (index > headerLine + 1) break;
      continue;
    }
    const cells = parseTableCells(line);
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const phaseMatch = /^(\d+)(?:\s*(?:—|-|:).*)?$/.exec(cells[phaseColumn] ?? "");
    if (!phaseMatch) continue;
    const phaseNumber = Number(phaseMatch[1]);
    const rawStatus = cells[statusColumn]?.trim() ?? "";
    const status = parseStatus(rawStatus);
    if (!status) {
      add("FeatureTasks.md", index + 1, `recognised status for phase ${phaseNumber}`, rawStatus || MISSING);
      continue;
    }
    if (statuses.has(phaseNumber)) {
      add("FeatureTasks.md", index + 1, `one row for phase ${phaseNumber}`, `duplicate phase ${phaseNumber}`);
      continue;
    }
    statuses.set(phaseNumber, { status, line: index + 1, cells });
  }

  for (const phaseNumber of phaseNumbers) {
    const row = statuses.get(phaseNumber);
    if (!row) {
      add("FeatureTasks.md", headerLine + 1, `phase ${phaseNumber} row with recognised status`, MISSING);
      continue;
    }
    if (row.status === "SKIPPED" && !hasSkipReason(row.cells)) {
      add("FeatureTasks.md", row.line, "SKIPPED phase row with a specific skip reason", "SKIPPED without a reason");
    }
  }
}

function validateContractFeatureTasks(
  lines: readonly string[],
  headerLine: number,
  statuses: Map<number, { status: string; line: number; cells: string[] }>,
  phaseNumbers: readonly number[],
  add: (file: string, line: number, expected: string, actual: string) => void,
) {
  const headers = parseTableCells(lines[headerLine]!);
  const documentColumn = headers.findIndex((value) => value.toLowerCase() === "document");
  const statusColumn = headers.findIndex((value) => value.toLowerCase() === "status");

  for (let index = headerLine + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim().startsWith("|")) {
      if (index > headerLine + 1) break;
      continue;
    }
    const cells = parseTableCells(line);
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const document = (cells[documentColumn] ?? "")
      .replace(/`/g, "")
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//, "");
    const phaseNumber = readPhaseDocumentNumber(document);
    if (phaseNumber === null) continue;
    const rawStatus = cells[statusColumn]?.trim() ?? "";
    const status = parseStatus(rawStatus);
    if (!status) {
      add("FeatureTasks.md", index + 1, `recognised status for phase ${phaseNumber}`, rawStatus || MISSING);
      continue;
    }
    if (statuses.has(phaseNumber)) {
      add("FeatureTasks.md", index + 1, `one row for phase ${phaseNumber}`, `duplicate phase ${phaseNumber}`);
      continue;
    }
    statuses.set(phaseNumber, { status, line: index + 1, cells });
  }

  for (const phaseNumber of phaseNumbers) {
    const row = statuses.get(phaseNumber);
    if (!row) {
      add("FeatureTasks.md", headerLine + 1, `contract inventory row whose Document uses phase-${phaseNumber} prefix`, MISSING);
      continue;
    }
    if (row.status === "SKIPPED" && !hasSkipReason(row.cells)) {
      add("FeatureTasks.md", row.line, "SKIPPED contract inventory row with a specific skip reason", "SKIPPED without a reason");
    }
  }
}

function validatePhaseDocument(
  markdown: string | null,
  file: string,
  phaseNumber: number,
  featureTasksStatus: string | null,
  add: (file: string, line: number, expected: string, actual: string) => void,
) {
  if (markdown === null) {
    add(file, 1, `Phase ${phaseNumber} document`, MISSING);
    return;
  }
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => new RegExp(`^#\\s+Phase\\s+${phaseNumber}(?:\\s|$)`, "i").test(line));
  if (heading === -1) add(file, 1, `# Phase ${phaseNumber} - <title>`, lines.find((line) => line.startsWith("#"))?.trim() || MISSING);

  const statusLine = lines.findIndex((line) => /^\*\*Status:\*\*\s*/i.test(line));
  const rawStatus = statusLine === -1 ? "" : lines[statusLine]!.replace(/^\*\*Status:\*\*\s*/i, "").trim();
  const status = parseStatus(rawStatus);
  if (!status) add(file, statusLine === -1 ? 1 : statusLine + 1, "**Status:** <recognised lifecycle status>", rawStatus || MISSING);

  const ledger = findSection(lines, TASK_LEDGER_HEADINGS);
  if (!ledger || !ledger.lines.some((line) => /^\s*[-*]\s+\[[ xX]\]\s+\S/.test(line))) {
    add(file, ledger?.headingLine ?? 1, "task ledger section with durable checkbox tasks", ledger ? "no checkbox task" : MISSING);
  }

  const gates = findSection(lines, new Set(["quality gate evidence"]));
  if (!gates) {
    add(file, 1, "## Quality Gate Evidence table", MISSING);
  } else {
    const found = new Set<string>();
    for (let index = 0; index < gates.lines.length; index += 1) {
      const line = gates.lines[index]!;
      if (!line.trim().startsWith("|")) continue;
      const cells = parseTableCells(line);
      if (cells.length < 3 || /^gate$/i.test(cells[0] ?? "") || /^-+$/.test(cells[0] ?? "")) continue;
      const name = normalizeGate(cells[0] ?? "");
      if (!name) continue;
      found.add(name);
      const decision = cells[1]?.trim().toLowerCase() ?? "";
      // A canonical gate decision may carry a task-specific qualifier, such as
      // `not applicable for T1.1` or `waived — documentation-only scope`.
      const decisionToken = /^(missing|not applicable|satisfied|waived)(?=$|\s|—|-|:)/.exec(decision)?.[1] ?? null;
      if (!decisionToken) {
        add(file, gates.headingLine + index + 1, `recognised decision for quality gate '${name}'`, decision || MISSING);
      }
      const evidence = cells.slice(2).join(" | ").trim();
      if (!evidence) add(file, gates.headingLine + index + 1, `evidence / justification for quality gate '${name}'`, MISSING);
    }
    for (const required of REQUIRED_GATES) {
      if (!found.has(required)) add(file, gates.headingLine, `quality gate row '${required}'`, MISSING);
    }
  }

  if (status === "SKIPPED" && !hasPhaseSkipRationale(lines)) {
    add(file, statusLine === -1 ? 1 : statusLine + 1, "SKIPPED phase with a ## Skip Rationale section", "SKIPPED without a structured rationale");
  }
  if (featureTasksStatus === "SKIPPED" && status !== "SKIPPED") {
    add(file, statusLine === -1 ? 1 : statusLine + 1, "**Status:** SKIPPED to match FeatureTasks skipped representation", rawStatus || MISSING);
  }
}

function findSection(lines: readonly string[], acceptedHeadings: ReadonlySet<string>) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index]!);
    if (!match || !acceptedHeadings.has(match[1]!.trim().toLowerCase())) continue;
    const sectionLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length && !/^##\s+/.test(lines[cursor]!); cursor += 1) sectionLines.push(lines[cursor]!);
    return { headingLine: index + 1, lines: sectionLines };
  }
  return null;
}

function parseTableCells(line: string) {
  return line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
}

function parseStatus(value: string) {
  const normalized = value.trim().toUpperCase();
  for (const status of STATUS_VALUES) {
    if (
      normalized === status ||
      new RegExp(`^${status}(?:\\s|—|-|:|\\()`).test(normalized)
    ) return status;
  }
  return null;
}

function normalizeGate(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("changed file")) return "changed files";
  if (normalized.includes("gherkin") || normalized.includes("playwright") || normalized.includes("e2e")) return "gherkin/playwright e2e";
  if (normalized.includes("code review")) return "code review";
  if (normalized === "tests" || normalized.startsWith("test ")) return "tests";
  return null;
}

function hasSkipReason(cells: readonly string[]) {
  return cells.some((cell) => /SKIPPED\s*(?:—|-|:).+|skip(?:ped)?\s+(?:because|due to)|not applicable|no (?:ui|browser|implementation)/i.test(cell));
}

function hasPhaseSkipRationale(lines: readonly string[]) {
  const section = findSection(lines, new Set(["skip rationale"]));
  return Boolean(section?.lines.some((line) => line.trim().length > 0));
}
