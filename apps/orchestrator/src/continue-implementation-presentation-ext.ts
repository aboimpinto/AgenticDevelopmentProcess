/**
 * FEAT-042 Phase 4: Presentation Logic
 *
 * Deterministic presentation/context adapters for the review finding ledger:
 * - Repair context formatting
 * - Ledger summary for workflow failure briefs and run summaries
 * - Timeline/read-model mapping
 *
 * All functions are deterministic and side-effect free:
 * - No filesystem access
 * - No database writes
 * - No process spawning
 * - No mutable module state
 * - No implicit clock reads
 */

import type {
  ReconciledFinding,
  RequiredFixStatus,
  FindingDecision,
} from "./code-review-finding-ledger.js";
import { isRequiredFixDecision } from "./code-review-finding-ledger.js";
import type { ReviewFindingLedgerRecord, ReviewRepairAttemptRecord } from "@hepha/db";

// ---------------------------------------------------------------------------
// Repair Context
// ---------------------------------------------------------------------------

/**
 * Structured repair context containing unresolved findings and metadata.
 */
export interface RepairContext {
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly unresolvedCount: number;
  readonly repairAttemptNumber: number;
  readonly maxAttempts: number;
  readonly findingsText: string;
  readonly reportPath: string | null;
  readonly runId: string | null;
  readonly summary: string;
}

/**
 * Build a formatted repair context from unresolved findings.
 *
 * Pure function: produces deterministic text from input data.
 *
 * @param phaseNumber - Implementation phase number.
 * @param phaseTitle - Implementation phase title.
 * @param unresolvedFindings - Reconciled findings that are still unresolved.
 * @param reportPath - Path to the review report that produced these findings.
 * @param runId - Workflow run identifier.
 * @param repairAttemptNumber - Current repair attempt number (1-based).
 * @param maxAttempts - Maximum allowed repair attempts.
 * @returns Structured repair context.
 */
export function buildRepairContext(
  phaseNumber: number,
  phaseTitle: string,
  unresolvedFindings: ReconciledFinding[],
  reportPath: string | null,
  runId: string | null,
  repairAttemptNumber: number,
  maxAttempts: number = 3,
): RepairContext {
  const findingLines = unresolvedFindings.map((f, i) => {
    const severity = f.currentDecision?.toUpperCase() ?? "UNKNOWN";
    const area = f.latestFinding.affectedArea
      ? ` (${f.latestFinding.affectedArea})`
      : "";
    const text = f.latestFinding.findingSummary;

    return `${i + 1}. [${severity}]${area} ${text}`;
  });

  const findingsText = findingLines.join("\n");

  return {
    phaseNumber,
    phaseTitle,
    unresolvedCount: unresolvedFindings.length,
    repairAttemptNumber,
    maxAttempts,
    findingsText,
    reportPath,
    runId,
    summary: `Phase ${phaseNumber} (${phaseTitle}): ${unresolvedFindings.length} unresolved required-fix finding(s) remain. Repair attempt ${repairAttemptNumber}/${maxAttempts}.`,
  };
}

/**
 * Format repair context into a markdown block for workflow prompts.
 *
 * Pure function.
 *
 * @param context - The repair context to format.
 * @returns Markdown-formatted repair context string.
 */
export function formatRepairContextBlock(context: RepairContext): string {
  const reportLine = context.reportPath
    ? `\n- Review report: \`${context.reportPath}\``
    : "";

  return (
    `## Repair Context (Attempt ${context.repairAttemptNumber}/${context.maxAttempts})\n\n` +
    `Phase ${context.phaseNumber}: ${context.phaseTitle}\n` +
    `Unresolved required-fix findings: ${context.unresolvedCount}\n` +
    reportLine +
    `\n\n### Findings Requiring Fix\n\n${context.findingsText}`
  );
}

// ---------------------------------------------------------------------------
// Ledger Summary
// ---------------------------------------------------------------------------

/**
 * Summary of a review finding ledger for a specific phase/report.
 */
