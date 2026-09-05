import { describe, expect, it, vi } from "vitest";
import { AutonomousContinuationScheduler } from "../src/workflows/implementation/autonomous-continuation-scheduler.js";

function harness(options: {
  autonomous?: boolean;
  fingerprintAfter?: string;
  fingerprintBefore?: string;
  remaining?: boolean;
} = {}) {
  const input = {
    autonomous: options.autonomous ?? true,
    branchMessage: "branch ready",
    branchName: "feature-branch",
    cardKey: "feature:item",
    command: "continue-implementing",
    durableFingerprintBeforeRun: options.fingerprintBefore ?? "before",
    feature: { externalId: "ITEM-ANY", folderPath: "/feature", kind: "feature" },
    previousFailureBrief: null,
    project: { id: "project" },
    runId: "current-run",
  } as any;
  const dependencies = {
    captureDurableProgress: vi.fn(() => options.fingerprintAfter ?? "after"),
    createId: vi.fn(() => "next"),
    execute: vi.fn(async () => undefined),
    hasRemainingWork: vi.fn(() => options.remaining ?? true),
    metadataStore: { recordFeatureWorkflowRun: vi.fn(async () => undefined) },
    notifyChanged: vi.fn(),
  };
  return { input, dependencies, scheduler: new AutonomousContinuationScheduler(dependencies) };
}

describe("autonomous continuation scheduler", () => {
  it("persists and dispatches a fresh continuation only after durable progress", async () => {
    const current = harness();
    await expect(current.scheduler.schedule(current.input)).resolves.toBe("scheduled");
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ command: "continue-implementing", runId: "workflow-next", status: "running" }),
    );
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith(
      "project", "workflow.continuation-scheduled", "ITEM-ANY",
    );
    expect(current.dependencies.execute).toHaveBeenCalledWith(expect.objectContaining({
      autonomous: true,
      command: "continue-implementing",
      durableFingerprintBeforeRun: "after",
      recoveryAttempt: 0,
      runId: "workflow-next",
    }));
  });

  it("blocks instead of scheduling an equivalent run when unresolved evidence is unchanged", async () => {
    const current = harness({ fingerprintAfter: "same", fingerprintBefore: "same" });
    await expect(current.scheduler.schedule(current.input)).resolves.toBe("blocked");
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      currentNodeId: "continuation-circuit",
      error: expect.stringContaining("WORKFLOW_AWAITING_USER_DECISION"),
      runId: "current-run",
      status: "blocked",
    }));
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith(
      "project", "workflow.blocked", "ITEM-ANY",
    );
    expect(current.dependencies.execute).not.toHaveBeenCalled();
  });

  it("does not schedule or block a non-autonomous continuation", async () => {
    const current = harness({ autonomous: false, fingerprintAfter: "same", fingerprintBefore: "same" });
    await expect(current.scheduler.schedule(current.input)).resolves.toBe("not_scheduled");
    expect(current.dependencies.metadataStore.recordFeatureWorkflowRun).not.toHaveBeenCalled();
  });

  it("does not inspect progress or schedule when all phase work is resolved", async () => {
    const current = harness({ fingerprintAfter: "same", fingerprintBefore: "same", remaining: false });
    await expect(current.scheduler.schedule(current.input)).resolves.toBe("not_scheduled");
    expect(current.dependencies.captureDurableProgress).not.toHaveBeenCalled();
    expect(current.dependencies.execute).not.toHaveBeenCalled();
  });
});
