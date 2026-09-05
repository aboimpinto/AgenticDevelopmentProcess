import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MANUAL_TEST_OBLIGATIONS_FILE,
  readManualTestObligations,
} from "../../manual-test-obligation.js";
import { parseMarkdownPipeTables } from "../../markdown-pipe-table-parser.js";
import { readPhaseContractTaskId } from "../../phase-execution-contract.js";
import { extractPhaseTaskLedger } from "../../workflows/phases/phase-task-ledger.js";

export type DevCycleRefineArtifactErrorCode =
  | "MISSING_FEATURE_TASKS"
  | "INVALID_FEATURE_STATUS"
  | "MISSING_PHASE_INVENTORY_TABLE"
  | "MISSING_STATUS_COLUMN"
  | "INCOMPLETE_PHASE_COVERAGE"
  | "MISSING_PHASE_REFERENCE"
  | "MISSING_PHASE_FILE"
  | "EMPTY_PHASE_FILE"
  | "INVALID_PHASE_HEADING"
  | "MISSING_PHASE_STATUS"
  | "DEFERRED_HUMAN_DECISION_TASK"
  | "INVALID_MANUAL_TEST_OBLIGATIONS"
  | "MANUAL_TEST_TRACEABILITY_MISMATCH";

export interface DevCycleRefineArtifactError {
  readonly code: DevCycleRefineArtifactErrorCode;
  readonly path: string;
  readonly message: string;
}

export interface DevCycleRefineArtifactValidationResult {
  readonly valid: boolean;
  readonly errors: DevCycleRefineArtifactError[];
}

const requiredPhaseNumbers = Object.freeze(Array.from({ length: 9 }, (_, phase) => phase));
type DevCycleArtifactProfile = "refinement" | "implementation";

/** Validate the durable outputs promised by the legacy DevCycle refine-feature recipe. */
export function validateDevCycleRefineArtifacts(
  featureFolderPath: string,
): DevCycleRefineArtifactValidationResult {
  return validateDevCycleArtifacts(featureFolderPath, "refinement");
}

/** Validate lifecycle-compatible DevCycle artifacts after implementation has started. */
export function validateDevCycleImplementationArtifacts(
  featureFolderPath: string,
): DevCycleRefineArtifactValidationResult {
  return validateDevCycleArtifacts(featureFolderPath, "implementation");
}

function validateDevCycleArtifacts(
  featureFolderPath: string,
  profile: DevCycleArtifactProfile,
): DevCycleRefineArtifactValidationResult {
  const errors: DevCycleRefineArtifactError[] = [];
  const featureTasksPath = resolve(featureFolderPath, "FeatureTasks.md");
  const featureTasks = readOrNull(featureTasksPath);
  if (!featureTasks?.trim()) {
    errors.push({
      code: "MISSING_FEATURE_TASKS",
      path: "FeatureTasks.md",
      message: "DevCycle refinement requires a non-empty FeatureTasks.md.",
    });
    return { valid: false, errors };
  }

  const expectedFeatureStatus = profile === "refinement" ? "READY_TO_DEVELOP" : "IN_PROGRESS";
  if (!new RegExp(`\\*\\*Status(?::)?\\*\\*\\s*:?\\s*${expectedFeatureStatus}\\b`, "i").test(featureTasks)) {
    errors.push({
      code: "INVALID_FEATURE_STATUS",
      path: "FeatureTasks.md",
      message: `DevCycle FeatureTasks.md must declare ${expectedFeatureStatus}.`,
    });
  }

  const inventory = findPhaseInventory(featureTasks);
  if (!inventory) {
    errors.push({
      code: "MISSING_PHASE_INVENTORY_TABLE",
      path: "FeatureTasks.md",
      message: "DevCycle FeatureTasks.md must contain a phase inventory with Phase and Status columns.",
    });
    return { valid: false, errors };
  }

  const phaseColumn = findColumn(inventory[0], "phase");
  const statusColumn = findColumn(inventory[0], "status");
  if (statusColumn < 0) {
    errors.push({
      code: "MISSING_STATUS_COLUMN",
      path: "FeatureTasks.md",
      message: "DevCycle phase inventory is missing its Status column.",
    });
    return { valid: false, errors };
  }

  const rowsByPhase = new Map<number, string[]>();
  for (const row of inventory.slice(1)) {
    const phase = Number.parseInt(row[phaseColumn] ?? "", 10);
    if (Number.isInteger(phase)) rowsByPhase.set(phase, row);
  }

  for (const phase of requiredPhaseNumbers) {
    const row = rowsByPhase.get(phase);
    if (!row) {
      errors.push({
        code: "INCOMPLETE_PHASE_COVERAGE",
        path: "FeatureTasks.md",
        message: `DevCycle phase inventory is missing phase ${phase}.`,
      });
      continue;
    }

    const status = row[statusColumn]?.trim().toUpperCase();
    if (!isAllowedPhaseStatus(status, profile)) {
      errors.push({
        code: "MISSING_PHASE_STATUS",
        path: "FeatureTasks.md",
        message: profile === "refinement"
          ? `DevCycle phase ${phase} must initially be PENDING or SKIPPED.`
          : `DevCycle phase ${phase} has an invalid implementation lifecycle status.`,
      });
    }

    const reference = findPhaseReference(row, phase);
    if (!reference) {
      errors.push({
        code: "MISSING_PHASE_REFERENCE",
        path: "FeatureTasks.md",
        message: `DevCycle phase ${phase} has no Phases/phase-${phase}-*.md reference.`,
      });
      continue;
    }
    validatePhaseFile(featureFolderPath, phase, reference, profile, errors);
  }

  validateManualTestTraceability(featureFolderPath, rowsByPhase, errors);
  return { valid: errors.length === 0, errors };
}

