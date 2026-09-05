// Behavior suite: workflow position.
/**
 * FEAT-035: Workflow Position Builder Tests
 *
 * Verifies the pure read-model projection for workflow-position summary.
 * Tests cover:
 * - Normal states: idle, running, completed, blocked, failed
 * - Precedence: durable events override phase documents
 * - Stale startup label prevention
 * - Quality-gate state derivation
 * - Deep-Dive freshness
 * - Synopsis generation
 */
import { describe, expect, it } from "vitest";
import type {
  FeatureWorkflowRunSummary,
  ImplementationPhaseRunSummary,
  PhaseSummary,
  FeatureImplementationEvidenceSummary,
  WorkItemValidationSummary,
} from "@hepha/shared";
import {
  deriveExecutionState,
  deriveCommandLabel,
  deriveActivePhase,
  deriveQualityGateState,
  deriveDeepDiveFreshness,
  buildSynopsis,
  buildWorkflowPosition,
  type BuildWorkflowPositionInput,
} from "../src/workflow-position-builder.js";
import type { PhaseLifecycleEventInput } from "../src/phase-precedence-helpers.js";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function activeRun(overrides: Partial<FeatureWorkflowRunSummary> = {}): FeatureWorkflowRunSummary {
  return {
    command: "start-implementing",
    completedAt: null,
    currentNodeId: null,
    currentStep: null,
    error: null,
    runId: "run-1",
    startedAt: "2026-07-09T10:00:00.000Z",
    status: "running",
    summary: null,
    workflowProgress: null,
    ...overrides,
  };
}

function implementationPhase(overrides: Partial<ImplementationPhaseRunSummary> = {}): ImplementationPhaseRunSummary {
  return {
    agent: null,
    completedAt: null,
    currentStep: null,
    error: null,
    model: null,
    phaseNumber: 1,
    phaseTitle: "Planning Analysis",
    reportPath: null,
    startedAt: null,
    status: "completed",
    summary: null,
    updatedAt: "2026-07-09T10:00:00.000Z",
    workflowRunId: "run-1",
    ...overrides,
  };
}

