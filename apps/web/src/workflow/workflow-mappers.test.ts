/**
 * FEAT-056: Workflow And Phase Interaction Decomposition
 *
 * Phase 2 — Data Layer tests for workflow mappers and types.
 */

import { describe, it, expect } from "vitest";
import type {
  WorkItemCard,
  FeatureWorkflowSummary,
  PhaseSummary,
} from "@hepha/shared";

import {
  createWorkflowSnapshot,
  formatStatusLabel,
  formatWorkflowCommand,
  sortPhasesByNumber,
  findCurrentPhase,
  mapAvailableActions,
  getBlockingReadinessReasons,
  hasBlockingReason,
  buildWorkflowReadModel,
} from "./workflow-mappers.js";

import type { WorkflowActionId } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCard(overrides?: Partial<WorkItemCard>): WorkItemCard {
  return {
    id: "card-1",
    externalId: "FEAT-001",
    kind: "feature",
    title: "Test Feature",
    stateFolder: "03_IN_PROGRESS",
    stateLabel: "In Progress",
    folderName: "FEAT-001-test",
    folderPath: "/features/03_IN_PROGRESS/FEAT-001-test",
    documentPath: null,
    documentUpdatedAt: null,
    documentRelativePath: null,
    epicState: null,
    epicRefinements: [],
    specMarkdown: "",
    summary: "A test feature",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    featureWorkflow: null,
    implementationEvidence: null,
    phases: [],
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "",
      deepDiveStatus: "current",
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
    ...overrides,
  };
}

function makePhase(overrides?: Partial<PhaseSummary>): PhaseSummary {
  return {
    number: 1,
    title: "Phase 1",
    status: "completed",
    fileName: "phase-1-test.md",
    documentPath: "/phases/phase-1-test.md",
    documentRelativePath: "phases/phase-1-test.md",
    defaultImplementationModel: null,
    estimatedAiTime: null,
    estimatedHumanTime: null,
    predictedModel: null,
    predictedModelSource: "feature_default",
    recommendedAgent: null,
    recommendedModel: null,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeWorkflow(overrides?: Partial<FeatureWorkflowSummary>): FeatureWorkflowSummary {
  return {
    activeRun: null,
    canAcceptHumanReviewFindings: false,
    canRecordManualTests: false,
    canRecordUserCodeReview: false,
    canSubmitFinding: false,
    canContinueImplementing: false,
    canCreateUiRequirements: false,
    canRefineFeature: false,
    canStartImplementing: false,
    defaultImplementationModel: null,
    designCompletedAt: null,
    hasDesignArtifacts: false,
    hasRefinementArtifacts: false,
    implementationCompleted: false,
    implementationPhases: [],
    implementationTasks: [],
    findings: [],
    lastRun: null,
    manualTestsCompletedAt: null,
    manualTestPackStatus: null,
    canGenerateManualTestPack: false,
    canReviewManualTestPack: false,
    canRecordManualTestPass: false,
    canRecordManualTestFail: false,
    refineCompletedAt: null,
    uiRequirementCheckedAt: null,
    uiRequirementDecision: "unknown",
    uiRequirementReason: null,
    userCodeReviewCompletedAt: null,
    workflowMessage: "Ready",
    readiness: null,
    workflowPosition: null,
    ...overrides,
  };
}

// ─── createWorkflowSnapshot ─────────────────────────────────────────────────

describe("createWorkflowSnapshot", () => {
  it("returns null when card has no workflow and no phases", () => {
    const card = makeCard();
    expect(createWorkflowSnapshot(card)).toBeNull();
  });

  it("returns snapshot with null workflow when card has phases but no featureWorkflow", () => {
    const card = makeCard({
      phases: [makePhase({ number: 1, title: "Phase 1" })],
      featureWorkflow: null,
    });
    const snapshot = createWorkflowSnapshot(card);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.workflow).toBeNull();
    expect(snapshot!.phases).toHaveLength(1);
  });

  it("includes workflow data when featureWorkflow is present", () => {
    const workflow = makeWorkflow({ implementationCompleted: true });
    const card = makeCard({ featureWorkflow: workflow });
    const snapshot = createWorkflowSnapshot(card);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.workflow?.implementationCompleted).toBe(true);
  });

  it("preserves empty arrays for findings and manualTestStatus", () => {
    const workflow = makeWorkflow();
    const card = makeCard({ featureWorkflow: workflow });
    const snapshot = createWorkflowSnapshot(card);
    expect(snapshot!.findings).toEqual([]);
    expect(snapshot!.manualTestStatus).toBeNull();
    expect(snapshot!.implementationPhases).toEqual([]);
    expect(snapshot!.implementationTasks).toEqual([]);
  });
});

// ─── formatStatusLabel ──────────────────────────────────────────────────────

