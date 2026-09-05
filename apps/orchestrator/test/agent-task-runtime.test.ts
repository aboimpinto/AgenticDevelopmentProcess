import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentTaskRuntime, type AgentTaskRuntimeConfig } from "../src/runtime/pi/agent-task-runtime.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

function createRuntime(script: string, overrides: Partial<AgentTaskRuntimeConfig> = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-agent-task-"));
  roots.push(root);
  const scriptPath = resolve(root, "worker.mjs");
  writeFileSync(scriptPath, script, "utf8");
  return new AgentTaskRuntime({
    cancel: () => undefined,
    registeredActionIds: ["continue-implementing"],
    resolvePlan: () => handoffPlan("model"),
    runPrompt: async () => {
      if (script.includes("setInterval")) return await new Promise<string>(() => undefined);
      if (script.includes("failure detail")) throw new Error("failure detail");
      return "complete";
    },
    runTimeoutMs: 2000,
    validateActionPlan: validatesContinueImplementingPlan,
    workspaceRoot: root,
    ...overrides,
  });
}

async function waitFor(check: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  expect(check()).toBe(true);
}

function validatesContinueImplementingPlan(actionId: string, candidate: ReturnType<typeof handoffPlan>): boolean {
  const expected = handoffPlan("registry-model").resolvedRoute.action;
  const actual = candidate.resolvedRoute.action;
  return actionId === expected.actionId
    && actual.actionId === expected.actionId
    && actual.actionType === expected.actionType
    && actual.roleId === expected.roleId
    && actual.promptVersion === expected.promptVersion
    && actual.capabilityRequirements.minimumContextWindowTokens
      === expected.capabilityRequirements.minimumContextWindowTokens
    && actual.capabilityRequirements.requiresApi === expected.capabilityRequirements.requiresApi
    && actual.capabilityRequirements.requiresReasoning === expected.capabilityRequirements.requiresReasoning
    && actual.capabilityRequirements.requiresTools === expected.capabilityRequirements.requiresTools;
}

function planWith(
  action: Partial<ReturnType<typeof handoffPlan>["resolvedRoute"]["action"]>,
  capabilities: Partial<ReturnType<typeof handoffPlan>["resolvedRoute"]["action"]["capabilityRequirements"]> = {},
): ReturnType<typeof handoffPlan> {
  const base = handoffPlan("model");
  return {
    ...base,
    resolvedRoute: {
      ...base.resolvedRoute,
      action: {
        ...base.resolvedRoute.action,
        ...action,
        capabilityRequirements: {
          ...base.resolvedRoute.action.capabilityRequirements,
          ...capabilities,
        },
      },
    },
  };
}

