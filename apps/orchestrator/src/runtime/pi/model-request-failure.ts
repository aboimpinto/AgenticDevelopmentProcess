/** Usage telemetry stays in the stream/usage log, not the card's actionable error. */
export function presentModelRequestFailure(message: string): string {
  const lines = message.split(/\r?\n/).filter(line => !line.trimStart().startsWith("HEPHA_MODEL_REQUEST "));
  const policy = lines.find(line => /^HEPHA_(?:INPUT_USAGE_BUDGET_EXCEEDED|SPENDING_CONFIGURATION_INVALID|CONTEXT_BUDGET_EXCEEDED|MODEL_CONTEXT_UNKNOWN|HIGH_REASONING_REQUIRED|TOKENIZER_UNAVAILABLE|MODEL_REQUEST_REJECTED):/.test(line.trim()));
  return policy?.trim() ?? lines.join("\n").trim();
}
