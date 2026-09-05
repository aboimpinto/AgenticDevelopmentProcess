import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import type { FinalVerificationCheckRecord } from "@hepha/db";
import type {
  AutomatedEvidenceSummary,
  ManualTestSourceManifestEntry,
} from "../manual-test-verification-types.js";
import {
  buildCoverageMap,
  generateManualTests,
  normalizeSourceItems,
  validateManualTestCase,
  type CoverageMapEntry,
  type ManualTestCase,
} from "../manual-test-verification-policy.js";
import { readManualTestObligations } from "../manual-test-obligation.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { discoverSources, type SourceDiscoveryOptions } from "./source-discovery.js";

export interface ManualTestDeliveryModel {
  readonly manifestEntries: readonly ManualTestSourceManifestEntry[];
  readonly coverageMap: readonly CoverageMapEntry[];
  readonly tests: readonly ManualTestCase[];
  readonly invalidManualTests: readonly { readonly id: string; readonly errors: readonly string[] }[];
  readonly automatedEvidence: readonly AutomatedEvidenceSummary[];
  readonly deferredSurfaces: readonly string[];
  readonly applicability: "applicable" | "not_applicable" | "incomplete";
}

/** Hash the complete delivery decision so evidence and classification changes
 * invalidate an older artifact even when the criterion text is unchanged. */
export function hashManualTestDeliveryModel(model: ManualTestDeliveryModel): string {
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: "hepha-test-delivery/v2",
    renderingVersion: 7,
    manifestEntries: model.manifestEntries,
    coverageMap: model.coverageMap,
    tests: model.tests,
    invalidManualTests: model.invalidManualTests,
    automatedEvidence: model.automatedEvidence,
    deferredSurfaces: model.deferredSurfaces,
    applicability: model.applicability,
  })).digest("hex");
}

export async function buildManualTestDeliveryModel(
  context: ManualTestAdapterContext,
  sourceOptions: SourceDiscoveryOptions,
): Promise<ManualTestDeliveryModel> {
  const manifestEntries = normalizeSourceItems(discoverSources(sourceOptions));
  const evidenceDiscovery = discoverDocumentEvidence(context.featFolderPath, context.projectRoot);
  const runtimeEvidence = await discoverRuntimeEvidence(context);
  const candidates = buildObligationCandidates(context.featFolderPath, manifestEntries);
  const invalidManualTests = candidates.flatMap((test) => {
    const errors = validateManualTestCase(test);
    return errors.length > 0 ? [{ id: test.id, errors }] : [];
  });
  const tests = generateManualTests(candidates);
  const manualCoverage = new Map(tests.flatMap((test) =>
    test.sourceIds.map((sourceId) => [sourceId, test.id] as const)));
  const coverageMap = buildCoverageMap(
    manifestEntries,
    manualCoverage,
    evidenceDiscovery.deferredSourceIds,
    evidenceDiscovery.bySourceId,
  );
  const acceptanceCoverage = coverageMap.filter((entry) =>
    entry.category === "feat-ac" || entry.category === "epic-ac" || entry.category === "phase-ac");
  const applicability = tests.length > 0 && invalidManualTests.length === 0
    ? "applicable" as const
    : invalidManualTests.length > 0 || acceptanceCoverage.some((entry) => entry.coverageStatus === "uncovered")
      ? "incomplete" as const
      : "not_applicable" as const;

  return {
    manifestEntries,
    coverageMap,
    tests,
    invalidManualTests,
    automatedEvidence: deduplicateEvidence([...runtimeEvidence, ...evidenceDiscovery.summaries]),
    deferredSurfaces: evidenceDiscovery.deferredSurfaces,
    applicability,
  };
}

