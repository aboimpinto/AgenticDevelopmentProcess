import { describe, expect, it, vi } from "vitest";
import { StartTransitionStateRecorder } from "../src/application/features/start-transition-state-recorder.js";

const input = {
  baseBranch: "trunk",
  cardKey: "work-item-key",
  deliveryPolicy: "branch",
  projectId: "project-key",
  repoRoot: "/workspace/project",
  runId: "run-key",
  startCommit: "0123456789abcdef",
  startedAt: "2031-04-05T06:07:08.000Z",
};

describe("start-transition state recorder", () => {
  it("records the prerequisite snapshot before mutable transition work", async () => {
    const recordStartTransition = vi.fn().mockResolvedValue(undefined);
    const recorder = new StartTransitionStateRecorder({ store: { recordStartTransition } });

    await recorder.record(input);

    expect(recordStartTransition).toHaveBeenCalledWith({
      ...input,
      completedAt: null,
      failureReason: null,
      implementationBranch: null,
      rolledBack: false,
      transitionStatus: "prerequisites_ready",
      transitionStep: "persist_metadata",
      worktreePath: null,
    });
  });

  it("reports storage errors without rejecting workflow start", async () => {
    const storageError = new Error("storage temporarily unavailable");
    const reportError = vi.fn();
    const recorder = new StartTransitionStateRecorder({
      reportError,
      store: { recordStartTransition: vi.fn().mockRejectedValue(storageError) },
    });

    await expect(recorder.record(input)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      "Start-transition state recording failed for work-item-key.",
      storageError,
    );
  });
});