describe("formatStatusLabel", () => {
  it("returns 'Unknown' for null input", () => {
    expect(formatStatusLabel(null)).toBe("Unknown");
  });

  it("returns 'Unknown' for undefined input", () => {
    expect(formatStatusLabel(undefined)).toBe("Unknown");
  });

  it("returns 'Unknown' for empty string", () => {
    expect(formatStatusLabel("")).toBe("Unknown");
  });

  it("maps known statuses to their labels", () => {
    expect(formatStatusLabel("completed")).toBe("Completed");
    expect(formatStatusLabel("blocked")).toBe("Blocked");
    expect(formatStatusLabel("pending")).toBe("Pending");
    expect(formatStatusLabel("in_progress")).toBe("In Progress");
  });

  it("returns the input unchanged for unknown statuses", () => {
    expect(formatStatusLabel("custom_status")).toBe("custom_status");
  });

  it("is case-insensitive for known statuses", () => {
    expect(formatStatusLabel("COMPLETED")).toBe("Completed");
    expect(formatStatusLabel("In_Progress")).toBe("In Progress");
  });
});

// ─── formatWorkflowCommand ──────────────────────────────────────────────────

describe("formatWorkflowCommand", () => {
  it("returns 'Unknown' for null", () => {
    expect(formatWorkflowCommand(null)).toBe("Unknown");
  });

  it("returns 'Unknown' for undefined", () => {
    expect(formatWorkflowCommand(undefined)).toBe("Unknown");
  });

  it("maps known commands", () => {
    expect(formatWorkflowCommand("start-implementing")).toBe("Start Implementation");
    expect(formatWorkflowCommand("complete-feature")).toBe("Complete Feature");
    expect(formatWorkflowCommand("design-feature")).toBe("Design");
    expect(formatWorkflowCommand("refine-feature")).toBe("Refine");
  });

  it("returns raw command for unknown commands", () => {
    expect(formatWorkflowCommand("unknown-command")).toBe("unknown-command");
  });
});

// ─── sortPhasesByNumber ─────────────────────────────────────────────────────

describe("sortPhasesByNumber", () => {
  it("returns phases sorted by number", () => {
    const phases = [
      makePhase({ number: 3, title: "Phase 3" }),
      makePhase({ number: 1, title: "Phase 1" }),
      makePhase({ number: 2, title: "Phase 2" }),
    ];
    const sorted = sortPhasesByNumber(phases);
    expect(sorted.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("places null-numbered phases last", () => {
    const phases = [
      makePhase({ number: 1, title: "Phase 1" }),
      makePhase({ number: null, title: "Null Phase" }),
    ];
    const sorted = sortPhasesByNumber(phases);
    expect(sorted[0].number).toBe(1);
    expect(sorted[1].number).toBeNull();
  });

  it("returns empty array for empty input", () => {
    expect(sortPhasesByNumber([])).toEqual([]);
  });
});

// ─── findCurrentPhase ───────────────────────────────────────────────────────

describe("findCurrentPhase", () => {
  it("returns the first non-completed phase", () => {
    const phases = [
      makePhase({ number: 1, status: "completed" }),
      makePhase({ number: 2, status: "in_progress" }),
      makePhase({ number: 3, status: "pending" }),
    ];
    const current = findCurrentPhase(phases);
    expect(current?.number).toBe(2);
  });

  it("returns null when all phases are completed or skipped", () => {
    const phases = [
      makePhase({ number: 1, status: "completed" }),
      makePhase({ number: 2, status: "SKIPPED" }),
    ];
    expect(findCurrentPhase(phases)).toBeNull();
  });

  it("returns null for empty phase list", () => {
    expect(findCurrentPhase([])).toBeNull();
  });
});

// ─── mapAvailableActions ────────────────────────────────────────────────────

describe("mapAvailableActions", () => {
  it("returns empty array for null workflow", () => {
    expect(mapAvailableActions(null, false)).toEqual([]);
  });

  it("includes check-ui-requirement when canCreateUiRequirements is true", () => {
    const workflow = makeWorkflow({ canCreateUiRequirements: true });
    const actions = mapAvailableActions(workflow, false);
    const checkUi = actions.find((a) => a.id === "check-ui-requirement");
    expect(checkUi?.available).toBe(true);
  });

  it("includes start-implementing when canStartImplementing is true", () => {
    const workflow = makeWorkflow({ canStartImplementing: true });
    const actions = mapAvailableActions(workflow, false);
    const startImpl = actions.find((a) => a.id === "start-implementing");
    expect(startImpl?.available).toBe(true);
  });

  it("includes cancel-workflow when there is an active run", () => {
    const workflow = makeWorkflow({
      activeRun: {
        command: "start-implementing",
        runId: "run-1",
        status: "running",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        currentNodeId: null,
        currentStep: null,
        error: null,
        summary: null,
        workflowProgress: null,
      },
    });
    const actions = mapAvailableActions(workflow, false);
    const cancel = actions.find((a) => a.id === "cancel-workflow");
    expect(cancel?.available).toBe(true);
  });

  it("keeps a recorded user code review visible as a completed action", () => {
    const workflow = makeWorkflow({
      canRecordUserCodeReview: false,
      userCodeReviewCompletedAt: "2026-07-11T20:00:00.000Z",
    });

    const review = mapAvailableActions(workflow, false).find((action) => action.id === "record-user-code-review");

    expect(review).toMatchObject({ available: false, completed: true, label: "User Code Review Complete" });
  });

  it("disables Complete Feature while a non-completion workflow is running", () => {
    const workflow = makeWorkflow({
      implementationCompleted: true,
      activeRun: {
        command: "continue-implementing",
        runId: "run-quality-gate-repair",
        status: "running",
        startedAt: "2026-01-01T00:00:00Z",
        completedAt: null,
        currentNodeId: "implementation-loop",
        currentStep: "Resolving missing quality gates",
        error: null,
        summary: null,
        workflowProgress: null,
      },
    });

    const complete = mapAvailableActions(workflow, false).find((action) => action.id === "complete-feature");

    expect(complete?.available).toBe(false);
  });

  it("returns readonly array", () => {
    const workflow = makeWorkflow();
    const actions = mapAvailableActions(workflow, false);
    // TypeScript ensures readonly — runtime check
    expect(Array.isArray(actions)).toBe(true);
  });
});

// ─── getBlockingReadinessReasons ────────────────────────────────────────────

describe("getBlockingReadinessReasons", () => {
  it("returns empty array when workflow is null", () => {
    expect(getBlockingReadinessReasons(null)).toEqual([]);
  });

  it("returns empty array when readiness is null", () => {
    const workflow = makeWorkflow({ readiness: null });
    expect(getBlockingReadinessReasons(workflow)).toEqual([]);
  });

  it("suppresses completion-only reasons while Continue Implementing is available", () => {
    const workflow = makeWorkflow({
      canContinueImplementing: true,
      readiness: {
        ready: false,
        reasons: [{
          code: "invalid_refine_artifacts",
          message: "A later phase lacks completion evidence.",
          blocking: true,
        }],
      },
    });

    expect(getBlockingReadinessReasons(workflow)).toEqual([]);
  });

  it("returns only blocking reasons", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: false,
        reasons: [
          { code: "deep_dive_not_recorded", message: "No deep-dive", blocking: true },
          { code: "missing_required_document", message: "Missing doc", blocking: false },
        ],
      },
    });
    const reasons = getBlockingReadinessReasons(workflow);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].code).toBe("deep_dive_not_recorded");
  });
});

