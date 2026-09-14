import { assessModelRequest, outputReservation, type RequestModelLimits } from "./model-request-policy.js";
import { getModelTokenCounter, prepareModelTokenCounter, modelTokenizerNeedsPreparation } from "./model-token-counter.js";
import { compactPromptContext } from "./prompt-context-codec.js";
import { fileURLToPath } from "node:url";
import { contextCompactionLevel, progressiveContextBudget } from "./progressive-context-policy.js";
import { supportsTaskOutputLimit } from "./provider-output-policy.js";
import { inputSpendingLimit } from "./input-spending-policy.js";

/** Actual source/build module path; no installation-specific location. */
export const MODEL_REQUEST_GUARD_PATH = fileURLToPath(import.meta.url);

interface GuardContext { model?: RequestModelLimits }
interface GuardApi {
  getThinkingLevel(): string;
  setThinkingLevel(level: "high"): void;
  on(event: "before_provider_request", handler: (event: { payload: unknown }, context: GuardContext) => unknown): void;
}

/** Mandatory explicit Pi extension, including no-tools/no-auto-extensions runs.
 * Pi logs and swallows ordinary hook exceptions, so rejection must terminate the
 * isolated worker synchronously BEFORE control can return to its provider call.
 */
export default function modelRequestGuard(pi: GuardApi) {
  let consumed = 0;
  let spendingLimit: number | null | undefined;
  pi.on("before_provider_request", (event, context) => {
    const execute = () => {
    try {
      if (!context.model) throw new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: no effective model limits; no request was sent.");
      const boundedPayload = boundTaskOutput(event.payload, context.model);
      const budget = progressiveContextBudget(context.model, outputReservation(boundedPayload, context.model.maxTokens));
      const counter = getModelTokenCounter(context.model);
      const beforeCompactionTokens = counter.count(JSON.stringify(boundedPayload));
      const level = contextCompactionLevel(beforeCompactionTokens, budget);
      const candidate = level === "none" ? boundedPayload : compactRequestText(boundedPayload);
      const payload = counter.count(JSON.stringify(candidate)) < beforeCompactionTokens ? candidate : boundedPayload;
      if (spendingLimit === undefined) spendingLimit = inputSpendingLimit("attempt");
      const usage = assessModelRequest(payload, context.model, pi.getThinkingLevel(), consumed, spendingLimit);
      consumed = usage.cumulativeInputTokens;
      process.stderr.write(`HEPHA_MODEL_REQUEST ${JSON.stringify({ reasoning: "high", contextWindowTokens: context.model.contextWindow,
        beforeCompactionTokens, compactionThresholdPercent: level === "strong" ? 80 : level === "light" ? 50 : 0, ...usage })}\n`);
      return payload;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : "HEPHA_MODEL_REQUEST_REJECTED"}\n`);
      process.exit(78);
    }
    };
    try {
    if (context.model && modelTokenizerNeedsPreparation(context.model)) return prepareModelTokenCounter(context.model).then(execute, () => {
      process.stderr.write("HEPHA_TOKENIZER_UNAVAILABLE: could not prepare selected model tokenizer; no request sent.\n"); process.exit(78);
    });
    } catch { /* execute reports unsupported identity through the fatal guard. */ }
    return execute();
  });
}

export function boundTaskOutput(payload: unknown, model: RequestModelLimits): unknown {
  if (!supportsTaskOutputLimit(model)) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    const result = { ...payload } as Record<string, unknown>;
    for (const field of ["max_output_tokens", "max_completion_tokens", "max_tokens"]) delete result[field];
    return result;
  }
  const requested = Number(process.env.HEPHA_PI_OUTPUT_TOKEN_LIMIT);
  if (!Number.isSafeInteger(requested) || requested <= 0) return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("HEPHA_MODEL_REQUEST_REJECTED: cannot bind the task output allowance.");
  const result = { ...payload } as Record<string, unknown>;
  const limit = Math.min(requested, model.maxTokens, outputReservation(payload, model.maxTokens));
  const fields = ["max_output_tokens", "max_completion_tokens", "max_tokens"].filter(key => key in result);
  if (!fields.length) {
    if (model.api?.includes("responses")) fields.push("max_output_tokens");
    else if (model.api?.includes("completions") || model.api?.includes("anthropic")) fields.push("max_tokens");
    else throw new Error("HEPHA_MODEL_REQUEST_REJECTED: output-limit adapter unavailable for selected provider API.");
  }
  fields.forEach(field => { result[field] = limit; });
  return result;
}

/** Preserve wire structure, IDs, tool arguments, signatures and non-text blocks.
 * Only self-contained user/tool plain text is eligible for lossless encoding.
 */
export function compactRequestText(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const result = { ...payload } as Record<string, unknown>;
  for (const key of ["messages", "input"]) {
    const messages = result[key];
    if (typeof messages === "string" && key === "input") result[key] = compactPromptContext(messages);
    if (!Array.isArray(messages)) continue;
    result[key] = messages.map(message => {
      if (!message || typeof message !== "object" || !["user", "tool"].includes(message.role)) return message;
      const content = typeof message.content === "string" ? compactPromptContext(message.content)
        : Array.isArray(message.content) ? message.content.map((block: Record<string, unknown>) => ["text", "input_text"].includes(String(block.type)) && typeof block.text === "string"
          ? { ...block, text: compactPromptContext(block.text) } : block) : message.content;
      return { ...message, content };
    });
  }
  return result;
}
