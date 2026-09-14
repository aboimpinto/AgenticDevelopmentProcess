import { randomUUID } from "node:crypto";
import type { ManualTestVerificationReviewRecord } from "@hepha/db";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { getExactCurrentManualTestPack, readStoredPackCases } from "./current-pack.js";

// ---------------------------------------------------------------------------
// Review Recording
// ---------------------------------------------------------------------------

export interface RecordReviewOptions {
  readonly context: ManualTestAdapterContext;
  readonly packId: string;
  readonly testId?: string;
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

  // Reviewing the stored executable cases does not approve acceptance coverage.
  try {
    const cases = readStoredPackCases(context.projectRoot, pack.markdownPath, true);
    if (options.testId && !cases.some(test => test.id === options.testId)) throw new Error("Test ID is not in the current pack.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, reviewId: null, message, errors: [message] };
  }

  // Verify no existing current review for this pack
  const existingReview = await context.store.getCurrentManualTestReview(context.projectId, context.cardKey);
  if (existingReview && existingReview.packId === packId) {
    if (existingReview.reviewedTestIds != null) {
      await context.store.recordManualTestReview({ ...existingReview, reviewedAt: new Date().toISOString(),
        reviewedTestIds: options.testId ? [...new Set([...existingReview.reviewedTestIds, options.testId])] : null });
    }
    return { success: true, reviewId: existingReview.id, message: options.testId ? `Case ${options.testId} reviewed. Other cases and coverage requirements are unchanged.` : "Pack reviewed.", errors: [] };
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
    reviewedTestIds: options.testId ? [options.testId] : null,
  };

  await context.store.recordManualTestReview(review);

  return {
    success: true,
    reviewId,
    message: options.testId ? `Case ${options.testId} reviewed. Record its result only after execution; this does not approve the whole pack.`
      : `Pack ${packId} reviewed successfully. Manual tests can now be recorded.`,
    errors,
  };
}
