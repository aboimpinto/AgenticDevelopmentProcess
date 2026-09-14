/** Shared no-progress policy for readiness plan, execution and response repair.
 * Different diagnosed defects can advance; repeated/cycling defects cannot gain
 * retries through timestamps, response length or other audit-only changes. */
export class VerificationRecoveryProgress {
  private readonly seen = new Map<string, number>();
  observe(diagnostics: readonly string[]) {
    const key = JSON.stringify([...new Set(diagnostics)].sort());
    const occurrences = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, occurrences);
    return { occurrences, repeated: occurrences > 1, exhausted: occurrences >= 3 };
  }
}
