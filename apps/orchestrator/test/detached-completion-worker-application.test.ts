import { describe, expect, it, vi } from "vitest";
import { DetachedCompletionWorkerApplication } from "../src/workflows/phases/detached-completion-worker-application.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

const plan = handoffPlan("model", "complete-feature");
const input = { agentName: "Completer", agentRole: "complete-feature", cardKey: "card", feature: {} as any,
  plan, phaseNumber: null, phaseTitle: null, project: { id: "project", rootPath: "/project" } as any,
  prompt: "prompt", runId: "run", step: "Completing" };

function target(overrides: Record<string, unknown> = {}) {
  const recordAgentRun = vi.fn().mockResolvedValue(undefined);
  const launch = vi.fn().mockResolvedValue({ pid: 42 });
  return { application: new DetachedCompletionWorkerApplication({
    buildSessionFile: () => "/session", createId: () => "id", formatFailure: ({ error }) => `failed: ${(error as Error).message}`,
    launch, recordAgentRun,
    ...overrides,
  } as any), launch, recordAgentRun };
}

describe("DetachedCompletionWorkerApplication", () => {
  it("records the pending run, launches detached Pi, and records its PID without claiming completion", async () => {
    const item = target();
    await expect(item.application.launch(input)).resolves.toBe("Detached complete-feature Pi skill launched as PID 42.");
    expect(item.recordAgentRun).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: "running", summary: expect.stringContaining("is running") }));
    expect(item.recordAgentRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: "running", summary: expect.stringContaining("PID 42") }));
    expect(item.launch).toHaveBeenCalledWith("prompt", plan, expect.objectContaining({ timeoutLabel: "Detached complete-feature Pi run" }));
  });

  it("starts the project-only curator only after a successful terminal completion", async () => {
    let settle!: (result: { ok: boolean }) => void;
    const completion = new Promise<{ ok: boolean }>((resolve) => { settle = resolve; });
    const afterSuccessfulCompletion = vi.fn(async () => undefined);
    const item = target({
      afterSuccessfulCompletion,
      launch: vi.fn().mockResolvedValue({ pid: 42, completion }),
    });
    await item.application.launch(input);
    expect(afterSuccessfulCompletion).not.toHaveBeenCalled();
    settle({ ok: true });
    await completion;
    await vi.waitFor(() => expect(afterSuccessfulCompletion).toHaveBeenCalledWith(input));
  });

  it("does not curate after a failed terminal completion", async () => {
    const afterSuccessfulCompletion = vi.fn(async () => undefined);
    const item = target({
      afterSuccessfulCompletion,
      launch: vi.fn().mockResolvedValue({ pid: 42, completion: Promise.resolve({ ok: false }) }),
    });
    await item.application.launch(input);
    await Promise.resolve();
    expect(afterSuccessfulCompletion).not.toHaveBeenCalled();
  });

  it("records launch failure best effort and rethrows attributed failure", async () => {
    const item = target({ launch: vi.fn().mockRejectedValue(new Error("spawn denied")) });
    await expect(item.application.launch(input)).rejects.toThrow("failed: spawn denied");
    expect(item.recordAgentRun).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: "failed: spawn denied" }));
  });
});
