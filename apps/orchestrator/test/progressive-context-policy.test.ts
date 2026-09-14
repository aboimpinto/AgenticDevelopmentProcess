import { expect, it, vi } from "vitest";
import { progressiveContextBudget, contextCompactionLevel } from "../src/runtime/pi/progressive-context-policy.js";
import { createReadinessPromptSession, createReadinessPromptRunners } from "../src/runtime/pi/readiness-prompt-session.js";
import type { CatalogModelRecord, HandoffPlanV1 } from "@hepha/shared";
import { getModelTokenCounter } from "../src/runtime/pi/model-token-counter.js";

it("does not plan with an unenforceable small output allowance on a Codex subscription route", () => {
  const codex = { id: "gpt-5", provider: "openai-codex", contextWindow: 272000, maxTokens: 128000, reasoning: true };
  expect(progressiveContextBudget(codex).outputTokens).toBe(128000);
  expect(progressiveContextBudget(codex).availableInputTokens).toBe(139904);
  expect(progressiveContextBudget({ ...codex, provider: "openai" }).outputTokens).toBe(16384);
});

it("propagates the real connection provider to pinned planning, including a Codex fallback", async () => {
  const plan = { steps: [{ kind: "primary", route: { connectionId: "api", modelId: "gpt-5" } },
    { kind: "recovery", route: { connectionId: "subscription", modelId: "gpt-5" } }] } as HandoffPlanV1;
  const record = { identity: { modelId: "gpt-5" }, contextWindowTokens: 272000,
    maxOutputTokens: 128000, capabilities: { reasoning: true } } as CatalogModelRecord;
  const runners = createReadinessPromptRunners(() => ({ resolvePlan: () => plan }),
    { listModelsForConnection: () => [record] }, async () => "ok", id => id === "api" ? "openai" : "openai-codex",
    { listModels: async () => ({ kind: "success", stdout: JSON.stringify({ models: ["openai", "openai-codex"].map(providerId => ({ ...record, providerId, modelId: "gpt-5" })) }) }) });
  const session = await runners.createReadinessPromptSession();
  expect(session.model.provider).toBe("openai-codex");
  expect(progressiveContextBudget(session.model).availableInputTokens).toBe(139904);
  await expect(session.runPrompt("hello")).resolves.toBe("ok");
});

it("pins the lazy production route and forwards the planner output allowance to Pi", async () => {
  const plan = { steps: [{ kind: "primary", route: { connectionId: "local", modelId: "gpt-5" } }] } as HandoffPlanV1;
  const record = { identity: { connectionId: "local", modelId: "gpt-5" }, contextWindowTokens: 200_000,
    maxOutputTokens: 128_000, capabilities: { reasoning: true } } as CatalogModelRecord;
  let resolutions = 0;
  const calls: unknown[] = [];
  const runners = createReadinessPromptRunners(() => ({ resolvePlan: () => { resolutions++; return plan; } }),
    { listModelsForConnection: () => [record] }, async (...args) => { calls.push(args); return "ok"; }, () => "openai",
    { listModels: async () => ({ kind: "success", stdout: JSON.stringify({ models: [{ ...record, providerId: "openai", modelId: "gpt-5" }] }) }) });
  expect(resolutions).toBe(0);
  const session = await runners.createReadinessPromptSession();
  await session.runPrompt("first"); await session.runPrompt("second");
  expect(resolutions).toBe(1);
  expect(calls).toEqual([expect.arrayContaining(["first", plan, expect.objectContaining({ maxOutputTokens: 16_384 })]),
    expect.arrayContaining(["second", plan, expect.objectContaining({ maxOutputTokens: 16_384 })])]);
  expect(calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ maxRuntimeMs: null, stallTimeoutMs: 120_000 })]));
});

it("starts light compaction at 50 percent and strong compaction at 80 percent of available input", () => {
  const budget = progressiveContextBudget({ contextWindow: 100_000, maxTokens: 20_000, reasoning: true });
  expect(budget.availableInputTokens).toBe(79_520);
  expect(contextCompactionLevel(budget.lightTokens - 1, budget)).toBe("none");
  expect(contextCompactionLevel(budget.lightTokens, budget)).toBe("light");
  expect(contextCompactionLevel(budget.strongTokens - 1, budget)).toBe("light");
  expect(contextCompactionLevel(budget.strongTokens, budget)).toBe("strong");
  expect(budget.targetTokens).toBeLessThan(budget.strongTokens);
});

it("pins a plan and accounts for a smaller approved fallback; missing metadata never dispatches", async () => {
  const plan = { steps: [{ kind: "primary", route: { connectionId: "local", modelId: "large" } },
    { kind: "recovery", route: { connectionId: "local", modelId: "small" } }] } as HandoffPlanV1;
  const lookup = (_connection: string, id: string) => ({ contextWindowTokens: id === "large" ? 1_000_000 : 100_000,
    maxOutputTokens: 20_000, capabilities: { reasoning: true } }) as CatalogModelRecord;
  const calls: HandoffPlanV1[] = [];
  const session = createReadinessPromptSession(plan, lookup, async (_p, pinned) => { calls.push(pinned); return "ok"; });
  expect(session.model.contextWindow).toBe(100_000);
  await session.runPrompt("one"); await session.runPrompt("two"); expect(calls).toEqual([plan, plan]);
  expect(() => createReadinessPromptSession(plan, () => undefined, async () => { throw new Error("must not run"); })).toThrow("CONTEXT_UNKNOWN");
});

it("uses model capacity and cost limits without assuming a feature or model name", () => {
  const small = progressiveContextBudget({ contextWindow: 32_000, maxTokens: 8000, reasoning: true });
  const large = progressiveContextBudget({ contextWindow: 1_000_000, maxTokens: 32_000, reasoning: true });
  expect(small.availableInputTokens).toBeLessThan(large.availableInputTokens);
  expect(large.availableInputTokens).toBeGreaterThan(900_000);
  expect(() => progressiveContextBudget({ contextWindow: 0, maxTokens: 8000, reasoning: true })).toThrow();
  expect(() => progressiveContextBudget({ contextWindow: 8000, maxTokens: 8000, reasoning: true })).toThrow();
});

it("enforces a whole-refresh budget across separate model calls including failed calls", async () => {
  vi.stubEnv("HEPHA_READINESS_MAX_INPUT_TOKENS", "512000");
  try {
  const plan = { steps: [{ kind: "primary", route: { connectionId: "local", modelId: "large" } }] } as HandoffPlanV1;
  let calls = 0;
  const session = createReadinessPromptSession(plan, () => ({ contextWindowTokens: 1_000_000, maxOutputTokens: 32_000,
    capabilities: { reasoning: true } }) as CatalogModelRecord, async () => { calls++; throw new Error("provider failure still consumed input"); });
  const prompt = "hello ".repeat(60_000), allowed = Math.floor(512_000 / (getModelTokenCounter().count(prompt) + 2048));
  for (let i = 0; i < allowed; i++) await expect(session.runPrompt(prompt)).rejects.toThrow("provider failure");
  expect(() => session.runPrompt(prompt)).toThrow("INPUT_USAGE_BUDGET_EXCEEDED");
  expect(calls).toBe(allowed);
  } finally { vi.unstubAllEnvs(); }
});
