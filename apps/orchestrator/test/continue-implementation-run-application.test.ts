import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { ContinueImplementationRunApplication } from "../src/workflows/implementation/continue-implementation-run-application.js";

function harness(reconciliations = [false, false]) {
  const feature = { externalId: "ITEM-ANY", kind: "feature" } as any;
  const input = {
    autonomous: true,
    branchMessage: "branch ready",
    branchName: "feature-branch",
    cardKey: "feature:item",
    command: "continue-implementing",
    feature,
    previousFailureBrief: null,
    project: { id: "project" },
    recoveryAttempt: 0,
    runId: "run",
  } as any;
  let reconciliation = 0;
  const dependencies = {
    assertRunActive: vi.fn(),
    attemptRecovery: vi.fn(async () => ({ errorMessage: "failed", failureBrief: null, output: "", recovered: false })),
    captureDurableProgress: vi.fn(() => "before"),
    classifyBlocked: vi.fn(() => false),
    clearCancellation: vi.fn(),
    createFailureBrief: vi.fn(() => "brief"),
    createRunner: vi.fn(() => ({ runNode: async (_node: string, _data: unknown, operation: () => unknown) => await operation() })),
    findCurrentFeature: vi.fn(async (_input: unknown, fallback: unknown) => fallback),
    isCancelled: vi.fn(() => false),
    metadataStore: {
      recordFeatureWorkflowCompletion: vi.fn(async () => undefined),
      recordFeatureWorkflowRun: vi.fn(async () => undefined),
    },
    notifyChanged: vi.fn(),
    reconcile: vi.fn(async (_input: unknown, current: unknown) => ({ allTerminal: reconciliations[reconciliation++] ?? false, feature: current })),
    reconcileRecordedGherkin: vi.fn(async (_input: unknown, current: unknown) => current),
    recoverPersistedWorkerEvidence: vi.fn(async (_input: unknown, current: unknown) => current),
    recordProgress: vi.fn(async () => undefined),
    resolveTask: vi.fn(async () => ({ currentStep: "next task", summary: "task summary" })),
    reviewHandoff: vi.fn(async (_input: unknown, current: unknown) => current),
    runAutonomous: vi.fn(async () => "worker output"),
    runInteractive: vi.fn(async () => "interactive output"),
    scheduleContinuation: vi.fn(async () => "scheduled" as const),
    summarizeOutput: vi.fn(() => "summary"),
  };
  return { application: new ContinueImplementationRunApplication(dependencies as any), dependencies, feature, input };
}

describe("Continue Implementation run application", () => {
  it("reconciles, executes, persists, and schedules the next durable run", async () => {
    const current = harness();
    await current.application.execute(current.input);
    expect(current.dependencies.runAutonomous).toHaveBeenCalledOnce();
    expect(current.dependencies.recordProgress).toHaveBeenCalledTimes(2);
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "summary" }),
    );
    expect(current.dependencies.scheduleContinuation).toHaveBeenCalledOnce();
    expect(current.dependencies.notifyChanged).not.toHaveBeenCalledWith("project", "workflow.completed", "ITEM-ANY");
  });

  it("completes before worker dispatch when authoritative reconciliation is terminal", async () => {
    const current = harness([true]);
    current.feature.implementationEvidence = {
      phaseQualityGates: [{ phaseStatus: "COMPLETED", gates: [{ gate: "tests", status: "missing" }] }],
    };
    await current.application.execute(current.input);
    expect(current.dependencies.runAutonomous).not.toHaveBeenCalled();
    expect(current.dependencies.scheduleContinuation).not.toHaveBeenCalled();
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalledWith(expect.objectContaining({
      summary: expect.stringContaining("Manual Code Review and Manual Tests"),
    }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.completed", "ITEM-ANY");
  });

  it("clears and publishes cancellation without recovery", async () => {
    const current = harness();
    current.dependencies.findCurrentFeature.mockRejectedValueOnce(new Error("cancelled"));
    current.dependencies.isCancelled.mockReturnValueOnce(true);
    await current.application.execute(current.input);
    expect(current.dependencies.clearCancellation).toHaveBeenCalledWith("run");
    expect(current.dependencies.attemptRecovery).not.toHaveBeenCalled();
  });

  it("records successful automatic recovery as completion", async () => {
    const current = harness();
    current.dependencies.runAutonomous.mockRejectedValueOnce(new Error("worker failed"));
    current.dependencies.attemptRecovery.mockResolvedValueOnce({ errorMessage: "", failureBrief: null, output: "recovered", recovered: true });
    await current.application.execute(current.input);
    expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).toHaveBeenCalled();
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.completed", "ITEM-ANY");
  });

  it("persists an unrecovered policy failure with its classified state", async () => {
    const current = harness();
    current.dependencies.runAutonomous.mockRejectedValueOnce(new Error("worker failed"));
    current.dependencies.classifyBlocked.mockReturnValueOnce(true);
    await current.application.execute(current.input);
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked", summary: "brief" }),
    );
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "workflow.blocked", "ITEM-ANY");
  });

  it("does not terminally complete a failed autonomous run because an earlier phase is complete", async () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-completed-phase-"));
    const documentPath = join(root, "Phases", "phase-0.md");
    mkdirSync(join(root, "Phases"), { recursive: true });
    writeFileSync(documentPath, "## Phase Task Ledger\n\n- [x] completed task\n");
    try {
      const current = harness();
      current.feature.phases = [{ number: 0, title: "Health check", documentPath, status: "COMPLETED" }];
      current.dependencies.runAutonomous.mockRejectedValueOnce(new Error("worker failed"));
      await current.application.execute(current.input);

      expect(current.dependencies.attemptRecovery).toHaveBeenCalledWith(expect.objectContaining({
        errorMessage: "worker failed",
      }));
      expect(current.dependencies.metadataStore.recordFeatureWorkflowCompletion).not.toHaveBeenCalledWith(
        expect.objectContaining({ summary: expect.stringContaining("Phase 0 is genuinely complete") }),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
