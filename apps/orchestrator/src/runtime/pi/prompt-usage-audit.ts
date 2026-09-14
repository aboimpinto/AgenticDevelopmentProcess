import { appendFileSync } from "node:fs";

/** Numeric-only diagnostics: no source text, tool arguments, credentials or responses. */
export function createPromptUsageAudit(path: string) {
  let pending = "";
  const append = (kind: string, value: Record<string, unknown>, keys: string[]) => {
    const counts = Object.fromEntries(keys.flatMap(key => typeof value[key] === "number" && Number.isFinite(value[key]) && Number(value[key]) >= 0 ? [[key, value[key]]] : []));
    if (!Object.keys(counts).length) return;
    try { appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), kind, ...counts }) + "\n", "utf8"); } catch { /* diagnostics cannot change the workflow outcome */ }
  };
  return {
    stderr(chunk: string) {
      pending += chunk;
      const lines = pending.split("\n"); pending = lines.pop()!.slice(-8192);
      for (const line of lines) {
        if (!line.startsWith("HEPHA_MODEL_REQUEST ")) continue;
        try { append("request-token-count", JSON.parse(line.slice(20)), ["inputBytes", "inputTokens", "availableInputTokens", "contextUsagePercent", "outputReserveTokens", "cumulativeInputTokens", "contextWindowTokens", "beforeCompactionTokens", "compactionThresholdPercent"]); } catch { /* partial/invalid telemetry is not evidence */ }
      }
    },
    event(event: Record<string, unknown>) {
      if (event.type !== "message_end" || !event.message || typeof event.message !== "object") return;
      const message = event.message as Record<string, unknown>;
      if (message.role !== "assistant" || !message.usage || typeof message.usage !== "object") return;
      append("provider-usage", message.usage as Record<string, unknown>, ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]);
    },
  };
}
