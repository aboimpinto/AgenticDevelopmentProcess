/** Operator-owned cumulative input limits, independent of any model's context window.
 * These are local dispatch-token estimates, not provider-billed monetary limits.
 * Absent means no cumulative cap; context, timeout and stall guards still apply.
 */
export function inputSpendingLimit(scope: "attempt" | "refresh", env: NodeJS.ProcessEnv = process.env): number | null {
  const key = scope === "attempt" ? "HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS" : "HEPHA_READINESS_MAX_INPUT_TOKENS";
  const value = env[key]?.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)
    throw new Error(`HEPHA_SPENDING_CONFIGURATION_INVALID: ${key} must be a positive integer token count or unset. No request was sent.`);
  return Number(value);
}

export function assertInputSpending(scope: "attempt" | "refresh", consumed: number, next: number, limit = inputSpendingLimit(scope)): void {
  if (limit !== null && consumed + next > limit) throw new Error(
    `HEPHA_INPUT_USAGE_BUDGET_EXCEEDED: scope=${scope}; consumed=${consumed}; next=${next}; limit=${limit} tokens. This is the configured cumulative spending cap, not the model context window. No request was sent. Inspect saved progress and adjust the operator budget before an explicit retry; do not bypass the cap with automatic retries or model fallback.`,
  );
}
