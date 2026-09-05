// FEAT-044: Final Verification Runner — Pure Business Logic
//
// Pure policy and decision helpers for validated, serialized, fail-fast final
// verification. No process execution, filesystem I/O, clocks, or persistence.
// All side effects belong in the adapter (Phase 6).

import {
  type VerificationCheckDeclaration,
  type VerificationProfile,
  type VerificationCheckIntent,
  type CheckOutcome,
  type CheckResult,
  type AggregateVerificationStatus,
  type AggregateVerificationResult,
  REQUIRED_VERIFICATION_INTENTS,
} from "./final-verification-types.js";

// ---------------------------------------------------------------------------
// Profile normalization and validation (pure)
// ---------------------------------------------------------------------------

/**
 * Normalize a validated profile into resolved checks in canonical execution order
 * (profile declaration order). This is a pure identity wrapper — the canonical order
 * IS the declared order in the profile.
 */
export function normalizeChecks(profile: VerificationProfile): VerificationCheckDeclaration[] {
  return [...profile.checks];
}

/** Keeps expensive coverage commands at the declared terminal checkpoint. */
export function selectChecksForCheckpoint(
  checks: readonly VerificationCheckDeclaration[],
  checkpointKind: "phase" | "final_checkpoint",
): VerificationCheckDeclaration[] {
  return checks.filter((check) => check.runAt !== "final_checkpoint"
    || checkpointKind === "final_checkpoint");
}

/**
 * Detect duplicate check IDs in a list of declarations.
 * Returns the duplicate IDs found.
 */
export function detectDuplicateCheckIds(checks: VerificationCheckDeclaration[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const check of checks) {
    if (seen.has(check.id)) {
      duplicates.push(check.id);
    }
    seen.add(check.id);
  }

  return duplicates;
}

/**
 * Detect unsafe checks — those whose command contains characters that allow
 * shell evaluation (e.g., pipes, redirects, semicolons, subshells).
 * Returns the IDs of unsafe checks.
 *
 * This is a conservative pure check. The command-policy evaluator provides
 * the definitive safety gate at adapter time.
 */
