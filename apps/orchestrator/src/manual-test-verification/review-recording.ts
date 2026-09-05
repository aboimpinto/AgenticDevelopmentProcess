import { randomUUID } from "node:crypto";
import type { ManualTestVerificationReviewRecord } from "@hepha/db";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { getExactCurrentManualTestPack, readStoredPackReadiness } from "./current-pack.js";

// ---------------------------------------------------------------------------
// Review Recording
// ---------------------------------------------------------------------------

export interface RecordReviewOptions {
  readonly context: ManualTestAdapterContext;
  readonly packId: string;
}

export interface RecordReviewResult {
  readonly success: boolean;
  readonly reviewId: string | null;
  readonly message: string;
  readonly errors: string[];
}

/**
 * Record an explicit review of the current pack.
 */
export async function recordPackReview(
  options: RecordReviewOptions,
): Promise<RecordReviewResult> {
  const { context, packId } = options;
  const errors: string[] = [];

  // Verify the pack exists and is current
  const pack = await getExactCurrentManualTestPack(context, packId);
  if (!pack) {
    return {
      success: false,
      reviewId: null,
      message: `Pack ${packId} is not the current manual test pack.`,
      errors: ["Pack is not current."],
    };
  }

  const readiness = readStoredPackReadiness(context.projectRoot, pack.markdownPath);
  if (!readiness.isReady) {
    return {
      success: false,
      reviewId: null,
      message: readiness.applicability === "not_applicable"
        ? "Manual Tests: Not Applicable. The informational delivery cannot be reviewed as a manual test pack."
        : "The manual test package is incomplete and cannot be reviewed as ready.",
      errors: ["At least one validated executable manual test is required."],
    };
  }

  // Verify no existing current review for this pack
  const existingReview = await context.store.getCurrentManualTestReview(context.projectId, context.cardKey);
  if (existingReview && existingReview.packId === packId) {
    return { success: true, reviewId: existingReview.id, message: "Pack already reviewed.", errors: [] };
  }

  const reviewId = `review-${randomUUID()}`;
  const now = new Date().toISOString();

  // Invalidate any prior review
  if (existingReview) {
    await context.store.invalidateManualTestReview(
      context.projectId,
      context.cardKey,
      existingReview.id,
      now,
      `Superseded by new review for pack ${packId}`,
    );
  }

  const review: ManualTestVerificationReviewRecord = {
    id: reviewId,
    projectId: context.projectId,
    cardKey: context.cardKey,
    packId,
    reviewedAt: now,
    state: "current",
    invalidatedAt: null,
    invalidatedReason: null,
  };

  await context.store.recordManualTestReview(review);

  return {
    success: true,
    reviewId,
    message: `Pack ${packId} reviewed successfully. Manual tests can now be recorded.`,
    errors,
  };
}
