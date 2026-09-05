/**
 * Generic FEAT readiness evaluator unit tests
 *
 * Tests the pure readiness evaluation module (feat-readiness-evaluator.ts)
 * against various FEAT readiness states, including valid ready baselines,
 * missing documents, validation markers, stale Deep-Dive metadata,
 * unavailable metadata, unknown UI requirements, and missing design artifacts.
 *
 * Uses temporary directory fixtures to isolate filesystem operations.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredCardMetadata } from "@hepha/db";
import type {
  FeatureWorkflowSummary,
  MemoryBankStateFolder,
  PhaseSummary,
  WorkItemCard,
  WorkItemValidationSummary,
} from "@hepha/shared";
import {
  evaluateFeatReadiness,
  evaluateStartImplementing,
  evaluateContinueImplementing,
  type FeatReadinessFailureCode,
} from "../src/feat-readiness-evaluator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-readiness-unit-"));
  tempRoots.push(root);
  return root;
}

/** Write a string to a file, creating parent directories if needed. */
function writeFixture(root: string, relativePath: string, content: string) {
  const fullPath = resolve(root, relativePath);
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

function featureFolderPath(root: string, stateFolder: string, featId: string): string {
  return resolve(root, "Features", stateFolder, featId);
}

// ---------------------------------------------------------------------------
// Minimal valid FEAT fixture builder
// ---------------------------------------------------------------------------

interface FeatFixtureOptions {
  stateFolder?: MemoryBankStateFolder;
  needsValidationCount?: number;
  deepDiveStatus?: WorkItemValidationSummary["deepDiveStatus"];
  changedSinceHephaDeepDive?: boolean;
  metadataStoreEnabled?: boolean;
  hasDesignArtifacts?: boolean;
  uiRequirementDecision?: StoredCardMetadata["uiRequirementDecision"];
  deepDiveMessage?: string;
}

function createBaseValidation(overrides?: Partial<WorkItemValidationSummary>): WorkItemValidationSummary {
  return {
    blocksFeatureExtraction: false,
    changedSinceHephaDeepDive: false,
    deepDiveMessage: "The source document matches the last Hepha deep-dive record.",
    deepDiveStatus: "current",
    lastHephaDeepDiveAt: "2026-07-01T00:00:00.000Z",
    needsValidationCount: 0,
    ...overrides,
  };
}

function createBaseMetadata(overrides?: Partial<StoredCardMetadata>): StoredCardMetadata {
  return {
    cardKey: "feature:FEAT-TEST",
    designFeatureCompletedAt: "2026-07-01T00:00:00.000Z",
    lastDeepDiveAt: "2026-07-01T00:00:00.000Z",
    lastDeepDiveRunId: "workflow-xxx",
    lastDeepDiveSourceHash: "abc123",
    lastDeepDiveSourceUpdatedAt: "2026-07-01T00:00:00.000Z",
    manualTestsCompletedAt: null,
    refineFeatureCompletedAt: "2026-07-05T00:00:00.000Z",
    uiRequirementCheckedAt: "2026-07-02T00:00:00.000Z",
    uiRequirementDecision: "no_ui",
    uiRequirementReason: "Backend-only feature, no UI changes needed.",
    uiRequirementSourceHash: "def456",
    userCodeReviewCompletedAt: null,
    workflowCommand: null,
    workflowCompletedAt: null,
    workflowCurrentNodeId: null,
    workflowCurrentStep: null,
    workflowError: null,
    workflowRunId: null,
    workflowStartedAt: null,
    workflowStatus: null,
    workflowSummary: null,
    ...overrides,
  };
}

/** Create a minimal item mock with all required fields for readiness evaluation. */
function createMinimalItem(
  featId: string,
  folderPath: string,
  stateFolder: MemoryBankStateFolder,
  hasRefinementArtifacts: boolean,
): Pick<WorkItemCard, "externalId" | "folderPath" | "stateFolder" | "phases" | "featureWorkflow"> {
  return {
    externalId: featId,
    folderPath,
    stateFolder,
    phases: [] as PhaseSummary[],
    featureWorkflow: {
      hasRefinementArtifacts,
      hasDesignArtifacts: false,
    } as FeatureWorkflowSummary,
  };
}

/** Build a complete valid FEAT fixture root with all refinement artifacts. */
function buildValidFeatFixture(root: string, featId: string, stateFolder: MemoryBankStateFolder = "02_READY_TO_DEVELOP"): string {
  const fPath = featureFolderPath(root, stateFolder, featId);
  mkdirSync(resolve(fPath, "Phases"), { recursive: true });

  // FeatureDescription.md
  writeFixture(root, `Features/${stateFolder}/${featId}/FeatureDescription.md`, `# ${featId}: Test Feature\n\n**Status:** Ready To Develop\n\nA test feature for readiness evaluation.`);

  // FeatureTasks.md
  writeFixture(root, `Features/${stateFolder}/${featId}/FeatureTasks.md`, buildValidFeatureTasksContent());

  // Phase files
  for (let i = 0; i <= 8; i++) {
    writeFixture(
      root,
      `Features/${stateFolder}/${featId}/Phases/phase-${i}-description.md`,
      `# Phase ${i} - Description\n\n**Status:** PENDING\n\n## Objective\n\nPhase ${i} objective.\n\n## Quality Gate Evidence\n\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Changed files | missing | Placeholder |\n| Tests | missing | Placeholder |\n| Gherkin/Playwright E2E | missing | Placeholder |\n| Code review | missing | Placeholder |\n`,
    );
  }

  return fPath;
}

function buildValidFeatureTasksContent(): string {
  const rows = [
    "| Phase | File | Focus | Status | Primary tasks | Evidence labels |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (let i = 0; i <= 8; i++) {
    rows.push(`| ${i} | \`phase-${i}-description.md\` | Phase ${i} | PENDING | Tasks | \`verification\` |`);
  }
  return rows.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluateFeatReadiness", () => {
  it("checks only unresolved validation markers while a FEAT is submitted", () => {
    const root = createTempRoot();
    const fPath = featureFolderPath(root, "01_SUBMITTED", "FEAT-SUBMITTED");
    mkdirSync(fPath, { recursive: true });
    writeFixture(root, "Features/01_SUBMITTED/FEAT-SUBMITTED/FeatureDescription.md", "# FEAT-SUBMITTED\n\nClear scope without markers.\n");
    const item = createMinimalItem("FEAT-SUBMITTED", fPath, "01_SUBMITTED", false);
    const historicalStatus = createBaseValidation({
      changedSinceHephaDeepDive: true,
      deepDiveStatus: "not_recorded",
      lastHephaDeepDiveAt: null,
    });

    expect(evaluateFeatReadiness(item, historicalStatus, false, false, "unknown")).toEqual({
      ready: true,
      reasons: [],
    });

    const unresolved = createBaseValidation({ needsValidationCount: 1 });
    expect(evaluateFeatReadiness(item, unresolved, true, false, "unknown").reasons).toEqual([
      expect.objectContaining({ code: "validation_markers_present", blocking: true }),
    ]);
  });

  it("does not prescribe preparation recovery for a completed FEAT with stale Deep-Dive metadata", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-DONE", "04_COMPLETED");
    const item = createMinimalItem("FEAT-DONE", fPath, "04_COMPLETED", true);
    const validation = createBaseValidation({
      changedSinceHephaDeepDive: true,
      deepDiveStatus: "stale",
      deepDiveMessage: "The completed source document changed during finalization.",
    });

    const result = evaluateFeatReadiness(item, validation, true, false, "unknown");

    expect(result.ready).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("returns ready=true for a fully valid FEAT with current Deep-Dive and no UI requirement", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-999", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-999", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "no_ui" });

    const result = evaluateFeatReadiness(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks Start and Continue when a V3 ledger has an uncontracted checkbox", () => {
    const root = createTempRoot();
    const fPath = featureFolderPath(root, "03_IN_PROGRESS", "WORK-ARBITRARY");
    writeFixture(root, "Features/03_IN_PROGRESS/WORK-ARBITRARY/FeatureTasks.md", [
      "## Phase Inventory", "", "| Contract ID | Document | Role | Status |", "| --- | --- | --- | --- |",
      "| arbitrary-boundary | `Phases/phase-0-arbitrary.md` | implementation | PENDING |",
    ].join("\n"));
    writeFixture(root, "Features/03_IN_PROGRESS/WORK-ARBITRARY/PhaseExecutionContract.json", JSON.stringify({
      schemaVersion: "hepha-phase-execution/v3",
      phases: [{
        id: "arbitrary-boundary", order: 0, document: "Phases/phase-0-arbitrary.md", role: "implementation",
        tasks: [{ id: "declared-work", kind: "agent", required: true }],
        developmentValidation: "focused", codeReview: "never", finalValidation: "none",
        failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push",
      }],
    }));
    writeFixture(root, "Features/03_IN_PROGRESS/WORK-ARBITRARY/Phases/phase-0-arbitrary.md", `# Phase 0 - Arbitrary

**Status:** PENDING

## Objective

Arbitrary contract boundary.

## Phase Task Ledger

- [ ] Describe work without a contract identity
- [ ] [contract:declared-work] [executor:agent] Declared work

## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | pending |
| Tests | missing | pending |
| Gherkin/Playwright E2E | missing | pending |
| Code review | not applicable | no review task |

## Phase Execution Contract

**Contract ID:** arbitrary-boundary
**Role:** implementation
**Development Validation:** focused
**Final Validation:** none
**Code Review Policy:** never
**Failure Policy:** repair_and_rerun
**Git Checkpoint:** commit_and_push

## Git Checkpoint

Pending.`);
    const item = createMinimalItem("WORK-ARBITRARY", fPath, "03_IN_PROGRESS", true);

    const continued = evaluateContinueImplementing(item, createBaseValidation(), true, false, "no_ui");
    const started = evaluateStartImplementing({ ...item, stateFolder: "02_READY_TO_DEVELOP" }, createBaseValidation(), true, false, "no_ui");

    for (const result of [continued, started]) {
      expect(result.ready).toBe(false);
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.objectContaining({ blocking: true, code: "invalid_refine_artifacts", detail: "[CONTRACT_TASK_LEDGER_MISMATCH]" }),
      ]));
    }

    const phasePath = resolve(fPath, "Phases/phase-0-arbitrary.md");
    writeFileSync(
      phasePath,
      readFileSync(phasePath, "utf8").replace("- [ ] Describe work without a contract identity\n", ""),
      "utf8",
    );
    const validContinuation = evaluateContinueImplementing(item, createBaseValidation(), true, false, "no_ui");

    expect(validContinuation.ready).toBe(true);
    expect(validContinuation.reasons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing_required_document", blocking: true }),
    ]));
  });

  it("returns ready=true with hasDesignArtifacts=true when UI is required and design exists", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-UI-OK", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-UI-OK", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "requires_ui" });

    const result = evaluateFeatReadiness(item, validation, true, true, "requires_ui");

    expect(result.ready).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks when hasRefinementArtifacts is false and files are missing", () => {
    const root = createTempRoot();
    const fPath = featureFolderPath(root, "02_READY_TO_DEVELOP", "FEAT-NO-REFINE");
    mkdirSync(fPath, { recursive: true });
    // No files created
    const item = createMinimalItem("FEAT-NO-REFINE", fPath, "02_READY_TO_DEVELOP", false);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata();

    const result = evaluateFeatReadiness(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.code === "missing_required_document")).toBe(true);
    // Each MISSING_FILE from the validator maps to missing_required_document
    expect(result.reasons.filter((r) => r.code === "missing_required_document").length).toBeGreaterThanOrEqual(2);
  });

  it("blocks when needsValidationCount > 0", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-VAL-ID", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-VAL-ID", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation({ needsValidationCount: 3 });
    const metadata = createBaseMetadata();

    const result = evaluateFeatReadiness(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(false);
    const markerReason = result.reasons.find((r) => r.code === "validation_markers_present");
    expect(markerReason).toBeDefined();
    expect(markerReason!.detail).toContain("needsValidationCount=3");
    expect(markerReason!.blocking).toBe(true);
  });

  it.each(["not_recorded", "stale", "metadata_unavailable"] as const)(
    "ignores historical Deep-Dive status %s when no validation markers remain",
    (deepDiveStatus) => {
      const root = createTempRoot();
      const fPath = buildValidFeatFixture(root, `FEAT-${deepDiveStatus}`, "02_READY_TO_DEVELOP");
      const item = createMinimalItem(`FEAT-${deepDiveStatus}`, fPath, "02_READY_TO_DEVELOP", true);
      const validation = createBaseValidation({
        changedSinceHephaDeepDive: deepDiveStatus === "stale",
        deepDiveStatus,
      });

      const result = evaluateFeatReadiness(item, validation, false, true, "no_ui");

      expect(result).toEqual({ ready: true, reasons: [] });
    },
  );

  it("blocks when uiRequirementDecision is 'unknown' or null", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-UI-UNK", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-UI-UNK", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();

    const result = evaluateFeatReadiness(item, validation, true, true);

    expect(result.ready).toBe(false);
    const uiReason = result.reasons.find((r) => r.code === "ui_requirement_unknown");
    expect(uiReason).toBeDefined();
    expect(uiReason!.blocking).toBe(true);
  });

  it("blocks when design artifacts are missing but UI is required", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-UI-DES", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-UI-DES", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "requires_ui" });

    const result = evaluateFeatReadiness(item, validation, true, false, "requires_ui");

    expect(result.ready).toBe(false);
    const designReason = result.reasons.find((r) => r.code === "missing_design_artifacts");
    expect(designReason).toBeDefined();
    expect(designReason!.blocking).toBe(true);
  });

  it("does not block on missing design artifacts when UI decision is 'no_ui'", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-NO-UI", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-NO-UI", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "no_ui" });

    const result = evaluateFeatReadiness(item, validation, true, false, "no_ui");

    expect(result.ready).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("reports multiple blocking reasons simultaneously", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-MULTI", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-MULTI", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation({
      deepDiveStatus: "not_recorded",
      needsValidationCount: 2,
    });
    const metadata = createBaseMetadata({
      lastDeepDiveAt: null,
      lastDeepDiveSourceHash: null,
      uiRequirementDecision: null,
    });

    const result = evaluateFeatReadiness(item, validation, true, false);

    expect(result.ready).toBe(false);
    expect(result.reasons.filter((r) => r.blocking).length).toBeGreaterThanOrEqual(2);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain("validation_markers_present");
    expect(codes).not.toContain("deep_dive_not_recorded");
    expect(codes).toContain("ui_requirement_unknown");
  });
});