export interface LedgerSummary {
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly totalFindings: number;
  readonly blockerCount: number;
  readonly requiredCount: number;
  readonly noteCount: number;
  readonly resolvedCount: number;
  readonly unresolvedBlockingCount: number;
  readonly reviewReportPath: string | null;
  readonly summaryLine: string;
}

/**
 * Build a summary of the review finding ledger for display in failure briefs
 * and run summaries.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param entries - Ledger entries for a phase/report.
 * @returns Compact ledger summary.
 */
export function summarizeLedgerEntries(
  entries: Pick<
    ReviewFindingLedgerRecord,
    "decisionClassification" | "resolutionState" | "phaseNumber" | "phaseTitle" | "reviewReportPath"
  >[],
): LedgerSummary {
  const phaseNumber = entries[0]?.phaseNumber ?? 0;
  const phaseTitle = entries[0]?.phaseTitle ?? "";
  const reviewReportPath = entries[0]?.reviewReportPath ?? null;

  let totalFindings = 0;
  let blockerCount = 0;
  let requiredCount = 0;
  let noteCount = 0;
  let resolvedCount = 0;
  let unresolvedBlockingCount = 0;

  for (const entry of entries) {
    totalFindings++;

    const classification = entry.decisionClassification as FindingDecision | null;

    if (classification === "blocker") {
      blockerCount++;
    } else if (classification === "required") {
      requiredCount++;
    } else {
      noteCount++;
    }

    if (entry.resolutionState === "resolved") {
      resolvedCount++;
    }

    if (
      isRequiredFixDecision(classification) &&
      entry.resolutionState === "unresolved"
    ) {
      unresolvedBlockingCount++;
    }
  }

  return {
    phaseNumber,
    phaseTitle,
    totalFindings,
    blockerCount,
    requiredCount,
    noteCount,
    resolvedCount,
    unresolvedBlockingCount,
    reviewReportPath,
    summaryLine:
      `Phase ${phaseNumber}: ${totalFindings} total finding(s), ` +
      `${blockerCount} blocker(s), ${requiredCount} required, ` +
      `${unresolvedBlockingCount} unresolved blocking, ${resolvedCount} resolved.`,
  };
}

/**
 * Format a ledger summary as a compact markdown block for workflow prompts.
 *
 * Pure function.
 *
 * @param summary - The ledger summary to format.
 * @returns Markdown-formatted summary string.
 */
export function formatLedgerSummary(summary: LedgerSummary): string {
  const reportLine = summary.reviewReportPath
    ? `\n  - Review report: \`${summary.reviewReportPath}\``
    : "";

  return (
    `### Review Finding Ledger — Phase ${summary.phaseNumber}\n` +
    reportLine +
    `\n  - Total findings: ${summary.totalFindings}` +
    `\n  - Blockers: ${summary.blockerCount}` +
    `\n  - Required: ${summary.requiredCount}` +
    `\n  - Notes/non-blocking: ${summary.noteCount}` +
    `\n  - Resolved: ${summary.resolvedCount}` +
    `\n  - Unresolved blocking: ${summary.unresolvedBlockingCount}`
  );
}

/**
 * Build a concise one-line summary for the workflow failure brief.
 *
 * Pure function.
 *
 * @param requiredFixStatus - Current required-fix status.
 * @param repairAttemptCount - Number of repair attempts so far.
 * @returns One-line summary string.
 */
export function buildFailureBriefFindingSummary(
  requiredFixStatus: RequiredFixStatus,
  repairAttemptCount: number,
): string {
  if (!requiredFixStatus.hasUnresolvedRequiredFixes) {
    return "All required-fix findings resolved.";
  }

  return (
    `${requiredFixStatus.unresolvedCount} unresolved required-fix finding(s) ` +
    `remain after ${repairAttemptCount} repair attempt(s). ` +
    `Blocked: ${requiredFixStatus.blockingCount}.`
  );
}

