import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { PhaseWorkerEntryApplication } from "../src/workflows/phases/phase-worker-entry-application.js";

const phase = { number: 731, status: "IN_PROGRESS", title: "Arbitrary" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const project = { id: "arbitrary-project" } as never;
const activeTask = { id: "arbitrary-task" } as never;

function createTarget(contractTask: unknown = null) {
  const beginTask = vi.fn(async () => activeTask);
  const executeVerification = vi.fn(async () => "Verification passed.");
  const recordProgress = vi.fn(async () => undefined);
  return {
    application: new PhaseWorkerEntryApplication({
      beginTask,
      executeVerification,
      getActiveContractTask: () => contractTask as never,
      recordProgress,
    }),
    beginTask,
    executeVerification,
    recordProgress,
  };
}

const input = {
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  contract: null,
  feature,
  implementationAgent: "Arbitrary Agent",
  implementationModel: handoffPlan("arbitrary-model"),
  implementationStep: "Implement Phase 731",
  orderedTasksComplete: false,
  phase,
  phaseHasTerminalReviewDecision: false,
  phaseReadyForReviewGate: false,
  phaseReadyForReviewRerun: false,
  phaseRef: "Phase 731",
  project,
  resolvingReviewFindings: false,
  resumingAtPhaseExit: false,
  resumingBlockedReview: false,
  reviewArtifactHash: null,
  runId: "arbitrary-run",
};

describe("PhaseWorkerEntryApplication", () => {
  it("bypasses task dispatch when the phase is already on its review route", async () => {
    const target = createTarget();

    await expect(target.application.enter({ ...input, phaseReadyForReviewGate: true }))
      .resolves.toEqual({ kind: "review_route", summary: "Phase 731: already awaiting review; running review gate." });
    expect(target.beginTask).not.toHaveBeenCalled();
  });

  it("runs a declared full verification task and repeats the same phase", async () => {
    const target = createTarget({ id: "verify", kind: "verification", profile: "full" });

    await expect(target.application.enter({ ...input, reviewArtifactHash: "a".repeat(64) }))
      .resolves.toEqual({ kind: "repeat_phase", summary: "Verification passed." });
    expect(target.executeVerification).toHaveBeenCalledWith(expect.objectContaining({
      activeTask,
      reviewArtifactHash: "a".repeat(64),
      taskId: "verify",
    }));
    expect(target.recordProgress).not.toHaveBeenCalled();
  });

  it("begins an ordinary worker task and records implementation progress", async () => {
    const target = createTarget();

    await expect(target.application.enter(input)).resolves.toEqual({ activeTask, kind: "worker" });
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "implementing",
      summary: "Phase worker started.",
    }));
  });

  it("records planning and fixer entries with their distinct durable progress", async () => {
    const target = createTarget();

    await target.application.enter({ ...input, contract: { role: "planning" } as never });
    await target.application.enter({ ...input, resolvingReviewFindings: true });

    expect(target.recordProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: "planning" }));
    expect(target.recordProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({
      status: "implementing",
      summary: "Resolve review findings before rerunning the review gate.",
    }));
  });
});
