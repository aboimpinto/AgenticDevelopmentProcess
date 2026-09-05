// FEAT-044: Final Verification Runner — Presentation Logic
//
// Pure deterministic summaries for final-verification evidence and blockers.
// No side effects. Produces safe, truncated, redacted output for workflow
// history and completion blockers.

import {
  type CheckResult,
  type AggregateVerificationResult,
  type AggregateVerificationStatus,
  type VerificationSummaryLine,
} from "./final-verification-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_SUMMARY_LENGTH = 2000;

// Patterns that suggest sensitive data in output.
const SECRET_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey|secret|token|password|credential)[=:]\s*\S+/gi,
  /(?:ghp_|gho_|github_pat_)[a-zA-Z0-9_]{36,}/g,
  /(?:sk-[a-zA-Z0-9]{32,}|sk-[a-zA-Z0-9]{20,})/g,
  /(?:AKIA[0-9A-Z]{16})/g,
  /(?:eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g,
];

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Redact common secret patterns from a string.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Replace all but first 4 chars with asterisks
      if (match.length <= 8) return "***";
      return match.slice(0, 4) + "*".repeat(Math.min(match.length - 4, 12)) + "...";
    });
  }
  return result;
}

/**
 * Truncate text to a maximum length, appending a truncation marker.
 */
export function truncateOutput(text: string, maxLength = MAX_OUTPUT_SUMMARY_LENGTH): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Safely summarize command output: redact secrets then truncate.
 */
export function safeOutputSummary(output: string): string {
  return truncateOutput(redactSecrets(output));
}

// ---------------------------------------------------------------------------
// Per-check summary
// ---------------------------------------------------------------------------

/**
 * Format a single check result as a human-readable line.
 */
export function formatCheckResultLine(check: CheckResult): string {
  const durationStr = formatDuration(check.duration);
  const outcomeLabel = formatOutcomeLabel(check.outcome);

  if (check.outcome === "passed") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} (${durationStr})`;
  }

  if (check.outcome === "advisory") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} (${durationStr}) — improvement recommended, completion allowed`;
  }

  if (check.outcome === "coverage-unavailable") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} (${durationStr}) — measurement unavailable, remark recorded, completion allowed`;
  }

  if (check.outcome === "failed") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} (${durationStr}) — exit code ${check.exitCode}`;
  }

  if (check.outcome === "timed-out") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} — timeout after ${durationStr}`;
  }

  if (check.outcome === "policy-blocked") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} — blocked by command policy`;
  }

  if (check.outcome === "skipped") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} — skipped`;
  }

  if (check.outcome === "zero-selection") {
    return `  [${outcomeLabel}] ${check.checkId}: ${check.description} — zero tests selected`;
  }

  return `  [${outcomeLabel}] ${check.checkId}: ${check.description} (${durationStr})`;
}

// ---------------------------------------------------------------------------
// Outcome label helpers
// ---------------------------------------------------------------------------

function formatOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case "passed": return "PASS";
    case "advisory": return "ADVISORY";
    case "coverage-unavailable": return "REMARK";
    case "failed": return "FAIL";
    case "timed-out": return "TIMEOUT";
    case "policy-blocked": return "BLOCKED";
    case "skipped": return "SKIP";
    case "zero-selection": return "ZERO";
    default: return outcome.toUpperCase();
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// Aggregate summary
// ---------------------------------------------------------------------------

/**
 * Build a one-line summary for an aggregate final-verification result.
 */
export function formatAggregateSummary(result: AggregateVerificationResult): string {
  const totalDuration = formatDuration(result.duration);
  const totalChecks = result.checks.length;
  const passedCount = result.checks.filter((c) =>
    c.outcome === "passed" || c.outcome === "advisory" || c.outcome === "coverage-unavailable"
  ).length;
  const coverageRemarks = result.checks.filter((c) => c.outcome === "coverage-unavailable").length;

  switch (result.status) {
    case "passed":
      return coverageRemarks > 0
        ? `Final verification passed: ${passedCount}/${totalChecks} checks in ${totalDuration}; ${coverageRemarks} coverage measurement remark(s) recorded`
        : `Final verification passed: ${passedCount}/${totalChecks} checks in ${totalDuration}`;

    case "failed": {
      const failedChecks = result.checks
        .filter((c) => c.required
          && c.outcome !== "passed"
          && c.outcome !== "advisory"
          && c.outcome !== "coverage-unavailable")
        .map((c) => c.checkId);
      return `Final verification FAILED: check(s) [${failedChecks.join(", ")}] — ${result.blockedReason ?? "see details"}`;
    }

    case "blocked":
      return `Final verification BLOCKED: ${result.blockedReason ?? "unknown reason"}`;

    case "skipped":
      return "Final verification SKIPPED: no checks configured";

    default:
      return `Final verification: ${result.status}`;
  }
}

/**
 * Build a multi-line block summarizing all checks.
 */
export function formatCheckResultsBlock(results: CheckResult[]): string {
  if (results.length === 0) return "No verification checks executed.";

  return results.map(formatCheckResultLine).join("\n");
}

/**
 * Build the full presentation for a completed final verification run.
 */
export function buildVerificationPresentation(result: AggregateVerificationResult): VerificationSummaryLine {
  const aggregateLine = formatAggregateSummary(result);
  const detail = formatCheckResultsBlock(result.checks);

  return {
    status: result.status,
    line: aggregateLine,
    detail: result.status === "passed" ? null : detail,
  };
}

/**
 * Build a presentation for a blocked run (profile missing, invalid, etc.)
 */
export function buildBlockedPresentation(reason: string): VerificationSummaryLine {
  return {
    status: "blocked",
    line: `Final verification BLOCKED: ${reason}`,
    detail: null,
  };
}

/**
 * Build a presentation for a persistence-warning suffix.
 */
export function buildPersistenceWarningSuffix(): string {
  return " (audit persistence warning)";
}

/**
 * Apply a persistence warning suffix to an existing summary line.
 */
export function applyPersistenceWarning(line: string): string {
  if (line.includes("(audit persistence warning)")) return line;
  return line + buildPersistenceWarningSuffix();
}
