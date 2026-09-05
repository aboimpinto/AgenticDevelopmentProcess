// FEAT-044: Final Verification Runner — Shared Types
//
// Domain types for profile declarations, resolved checks, per-attempt results,
// aggregate final-verification status, and persistence-warning state.

// ---------------------------------------------------------------------------
// Profile definition types
// ---------------------------------------------------------------------------

/** Declared intent label for a verification check. */
export type VerificationCheckIntent = "build" | "test" | "lint" | "coverage";

/**
 * Canonical set of required intents. Every profile must cover at least one
 * `required: true` check for each of these intents.
 */
export const REQUIRED_VERIFICATION_INTENTS: readonly VerificationCheckIntent[] = ["build", "test", "lint", "coverage"] as const;

export interface CoverageTelemetryDeclaration {
  /** LCOV report path relative to the project execution root. */
  reportPath: string;
  format: "lcov";
  /** Project-relative production paths owned by this report. */
  include: string[];
  /** Project-relative paths that contain no executable production behavior. */
  exclude: string[];
  /** Advisory changed-line reference; never fails a phase by percentage alone. */
  minimumPercent: number;
  /** Non-blocking engineering target reported with the receipt. */
  targetPercent: number;
  /** Maximum FEAT-scoped improvement attempts before accepting the advisory. */
  improvementAttempts: number;
}

/** Declared check entry from the YAML profile. */
export interface VerificationCheckDeclaration {
  id: string;
  description: string;
  intent: VerificationCheckIntent;
  /** Safe argv array — never a shell string. */
  command: string[];
  /** Relative to the resolved execution root. */
  workingDirectory: string;
  /** Timeout in milliseconds. */
  timeout: number;
  /**
   * If true, failure/skip/timeout blocks completion for executable quality
   * gates. Coverage execution and measurement errors are recorded as
   * non-blocking `coverage-unavailable` remarks because coverage is telemetry.
   */
  required: boolean;
  /** Coverage is expensive and belongs to the declared final checkpoint. */
  runAt?: "always" | "final_checkpoint";
  /** Required machine-report contract when intent is coverage. */
  coverage?: CoverageTelemetryDeclaration;
}

/** Validated and resolved verification profile. */
export interface VerificationProfile {
  version: string;
  description: string;
  /** Ordered checks in declared (execution) order. */
  checks: VerificationCheckDeclaration[];
}

// ---------------------------------------------------------------------------
// Profile validation error types
// ---------------------------------------------------------------------------

export type ProfileValidationIssueKind =
  | "missing-file"
  | "invalid-yaml"
  | "missing-checks"
  | "zero-checks"
  | "duplicate-check-id"
  | "invalid-intent"
  | "missing-required-intent"
  | "unsafe-command-type"
  | "unsafe-working-directory"
  | "invalid-run-stage"
  | "invalid-coverage-contract"
  | "policy-blocked"
  | "timeout-too-low";

export interface ProfileValidationIssue {
  kind: ProfileValidationIssueKind;
  message: string;
  checkId?: string;
  missingIntents?: VerificationCheckIntent[];
}

export interface ProfileValidationResult {
  valid: boolean;
  profile: VerificationProfile | null;
  issues: ProfileValidationIssue[];
}

// ---------------------------------------------------------------------------
// Execution / result types
// ---------------------------------------------------------------------------

export type CheckOutcome =
  | "passed"
  | "advisory"
  | "coverage-unavailable"
  | "failed"
  | "timed-out"
  | "policy-blocked"
  | "skipped"
  | "zero-selection";

export interface CheckResult {
  checkId: string;
  intent: VerificationCheckIntent;
  description: string;
  command: string[];
  workingDirectory: string;
  outcome: CheckOutcome;
  duration: number;           // wall-clock ms
  exitCode: number | null;    // null for policy/skip outcomes
  startedAt: string;          // ISO timestamp
  outputSummary: string;      // truncated, redacted
  required: boolean;
  /** Present only for a non-blocking coverage improvement opportunity. */
  advisoryRepairLimit?: number;
}

export type AggregateVerificationStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "skipped";

export interface AggregateVerificationResult {
  status: AggregateVerificationStatus;
  failedRequiredChecks: string[];
  blockedReason: string | null;
  persistenceWarning: string | null;
  checks: CheckResult[];
  duration: number;           // total wall-clock ms
  startedAt: string;          // ISO timestamp
}

// ---------------------------------------------------------------------------
// Store / evidence types (used by @hepha/db persistence)
// ---------------------------------------------------------------------------

export interface FinalVerificationRunRecord {
  id: string;
  projectId: string;
  cardKey: string;
  workflowRunId: string;
  executionRoot: string;
  aggregateStatus: AggregateVerificationStatus;
  blockedReason: string | null;
  persistenceWarning: string | null;
  duration: number;
  startedAt: string;
  completedAt: string;
}

export interface FinalVerificationCheckRecord {
  id: string;
  runId: string;
  projectId: string;
  cardKey: string;
  checkId: string;
  intent: VerificationCheckIntent;
  description: string;
  command: string;
  workingDirectory: string;
  outcome: CheckOutcome;
  duration: number;
  exitCode: number | null;
  startedAt: string;
  outputSummary: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Presentation types
// ---------------------------------------------------------------------------

export interface VerificationSummaryLine {
  status: AggregateVerificationStatus;
  line: string;
  detail: string | null;
}
