import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { extractPhaseTaskLedger } from "./phase-task-ledger.js";

// ---------------------------------------------------------------------------
// Derived phase state model
//
// Phase lifecycle status is not a persisted field — it is derived from
// observable facts. The DerivePhaseState function is the single authority
// for all lifecycle decision points. The **Status:** line in the phase
// document is display-only and must not drive lifecycle transitions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Derived phase state model
//
// Phase lifecycle status is not a persisted field — it is derived from
// observable facts. The DerivePhaseState function is the single authority
// for all lifecycle decision points. The **Status:** line in the phase
// document is display-only and must not drive lifecycle transitions.
// ---------------------------------------------------------------------------

/**
 * Observable facts that determine a phase's lifecycle state.
 *
 * Every fact is a YES / NO / N/A value, never null or undefined.
 * codeReviewState:
 *   - APPROVED        review completed and accepted
 *   - NEEDS_CHANGES    review completed with change requests
 *   - BLOCKED          review is blocked
 *   - N/A              no review exists or not applicable
 */
export interface PhaseFacts {
  readonly allTasksCompleted: boolean;
  readonly needCodeReview: boolean;
  readonly codeReviewExists: boolean;
  readonly codeReviewState: "APPROVED" | "NEEDS_CHANGES" | "BLOCKED" | "N/A";
  readonly isAutonomous: boolean;
}

/**
 * Pure function that derives a phase lifecycle state from observable facts.
 *
 * Rules:
 * 1. Not all tasks complete → IN_PROGRESS
 * 2. No code review needed → COMPLETED
 * 3. Code review APPROVED:
 *    - autonomous → COMPLETED (no user gate needed)
 *    - non-autonomous → AWAITING_USER_ACCEPTANCE
 * 4. Code review NEEDS_CHANGES → AWAITING_FIXES
 * 5. Code review BLOCKED → BLOCKED
 * 6. Code review exists but state is N/A (rerun due) → AWAITING_REVIEW_RERUN
 * 7. No code review exists (N/A) → AWAITING_REVIEW
 */
export function derivePhaseState(facts: PhaseFacts): DerivedPhaseState {
  if (!facts.allTasksCompleted) return "IN_PROGRESS";
  if (!facts.needCodeReview) return "COMPLETED";
  if (facts.codeReviewState === "APPROVED") {
    return facts.isAutonomous ? "COMPLETED" : "AWAITING_USER_ACCEPTANCE";
  }
  if (facts.codeReviewState === "NEEDS_CHANGES") return "AWAITING_FIXES";
  if (facts.codeReviewState === "BLOCKED") return "BLOCKED";
  if (facts.codeReviewExists) return "AWAITING_REVIEW_RERUN";
  return "AWAITING_REVIEW";
}

export type DerivedPhaseState =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "AWAITING_REVIEW"
  | "AWAITING_FIXES"
  | "AWAITING_REVIEW_RERUN"
  | "AWAITING_USER_ACCEPTANCE"
  | "BLOCKED"
  | "PENDING";

// ---------------------------------------------------------------------------
// Legacy status normalization (display only, not lifecycle authority)
// ---------------------------------------------------------------------------

export function formatPhaseReference(phase: PhaseSummary): string {
  return phase.number === null ? phase.title : `Phase ${phase.number}`;
}

export function getNumberedPhases(feature: Pick<WorkItemCard, "phases">): Array<PhaseSummary & { number: number }> {
  return feature.phases.filter(
    (phase) => phase.number !== null && !isHumanReviewFindingsPhase(phase),
  ) as Array<PhaseSummary & { number: number }>;
}

export function isHumanReviewFindingsPhase(phase: Pick<PhaseSummary, "fileName" | "title">): boolean {
  return /human-review-findings/i.test(phase.fileName) || /human review findings/i.test(phase.title);
}

export function getHumanReviewFindingsPhase(
  feature: Pick<WorkItemCard, "phases">,
): (PhaseSummary & { number: number }) | undefined {
  return feature.phases.find(
    (phase) => phase.number !== null && isHumanReviewFindingsPhase(phase),
  ) as (PhaseSummary & { number: number }) | undefined;
}

export function hasUnresolvedHumanReviewFindingsPhase(feature: Pick<WorkItemCard, "phases">): boolean {
  const phase = getHumanReviewFindingsPhase(feature);
  return Boolean(phase && !isImplementationPhaseResolved(phase));
}