// ---------------------------------------------------------------------------
// Timeline Summary Mapping
// ---------------------------------------------------------------------------

/**
 * Timeline event entry for a review finding event.
 */
export interface ReviewFindingTimelineEntry {
  readonly eventType: "review_finding" | "repair_attempt" | "rerun_result" | "finding_resolved";
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly timestamp: string;
  readonly reportPath: string | null;
  readonly findingCount: number;
  readonly blockingCount: number;
  readonly decision: string;
  readonly summary: string;
}

/**
 * Build review-finding timeline entries from ledger records and repair
 * attempt records for a specific phase. This is used to populate optional
 * additive timeline summary fields.
 *
 * Pure function: no I/O, no clock, no random values.
 *
 * @param phaseNumber - Phase number.
 * @param phaseTitle - Phase title.
 * @param ledgerEntries - Ledger entries for the phase.
 * @param repairAttempts - Repair attempt records for the phase.
 * @returns Array of timeline entries sorted by timestamp.
 */
export function buildReviewFindingTimelineEntries(
  phaseNumber: number,
  phaseTitle: string,
  ledgerEntries: Pick<ReviewFindingLedgerRecord, "createdAt" | "reviewReportPath" | "decisionClassification" | "resolutionState" | "updatedAt">[],
  repairAttempts: Pick<ReviewRepairAttemptRecord, "createdAt" | "rerunReviewReportPath" | "rerunResult" | "unresolvedBeforeCount" | "unresolvedAfterCount" | "completedAt">[],
): ReviewFindingTimelineEntry[] {
  const entries: ReviewFindingTimelineEntry[] = [];

  // Group ledger entries by report path to create "review_finding" events
  const byReport = new Map<string | null, typeof ledgerEntries>();

  for (const entry of ledgerEntries) {
    const key = entry.reviewReportPath;
    const existing = byReport.get(key) ?? [];
    existing.push(entry);
    byReport.set(key, existing);
  }

  for (const [reportPath, reportEntries] of byReport) {
    const blockingCount = reportEntries.filter(
      (e) =>
        isRequiredFixDecision(e.decisionClassification as FindingDecision | null) &&
        e.resolutionState === "unresolved",
    ).length;

    const earliestTimestamp = reportEntries.reduce(
      (earliest, e) => (e.createdAt < earliest ? e.createdAt : earliest),
      reportEntries[0]?.createdAt ?? "",
    );

    entries.push({
      eventType: "review_finding",
      phaseNumber,
      phaseTitle,
      timestamp: earliestTimestamp,
      reportPath,
      findingCount: reportEntries.length,
      blockingCount,
      decision: blockingCount > 0 ? "blocked" : "approved",
      summary: `${reportEntries.length} finding(s), ${blockingCount} blocking`,
    });
  }

  // Add repair attempt events
  for (const attempt of repairAttempts) {
    if (attempt.createdAt) {
      entries.push({
        eventType: "repair_attempt",
        phaseNumber,
        phaseTitle,
        timestamp: attempt.createdAt,
        reportPath: attempt.rerunReviewReportPath,
        findingCount: attempt.unresolvedBeforeCount,
        blockingCount: attempt.unresolvedAfterCount,
        decision: attempt.rerunResult ?? "unknown",
        summary: `Repair: ${attempt.unresolvedBeforeCount} before, ${attempt.unresolvedAfterCount} after`,
      });
    }

    if (attempt.completedAt) {
      entries.push({
        eventType: "rerun_result",
        phaseNumber,
        phaseTitle,
        timestamp: attempt.completedAt,
        reportPath: attempt.rerunReviewReportPath,
        findingCount: attempt.unresolvedAfterCount,
        blockingCount: attempt.unresolvedAfterCount,
        decision: attempt.rerunResult ?? "unknown",
        summary: `Rerun result: ${attempt.rerunResult ?? "unknown"}, ${attempt.unresolvedAfterCount} unresolved remaining`,
      });
    }
  }

  // Sort by timestamp
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return entries;
}
