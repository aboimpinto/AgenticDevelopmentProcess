import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  agentTask: null as Record<string, unknown> | null,
  detached: null as Record<string, unknown> | null,
  oneShot: null as Record<string, unknown> | null,
}));

vi.mock("../src/runtime/pi/pi-one-shot-runner.js", () => ({
  createPiOneShotPromptRunner: vi.fn((config: Record<string, unknown>) => {
    captured.oneShot = config;
    return vi.fn();
  }),
}));

vi.mock("../src/runtime/pi/pi-detached-runner.js", () => ({
  createPinnedPiDetachedPromptRunner: vi.fn((config: Record<string, unknown>) => {
    captured.detached = config;
    return vi.fn();
  }),
}));

vi.mock("../src/runtime/pi/agent-task-runtime.js", () => ({
  AgentTaskRuntime: class {
    constructor(config: Record<string, unknown>) { captured.agentTask = config; }
  },
}));

import { createAgentRuntimeApplications } from "../src/bootstrap/agent-runtime-applications.js";

describe("agent runtime routing boundary", () => {
  it("keeps all Pi runtime entry points free of legacy environment authentication fallback", () => {
    createAgentRuntimeApplications({
      metadataStore: { recordImplementationAgentRun: vi.fn() } as never,
      routingCatalogStore: { listModels: () => [] },
      routingConnectionStore: { getConnection: () => null, listConnections: () => [] },
      routingInstallationDefault: null,
      routingStore: {
        getCurrentPolicy: () => null,
        applyMutation: () => ({ ok: false, code: "ROUTING_INVALID_POLICY" }),
      } as never,
      routingVault: { readSecret: vi.fn() },
      settings: {
        createPiProcessEnv: vi.fn(() => ({ DEEPSEEK_API_KEY: "must-not-be-routing-authority" })),
        implementationIdleTimeoutMs: 1_000,
        implementationRunTimeoutMs: 2_000,
        implementationSkillPaths: [],
        inferredWorkspaceRoot: `/tmp/hepha-agent-runtime-boundary-${process.pid}`,
        runTimeoutMs: 1_000,
        runtimeEnv: {},
        sessionDir: "/tmp/hepha-sessions",
        workspaceRoot: "/workspace",
      } as never,
    });

    for (const config of [captured.oneShot, captured.detached, captured.agentTask]) {
      expect(config).not.toHaveProperty("defaultModelKey");
      expect(config).not.toHaveProperty("models");
      expect(config).not.toHaveProperty("getAuthError");
    }
    expect(captured.agentTask?.resolvePlan).toBeTypeOf("function");
  });
});