export function isHumanReviewFindingsPhaseAwaitingUser(phase: PhaseSummary): boolean {
  return normalizeImplementationPhaseStatus(phase.status) === "AWAITING_USER_ACCEPTANCE";
}

export function areAllImplementationPhasesResolved(feature: Pick<WorkItemCard, "phases">): boolean {
  const phases = getNumberedPhases(feature);
  return phases.length > 0 && phases.every(isImplementationPhaseResolved);
}

// ---------------------------------------------------------------------------
// Phase resolved/completed checks — use the derived model via a facts builder.
// The legacy status-based functions below remain for callers that have not
// been migrated to the derived model. New callers must use derivePhaseState.
// ---------------------------------------------------------------------------

/**
 * Check whether a code-review report with APPROVED exists in the phase's
 * code-reviews directory. Returns false when the directory is missing or
 * no report contains an approved decision.
 */
function phaseHasApprovedReview(phase: PhaseSummary): boolean {
  if (!phase.documentPath) return false;
  const reviewsDir = join(dirname(phase.documentPath), "..", "code-reviews");
  if (!existsSync(reviewsDir)) return false;
  try {
    const entries = readdirSync(reviewsDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const content = readFileSync(join(reviewsDir, entry), "utf8");
      if (/APPROVED|✅\s*APPROVED/i.test(content)) return true;
    }
  } catch {
    // Best-effort: if code-reviews is unreadable, assume no approval.
  }
  return false;
}

/**
 * Returns true when the phase is COMPLETED or SKIPPED according to its
 * **Status:** field. For AWAITING_REVIEW phases, additionally checks
 * whether the task ledger is fully checked — a safety net for when the
 * status field was not updated to COMPLETED after an approved review.
 * This ensures the autonomous continuation scheduler does not dispatch
 * recovery work for a completed phase.
 */
export function isImplementationPhaseResolved(phase: PhaseSummary): boolean {
  const status = normalizeImplementationPhaseStatus(phase.status);
  if (status === "COMPLETED" || status === "SKIPPED") return true;
  // Derived-state safety net: AWAITING_REVIEW with all tasks checked and
  // an approved review → phase is resolved.
  if (status === "AWAITING_REVIEW" && phase.documentPath) {
    try {
      const content = readFileSync(phase.documentPath, "utf8");
      const tasks = extractPhaseTaskLedger(content, phase.number);
      if (tasks.length > 0 && tasks.every((t) => t.checked) && phaseHasApprovedReview(phase)) {
        return true;
      }
    } catch {
      /* best-effort; fall through to status-based result */
    }
  }
  return false;
}

export function isImplementationPhaseCompleted(phase: PhaseSummary): boolean {
  return normalizeImplementationPhaseStatus(phase.status) === "COMPLETED";
}

export function isImplementationPhaseRecoveryComplete(phase: PhaseSummary): boolean {
  return normalizeImplementationPhaseStatus(phase.status) === "RECOVERY_COMPLETE";
}

export function isPhaseAwaitingReview(phase: PhaseSummary): boolean {
  return normalizeImplementationPhaseStatus(phase.status) === "AWAITING_REVIEW";
}

export function normalizeImplementationPhaseStatus(status: string | null | undefined): string {
  const normalized = cleanInlineMarkdown(status ?? "").replace(/[_-]+/g, " ").trim().toUpperCase();
  if (!normalized) return "UNKNOWN";
  if (/\bRECOVERY\b/.test(normalized) && /\b(COMPLETE|COMPLETED)\b/.test(normalized)) return "RECOVERY_COMPLETE";
  if (/\b(COMPLETED|COMPLETE|DONE)\b/.test(normalized)) return "COMPLETED";
  if (/\bAWAITING\s+USER\s+ACCEPTANCE\b/.test(normalized)) return "AWAITING_USER_ACCEPTANCE";
  if (/\bAWAITING\s+(?:CODE\s+)?REVIEW(?:\s+RERUN)?\b/.test(normalized)) return "AWAITING_REVIEW";
  if (/\bIN\s+PROGRESS\b/.test(normalized)) return "IN_PROGRESS";
  if (/\bBLOCKED\b/.test(normalized)) return "BLOCKED";
  if (/\bPENDING\b/.test(normalized)) return "PENDING";
  return normalized.replace(/\s+/g, "_");
}

function cleanInlineMarkdown(value: string): string {
  return value.replace(/`/g, "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/_/g, " ").replace(/[^\S\r\n]+/g, " ").trim();
}