// ─── hasBlockingReason ──────────────────────────────────────────────────────

describe("hasBlockingReason", () => {
  it("returns true when the code matches a blocking reason", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: false,
        reasons: [
          { code: "deep_dive_not_recorded", message: "No deep-dive", blocking: true },
        ],
      },
    });
    expect(hasBlockingReason(workflow, "deep_dive_not_recorded")).toBe(true);
  });

  it("returns false when the code is not among blocking reasons", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: false,
        reasons: [
          { code: "deep_dive_not_recorded", message: "No deep-dive", blocking: true },
        ],
      },
    });
    expect(hasBlockingReason(workflow, "ui_requirement_unknown")).toBe(false);
  });
});

// ─── buildWorkflowReadModel ─────────────────────────────────────────────────

describe("buildWorkflowReadModel", () => {
  it("returns available=false when snapshot is null", () => {
    const card = makeCard();
    const model = buildWorkflowReadModel(card, () => false);
    expect(model.available).toBe(false);
    expect(model.snapshot).toBeNull();
    expect(model.actions).toEqual([]);
  });

  it("returns available=true when workflow is present", () => {
    const workflow = makeWorkflow({ implementationCompleted: true });
    const card = makeCard({ featureWorkflow: workflow });
    const model = buildWorkflowReadModel(card, (id: WorkflowActionId) => id === "complete-feature");
    expect(model.available).toBe(true);
    expect(model.snapshot).not.toBeNull();
  });

  it("applies busy state from the isBusy callback", () => {
    const workflow = makeWorkflow({ canStartImplementing: true });
    const card = makeCard({ featureWorkflow: workflow });
    const model = buildWorkflowReadModel(card, (id: WorkflowActionId) => id === "start-implementing");
    const startImpl = model.actions.find((a) => a.id === "start-implementing");
    expect(startImpl?.busy).toBe(true);
  });

  it("extracts blocking reasons from the workflow", () => {
    const workflow = makeWorkflow({
      readiness: {
        ready: false,
        reasons: [
          { code: "deep_dive_not_recorded", message: "No deep-dive", blocking: true },
        ],
      },
    });
    const card = makeCard({ featureWorkflow: workflow });
    const model = buildWorkflowReadModel(card, () => false);
    expect(model.blockingReasons).toHaveLength(1);
  });

  it("reports hasActiveRun correctly", () => {
    const activeRun = {
      command: "start-implementing" as const,
      runId: "run-1",
      status: "running" as const,
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: null,
      currentNodeId: null,
      currentStep: null,
      error: null,
      summary: null,
      workflowProgress: null,
    };
    const workflow = makeWorkflow({ activeRun });
    const card = makeCard({ featureWorkflow: workflow });
    const model = buildWorkflowReadModel(card, () => false);
    expect(model.hasActiveRun).toBe(true);
  });
});
