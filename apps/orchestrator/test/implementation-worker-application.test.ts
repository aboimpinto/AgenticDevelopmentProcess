import { describe, expect, it, vi } from "vitest";
import { ImplementationWorkerApplication } from "../src/workflows/phases/implementation-worker-application.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

const selectedPlan = handoffPlan("selected");
const input = { agentAction: "continue-implementing", agentName: "Worker", agentRole: "implementation", cardKey: "card", feature: {} as any,
  plan: selectedPlan, phaseNumber: 3, phaseTitle: "Any", project: { id: "project", rootPath: "/project" } as any,
  prompt: "prompt", runId: "run", step: "Implementing" };

function target(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const recordAgentRun = vi.fn(async (entry: any) => { events.push(`record:${entry.status}`); });
  const appendAudit = vi.fn((entry: any) => { events.push(`audit:${entry.status}`); });
  const runPrompt = vi.fn(async () => { events.push("prompt"); return "DONE"; });
  const application = new ImplementationWorkerApplication({
    appendAudit, appendProfile: (summary, profile) => `${summary} [${profile.profileId}]`,
    assertRunActive: () => { events.push("active"); }, buildSessionFile: () => "/session.json",
    createId: () => "id", formatFailure: ({ agentName, error }) => `${agentName}: ${(error as Error).message}`,
    isCancelled: () => false, recordAgentRun,
    runPrompt, summarizeOutput: (output) => output, validateActionPlan: () => true, validateNodeSkill: () => ({ status: "valid" }), ...overrides,
  } as any);
  return { application, appendAudit, events, recordAgentRun, runPrompt };
}

describe("ImplementationWorkerApplication", () => {
  it("persists running, audits the attempt, runs Pi, and persists completion in order", async () => {
    const item = target();
    await expect(item.application.execute(input)).resolves.toBe("DONE");
    expect(item.events).toEqual(["record:running", "active", "audit:running", "prompt", "audit:completed", "record:completed"]);
    expect(item.runPrompt).toHaveBeenCalledWith("prompt", selectedPlan, expect.objectContaining({ sessionFile: "/session.json" }));
    expect(item.recordAgentRun).toHaveBeenLastCalledWith(expect.objectContaining({
      model: "selected",
      phaseNumber: 3,
      phaseTitle: "Any",
      status: "completed",
    }));
  });

  it("binds stable phase and task identity into the plan-bound runtime context", async () => {
    const item = target();
    await item.application.execute({
      ...input,
      phaseExecutionContractId: "semantic-phase-contract",
      phaseNumber: 0,
      taskId: "semantic-task",
    });
    expect(item.runPrompt).toHaveBeenCalledWith("prompt", selectedPlan, expect.objectContaining({
      runtimeContext: {
        cardKey: "card",
        phaseExecutionContractId: "semantic-phase-contract",
        phaseNumber: 0,
        selectedLessonIds: [],
        taskId: "semantic-task",
      },
    }));
  });

  it("rejects unknown registry bindings and plan-action conflicts before telemetry or launch", async () => {
    const malformed = target();
    await expect(malformed.application.execute({ ...input, plan: {} as never })).rejects.toThrow("RUNTIME_INVALID_PLAN");
    expect(malformed.recordAgentRun).not.toHaveBeenCalled();
    expect(malformed.runPrompt).not.toHaveBeenCalled();

    const unknown = target({ validateActionPlan: () => false });
    await expect(unknown.application.execute(input)).rejects.toThrow("AGENT_ACTION_UNKNOWN");
    expect(unknown.recordAgentRun).not.toHaveBeenCalled();
    expect(unknown.runPrompt).not.toHaveBeenCalled();

    const conflict = target();
    await expect(conflict.application.execute({ ...input, agentAction: "phase-worker" })).rejects.toThrow("AGENT_ACTION_CONFLICT");
    expect(conflict.recordAgentRun).not.toHaveBeenCalled();
    expect(conflict.runPrompt).not.toHaveBeenCalled();
  });

  it("fails before launch when the declared skill contract is blocked", async () => {
    const item = target({ validateNodeSkill: () => ({ status: "blocked", blockedMessage: "missing skill" }) });
    await expect(item.application.execute({ ...input, node: { agentAction: "continue-implementing", kind: "prompt", skill: "required" } as any })).rejects.toThrow("missing skill");
    expect(item.runPrompt).not.toHaveBeenCalled();
    expect(item.recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("audits and persists a provider failure with resolved model context", async () => {
    const item = target({ runPrompt: vi.fn().mockRejectedValue(new Error("offline")) });
    await expect(item.application.execute(input)).rejects.toThrow("Worker: offline");
    expect(item.appendAudit).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
    expect(item.recordAgentRun).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", error: "Worker: offline" }));
  });

  it("derives a fresh session file from every new worker identity", async () => {
    let sequence = 0;
    const item = target({
      createId: () => `agent-${++sequence}`,
      buildSessionFile: ({ agentRunId }: { agentRunId: string }) => `/sessions/${agentRunId}.json`,
    });
    await item.application.execute(input);
    await item.application.execute(input);
    expect(item.runPrompt.mock.calls.map((call) => call[2]?.sessionFile)).toEqual([
      "/sessions/agent-agent-1.json",
      "/sessions/agent-agent-2.json",
    ]);
  });

  it("rethrows cancellation without persisting an ordinary failed run", async () => {
    const cancelled = new Error("cancelled");
    const item = target({ isCancelled: (error: unknown) => error === cancelled, runPrompt: vi.fn().mockRejectedValue(cancelled) });
    await expect(item.application.execute(input)).rejects.toBe(cancelled);
    expect(item.appendAudit).toHaveBeenLastCalledWith(expect.objectContaining({ status: "cancelled" }));
    expect(item.recordAgentRun).toHaveBeenCalledTimes(1);
  });
});