function buildObligationCandidates(
  featureFolderPath: string,
  entries: readonly ManualTestSourceManifestEntry[],
): ManualTestCase[] {
  const obligations = readManualTestObligations(featureFolderPath)?.obligations ?? [];
  return obligations.map((obligation) => {
    const referencedCriteria = entries
      .filter((entry) => entry.sourceId === obligation.taskId
        || obligation.title.includes(entry.sourceId)
        || obligation.reason.includes(entry.sourceId))
      .map((entry) => entry.sourceId);
    const firstStep = obligation.steps[0] ?? "";
    const application = firstStep.match(/^(?:open|launch|start|connect to|sign in to|log in to)\s+(.+?)(?:\.|,|$)/i)?.[1]?.trim() ?? "";
    const setupData = obligation.preconditions.find((value) => /\b(?:account|test data|fixture|record|user)\b/i.test(value))
      ?? "No special test account or test data is required.";
    return {
      id: obligation.id,
      title: obligation.title,
      purpose: obligation.reason,
      sourceIds: [...new Set([obligation.id, ...referencedCriteria])],
      role: "User / qualified test operator",
      application,
      preconditions: obligation.preconditions,
      setupData,
      steps: obligation.steps,
      expectedResult: obligation.expectedResult,
    };
  });
}

async function discoverRuntimeEvidence(context: ManualTestAdapterContext): Promise<AutomatedEvidenceSummary[]> {
  if (typeof context.store.listFinalVerificationRuns !== "function"
    || typeof context.store.listFinalVerificationChecks !== "function") return [];
  const runs = await context.store.listFinalVerificationRuns(context.projectId, context.cardKey).catch(() => []);
  if (runs.length === 0) return [];
  const checks = await context.store.listFinalVerificationChecks(runs[0]!.id).catch(() => []);
  return checks.map(runtimeEvidenceSummary);
}

function runtimeEvidenceSummary(check: FinalVerificationCheckRecord): AutomatedEvidenceSummary {
  const status = check.outcome === "passed" || check.outcome === "advisory"
    ? "executed-passed" as const
    : check.outcome === "zero-selection"
      ? "zero-tests-discovered" as const
      : check.outcome === "failed" || check.outcome === "timed-out" || check.outcome === "policy-blocked"
        ? "executed-failed" as const
        : "not-executed" as const;
  return {
    id: `verification-${check.checkId}`,
    title: check.description,
    status,
    detail: check.outputSummary || `Outcome: ${check.outcome}.`,
    sourcePath: null,
    command: check.command,
  };
}

