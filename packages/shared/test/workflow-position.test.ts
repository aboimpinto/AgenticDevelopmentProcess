/**
 * FEAT-035: Workflow-Position Shared Contract Tests
 *
 * Verifies that the WorkflowPositionSummary DTO and its supporting
 * types are additive, readonly where appropriate, and tolerate
 * sparse/partial durable state without runtime errors.
 */
import { describe, expect, it } from "vitest";
import type {
  WorkflowExecutionState,
  PhaseLifecycleStatus,
  QualityGateState,
  DeepDiveFreshness,
  EvidenceSource,
  WorkflowPositionEvidence,
  WorkflowPositionSummary,
} from "../src/workflow-position.js";

// ---------------------------------------------------------------------------
// Type shape tests (compile-time, verified via runtime assignment)
// ---------------------------------------------------------------------------

describe("WorkflowPositionSummary type contract", () => {
  it("accepts a fully populated summary", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: "start-implementing",
      executionState: "running",
      activePhaseNumber: 3,
      activePhaseTitle: "Business Logic",
      phaseStatus: "in-progress",
      qualityGateState: "missing",
      deepDiveFreshness: "current",
      synopsis: "Phase 3: Business Logic — running",
      evidence: [
        {
          field: "executionState",
          source: "durable_event",
          value: "running",
          detail: "activeRun.status from FeatureWorkflowSummary",
        },
        {
          field: "phaseStatus",
          source: "phase_document",
          value: "IN_PROGRESS",
          detail: "extractPhaseStatus from phase-3-business-logic.md",
        },
      ],
    };

    expect(summary.commandLabel).toBe("start-implementing");
    expect(summary.executionState).toBe("running");
    expect(summary.activePhaseNumber).toBe(3);
    expect(summary.activePhaseTitle).toBe("Business Logic");
    expect(summary.phaseStatus).toBe("in-progress");
    expect(summary.qualityGateState).toBe("missing");
    expect(summary.deepDiveFreshness).toBe("current");
    expect(summary.synopsis).toBe("Phase 3: Business Logic — running");
    expect(summary.evidence).toHaveLength(2);
  });

  it("accepts a minimal/sparse summary with unknown state", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: null,
      executionState: "unknown",
      activePhaseNumber: null,
      activePhaseTitle: null,
      phaseStatus: "unknown",
      qualityGateState: "unknown",
      deepDiveFreshness: "metadata_unavailable",
      synopsis: "No workflow activity recorded",
      evidence: [],
    };

    expect(summary.commandLabel).toBeNull();
    expect(summary.executionState).toBe("unknown");
    expect(summary.activePhaseNumber).toBeNull();
    expect(summary.activePhaseTitle).toBeNull();
    expect(summary.phaseStatus).toBe("unknown");
    expect(summary.qualityGateState).toBe("unknown");
    expect(summary.deepDiveFreshness).toBe("metadata_unavailable");
    expect(summary.synopsis).toBe("No workflow activity recorded");
    expect(summary.evidence).toHaveLength(0);
  });

  it("accepts an idle-state summary", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: null,
      executionState: "idle",
      activePhaseNumber: null,
      activePhaseTitle: null,
      phaseStatus: "pending",
      qualityGateState: "not_applicable",
      deepDiveFreshness: "not_recorded",
      synopsis: "No workflow activity recorded",
      evidence: [],
    };

    expect(summary.executionState).toBe("idle");
    expect(summary.phaseStatus).toBe("pending");
    expect(summary.qualityGateState).toBe("not_applicable");
    expect(summary.deepDiveFreshness).toBe("not_recorded");
  });

  it("accepts a completed summary", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: "complete-feature",
      executionState: "completed",
      activePhaseNumber: null,
      activePhaseTitle: null,
      phaseStatus: "completed",
      qualityGateState: "satisfied",
      deepDiveFreshness: "current",
      synopsis: "All phases completed",
      evidence: [
        {
          field: "executionState",
          source: "durable_event",
          value: "completed",
          detail: "Most recent phase.completed event",
        },
      ],
    };

    expect(summary.executionState).toBe("completed");
    expect(summary.phaseStatus).toBe("completed");
    expect(summary.qualityGateState).toBe("satisfied");
  });

  it("accepts a blocked summary", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: "continue-implementing",
      executionState: "blocked",
      activePhaseNumber: 5,
      activePhaseTitle: "User Interface",
      phaseStatus: "blocked",
      qualityGateState: "missing",
      deepDiveFreshness: "current",
      synopsis: "Phase 5: User Interface — blocked",
      evidence: [
        {
          field: "phaseStatus",
          source: "durable_event",
          value: "blocked",
          detail: "phase.blocked event for phase 5",
        },
      ],
    };

    expect(summary.commandLabel).toBe("continue-implementing");
    expect(summary.executionState).toBe("blocked");
    expect(summary.activePhaseNumber).toBe(5);
    expect(summary.phaseStatus).toBe("blocked");
  });

  it("accepts a failed summary", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: "continue-implementing",
      executionState: "failed",
      activePhaseNumber: 3,
      activePhaseTitle: "Business Logic",
      phaseStatus: "failed",
      qualityGateState: "missing",
      deepDiveFreshness: "current",
      synopsis: "Phase 3: Business Logic — failed",
      evidence: [
        {
          field: "phaseStatus",
          source: "durable_event",
          value: "failed",
          detail: "phase.failed event for phase 3",
        },
      ],
    };

    expect(summary.executionState).toBe("failed");
    expect(summary.phaseStatus).toBe("failed");
  });

  it("accepts a stale deep-dive summary", () => {
    const summary: WorkflowPositionSummary = {
      commandLabel: null,
      executionState: "idle",
      activePhaseNumber: null,
      activePhaseTitle: null,
      phaseStatus: "pending",
      qualityGateState: "missing",
      deepDiveFreshness: "stale",
      synopsis: "Deep-Dive is stale — requirements may have changed",
      evidence: [],
    };

    expect(summary.deepDiveFreshness).toBe("stale");
  });
});

