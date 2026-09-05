import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { PhasePreReviewRoutingApplication } from "../src/workflows/reviews/phase-pre-review-routing-application.js";

const feature = { externalId: "arbitrary-feature" } as never;
const phase = { number: 731 } as never;
const project = { id: "arbitrary-project" } as never;
const input = {
  agent: "Arbitrary Agent",
  baselineReady: false,
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  feature,
  hasReviewFindings: false,
  model: handoffPlan("arbitrary-model"),
  phase,
  phaseRef: "Phase 731",
  project,
  recoveryAttempt: 0,
  rerunReady: false,
  reviewRequired: true,
  runId: "arbitrary-run",
};

function createTarget(options: {
  awaitsBaseline?: boolean;
  awaitsRerun?: boolean;
  completionEvidence?: boolean;
  decision?: "continue" | "phase_completed";
} = {}) {
  const reconcileContinuation = vi.fn(async () => ({
    decision: {
      kind: options.decision ?? "continue",
      reason: "Durable continuation decision",
    },
    feature,
    phase,
  }));
  return {
    application: new PhasePreReviewRoutingApplication({
      hasCompletionEvidence: () => options.completionEvidence ?? false,
      prepareReviewHandoff: async () => ({
        awaitsBaseline: options.awaitsBaseline ?? false,
        awaitsRerun: options.awaitsRerun ?? false,
        feature,
        phase,
      }),
      reconcileContinuation: reconcileContinuation as never,
    }),
    reconcileContinuation,
  };
}

describe("PhasePreReviewRoutingApplication", () => {
  it("routes a baseline review without demanding generic completion evidence", async () => {
    const target = createTarget({ awaitsBaseline: true });

    await expect(target.application.route(input)).resolves.toEqual({
      awaitsBaseline: true,
      awaitsRerun: false,
      feature,
      kind: "review_ready",
      phase,
      summaries: [],
    });
    expect(target.reconcileContinuation).not.toHaveBeenCalled();
  });

  it("routes an independent rerun without starting another implementation task", async () => {
    const target = createTarget({ awaitsRerun: true });

    await expect(target.application.route(input)).resolves.toMatchObject({
      awaitsRerun: true,
      kind: "review_ready",
    });
    expect(target.reconcileContinuation).not.toHaveBeenCalled();
  });

  it("advances when reconciliation completed the current phase", async () => {
    const target = createTarget({ decision: "phase_completed" });

    await expect(target.application.route(input)).resolves.toMatchObject({
      kind: "advance_phase",
      summaries: ["Phase 731: Durable continuation decision"],
    });
  });

  it("repeats the phase when durable progress selected its next task", async () => {
    const target = createTarget({ decision: "continue" });

    await expect(target.application.route(input)).resolves.toMatchObject({
      kind: "repeat_phase",
      summaries: ["Phase 731: Durable continuation decision"],
    });
  });
});
