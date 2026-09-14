import type { CatalogModelRecord, HandoffPlanV1 } from "@hepha/shared";
import { progressiveContextBudget } from "./progressive-context-policy.js";
import type { PlanBoundPiPromptRunner } from "./plan-bound-pi-prompt-runner.js";
import { getModelTokenCounter, prepareModelTokenCounter } from "./model-token-counter.js";
import type { PiCatalogProcess } from "../../model-catalog/catalog-ports.js";
import { NodePiCatalogProcess } from "../../model-catalog/pi-catalog-process.js";
import { liveReadinessModelLimits } from "./live-readiness-model-limits.js";
import { assertInputSpending, inputSpendingLimit } from "./input-spending-policy.js";

export function createReadinessPromptRunners(resolver: () => { resolvePlan(action: "refine-feature"): HandoffPlanV1 },
  catalog: { listModelsForConnection(id: CatalogModelRecord["identity"]["connectionId"]): CatalogModelRecord[] }, run: PlanBoundPiPromptRunner,
  providerForConnection?: (id: CatalogModelRecord["identity"]["connectionId"]) => string | null,
  modelProcess: PiCatalogProcess = new NodePiCatalogProcess()) {
  const options = { maxRuntimeMs: 300_000, stallTimeoutMs: 120_000, timeoutLabel: "Manual-test/readiness assessment" };
  return {
    runManualTestAuthoringPrompt: (prompt: string) => run(prompt, resolver().resolvePlan("refine-feature"), options),
    createReadinessPromptSession: async () => {
      const plan = resolver().resolvePlan("refine-feature");
      const lookup = await liveReadinessModelLimits(plan,
        (connectionId, modelId) => catalog.listModelsForConnection(connectionId).find(entry => entry.identity.modelId === modelId),
        providerForConnection, modelProcess);
      for (const step of plan.steps) await prepareModelTokenCounter({ id: step.route.modelId, provider: providerForConnection?.(step.route.connectionId) ?? undefined });
      return createReadinessPromptSession(plan, lookup,
        (prompt, pinned) => run(prompt, pinned, { ...options, maxRuntimeMs: null, maxOutputTokens: 16_384 }), providerForConnection);
    },
  };
}

/** Pin the approved plan once. Account for every permitted route so a smaller
 * fallback never inherits the primary model's larger planning capacity. */
export function createReadinessPromptSession(plan: HandoffPlanV1, lookup: (connectionId: CatalogModelRecord["identity"]["connectionId"], modelId: string) => CatalogModelRecord | undefined,
  run: (prompt: string, plan: HandoffPlanV1) => Promise<string>, providerForConnection?: (id: CatalogModelRecord["identity"]["connectionId"]) => string | null) {
  const limits = plan.steps.map(({ route }) => {
    const record = lookup(route.connectionId, route.modelId);
    if (!record?.contextWindowTokens || !record.maxOutputTokens || record.capabilities.reasoning !== true) {
      throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: refresh the selected model catalogue; readiness requires input/output limits and High reasoning for every approved route.");
    }
    const provider = providerForConnection?.(route.connectionId);
    if (providerForConnection && !provider) throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: selected route provider could not be resolved.");
    const model = { id: record.identity?.modelId, provider: provider ?? undefined, contextWindow: record.contextWindowTokens, maxTokens: record.maxOutputTokens, reasoning: true };
    return { model, counter: getModelTokenCounter(model), budget: progressiveContextBudget(model) };
  });
  if (!limits.length) throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: no approved model route.");
  const restrictive = limits.reduce((a, b) => a.budget.availableInputTokens <= b.budget.availableInputTokens ? a : b);
  const counter = { encoding: [...new Set(limits.map(l => l.counter.encoding))].join("+"), count: (text: string) => Math.max(...limits.map(l => l.counter.count(text))) };
  let dispatchedTokens = 0;
  const spendingLimit = inputSpendingLimit("refresh");
  return { model: restrictive.model, counter, runPrompt: (prompt: string) => {
    const tokens = counter.count(prompt) + 2048;
    if (tokens > restrictive.budget.availableInputTokens) throw new Error("HEPHA_CONTEXT_BUDGET_EXCEEDED: readiness request exceeds the pinned model input capacity; no request sent.");
    assertInputSpending("refresh", dispatchedTokens, tokens, spendingLimit);
    dispatchedTokens += tokens;
    return run(prompt, plan);
  } };
}
