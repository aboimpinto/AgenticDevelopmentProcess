import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import type { PhaseExecutionContractPhase } from "../src/phase-execution-contract.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseExitLifecycleApplication } from "../src/workflows/phases/phase-exit-lifecycle-application.js";

function fixture() {
  const phase = {
    documentPath: "/project/phase.md", fileName: "phase.md", number: 608,
    status: "AWAITING_REVIEW", title: "Arbitrary Work",
  } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/project/feature", phases: [phase] } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const contract = { number: phase.number, tasks: [] } as unknown as PhaseExecutionContractPhase;
  const authorize = vi.fn(async () => ({ feature, phase, reason: "authorized" }));
  const completeRecoveredReviewTask = vi.fn(async () => false);
  const executeGitCheckpoint = vi.fn(async () => ({ kind: "completed" as const, summary: "git complete" }));
  const recordProgress = vi.fn(async () => undefined);
  const application = new PhaseExitLifecycleApplication({
    authorize,
    completeRecoveredReviewTask,
    executeGitCheckpoint,
    hasUnresolvedContractTask: () => false,
    isGitCheckpointRequired: () => false,
    isOrderedTaskWorkflow: () => true,
    recordProgress,
    refreshFeature: async () => feature,
    resolvePhase: () => phase,
  });
  const input = {
    branchName: "feature/work", cardKey: "feature:WORK", command: "continue-implementing" as const,
    contract, feature, implementationAgent: "Implementation Agent", implementationModel: handoffPlan("model"),
    orderedReviewRequired: true, phase, phaseRef: "Phase 608", project, resumingAtPhaseExit: false,
    runId: "run", summaryFallback: "latest phase summary", v1ReviewRequired: true,
  };
  return { application, authorize, completeRecoveredReviewTask, contract, executeGitCheckpoint, input, recordProgress };
}

describe("phase exit lifecycle application", () => {
  it("authorizes and records a completed phase", async () => {
    const target = fixture();
    const result = await target.application.execute(target.input);
    expect(result.kind).toBe("completed");
    expect(target.authorize).toHaveBeenCalledWith(expect.objectContaining({
      orderedTaskWorkflow: true,
      orderedTasksComplete: true,
      v1ReviewRequired: true,
    }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      summary: "latest phase summary",
    }));
  });

  it("repeats the phase after recovering a declared approved-review task", async () => {
    const target = fixture();
    target.completeRecoveredReviewTask.mockResolvedValueOnce(true);
    const result = await target.application.execute({ ...target.input, resumingAtPhaseExit: true });
    expect(result.kind).toBe("repeat_phase");
    expect(target.authorize).not.toHaveBeenCalled();
    expect(target.recordProgress).not.toHaveBeenCalled();
  });

  it("returns a workflow boundary when the non-fatal git checkpoint remains pending", async () => {
    const target = fixture();
    const application = new PhaseExitLifecycleApplication({
      authorize: target.authorize,
      completeRecoveredReviewTask: target.completeRecoveredReviewTask,
      executeGitCheckpoint: vi.fn(async () => ({ kind: "checkpoint_pending" as const, summary: "git pending" })),
      hasUnresolvedContractTask: () => false,
      isGitCheckpointRequired: () => true,
      isOrderedTaskWorkflow: () => true,
      recordProgress: target.recordProgress,
      refreshFeature: async () => target.input.feature,
      resolvePhase: () => target.input.phase,
    });
    const result = await application.execute(target.input);
    expect(result).toEqual(expect.objectContaining({ kind: "checkpoint_pending", summaries: ["git pending"] }));
    expect(target.recordProgress).not.toHaveBeenCalled();
  });

  it("records the successful git checkpoint as the completion summary", async () => {
    const target = fixture();
    const application = new PhaseExitLifecycleApplication({
      authorize: target.authorize,
      completeRecoveredReviewTask: target.completeRecoveredReviewTask,
      executeGitCheckpoint: target.executeGitCheckpoint,
      hasUnresolvedContractTask: () => false,
      isGitCheckpointRequired: () => true,
      isOrderedTaskWorkflow: () => true,
      recordProgress: target.recordProgress,
      refreshFeature: async () => target.input.feature,
      resolvePhase: () => target.input.phase,
    });
    const result = await application.execute(target.input);
    expect(result).toEqual(expect.objectContaining({ kind: "completed", summaries: ["git complete"] }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ summary: "git complete" }));
  });
});