function discoverDocumentEvidence(featureFolderPath: string, projectRoot: string): {
  bySourceId: Map<string, readonly string[]>;
  deferredSourceIds: Set<string>;
  deferredSurfaces: string[];
  summaries: AutomatedEvidenceSummary[];
} {
  const files = listEvidenceMarkdown(featureFolderPath);
  const bySourceId = new Map<string, string[]>();
  const deferredSourceIds = new Set<string>();
  const deferredSurfaces: string[] = [];
  const summaries: AutomatedEvidenceSummary[] = [];
  let corpus = "";

  for (const path of files) {
    const content = readFileSync(path, "utf8");
    const isAcceptanceLedger = /acceptance-traceability-ledger\.md$/i.test(path);
    corpus += `\n${content}`;
    if (/FeatureDescription\.md$/i.test(path)) {
      deferredSurfaces.push(...extractDeferredHumanSurfaces(content));
    }
    const sourcePath = relative(projectRoot, path);
    for (const line of content.split(/\r?\n/)) {
      const ids = [...line.matchAll(/\b(?:AC|AT)-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/gi)].map((match) => match[0]!.toUpperCase());
      if (isAcceptanceLedger && ids.length > 0 && /\b(?:deferred|later feature|out of scope)\b/i.test(line)
        && !/\b(?:tests?|evidence|verifier|assert|fixture)\b/i.test(line)) {
        for (const id of ids) deferredSourceIds.add(id);
      }
      if (ids.length > 0 && (isAcceptanceLedger && /^\s*\|/.test(line)
        || /\b(?:tests?|coverage|evidence|verifier|assert|fixture|build|scan|mapper|validator|ledger|handoff|mapped|phase|passed|green)\b/i.test(line))) {
        for (const id of ids) {
          const current = bySourceId.get(id) ?? [];
          current.push(`${sourcePath}: ${cleanTableLine(line)}`);
          bySourceId.set(id, current);
        }
      }
      if (/^\s*[-*]/.test(line) && /\b(?:deferred to|out of scope)\b/i.test(line)
        && /\b(?:ui|browser|end-to-end|e2e|api|login|flyout|upgrade|journey)\b/i.test(line)) {
        deferredSurfaces.push(cleanTableLine(line));
      }
    }
  }

  const focused = corpus.match(/(?:focused[^\n]{0,80}(?:tests?|licensing)[^\n]{0,80})(\d+)\s*\/\s*\1(?:[^\n]*)/i)
    ?? corpus.match(/(?:focused[^\n]{0,80})(\d+)\s+(?:tests?\s+)?passed/i);
  if (focused) {
    summaries.push({
      id: "focused-tests",
      title: "Focused automated tests",
      status: "executed-passed",
      detail: `${focused[1]} tests executed and passed.`,
      sourcePath: relative(projectRoot, findPreferredEvidenceFile(files, "phase-8-final-checkpoint.md")),
      command: null,
    });
  }

  if (/deterministic verifier[^\n]{0,100}\b(?:green|passed)\b/i.test(corpus)) {
    summaries.push({
      id: "deterministic-verifier",
      title: "Catalogue digest and fixture verifier",
      status: "executed-passed",
      detail: "Deterministic normalization, digest verification, and fixture replay are reported as passed.",
      sourcePath: relative(projectRoot, findPreferredEvidenceFile(files, "phase-8-final-checkpoint.md")),
      command: null,
    });
  }

  for (const command of extractDeclaredTestCommands(corpus)) {
    if (/Category=[^"`\s]*FEAT-/i.test(command)) {
      const zero = /no test matches|no tests? (?:were )?(?:found|discovered)|total tests:\s*0/i.test(corpus);
      summaries.push({
        id: "focused-startup-integration",
        title: "Feature startup integration tests",
        status: zero ? "zero-tests-discovered" : "not-executed",
        detail: zero
          ? "The command completed without discovering a matching test. It is not passing coverage."
          : "The command is declared, but no authoritative execution result or discovered-test count was found.",
        sourcePath: relative(projectRoot, findPreferredEvidenceFile(files, "phase-8-final-checkpoint.md")),
        command,
      });
    }
  }

  return {
    bySourceId: new Map([...bySourceId].map(([key, values]) => [key, [...new Set(values)]])),
    deferredSourceIds,
    deferredSurfaces: [...new Set(deferredSurfaces)],
    summaries,
  };
}

function extractDeferredHumanSurfaces(markdown: string): string[] {
  const section = markdown.match(/^## Out of Scope\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im)?.[1] ?? "";
  const bullets: string[] = [];
  let current = "";
  for (const line of section.split(/\r?\n/)) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (current) bullets.push(current);
      current = line.replace(/^\s*[-*]\s+/, "").trim();
    } else if (current && /^\s{2,}\S/.test(line)) {
      current += ` ${line.trim()}`;
    }
  }
  if (current) bullets.push(current);
  return bullets
    .filter((item) => /\bFEAT-\d+\b/i.test(item)
      && /\b(?:api|endpoint|authentication|login|account|upgrade page|confirmation ui|playwright|journey)\b/i.test(item))
    .map((item) => item.replace(/;$/, "."));
}

function listEvidenceMarkdown(root: string): string[] {
  const preferred = [
    "FeatureDescription.md",
    "acceptance-traceability-ledger.md",
    "feature-completion-report.md",
    "completion-report.md",
    "Phases/phase-7-testing-polish.md",
    "Phases/phase-8-final-checkpoint.md",
  ].map((path) => resolve(root, path)).filter(existsSync);
  return preferred.filter((path) => statSync(path).size <= 1_000_000);
}

function extractDeclaredTestCommands(content: string): string[] {
  return [...content.matchAll(/`([^`\n]*(?:dotnet|pnpm|npm|yarn|cargo)[^`\n]*\btest\b[^`\n]*)`/gi)]
    .map((match) => match[1]!.trim())
    .filter((command) => command.length > 0);
}

function findPreferredEvidenceFile(files: readonly string[], name: string): string {
  return files.find((path) => basename(path).toLowerCase() === name) ?? files[0] ?? dirname(name);
}

function cleanTableLine(line: string): string {
  return line.replace(/^\s*[-*]\s+/, "").replace(/^\||\|$/g, "").replace(/\s*\|\s*/g, " | ").trim();
}

function deduplicateEvidence(items: readonly AutomatedEvidenceSummary[]): AutomatedEvidenceSummary[] {
  const byId = new Map<string, AutomatedEvidenceSummary>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}
