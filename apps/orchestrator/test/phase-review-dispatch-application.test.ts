import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { PhaseReviewDispatchApplication } from "../src/workflows/reviews/phase-review-dispatch-application.js";

const feature = { externalId: "arbitrary-feature" } as never;
const phase = { number: 731 } as never;
const project = { id: "arbitrary-project", rootPath: "/arbitrary" } as never;
const input = {
  baselineReviewRequired: true,
  branchName: "arbitrary-branch",
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  contract: null,
  durableApprovedHash: null,
  feature,
  model: handoffPlan("arbitrary-review-model"),
  onReviewStarted: vi.fn(),
  phase,
  phaseRef: "Phase 731",
  phaseTitle: "Arbitrary",
  project,
  rerunRequired: false,
  runId: "arbitrary-run",
  terminalDecisionPresent: false,
};

function createTarget(options: {
  dispatchReviewer?: boolean;
  route?: "fixer" | "phase_exit";
  gateApproved?: boolean;
  completedReviewTask?: boolean;
} = {}) {
  const receipt = { contentHash: "hash", databasePath: "/arbitrary/db", scope: {} };
  const completeReviewTask = vi.fn(async () => options.completedReviewTask ? {} : null);
  const executeReview = vi.fn(async () => ({
    gateApproved: options.gateApproved ?? true,
    receipt,
    reviewSummary: "Approved",
    route: options.route ?? "phase_exit",
    summaries: ["Review complete"],
  }));
  return {
    application: new PhaseReviewDispatchApplication({
      canonicalFeatureId: () => "arbitrary-feature",
      completeReviewTask: completeReviewTask as never,
      createInvocationId: () => "arbitrary-invocation",
      executeReview: executeReview as never,
      isOrderedTaskWorkflow: () => true,
      planInvocation: () => ({
        approvedReceipt: receipt,
        artifactId: "artifact",
        databasePath: "/arbitrary/db",
        dispatchReviewer: options.dispatchReviewer ?? true,
        rerun: false,
        scope: {} as never,
      }),
    }),
    completeReviewTask,
    executeReview,
  };
}

describe("PhaseReviewDispatchApplication", () => {
  it("continues with durable approval when no reviewer dispatch is needed", async () => {
    const target = createTarget({ dispatchReviewer: false });

    await expect(target.application.dispatch(input)).resolves.toMatchObject({
      kind: "continue",
      receipt: { contentHash: "hash" },
      summaries: [],
    });
    expect(target.executeReview).not.toHaveBeenCalled();
  });

  it("repeats the phase when the reviewer routes findings to the fixer", async () => {
    const target = createTarget({ route: "fixer" });

    await expect(target.application.dispatch(input)).resolves.toMatchObject({
      kind: "repeat_phase",
      summaries: ["Review complete"],
    });
  });

  it("completes a declared review task and selects the next phase task", async () => {
    const target = createTarget({ completedReviewTask: true });

    await expect(target.application.dispatch({ ...input, contract: {} as never })).resolves.toMatchObject({
      kind: "repeat_phase",
      summaries: ["Review complete", "Phase 731: declared code-review task completed; selecting the next declared task."],
    });
    expect(target.completeReviewTask).toHaveBeenCalledOnce();
  });

  it("continues to phase exit after an approved non-task review", async () => {
    const target = createTarget();

    await expect(target.application.dispatch(input)).resolves.toMatchObject({
      kind: "continue",
      summaries: ["Review complete"],
    });
  });
});