// ---------------------------------------------------------------------------
// Evidence contract tests
// ---------------------------------------------------------------------------

describe("WorkflowPositionEvidence contract", () => {
  it("accepts an evidence record with all fields", () => {
    const evidence: WorkflowPositionEvidence = {
      field: "executionState",
      source: "durable_event",
      value: "running",
      detail: "Workflow activeRun.status",
    };

    expect(evidence.field).toBe("executionState");
    expect(evidence.source).toBe("durable_event");
    expect(evidence.value).toBe("running");
    expect(evidence.detail).toBe("Workflow activeRun.status");
  });

  it("accepts an evidence record with null value", () => {
    const evidence: WorkflowPositionEvidence = {
      field: "activePhaseNumber",
      source: "phase_document",
      value: null,
      detail: null,
    };

    expect(evidence.value).toBeNull();
    expect(evidence.detail).toBeNull();
  });

  it("accepts all evidence source types", () => {
    const sources: EvidenceSource[] = [
      "durable_event",
      "phase_document",
      "card_metadata",
      "feature_tasks",
    ];

    const records = sources.map((source) => ({
      field: "phaseStatus",
      source,
      value: "completed",
      detail: null,
    })) satisfies WorkflowPositionEvidence[];

    expect(records).toHaveLength(4);
    expect(records[0].source).toBe("durable_event");
    expect(records[1].source).toBe("phase_document");
    expect(records[2].source).toBe("card_metadata");
    expect(records[3].source).toBe("feature_tasks");
  });
});

// ---------------------------------------------------------------------------
// Type enum/literal contract tests
// ---------------------------------------------------------------------------

describe("WorkflowExecutionState literals", () => {
  it("accepts all defined execution states", () => {
    const states: WorkflowExecutionState[] = [
      "idle",
      "queued",
      "running",
      "blocked",
      "failed",
      "completed",
      "unknown",
    ];

    expect(states).toHaveLength(7);
    expect(states).toContain("idle");
    expect(states).toContain("running");
    expect(states).toContain("blocked");
    expect(states).toContain("failed");
    expect(states).toContain("completed");
    expect(states).toContain("queued");
    expect(states).toContain("unknown");
  });
});

describe("PhaseLifecycleStatus literals", () => {
  it("accepts all defined phase lifecycle statuses", () => {
    const statuses: PhaseLifecycleStatus[] = [
      "pending",
      "in-progress",
      "completed",
      "skipped",
      "blocked",
      "failed",
      "unknown",
    ];

    expect(statuses).toHaveLength(7);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("in-progress");
    expect(statuses).toContain("completed");
    expect(statuses).toContain("skipped");
    expect(statuses).toContain("blocked");
    expect(statuses).toContain("failed");
    expect(statuses).toContain("unknown");
  });
});

describe("QualityGateState literals", () => {
  it("accepts all defined quality-gate states", () => {
    const states: QualityGateState[] = [
      "satisfied",
      "waived",
      "missing",
      "not_applicable",
      "unknown",
    ];

    expect(states).toHaveLength(5);
    expect(states).toContain("satisfied");
    expect(states).toContain("waived");
    expect(states).toContain("missing");
    expect(states).toContain("not_applicable");
    expect(states).toContain("unknown");
  });
});

describe("DeepDiveFreshness literals", () => {
  it("accepts all defined freshness states", () => {
    const states: DeepDiveFreshness[] = [
      "current",
      "stale",
      "not_recorded",
      "metadata_unavailable",
    ];

    expect(states).toHaveLength(4);
    expect(states).toContain("current");
    expect(states).toContain("stale");
    expect(states).toContain("not_recorded");
    expect(states).toContain("metadata_unavailable");
  });
});
