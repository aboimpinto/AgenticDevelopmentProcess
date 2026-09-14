import { buildPackStatus, type ManualTestPackStatus } from "../manual-test-verification-policy.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import type { SourceDiscoveryOptions } from "./source-discovery.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel } from "./delivery-model.js";
import { readStoredPackCases } from "./current-pack.js";
import { resolve } from "node:path";
import { readAuthoringProgress } from "./authoring-checkpoints.js";

// ---------------------------------------------------------------------------
// Pack Status Query
// ---------------------------------------------------------------------------

export interface QueryPackStatusOptions {
  readonly context: ManualTestAdapterContext;
  readonly currentSourceOptions: SourceDiscoveryOptions;
}

/**
 * Build the current pack status by reading storage and re-checking freshness.
 */
export async function queryPackStatus(
  options: QueryPackStatusOptions,
): Promise<ManualTestPackStatus> {
  const { context } = options;

  const currentPack = await context.store.getCurrentManualTestPack(
    context.projectId,
    context.cardKey,
  );

  const currentReview = await context.store.getCurrentManualTestReview(
    context.projectId,
    context.cardKey,
  );

  const allResults = currentPack
    ? await context.store.listManualTestResults(context.projectId, context.cardKey, currentPack.id)
    : [];

  // Check staleness by re-discovering sources and comparing hashes
  let isStale = false;
  let model: Awaited<ReturnType<typeof buildManualTestDeliveryModel>> | null = null;
  try {
    model = await buildManualTestDeliveryModel(context, options.currentSourceOptions);
  } catch {
    model = null;
  }
  if (currentPack) {
    try {
      isStale = !model || currentPack.manifestHash !== hashManualTestDeliveryModel(model);
    } catch {
      // If source discovery fails, assume stale to be safe
      isStale = true;
    }
  }

  const allPhasesResolved = true; // Checked by caller before allowing actions

  let cases: NonNullable<ManualTestPackStatus["manualCases"]> = [];
  try { cases = currentPack ? readStoredPackCases(context.projectRoot, currentPack.markdownPath, true) : []; } catch { /* Unreadable cases cannot be acknowledged. */ }
  const invalid = model?.invalidManualTests.filter(entry => entry.id !== "authoring") ?? [];
  const manualReady = cases.length > 0 && invalid.length === 0;
  const status = buildPackStatus({
    currentPack,
    currentReview,
    testResults: allResults,
    isStale,
    allPhasesResolved,
    applicability: manualReady ? "applicable" : model?.applicability === "not_applicable" ? "not_applicable" : "incomplete",
    manualTestCount: model?.tests.length ?? 0,
    invalidManualTestCount: invalid.length,
  });
  const validReview = !isStale && currentReview?.packId === currentPack?.id && currentReview?.state === "current" ? currentReview : null;
  return { ...status,
    ...(status.isReady && status.isReviewed && status.failedCount === 0 && allResults.length > 0 && cases.some((test) => !allResults.some((result) => result.testId === test.id && result.result === "pass"))
      ? { message: "Some manual cases have results; execute and record the remaining cases before completion." } : {}),
    authoringProgress: (() => {
      const progress = readAuthoringProgress(resolve(context.featFolderPath, "manual-test-verification", "authoring-progress.json"));
      return progress?.state === "assessed" ? undefined : progress;
    })(),
    currentReviewId: validReview?.id ?? null,
    manualCases: cases.map((test) => ({ ...test,
      isReviewed: !!validReview && (validReview.reviewedTestIds == null || validReview.reviewedTestIds.includes(test.id)),
      result: allResults.filter((result) => result.testId === test.id).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]?.result ?? null,
    })),
    coverageIssues: [
      ...(invalid.flatMap((entry) => entry.errors.map((error) => `${entry.id}: ${error}`)) ?? []),

    ],
  };
}
