import { describe, expect, it, vi } from "vitest";
import { PhaseReviewRequirementApplication } from "../src/workflows/reviews/phase-review-requirement-application.js";

const phase = { number: 731, status: "AWAITING_REVIEW", title: "Arbitrary" } as never;
const completedPhase = { number: 731, status: "COMPLETED", title: "Arbitrary" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const refreshedFeature = { externalId: "arbitrary-feature", phases: [completedPhase] } as never;
const project = { id: "arbitrary-project" } as never;

function createTarget(options: { awaiting?: boolean; ordered?: boolean; plan?: Record<string, boolean> } = {}) {
  const skipTask = vi.fn(async () => undefined);
  const reconcile = vi.fn(async () => ({ feature: refreshedFeature }));
  const plan = {
    orderedReviewRequired: false,
    orderedTasksComplete: false,
    reviewRequiredNow: false,
    skipConditionalReviewTask: false,
    ...options.plan,
  };
  return {
    application: new PhaseReviewRequirementApplication({
      isAwaitingReview: () => options.awaiting ?? false,
      isOrderedTaskWorkflow: () => options.ordered ?? false,
      isResolved: (candidate) => candidate === completedPhase,
      plan: () => plan,
      reconcile,
      resolvePhase: () => completedPhase,
      skipTask,
    }),
    reconcile,
    skipTask,
  };
}

const input = {
  cardKey: "arbitrary-card",
  contract: null,
  feature,
  nextOrderedTask: null,
  observedChangedFiles: [],
  phase,
  phaseRef: "Phase 731",
  project,
  runId: "arbitrary-run",
};

describe("PhaseReviewRequirementApplication", () => {
  it("skips a conditional declared review task when production code did not change", async () => {
    const target = createTarget({ plan: { skipConditionalReviewTask: true } });

    const result = await target.application.prepare({
      ...input,
      nextOrderedTask: { id: "arbitrary-review", kind: "code_review" } as never,
    });

    expect(result.kind).toBe("repeat_phase");
    expect(target.skipTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "arbitrary-review" }));
  });

  it("reconciles a stale documentation-only awaiting-review state", async () => {
    const target = createTarget({ awaiting: true });

    const result = await target.application.prepare(input);

    expect(result.feature).toBe(refreshedFeature);
    expect(result.phase).toBe(completedPhase);
    expect(result.summaries).toEqual(["Phase 731: recovered stale documentation-only review state; phase completed."]);
  });

  it("does not reconcile an ordered task workflow", async () => {
    const target = createTarget({ awaiting: true, ordered: true });

    await target.application.prepare(input);

    expect(target.reconcile).not.toHaveBeenCalled();
  });

  it("returns current review requirements without mutation", async () => {
    const target = createTarget({ plan: { reviewRequiredNow: true } });

    const result = await target.application.prepare(input);

    expect(result.kind).toBe("continue");
    expect(result.plan.reviewRequiredNow).toBe(true);
    expect(target.skipTask).not.toHaveBeenCalled();
    expect(target.reconcile).not.toHaveBeenCalled();
  });
});
