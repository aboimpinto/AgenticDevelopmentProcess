import type { AggregateVerificationResult } from "../../final-verification-types.js";

/** Interpret a phase boundary without rewriting the raw executor result. */
export function hasOnlyPhaseHealthWarnings(result: AggregateVerificationResult): boolean {
  const unresolved = result.checks.filter(check => check.required && !["passed", "advisory", "coverage-unavailable"].includes(check.outcome));
  return unresolved.length > 0 && unresolved.every(check => check.intent === "build" || check.intent === "lint")
    && result.failedRequiredChecks.every(id => unresolved.some(check => check.checkId === id));
}
