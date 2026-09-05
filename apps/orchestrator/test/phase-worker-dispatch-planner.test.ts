import { describe, expect, it } from "vitest";
import { planPhaseWorkerDispatch } from "../src/workflows/phases/phase-worker-dispatch-planner.js";

const baseline = {
  codePhase: true,
  contractRole: "implementation" as const,
  fallbackAgent: "Detected Stack Agent",
  implementationModel: "implementation-model",
  phaseNumber: 731,
  phaseTitle: "Arbitrary Work",
  planningModel: "planning-model",
  resolveFindingsModel: "fixer-model",
  resolvingReviewFindings: false,
};

describe("phase worker dispatch planner", () => {
  it("selects the recommended agent for implementation", () => {
    expect(planPhaseWorkerDispatch({ ...baseline, recommendedAgent: "Recommended Agent" })).toEqual({
      agent: "Recommended Agent",
      failureStep: "Phase 731 failed",
      failureSummary: "Phase 731 implementation failed.",
      model: "implementation-model",
      step: "Phase 731: Implementing Arbitrary Work",
    });
  });

  it("falls back to the detected stack agent for non-code work", () => {
    const plan = planPhaseWorkerDispatch({ ...baseline, codePhase: false, recommendedAgent: null });
    expect(plan.agent).toBe("Detected Stack Agent");
    expect(plan.step).toBe("Phase 731: Running Arbitrary Work");
  });

  it("uses the planning model and stable planning step for a planning role", () => {
    const plan = planPhaseWorkerDispatch({ ...baseline, contractRole: "planning" });
    expect(plan.model).toBe("planning-model");
    expect(plan.step).toBe("Phase 731: Contract planning");
  });

  it("routes findings through the fixer model regardless of phase role", () => {
    expect(planPhaseWorkerDispatch({
      ...baseline,
      contractRole: "planning",
      resolvingReviewFindings: true,
    })).toEqual({
      agent: "Detected Stack Agent",
      failureStep: "Resolve Code Review Findings Phase 731 failed",
      failureSummary: "Phase 731 review findings resolution failed.",
      model: "fixer-model",
      step: "Resolve Code Review Findings Phase 731",
    });
  });
});