function validateManualTestTraceability(
  featureFolderPath: string,
  rowsByPhase: ReadonlyMap<number, readonly string[]>,
  errors: DevCycleRefineArtifactError[],
) {
  if (!existsSync(resolve(featureFolderPath, MANUAL_TEST_OBLIGATIONS_FILE))) return;

  let document: ReturnType<typeof readManualTestObligations>;
  try {
    document = readManualTestObligations(featureFolderPath);
  } catch (error) {
    errors.push({
      code: "INVALID_MANUAL_TEST_OBLIGATIONS",
      path: MANUAL_TEST_OBLIGATIONS_FILE,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (!document) return;

  const tasks = [...rowsByPhase.entries()].flatMap(([phaseNumber, row]) => {
    const reference = findPhaseReference(row, phaseNumber);
    const content = reference ? readOrNull(resolve(featureFolderPath, reference)) : null;
    return content
      ? extractPhaseTaskLedger(content, phaseNumber).map((task) => ({ phaseNumber, task }))
      : [];
  });
  const seenObligationIds = new Set<string>();

  for (const obligation of document.obligations) {
    if (seenObligationIds.has(obligation.id)) {
      errors.push({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: `Manual-test obligation id '${obligation.id}' must be unique.`,
      });
    }
    seenObligationIds.add(obligation.id);

    const matches = tasks.filter(({ task }) =>
      task.id === obligation.taskId || readPhaseContractTaskId(task.text) === obligation.taskId,
    );
    if (matches.length !== 1) {
      errors.push({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: `Obligation '${obligation.id}' taskId '${obligation.taskId}' must resolve to exactly one HEPHA phase-ledger task; found ${matches.length}.`,
      });
      continue;
    }
    if (matches[0]!.phaseNumber !== obligation.phaseNumber) {
      errors.push({
        code: "MANUAL_TEST_TRACEABILITY_MISMATCH",
        path: MANUAL_TEST_OBLIGATIONS_FILE,
        message: `Obligation '${obligation.id}' phaseNumber ${obligation.phaseNumber} does not match task '${obligation.taskId}' phase projection ${matches[0]!.phaseNumber}.`,
      });
    }
  }
}

function findPhaseInventory(markdown: string): string[][] | null {
  return parseMarkdownPipeTables(markdown).find((table) => {
    const headers = table[0] ?? [];
    return findColumn(headers, "phase") >= 0 && findColumn(headers, "status") >= 0;
  }) ?? null;
}

function findColumn(headers: readonly string[], name: string): number {
  return headers.findIndex((header) => header.trim().toLowerCase() === name);
}

function findPhaseReference(row: readonly string[], phase: number): string | null {
  const pattern = new RegExp(`(?:^|\\()((?:Phases/)phase-${phase}-[^)\\s]+\\.md)(?:\\)|$)`, "i");
  for (const cell of row) {
    const match = cell.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function validatePhaseFile(
  featureFolderPath: string,
  phase: number,
  relativePath: string,
  profile: DevCycleArtifactProfile,
  errors: DevCycleRefineArtifactError[],
) {
  const path = resolve(featureFolderPath, relativePath);
  if (!existsSync(path)) {
    errors.push({
      code: "MISSING_PHASE_FILE",
      path: relativePath,
      message: `DevCycle phase ${phase} document is missing.`,
    });
    return;
  }
  const content = readOrNull(path);
  if (!content?.trim()) {
    errors.push({
      code: "EMPTY_PHASE_FILE",
      path: relativePath,
      message: `DevCycle phase ${phase} document is empty.`,
    });
    return;
  }
  if (!new RegExp(`^#\\s+Phase\\s+${phase}(?::|\\s|$)`, "im").test(content)) {
    errors.push({
      code: "INVALID_PHASE_HEADING",
      path: relativePath,
      message: `DevCycle phase ${phase} document has no matching phase heading.`,
    });
  }
  const statusMatch = content.match(/\*\*Status(?::)?\*\*\s*:?\s*([A-Z_]+)/i);
  if (!isAllowedPhaseStatus(statusMatch?.[1]?.toUpperCase(), profile)) {
    errors.push({
      code: "MISSING_PHASE_STATUS",
      path: relativePath,
      message: profile === "refinement"
        ? `DevCycle phase ${phase} document has no initial status metadata.`
        : `DevCycle phase ${phase} document has no valid implementation lifecycle status.`,
    });
  }
  if (profile === "refinement" && containsDeferredHumanDecisionTask(content)) {
    errors.push({
      code: "DEFERRED_HUMAN_DECISION_TASK",
      path: relativePath,
      message: `DevCycle phase ${phase} defers a decision or acceptance gate to human sign-off; resolve it in Deep-Dive before refinement.`,
    });
  }
}

function isAllowedPhaseStatus(status: string | undefined, profile: DevCycleArtifactProfile): boolean {
  if (!status) return false;
  if (profile === "refinement") return status === "PENDING" || status === "SKIPPED";
  return ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED", "AWAITING_USER_ACCEPTANCE", "BLOCKED"].includes(status);
}

function containsDeferredHumanDecisionTask(markdown: string): boolean {
  const taskSections = markdown.split(/^###\s+Task\b/im).slice(1);
  return taskSections.some((task) =>
    /(?:human\s+sign[- ]?off|required\s+human|human\s+(?:approval|judg(?:e)?ment)|owner\s+attestation|product(?:\/platform)?[- ]owner\s+attestation|CODEOWNERS?\s+approval|manual\s+(?:approval|acceptance))/i.test(task),
  );
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
