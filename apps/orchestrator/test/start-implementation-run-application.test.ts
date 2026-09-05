import { describe, expect, it, vi } from "vitest";
import { StartImplementationRunApplication } from "../src/workflows/implementation/start-implementation-run-application.js";

function harness() {
  const feature = { externalId: "ITEM-ANY", kind: "feature" } as any;
  const input = { autonomous: true, baseBranch: "master", branchName: "feature-branch", cardKey: "feature:item",
    deliveryPolicy: "branch", feature, forcedRecoveryPhaseNumber: null, previousFailureBrief: null,
    project: { id: "project" }, repoRoot: "/project", runId: "run", startCommit: "abc", transitionOnly: false } as any;
  const dependencies = {
    assertRunActive: vi.fn(), attemptRecovery: vi.fn(async () => ({ errorMessage: "failed", failureBrief: null, output: "", recovered: false })),
    captureDurableProgress: vi.fn(() => "before"), clearCancellation: vi.fn(), completeTransition: vi.fn(async () => undefined), createFailureBrief: vi.fn(() => "brief"),
    createRunner: vi.fn(() => ({ runNode: async (_node: string, _data: unknown, operation: () => unknown) => await operation() })),
    findCurrentFeature: vi.fn(async (_input: unknown, fallback: unknown) => fallback), isBlockedFailure: vi.fn(() => false),
    isCancelled: vi.fn(() => false), metadataEnabled: vi.fn(() => true),
    metadataStore: { recordFeatureWorkflowCompletion: vi.fn(async () => undefined), recordFeatureWorkflowRun: vi.fn(async () => undefined) },
    moveToInProgress: vi.fn(async () => ({ feature: { ...feature, stateFolder: "03_IN_PROGRESS" }, moved: true })),
    notifyChanged: vi.fn(), now: vi.fn(() => "now"), postProcess: vi.fn(async (_input: unknown, current: unknown) => current),
    prepareBranches: vi.fn(() => ({ branchName: "feature-branch", message: "branch ready" })), recordPrerequisite: vi.fn(),
    rollback: vi.fn(async () => undefined), runImplementation: vi.fn(async () => "output"),
    scheduleContinuation: vi.fn(async () => "scheduled" as const), summarizeOutput: vi.fn(() => "summary"), syncLinkedEpic: vi.fn(async () => undefined),
  };
  return { application: new StartImplementationRunApplication(dependencies as any), dependencies, feature, input };
}

describe("Start Implementation run application", () => {
  it("runs branch, transition, post-process, implementation, and successor scheduling", async () => {
    const current = harness(); await current.application.execute(current.input);
    expect(current.dependencies.recordPrerequisite).toHaveBeenCalledWith(current.input, "now");
    expect(current.dependencies.runImplementation).toHaveBeenCalledOnce();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(expect.objectContaining({ summary: "summary" }));
    expect(current.dependencies.scheduleContinuation).toHaveBeenCalledOnce();
  });
  it("stops after durable transition-only completion", async () => {
    const current = harness(); current.input.transitionOnly = true; await current.application.execute(current.input);
    expect(current.dependencies.completeTransition).toHaveBeenCalledOnce();
    expect(current.dependencies.postProcess).not.toHaveBeenCalled();
  });
  it("rolls back a moved feature when pre-loop post-processing fails", async () => {
    const current = harness(); current.dependencies.postProcess.mockRejectedValueOnce(new Error("post-process failed"));
    await current.application.execute(current.input);
    expect(current.dependencies.rollback).toHaveBeenCalledOnce();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
  it("publishes cancellation without rollback or recovery", async () => {
    const current = harness(); current.dependencies.prepareBranches.mockImplementationOnce(() => { throw new Error("cancelled"); });
    current.dependencies.isCancelled.mockReturnValueOnce(true); await current.application.execute(current.input);
    expect(current.dependencies.clearCancellation).toHaveBeenCalledWith("run");
    expect(current.dependencies.attemptRecovery).not.toHaveBeenCalled();
  });
  it("completes from successful post-loop automatic recovery", async () => {
    const current = harness(); current.dependencies.runImplementation.mockRejectedValueOnce(new Error("worker failed"));
    current.dependencies.attemptRecovery.mockResolvedValueOnce({ errorMessage: "", failureBrief: null, output: "recovered", recovered: true });
    await current.application.execute(current.input);
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.completed", "ITEM-ANY");
  });
  it("persists a classified unrecovered failure", async () => {
    const current = harness(); current.dependencies.runImplementation.mockRejectedValueOnce(new Error("worker failed"));
    current.dependencies.isBlockedFailure.mockReturnValueOnce(true); await current.application.execute(current.input);
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
  });
});