export function detectUnsafeCommands(checks: VerificationCheckDeclaration[]): string[] {
  const shellMetaChars = /[|;&$`(){}<>!~*?\[\\#]/;
  const unsafe: string[] = [];

  for (const check of checks) {
    for (const arg of check.command) {
      if (shellMetaChars.test(arg)) {
        unsafe.push(check.id);
        break;
      }
    }
  }

  return unsafe;
}

/**
 * Verify that required intents (build, test, lint) are covered by at least one
 * `required: true` check.
 *
 * Returns the list of intents that have no required coverage.
 */
export function findMissingRequiredIntents(checks: VerificationCheckDeclaration[]): VerificationCheckIntent[] {
  const covered = new Set<VerificationCheckIntent>();

  for (const check of checks) {
    if (check.required) {
      covered.add(check.intent);
    }
  }

  return REQUIRED_VERIFICATION_INTENTS.filter((intent) => !covered.has(intent));
}

// ---------------------------------------------------------------------------
// Outcome classification (pure)
// ---------------------------------------------------------------------------

export interface ClassifyOutcomeParams {
  exitCode: number | null;
  timedOut: boolean;
  policyBlocked: boolean;
  skipped: boolean;
  zeroSelection: boolean;
}

/**
 * Classify a single check outcome deterministically.
 */
export function classifyOutcome(params: ClassifyOutcomeParams): CheckOutcome {
  if (params.timedOut) return "timed-out";
  if (params.policyBlocked) return "policy-blocked";
  if (params.skipped) return "skipped";
  if (params.zeroSelection) return "zero-selection";
  if (params.exitCode === 0) return "passed";
  if (params.exitCode !== null) return "failed";
  return "skipped";
}

/** Detect successful commands that selected no tests. Exit code alone is not coverage. */
export function detectsZeroTestSelection(output: string): boolean {
  return [
    /no test matches the given testcase filter/i,
    /no tests? (?:were )?(?:found|discovered|matched|selected)/i,
    /total tests:\s*0\b/i,
    /tests? run:\s*0\b/i,
    /test files?\s+no tests/i,
  ].some((pattern) => pattern.test(output));
}

/**
 * Coverage is decision-support telemetry. An execution, timeout, command,
 * baseline, report, or instrumentation error records an explicit unavailable
 * remark without turning the final checkpoint into a lifecycle stop.
 */
export function normalizeCoverageOutcome(
  intent: VerificationCheckIntent,
  outcome: CheckOutcome,
): CheckOutcome {
  if (intent !== "coverage" || outcome === "passed" || outcome === "advisory") return outcome;
  return "coverage-unavailable";
}

// ---------------------------------------------------------------------------
// Aggregate decision helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Build a deterministic serial execution plan — return the checks in their
 * declared order. This is a pure function; the adapter must execute them
 * one at a time.
 */
export function buildExecutionPlan(checks: VerificationCheckDeclaration[]): VerificationCheckDeclaration[] {
  return [...checks];
}

/**
 * Determine whether the next check should be suppressed given a list of
 * already-completed check results.
 *
 * Fail-fast rule: if any required executable gate has an unsuccessful
 * outcome, all subsequent required checks must be suppressed. Advisory
 * coverage and coverage-unavailable remarks are successful telemetry
 * outcomes and therefore never suppress later executable gates.
 */
export function shouldSuppressNextRequiredCheck(results: CheckResult[]): boolean {
  return results.some(
    (r) => r.required && !isSuccessfulOutcome(r.outcome),
  );
}

/**
 * Determine if the aggregate is a pass — all required executable gates
 * passed and any coverage check produced an accepted telemetry outcome.
 */
export function allRequiredChecksPassed(results: CheckResult[]): boolean {
  if (results.length === 0) return false;

  return results
    .filter((r) => r.required)
    .every((r) => isSuccessfulOutcome(r.outcome));
}

/**
 * Compute aggregate verification status from completed or blocked check results.
 */
export function computeAggregateStatus(results: CheckResult[]): AggregateVerificationStatus {
  if (results.length === 0) return "skipped";

  // Check if any required check was blocked by policy
  const hasPolicyBlocked = results.some(
    (r) => r.required && r.outcome === "policy-blocked",
  );
  if (hasPolicyBlocked) return "blocked";

  // Check if any required check timed out
  const hasTimeout = results.some(
    (r) => r.required && r.outcome === "timed-out",
  );
  if (hasTimeout) return "blocked";

  // Check if any required check failed
  const hasFailed = results.some(
    (r) => r.required && (r.outcome === "failed" || r.outcome === "zero-selection"),
  );
  if (hasFailed) return "failed";

  // Check if any required check was skipped
  const hasSkipped = results.some(
    (r) => r.required && r.outcome === "skipped",
  );
  if (hasSkipped) return "blocked";

  // All required checks have accepted outcomes; verify that required checks exist.
  const requiredCount = results.filter((r) => r.required).length;
  if (requiredCount === 0) return "skipped";

  return "passed";
}

/**
 * Get the IDs of required checks that did not pass.
 */
export function getFailedRequiredCheckIds(results: CheckResult[]): string[] {
  return results
    .filter((r) => r.required && !isSuccessfulOutcome(r.outcome))
    .map((r) => r.checkId);
}

function isSuccessfulOutcome(outcome: CheckOutcome): boolean {
  return outcome === "passed" || outcome === "advisory" || outcome === "coverage-unavailable";
}

/**
 * Get the blocked reason string for an aggregate result.
 */
export function getBlockedReason(results: CheckResult[], status: AggregateVerificationStatus): string | null {
  if (status !== "blocked" && status !== "failed") return null;

  for (const r of results) {
    if (!r.required) continue;

    switch (r.outcome) {
      case "policy-blocked":
        return `Check '${r.checkId}' blocked by command policy`;
      case "timed-out":
        return `Check '${r.checkId}' timed out after ${r.duration}ms`;
      case "failed":
        return r.exitCode === 0
          ? `Check '${r.checkId}' emitted warnings despite a successful exit code`
          : `Check '${r.checkId}' exited with code ${r.exitCode}`;
      case "skipped":
        return `Check '${r.checkId}' was skipped`;
      case "zero-selection":
        return `Check '${r.checkId}' selected zero tests`;
    }
  }

  return null;
}

/**
 * Compute total duration from a list of check results.
 */
export function computeTotalDuration(results: CheckResult[]): number {
  return results.reduce((sum, r) => sum + r.duration, 0);
}

/**
 * Build the full aggregate result from completed check results.
 *
 * This is the pure decision function that the adapter calls after all checks
 * have been attempted (or stopped early by fail-fast).
 */
export function buildAggregateResult(
  results: CheckResult[],
  startedAt: string,
  persistenceWarning: string | null,
): AggregateVerificationResult {
  const status = computeAggregateStatus(results);
  const failedRequiredChecks = getFailedRequiredCheckIds(results);
  const blockedReason = getBlockedReason(results, status);
  const duration = computeTotalDuration(results);

  return {
    status,
    failedRequiredChecks,
    blockedReason,
    persistenceWarning,
    checks: results,
    duration,
    startedAt,
  };
}