describe("evaluateStartImplementing", () => {
  it("returns ready=true for a valid ready FEAT in 02_READY_TO_DEVELOP", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-START-OK", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-START-OK", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "no_ui" });

    const result = evaluateStartImplementing(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(true);
  });

  it("blocks when folder state is not 02_READY_TO_DEVELOP", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-WRONG-FOLDER", "03_IN_PROGRESS");
    const item = createMinimalItem("FEAT-WRONG-FOLDER", fPath, "03_IN_PROGRESS", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "no_ui" });

    const result = evaluateStartImplementing(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(false);
    const folderReason = result.reasons.find((r) => r.code === "folder_state_mismatch");
    expect(folderReason).toBeDefined();
    expect(folderReason!.message).toContain("Ready To Develop");
  });
});

describe("evaluateContinueImplementing", () => {
  it("returns ready=true for a valid in-progress FEAT in 03_IN_PROGRESS", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-CONT-OK", "03_IN_PROGRESS");
    const item = createMinimalItem("FEAT-CONT-OK", fPath, "03_IN_PROGRESS", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "no_ui" });

    const result = evaluateContinueImplementing(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(true);
  });

  it("allows continuation after source changes without projecting a Deep-Dive warning", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-CONT-STALE", "03_IN_PROGRESS");
    const item = createMinimalItem("FEAT-CONT-STALE", fPath, "03_IN_PROGRESS", true);
    const validation = createBaseValidation({
      changedSinceHephaDeepDive: true,
      deepDiveMessage: "The source document changed after the last Hepha deep-dive.",
      deepDiveStatus: "stale",
    });

    const result = evaluateContinueImplementing(item, validation, true, true, "no_ui");
    expect(result.ready).toBe(true);
    expect(result.reasons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "deep_dive_stale" }),
    ]));
  });

  it("uses the execution-continuation contract instead of refinement satellite completeness", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-CONT-CONTRACT", "03_IN_PROGRESS");
    const item = createMinimalItem("FEAT-CONT-CONTRACT", fPath, "03_IN_PROGRESS", false);
    item.featureWorkflow = {
      ...item.featureWorkflow,
      hasContinuationArtifacts: true,
      hasRefinementArtifacts: false,
    } as never;

    const result = evaluateContinueImplementing(
      item,
      createBaseValidation(),
      true,
      true,
      "no_ui",
    );

    expect(result.ready).toBe(true);
    expect(result.reasons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_refine_artifacts", blocking: true }),
    ]));
  });

  it("blocks when folder state is not 03_IN_PROGRESS for continue", () => {
    const root = createTempRoot();
    const fPath = buildValidFeatFixture(root, "FEAT-CONT-WRONG", "02_READY_TO_DEVELOP");
    const item = createMinimalItem("FEAT-CONT-WRONG", fPath, "02_READY_TO_DEVELOP", true);
    const validation = createBaseValidation();
    const metadata = createBaseMetadata({ uiRequirementDecision: "no_ui" });

    const result = evaluateContinueImplementing(item, validation, true, true, "no_ui");

    expect(result.ready).toBe(false);
    const folderReason = result.reasons.find((r) => r.code === "folder_state_mismatch");
    expect(folderReason).toBeDefined();
    expect(folderReason!.message).toContain("In Progress");
  });
});
