import { describe, expect, it, vi } from "vitest";
import { PhaseReviewGateHandoffApplication } from "../src/workflows/reviews/phase-review-gate-handoff-application.js";

const phase = { number: 731, status: "IN_PROGRESS", title: "Arbitrary work" } as never;
const awaitingPhase = { number: 731, status: "AWAITING_REVIEW", title: "Arbitrary work" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const refreshedFeature = { externalId: "arbitrary-feature", phases: [awaitingPhase] } as never;
const project = { id: "arbitrary-project" } as never;

function createTarget(options: { awaitingReview?: boolean; awaitingRerun?: boolean; missingGate?: boolean } = {}) {
  const markAwaitingReview = vi.fn();
  const refreshFeature = vi.fn(async () => refreshedFeature);
  return {
    application: new PhaseReviewGateHandoffApplication({
      getMissingGates: () => options.missingGate === false ? [] : ["code_review"],
      hasCheckedTaskLedger: () => true,
      isAwaitingReview: (candidate) => candidate === awaitingPhase || Boolean(options.awaitingReview),
      isAwaitingRerun: () => Boolean(options.awaitingRerun),
      markAwaitingReview,
      refreshFeature,
      resolvePhase: () => awaitingPhase,
    }),
    markAwaitingReview,
    refreshFeature,
  };
}

const input = {
  baselineReady: false,
  feature,
  hasReviewFindings: false,
  phase,
  project,
  rerunReady: false,
  reviewRequired: true,
};

describe("PhaseReviewGateHandoffApplication", () => {
  it("persists and refreshes a baseline review handoff after durable task completion", async () => {
    const target = createTarget();

    await expect(target.application.prepare(input)).resolves.toEqual({
      awaitsBaseline: true,
      awaitsRerun: false,
      feature: refreshedFeature,
      phase: awaitingPhase,
    });
    expect(target.markAwaitingReview).toHaveBeenCalledWith(feature, phase);
    expect(target.refreshFeature).toHaveBeenCalledOnce();
  });

  it("preserves an independent rerun without manufacturing a baseline handoff", async () => {
    const target = createTarget({ awaitingRerun: true });

    const result = await target.application.prepare({ ...input, hasReviewFindings: true, rerunReady: true });

    expect(result.awaitsRerun).toBe(true);
    expect(target.markAwaitingReview).not.toHaveBeenCalled();
    expect(target.refreshFeature).not.toHaveBeenCalled();
  });

  it("does nothing when the phase contract does not require review", async () => {
    const target = createTarget();

    await expect(target.application.prepare({ ...input, reviewRequired: false })).resolves.toEqual({
      awaitsBaseline: false,
      awaitsRerun: false,
      feature,
      phase,
    });
    expect(target.markAwaitingReview).not.toHaveBeenCalled();
  });

  it("does not hand off before the code-review gate is actually missing", async () => {
    const target = createTarget({ missingGate: false });

    const result = await target.application.prepare(input);

    expect(result.awaitsBaseline).toBe(false);
    expect(target.markAwaitingReview).not.toHaveBeenCalled();
  });
});
