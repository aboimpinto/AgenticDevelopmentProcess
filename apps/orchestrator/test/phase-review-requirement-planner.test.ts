import { describe, expect, it } from "vitest";
import type {
  PhaseExecutionContractPhase,
  PhaseExecutionTaskContract,
} from "../src/phase-execution-contract.js";
import { planPhaseReviewRequirement } from "../src/workflows/phases/phase-review-requirement-planner.js";

function contract(tasks: PhaseExecutionTaskContract[], codeReview: PhaseExecutionContractPhase["codeReview"] = "when_production_code_changes"): PhaseExecutionContractPhase {
  return {
    codeReview,
    developmentValidation: "focused",
    document: "Phases/phase-731-any-name.md",
    failurePolicy: "repair_and_rerun",
    finalValidation: "full",
    id: "arbitrary-phase",
    order: 731,
    role: "implementation",
    tasks,
  };
}

describe("phase review requirement planner", () => {
  it("requires an unconditional ordered review when it becomes current", () => {
    const review = { id: "review", kind: "code_review", condition: "always", required: true } as const;
    expect(planPhaseReviewRequirement({ contract: contract([review]), nextOrderedTask: review, observedChangedFiles: [] })).toEqual({
      orderedReviewRequired: true,
      orderedTasksComplete: false,
      reviewRequiredNow: true,
      skipConditionalReviewTask: false,
    });
  });

  it("skips a conditional ordered review when no phase-attributed file changed", () => {
    const review = { id: "review", kind: "code_review", condition: "when_production_code_changes", required: true } as const;
    expect(planPhaseReviewRequirement({ contract: contract([review]), nextOrderedTask: review, observedChangedFiles: [] })).toEqual({
      orderedReviewRequired: false,
      orderedTasksComplete: false,
      reviewRequiredNow: false,
      skipConditionalReviewTask: true,
    });
  });

  it("remembers a later applicable ordered review without dispatching it early", () => {
    const work = { id: "work", kind: "agent", required: true } as const;
    const review = { id: "review", kind: "code_review", condition: "when_production_code_changes", required: true } as const;
    const plan = planPhaseReviewRequirement({
      contract: contract([work, review]),
      nextOrderedTask: work,
      observedChangedFiles: ["src/arbitrary.ts"],
    });
    expect(plan.orderedReviewRequired).toBe(true);
    expect(plan.reviewRequiredNow).toBe(false);
    expect(plan.skipConditionalReviewTask).toBe(false);
  });

  it("reports an ordered queue complete only after no declaration remains", () => {
    const plan = planPhaseReviewRequirement({
      contract: contract([{ id: "work", kind: "agent", required: true }]),
      nextOrderedTask: null,
      observedChangedFiles: [],
    });
    expect(plan.orderedTasksComplete).toBe(true);
    expect(plan.reviewRequiredNow).toBe(false);
  });

  it("preserves legacy-contract review policy", () => {
    const declaration = contract([{ id: "work", kind: "work", required: true }]);
    expect(planPhaseReviewRequirement({
      contract: declaration,
      nextOrderedTask: null,
      observedChangedFiles: ["src/arbitrary.ts"],
    }).reviewRequiredNow).toBe(true);
    expect(planPhaseReviewRequirement({
      contract: declaration,
      nextOrderedTask: null,
      observedChangedFiles: [],
    }).reviewRequiredNow).toBe(false);
  });

  it("uses evidence-based production source detection for contract-free phases", () => {
    expect(planPhaseReviewRequirement({
      contract: null,
      nextOrderedTask: null,
      observedChangedFiles: ["src/arbitrary.ts", "docs/notes.md"],
    }).reviewRequiredNow).toBe(true);
    expect(planPhaseReviewRequirement({
      contract: null,
      nextOrderedTask: null,
      observedChangedFiles: ["tests/arbitrary.test.ts", "docs/notes.md"],
    }).reviewRequiredNow).toBe(false);
  });
});