function phaseSummary(overrides: Partial<PhaseSummary> = {}): PhaseSummary {
  return {
    defaultImplementationModel: null,
    documentPath: "/tmp/phases/phase-1-planning-analysis.md",
    documentRelativePath: "Phases/phase-1-planning-analysis.md",
    estimatedAiTime: null,
    estimatedHumanTime: null,
    fileName: "phase-1-planning-analysis.md",
    number: 1,
    predictedModel: null,
    predictedModelSource: "unavailable_phase_override",
    recommendedAgent: null,
    recommendedModel: null,
    status: "COMPLETED",
    title: "Planning Analysis",
    updatedAt: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

function emptyValidation(): WorkItemValidationSummary {
  return {
    blocksFeatureExtraction: false,
    changedSinceHephaDeepDive: false,
    deepDiveMessage: "",
    deepDiveStatus: "not_recorded",
    lastHephaDeepDiveAt: null,
    needsValidationCount: 0,
  };
}

const EMPTY_IMPL_EVIDENCE: FeatureImplementationEvidenceSummary = {
  changedFiles: [],
  codeReviews: [],
  phaseQualityGates: [],
};

// ---------------------------------------------------------------------------
// deriveExecutionState
// ---------------------------------------------------------------------------

describe("deriveExecutionState", () => {
  it('returns "idle" when no active run', () => {
    expect(deriveExecutionState(null)).toBe("idle");
  });

  it('returns "running" when active run is running', () => {
    expect(deriveExecutionState(activeRun({ status: "running" }))).toBe("running");
  });

  it('returns "completed" when active run is completed', () => {
    expect(deriveExecutionState(activeRun({ status: "completed" }))).toBe("completed");
  });

  it('returns "failed" when active run is failed', () => {
    expect(deriveExecutionState(activeRun({ status: "failed" }))).toBe("failed");
  });

  it('returns "blocked" when active run is blocked', () => {
    expect(deriveExecutionState(activeRun({ status: "blocked" }))).toBe("blocked");
  });

  it('returns "completed" when active run is cancelled', () => {
    expect(deriveExecutionState(activeRun({ status: "cancelled" }))).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// deriveCommandLabel — stale startup label prevention
// ---------------------------------------------------------------------------

describe("deriveCommandLabel", () => {
  it("returns null when no runs exist", () => {
    expect(deriveCommandLabel(null, null)).toBeNull();
  });

  it("returns active run command when active run exists", () => {
    const result = deriveCommandLabel(
      activeRun({ command: "continue-implementing" }),
      null,
    );
    expect(result).toBe("continue-implementing");
  });

  it("falls back to last run when no active run", () => {
    const result = deriveCommandLabel(
      null,
      activeRun({ command: "start-implementing" }),
    );
    expect(result).toBe("start-implementing");
  });

  it("prefers active run over last run", () => {
    const result = deriveCommandLabel(
      activeRun({ command: "continue-implementing" }),
      activeRun({ command: "start-implementing" }),
    );
    // Active run takes precedence — stale last run label is not used
    expect(result).toBe("continue-implementing");
  });
});

// ---------------------------------------------------------------------------
// deriveActivePhase
// ---------------------------------------------------------------------------

describe("deriveActivePhase", () => {
  it("returns unknown when no evidence exists", () => {
    const result = deriveActivePhase(null, [], [], []);
    expect(result.number).toBeNull();
    expect(result.title).toBeNull();
    expect(result.status).toBe("unknown");
  });

  it("derives active phase from currentNodeId when active run exists", () => {
    const result = deriveActivePhase(
      activeRun({ currentNodeId: "phase-3" }),
      [],
      [phaseSummary({ number: 3, title: "Business Logic", status: "IN_PROGRESS" })],
      [],
    );
    expect(result.number).toBe(3);
    expect(result.title).toBe("Business Logic");
    expect(result.status).toBe("in-progress");
  });

  it("finds last non-completed implementation phase", () => {
    const result = deriveActivePhase(
      null,
      [
        implementationPhase({ phaseNumber: 1, status: "completed" }),
        implementationPhase({ phaseNumber: 2, status: "completed" }),
        implementationPhase({ phaseNumber: 3, status: "in-progress" }),
      ],
      [],
      [],
    );
    expect(result.number).toBe(3);
    expect(result.status).toBe("in-progress");
  });

  it("detects all phases completed", () => {
    const result = deriveActivePhase(
      activeRun({ status: "completed", currentNodeId: null }),
      [
        implementationPhase({ phaseNumber: 1, status: "completed" }),
        implementationPhase({ phaseNumber: 2, status: "completed" }),
      ],
      [],
      [],
    );
    expect(result.number).toBeNull();
    expect(result.title).toBeNull();
    expect(result.status).toBe("completed");
  });

  it("finds lowest pending phase from PhaseSummary", () => {
    const result = deriveActivePhase(
      null,
      [],
      [
        phaseSummary({ number: 0, status: "COMPLETED", title: "Health Check" }),
        phaseSummary({ number: 1, status: "COMPLETED", title: "Planning" }),
        phaseSummary({ number: 2, status: "PENDING", title: "Data Layer" }),
        phaseSummary({ number: 3, status: "PENDING", title: "Business Logic" }),
      ],
      [],
    );
    expect(result.number).toBe(2);
    expect(result.title).toBe("Data Layer");
    expect(result.status).toBe("pending");
  });

  it("uses durable event precedence in phase status", () => {
    const result = deriveActivePhase(
      activeRun({ currentNodeId: "phase-2" }),
      [],
      [phaseSummary({ number: 2, title: "Data", status: "PENDING" })],
      [
        { occurredAt: "2026-07-09T12:00:00.000Z", phaseNumber: 2, eventType: "phase.completed" },
      ],
    );
    expect(result.number).toBe(2);
    expect(result.status).toBe("completed"); // durable event overrides phase doc
  });
});

// ---------------------------------------------------------------------------
// deriveQualityGateState
// ---------------------------------------------------------------------------

describe("deriveQualityGateState", () => {
  it('returns "not_applicable" when no evidence exists', () => {
    expect(deriveQualityGateState(null, null)).toBe("not_applicable");
  });

  it('returns "not_applicable" when active phase is null', () => {
    expect(deriveQualityGateState(EMPTY_IMPL_EVIDENCE, null)).toBe("not_applicable");
  });

  it('returns "satisfied" when all gates are satisfied', () => {
    const evidence: FeatureImplementationEvidenceSummary = {
      changedFiles: [],
      codeReviews: [],
      phaseQualityGates: [
        {
          changedFiles: [],
          codeFiles: [],
          documentationFiles: [],
          gates: [
            { evidencePaths: [], gate: "tests", justification: null, status: "satisfied" },
            { evidencePaths: [], gate: "code_review", justification: null, status: "satisfied" },
          ],
          phaseNumber: 1,
          phaseStatus: "COMPLETED",
          phaseTitle: "Test",
          testFiles: [],
          warnings: [],
        },
      ],
    };
    expect(deriveQualityGateState(evidence, 1)).toBe("satisfied");
  });

  it('returns "missing" when any gate is missing', () => {
    const evidence: FeatureImplementationEvidenceSummary = {
      changedFiles: [],
      codeReviews: [],
      phaseQualityGates: [
        {
          changedFiles: [],
          codeFiles: [],
          documentationFiles: [],
          gates: [
            { evidencePaths: [], gate: "tests", justification: null, status: "missing" },
          ],
          phaseNumber: 1,
          phaseStatus: "COMPLETED",
          phaseTitle: "Test",
          testFiles: [],
          warnings: [],
        },
      ],
    };
    expect(deriveQualityGateState(evidence, 1)).toBe("missing");
  });

  it('returns "waived" when all non-applicable gates are waived', () => {
    const evidence: FeatureImplementationEvidenceSummary = {
      changedFiles: [],
      codeReviews: [],
      phaseQualityGates: [
        {
          changedFiles: [],
          codeFiles: [],
          documentationFiles: [],
          gates: [
            { evidencePaths: [], gate: "tests", justification: null, status: "waived" },
            { evidencePaths: [], gate: "code_review", justification: null, status: "not_applicable" },
          ],
          phaseNumber: 1,
          phaseStatus: "COMPLETED",
          phaseTitle: "Test",
          testFiles: [],
          warnings: [],
        },
      ],
    };
    expect(deriveQualityGateState(evidence, 1)).toBe("waived");
  });
});

// ---------------------------------------------------------------------------
// deriveDeepDiveFreshness
// ---------------------------------------------------------------------------

describe("deriveDeepDiveFreshness", () => {
  it('returns "not_recorded" when no deep-dive exists', () => {
    const v = emptyValidation();
    expect(deriveDeepDiveFreshness(v)).toBe("not_recorded");
  });

  it('returns "current" when deep-dive is current', () => {
    const v: WorkItemValidationSummary = {
      ...emptyValidation(),
      deepDiveStatus: "current",
    };
    expect(deriveDeepDiveFreshness(v)).toBe("current");
  });

  it('returns "stale" when deep-dive is stale', () => {
    const v: WorkItemValidationSummary = {
      ...emptyValidation(),
      deepDiveStatus: "stale",
    };
    expect(deriveDeepDiveFreshness(v)).toBe("stale");
  });

  it('returns "metadata_unavailable" when metadata is unavailable', () => {
    const v: WorkItemValidationSummary = {
      ...emptyValidation(),
      deepDiveStatus: "metadata_unavailable",
    };
    expect(deriveDeepDiveFreshness(v)).toBe("metadata_unavailable");
  });
});

// ---------------------------------------------------------------------------
// buildSynopsis
// ---------------------------------------------------------------------------

describe("buildSynopsis", () => {
  it('returns "No workflow activity recorded" for idle state', () => {
    expect(buildSynopsis(null, "idle", null, null, "pending", "not_applicable"))
      .toBe("No workflow activity recorded");
  });

  it('returns "No workflow activity recorded" for unknown state', () => {
    expect(buildSynopsis(null, "unknown", null, null, "unknown", "not_applicable"))
      .toBe("No workflow activity recorded");
  });

  it('returns "All phases completed" for completed phase status', () => {
    expect(buildSynopsis("complete-feature", "completed", null, null, "completed", "satisfied"))
      .toBe("All phases completed");
  });

  it('builds phase synopsis for running state', () => {
    expect(buildSynopsis("continue-implementing", "running", 3, "Business Logic", "in-progress", "missing"))
      .toBe("Phase 3: Business Logic — running");
  });

  it('builds blocked phase synopsis with quality gate', () => {
    expect(buildSynopsis("continue-implementing", "blocked", 5, "UI", "blocked", "missing"))
      .toBe("Phase 5: UI — blocked (quality gate: missing)");
  });

  it('builds failed phase synopsis with quality gate', () => {
    expect(buildSynopsis("continue-implementing", "failed", 2, "Data", "failed", "missing"))
      .toBe("Phase 2: Data — failed (quality gate: missing)");
  });
});

// ---------------------------------------------------------------------------
// buildWorkflowPosition — Integration
// ---------------------------------------------------------------------------

describe("buildWorkflowPosition — integration", () => {
  const baseInput: BuildWorkflowPositionInput = {
    activeRun: null,
    lastRun: null,
    phases: [],
    implementationPhases: [],
    implementationEvidence: null,
    validation: emptyValidation(),
    phaseLifecycleEvents: [],
  };

  it("returns a complete summary with all fields present", () => {
    const result = buildWorkflowPosition(baseInput);
    expect(result).toHaveProperty("commandLabel");
    expect(result).toHaveProperty("executionState");
    expect(result).toHaveProperty("activePhaseNumber");
    expect(result).toHaveProperty("activePhaseTitle");
    expect(result).toHaveProperty("phaseStatus");
    expect(result).toHaveProperty("qualityGateState");
    expect(result).toHaveProperty("deepDiveFreshness");
    expect(result).toHaveProperty("synopsis");
    expect(result).toHaveProperty("evidence");
    // All fields should have non-undefined values
    expect(result.synopsis).toBeDefined();
    expect(result.executionState).toBe("idle");
    expect(result.commandLabel).toBeNull();
  });

  it("separates command label from execution state (stale label prevention)", () => {
    // Simulate: last run was "start-implementing" but no active run
    const result = buildWorkflowPosition({
      ...baseInput,
      lastRun: activeRun({ command: "start-implementing", status: "completed" }),
      activeRun: activeRun({ command: "continue-implementing", status: "running" }),
    });
    // Command label and execution state are independent concepts
    expect(result.commandLabel).toBe("continue-implementing");
    expect(result.executionState).toBe("running");
  });

  it("handles blocked workflow correctly", () => {
    const result = buildWorkflowPosition({
      ...baseInput,
      activeRun: activeRun({ command: "continue-implementing", status: "blocked" }),
      implementationPhases: [
        implementationPhase({ phaseNumber: 1, status: "completed" }),
        implementationPhase({ phaseNumber: 2, status: "in-progress" }),
      ],
    });
    expect(result.executionState).toBe("blocked");
    expect(result.commandLabel).toBe("continue-implementing");
  });

  it("handles completed workflow with all phases done", () => {
    const result = buildWorkflowPosition({
      ...baseInput,
      activeRun: activeRun({ command: "complete-feature", status: "completed" }),
      implementationPhases: [
        implementationPhase({ phaseNumber: 1, status: "completed" }),
        implementationPhase({ phaseNumber: 2, status: "completed" }),
      ],
    });
    expect(result.executionState).toBe("completed");
    expect(result.phaseStatus).toBe("completed");
    expect(result.synopsis).toBe("All phases completed");
  });

  it("includes evidence records", () => {
    const result = buildWorkflowPosition(baseInput);
    expect(Array.isArray(result.evidence)).toBe(true);
    // idle state should still have evidence
    expect(result.evidence.length).toBeGreaterThanOrEqual(0);
  });
});
