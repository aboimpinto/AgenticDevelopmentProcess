import { getModelTokenCounter, type ModelTokenIdentity } from "./model-token-counter.js";
import { assertInputSpending, inputSpendingLimit } from "./input-spending-policy.js";
/** Local tokenizer counts plus framing reserve; provider-billed usage is separate. */
export const MODEL_REQUEST_POLICY = Object.freeze({
  thinking: "high" as const,
  framingReserveTokens: 4096,
});

export interface RequestModelLimits extends ModelTokenIdentity { contextWindow: number; maxTokens: number; reasoning: boolean; api?: string }
export function assessModelRequest(payload: unknown, model: RequestModelLimits | undefined, thinking: string, consumed = 0, spendingLimit = inputSpendingLimit("attempt")) {
  if (!model || !Number.isSafeInteger(model.contextWindow) || model.contextWindow <= 0
    || !Number.isSafeInteger(model.maxTokens) || model.maxTokens <= 0) throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: refresh the model catalogue; no request was sent.");
  if (!model.reasoning || thinking !== MODEL_REQUEST_POLICY.thinking) throw new Error("HEPHA_HIGH_REASONING_REQUIRED: this route did not provide High reasoning; no request was sent.");
  const serialized = JSON.stringify(payload);
  const bytes = Buffer.byteLength(serialized, "utf8");
  const counter = getModelTokenCounter(model);
  const inputTokens = counter.count(serialized);
  const output = outputReservation(payload, model.maxTokens);
  const availableInputTokens = model.contextWindow - output - MODEL_REQUEST_POLICY.framingReserveTokens;
  if (inputTokens > availableInputTokens) {
    throw new Error(`HEPHA_CONTEXT_BUDGET_EXCEEDED: inputTokens=${inputTokens}; availableInputTokens=${availableInputTokens}; tokenizer=${counter.encoding}. Reduce or partition task context; no evidence was discarded and no request was sent.`);
  }
  assertInputSpending("attempt", consumed, inputTokens, spendingLimit);
  return { inputBytes: bytes, inputTokens, tokenizer: counter.encoding, availableInputTokens, contextUsagePercent: inputTokens / availableInputTokens * 100,
    outputReserveTokens: output, cumulativeInputTokens: consumed + inputTokens };
}

export function outputReservation(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") return fallback;
  const values = ["max_output_tokens", "max_completion_tokens", "max_tokens"].map(key => (payload as Record<string, unknown>)[key])
    .filter((x): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0);
  return values.length ? Math.max(...values) : fallback;
}
