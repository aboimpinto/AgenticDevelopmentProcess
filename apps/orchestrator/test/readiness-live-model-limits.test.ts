import { expect, it, vi } from "vitest";
import type { CatalogModelRecord, HandoffPlanV1 } from "@hepha/shared";
import { createReadinessPromptRunners } from "../src/runtime/pi/readiness-prompt-session.js";
import { contextCompactionLevel, progressiveContextBudget } from "../src/runtime/pi/progressive-context-policy.js";

function fixture(rows: unknown[], fallback = false) {
  const plan = { steps: [{ kind: "primary", route: { connectionId: "primary", modelId: "gpt-5" } },
    ...(fallback ? [{ kind: "recovery", route: { connectionId: "fallback", modelId: "gpt-5" } }] : [])] } as HandoffPlanV1;
  const cached = { identity: { modelId: "gpt-5" }, contextWindowTokens: 200_000,
    maxOutputTokens: 128_000, capabilities: { reasoning: true } } as CatalogModelRecord;
  const run = vi.fn(async () => "ok");
  const process = { listModels: vi.fn(async () => ({ kind: "success" as const, stdout: JSON.stringify({ models: rows }) })) };
  const runners = createReadinessPromptRunners(() => ({ resolvePlan: () => plan }),
    { listModelsForConnection: () => [cached] }, run, id => id === "primary" ? "openai-codex" : "openai", process);
  return { runners, process, run, cached };
}
const row = (providerId = "openai-codex", contextWindowTokens = 1_000_000) => ({ providerId, modelId: "gpt-5",
  contextWindowTokens, maxOutputTokens: 128_000, capabilities: { reasoning: true } });

it("LC-01: stale cached limits cannot trigger startup compaction below the current runtime threshold", async () => {
  const { runners, process, cached } = fixture([row(), row("other", 160_000)]);
  const session = await runners.createReadinessPromptSession();
  expect(session.model.contextWindow).toBe(1_000_000);
  expect(contextCompactionLevel(160_000, progressiveContextBudget(session.model))).toBe("none");
  await session.runPrompt("assessment"); await session.runPrompt("routing");
  expect(process.listModels).toHaveBeenCalledTimes(1);
  expect(cached.contextWindowTokens).toBe(200_000); // No catalogue mutation.
  await runners.createReadinessPromptSession();
  expect(process.listModels).toHaveBeenCalledTimes(2); // No stale cross-refresh cache.
});

it("LC-02: a genuinely smaller approved fallback still retains the progressive safeguards", async () => {
  const { runners } = fixture([row(), row("openai", 180_000)], true);
  const session = await runners.createReadinessPromptSession();
  const budget = progressiveContextBudget(session.model);
  expect(session.model.contextWindow).toBe(180_000);
  expect(contextCompactionLevel(budget.lightTokens - 1, budget)).toBe("none");
  expect(contextCompactionLevel(budget.lightTokens, budget)).toBe("light");
  expect(contextCompactionLevel(budget.strongTokens, budget)).toBe("strong");
});

it.each([[], [row("different-provider")], [row(), row()], [{ ...row(), contextWindowTokens: 0 }],
  [{ ...row(), capabilities: { reasoning: false } }]].map(rows => [rows]))("LC-03: missing or ambiguous live metadata never falls back to stale limits (%j)", async rows => {
  const { runners, run } = fixture(rows);
  await expect(runners.createReadinessPromptSession()).rejects.toThrow("HEPHA_MODEL_CONTEXT_UNKNOWN");
  expect(run).not.toHaveBeenCalled();
});
