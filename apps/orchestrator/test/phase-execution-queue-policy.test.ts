import { describe, expect, it } from "vitest";
import { selectPhaseExecutionQueue } from "../src/workflows/phases/phase-execution-queue-policy.js";

const phase = (number: number, overrides = {}) => ({
  forcedRecovery: false,
  gitCheckpointRequired: false,
  gitCheckpointSatisfied: true,
  missingQualityGateCount: 0,
  phase: { number, title: `Random ${number}` },
  planningArtifactMissing: false,
  resolved: true,
  ...overrides,
});

describe("phase execution queue policy", () => {
  it("preserves supplied contract order for every executable reason", () => {
    const decision = selectPhaseExecutionQueue({
      firstMissingQualityGatePhaseNumber: null,
      humanReviewPending: false,
      phases: [
        phase(8, { resolved: false }),
        phase(1, { planningArtifactMissing: true }),
        phase(5, { forcedRecovery: true }),
        phase(2, { gitCheckpointRequired: true, gitCheckpointSatisfied: false }),
        phase(3),
      ],
      usesOrderedTaskWorkflow: true,
    });
    expect(decision).toEqual({ kind: "execute_phases", phases: [
      { number: 8, title: "Random 8" },
      { number: 1, title: "Random 1" },
      { number: 5, title: "Random 5" },
      { number: 2, title: "Random 2" },
    ] });
  });

  it("does not use generic missing-gate recovery for an ordered task workflow", () => {
    expect(selectPhaseExecutionQueue({
      firstMissingQualityGatePhaseNumber: 4,
      humanReviewPending: true,
      phases: [phase(4, { missingQualityGateCount: 1 })],
      usesOrderedTaskWorkflow: true,
    })).toEqual({ kind: "complete" });
  });

  it("routes an exhausted legacy queue to its first missing quality gate", () => {
    expect(selectPhaseExecutionQueue({
      firstMissingQualityGatePhaseNumber: 6,
      humanReviewPending: true,
      phases: [],
      usesOrderedTaskWorkflow: false,
    })).toEqual({ kind: "recover_legacy_gate", phaseNumber: 6 });
  });

  it("routes legacy human review only after phases and gates are exhausted", () => {
    expect(selectPhaseExecutionQueue({
      firstMissingQualityGatePhaseNumber: null,
      humanReviewPending: true,
      phases: [],
      usesOrderedTaskWorkflow: false,
    })).toEqual({ kind: "execute_human_review" });
  });

  it("completes when no declared or compatibility work remains", () => {
    expect(selectPhaseExecutionQueue({
      firstMissingQualityGatePhaseNumber: null,
      humanReviewPending: false,
      phases: [phase(1)],
      usesOrderedTaskWorkflow: false,
    })).toEqual({ kind: "complete" });
  });
});