describe("agent task runtime", () => {
  it("validates and creates queued tasks with deterministic identities and defaults", () => {
    const runtime = createRuntime("");

    expect(() => runtime.create({ agent_action: "continue-implementing", prompt: " " })).toThrow("Prompt is required");
    const first = runtime.create({ agent_action: "continue-implementing", prompt: " first " });
    const second = runtime.create({ agent: " Agent ", agent_action: "continue-implementing", prompt: "second", title: " Task " });

    expect(first).toEqual(expect.objectContaining({ id: "ADP-120", model: "model", prompt: "first", status: "queued" }));
    expect(second).toEqual(expect.objectContaining({ agent: "Agent", id: "ADP-121", model: "model", title: "Task" }));
    expect(runtime.find(first.id)).toEqual(first);
    expect(runtime.list()).toHaveLength(2);
    expect(runtime.find("missing")).toBeUndefined();
  });

  it("rejects missing unknown and route-bearing task actions before resolution or storage", () => {
    const resolvePlan = vi.fn(() => handoffPlan("model"));
    const runtime = createRuntime("", { resolvePlan });

    expect(() => runtime.create({ prompt: "missing" } as never)).toThrow("AGENT_DISPATCH_INVALID");
    expect(() => runtime.create({ agent_action: "unknown-action", prompt: "unknown" })).toThrow("AGENT_ACTION_UNKNOWN");
    expect(() => runtime.create({ agent_action: "continue-implementing", model: "forbidden", prompt: "extra" } as never))
      .toThrow("AGENT_DISPATCH_INVALID");
    expect(resolvePlan).not.toHaveBeenCalled();
    expect(runtime.list()).toEqual([]);
  });

  it("rejects a malformed or mismatched resolved task plan before storage", () => {
    const malformed = createRuntime("", { resolvePlan: () => ({}) as never });
    const mismatched = createRuntime("", { resolvePlan: () => handoffPlan("model", "phase-worker") });

    expect(() => malformed.create({ agent_action: "continue-implementing", prompt: "malformed" }))
      .toThrow("RUNTIME_INVALID_PLAN");
    expect(() => mismatched.create({ agent_action: "continue-implementing", prompt: "mismatched" }))
      .toThrow("RUNTIME_INVALID_PLAN");
    expect(malformed.list()).toEqual([]);
    expect(mismatched.list()).toEqual([]);
  });

  it("rejects every registry-conflicting resolved task plan before numbering or storage", () => {
    const invalidPlans: readonly [string, unknown][] = [
      ["malformed", {}],
      ["action", planWith({ actionId: "phase-worker" })],
      ["type", planWith({ actionType: "review" })],
      ["role", planWith({ roleId: "code-review-agent" })],
      ["prompt", planWith({ promptVersion: "implementation/v2" })],
      ["context", planWith({}, { minimumContextWindowTokens: 31_999 })],
      ["api", planWith({}, { requiresApi: false })],
      ["reasoning", planWith({}, { requiresReasoning: true })],
      ["tools", planWith({}, { requiresTools: false })],
    ];

    for (const [label, invalidPlan] of invalidPlans) {
      let resolvedPlan: unknown = invalidPlan;
      const runtime = createRuntime("", { resolvePlan: () => resolvedPlan as never });

      expect(
        () => runtime.create({ agent_action: "continue-implementing", prompt: label }),
        label,
      ).toThrow("RUNTIME_INVALID_PLAN");
      expect(runtime.list(), label).toEqual([]);

      resolvedPlan = handoffPlan("model");
      expect(runtime.create({ agent_action: "continue-implementing", prompt: `valid-${label}` }).id, label)
        .toBe("ADP-120");
    }
  });

  it("streams and completes a real Pi task process", async () => {
    const runtime = createRuntime(`
console.log(JSON.stringify({type:"message_update",assistantMessageEvent:{type:"text_delta",delta:"live"}}));
console.log(JSON.stringify({type:"message_end",message:{stopReason:"stop",content:"complete"}}));
`);
    const task = runtime.create({ agent_action: "continue-implementing", prompt: "execute" });

    runtime.start(task.id);
    await waitFor(() => runtime.find(task.id)?.status === "completed");

    expect(runtime.find(task.id)).toEqual(expect.objectContaining({
      columnId: "done", output: "complete", progress: 100, state: "Done", status: "completed",
    }));
    expect(runtime.find(task.id)?.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.started", "process.spawned", "agent.output.started", "agent.completed",
    ]));
    expect(runtime.hasActiveRuns()).toBe(false);
  });

  it("fails before spawning when model authentication is unavailable", async () => {
    const runtime = createRuntime("", { runPrompt: async () => { throw new Error("authentication missing"); } });
    const task = runtime.create({ agent_action: "continue-implementing", prompt: "execute" });

    runtime.start(task.id);
    await waitFor(() => runtime.find(task.id)?.status === "failed");

    expect(runtime.find(task.id)).toEqual(expect.objectContaining({ status: "failed", output: "authentication missing" }));
    expect(runtime.hasActiveRuns()).toBe(false);
  });

  it("cancels a running process and ignores invalid repeated commands", async () => {
    const runtime = createRuntime("setInterval(() => {}, 1000);");
    const task = runtime.create({ agent_action: "continue-implementing", prompt: "execute" });

    runtime.start(task.id);
    runtime.start(task.id);
    await waitFor(() => runtime.hasActiveRuns());
    runtime.cancel(task.id);
    runtime.cancel(task.id);

    expect(runtime.find(task.id)).toEqual(expect.objectContaining({ status: "cancelled", progress: 100 }));
    expect(runtime.hasActiveRuns()).toBe(false);
  });

  it("records process failure diagnostics", async () => {
    const runtime = createRuntime('console.error("failure detail"); process.exitCode = 4;');
    const task = runtime.create({ agent_action: "continue-implementing", prompt: "execute" });

    runtime.start(task.id);
    await waitFor(() => runtime.find(task.id)?.status === "failed");

    expect(runtime.find(task.id)?.output).toBe("failure detail");
    expect(runtime.hasActiveRuns()).toBe(false);
  });
});
