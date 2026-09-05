import { buildPackStatus, type ManualTestPackStatus } from "../manual-test-verification-policy.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import type { SourceDiscoveryOptions } from "./source-discovery.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel } from "./delivery-model.js";

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

  return buildPackStatus({
    currentPack,
    currentReview,
    testResults: allResults,
    isStale,
    allPhasesResolved,
    applicability: model?.applicability ?? "incomplete",
    manualTestCount: model?.tests.length ?? 0,
    invalidManualTestCount: model?.invalidManualTests.length ?? 0,
  });
}
