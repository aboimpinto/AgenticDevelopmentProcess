/**
 * Pure resume routing for the generic reviewed-work lifecycle.
 *
 * Human-readable reports remain audit evidence. Once the orchestrator has
 * persisted a remediation successor, or has recorded that an independent
 * rerun is due, the old NEEDS_CHANGES report must not dispatch the fixer
 * again. Only a newer authoritative review manifest may reopen remediation.
 */

export type DurableReviewArtifactKind =
  | "review_manifest"
  | "remediation_response"
  | "verification_receipt";

export type ReviewResumeRoute =
  | "implementation"
  | "fixer"
  | "reviewer"
  | "phase_exit"
  | "blocked";

export type DurableReviewManifestResult = "APPROVED" | "NEEDS_CHANGES" | "BLOCKED";
export type DurableReviewGateState = "APPROVED" | "REJECTED" | "BLOCKED" | "PENDING";

/**
 * The complete workflow authority carried by a persisted reviewer decision.
 * Analysis services may explain a decision, but they may not invent another
 * transition for the generic Phase Executor.
 */
export function selectPersistedReviewTransition(
  result: DurableReviewManifestResult,
  gateState: DurableReviewGateState,
): "fixer" | "phase_exit" | "blocked" {
  if (result === "NEEDS_CHANGES") return "fixer";
  if (result === "BLOCKED") return "blocked";
  if (gateState === "APPROVED") return "phase_exit";
  if (gateState === "PENDING") return "fixer";
  return "blocked";
}

export function selectReviewResumeRoute(input: {
  readonly reviewRequired: boolean;
  readonly workReadyForReview: boolean;
  readonly latestReportHasFindings: boolean;
  readonly awaitingBaselineReview: boolean;
  readonly awaitingIndependentRerun: boolean;
  readonly currentDurableArtifactKind?: DurableReviewArtifactKind;
  readonly currentDurableGateState?: DurableReviewGateState;
  readonly currentDurableManifestResult?: DurableReviewManifestResult;
}): ReviewResumeRoute {
  if (!input.reviewRequired || !input.workReadyForReview) return "implementation";

  // A durable reviewer decision is the newest authority in the loop. The
  // independent-rerun marker caused this review and can remain in the phase
  // projection until a later transition updates it; it must not override the
  // result that the reviewer just committed.
  if (input.currentDurableArtifactKind === "review_manifest"
    && input.currentDurableManifestResult) {
    const gateState = input.currentDurableGateState
      ?? (input.currentDurableManifestResult === "NEEDS_CHANGES"
        ? "REJECTED"
        : input.currentDurableManifestResult === "BLOCKED" ? "BLOCKED" : "PENDING");
    return selectPersistedReviewTransition(input.currentDurableManifestResult, gateState);
  }

  // A response alone is not a reviewer handoff. The same fixer task must
  // recover its bound receipt before an independent review can run.
  if (input.currentDurableArtifactKind === "remediation_response") {
    return "fixer";
  }

  // A receipt is the immutable reviewer handoff. The explicit rerun marker
  // remains the legacy/durable task projection of that same transition.
  if (input.awaitingIndependentRerun
    || input.currentDurableArtifactKind === "verification_receipt") {
    return "reviewer";
  }

  if (input.latestReportHasFindings) return "fixer";
  if (input.awaitingBaselineReview) return "reviewer";
  return "implementation";
}
