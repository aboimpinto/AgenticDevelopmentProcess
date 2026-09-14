import { MODEL_REQUEST_POLICY, type RequestModelLimits } from "./model-request-policy.js";
import { taskOutputReservation } from "./provider-output-policy.js";

export type CompactionLevel = "none" | "light" | "strong";
/** Context occupancy is token based. Spending caps never shrink this denominator. */
export function progressiveContextBudget(model: RequestModelLimits, outputTokens = taskOutputReservation(model)) {
  if (!Number.isSafeInteger(model.contextWindow) || !Number.isSafeInteger(model.maxTokens)
    || model.maxTokens <= 0 || !Number.isSafeInteger(outputTokens) || outputTokens <= 0 || outputTokens > model.maxTokens
    || !model.reasoning) throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: valid model limits and High reasoning are required.");
  const availableInputTokens = model.contextWindow - outputTokens - MODEL_REQUEST_POLICY.framingReserveTokens;
  if (availableInputTokens <= 0) throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: no input capacity remains after output and framing reserves.");
  return { availableInputTokens, outputTokens,
    lightTokens: Math.floor(availableInputTokens * 0.5), strongTokens: Math.floor(availableInputTokens * 0.8),
    targetTokens: Math.floor(availableInputTokens * 0.75) };
}
export function contextCompactionLevel(tokens: number, budget: ReturnType<typeof progressiveContextBudget>): CompactionLevel {
  return tokens >= budget.strongTokens ? "strong" : tokens >= budget.lightTokens ? "light" : "none";
}
