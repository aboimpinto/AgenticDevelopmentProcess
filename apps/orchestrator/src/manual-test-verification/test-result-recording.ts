import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ManualTestResultRecord } from "@hepha/db";
import { buildFindingContent, buildFindingTitle } from "../manual-test-verification-policy.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { getExactCurrentManualTestPack } from "./current-pack.js";

// ---------------------------------------------------------------------------
// Manual Test Recording (Success & Failure)
// ---------------------------------------------------------------------------

export interface RecordTestResultOptions {
  readonly context: ManualTestAdapterContext;
  readonly packId: string;
  readonly reviewId: string;
  readonly testId: string;
  readonly result: "pass" | "fail";
  readonly actualResult: string | null;
  readonly notes: string | null;
}

export interface RecordTestResultResult {
  readonly success: boolean;
  readonly resultId: string | null;
  readonly findingId: string | null;
  readonly message: string;
  readonly errors: string[];
}

/**
 * Record that every generated test in a reviewed pack passed.
 *
 * The canonical Markdown is the durable definition of a pack's test cases, so
 * each pass is persisted against its real MT identifier rather than a UI-only
 * summary identifier. Repeating the request is idempotent for existing passes.
 */
export async function recordAllManualTestPasses(options: {
  readonly context: ManualTestAdapterContext;
  readonly packId: string;
  readonly reviewId: string;
}): Promise<RecordTestResultResult> {
  const { context, packId, reviewId } = options;
  const pack = await getExactCurrentManualTestPack(context, packId);

  if (!pack) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "Pack is not current or not found.",
      errors: ["Current pack not found."],
    };
  }

  const review = await context.store.getCurrentManualTestReview(context.projectId, context.cardKey);
  if (!review || review.id !== reviewId || review.packId !== packId) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "Review is not valid or not current.",
      errors: ["Current review not found."],
    };
  }

  const markdownPath = resolve(context.projectRoot, pack.markdownPath);
  if (!existsSync(markdownPath)) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "The current pack Markdown artifact is unavailable.",
      errors: ["Current pack Markdown not found."],
    };
  }

  const testIds = [...readFileSync(markdownPath, "utf8").matchAll(/^###\s+(MT-\d+):/gm)].map((match) => match[1]!);
  if (testIds.length === 0) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "The current pack does not contain any manual test cases.",
      errors: ["No manual test IDs found in the current pack."],
    };
  }

  const existingResults = await context.store.listManualTestResults(context.projectId, context.cardKey, packId);
  if (existingResults.some((result) => result.result === "fail")) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "Resolve failed manual-test findings before recording an all-pass result.",
      errors: ["The current pack has failed manual-test results."],
    };
  }

  const recordedTestIds = new Set(existingResults.filter((result) => result.result === "pass").map((result) => result.testId));
  let lastResultId: string | null = null;

  for (const testId of testIds) {
    if (recordedTestIds.has(testId)) {
      continue;
    }

    const result = await recordTestResult({
      context,
      packId,
      reviewId,
      testId,
      result: "pass",
      actualResult: null,
      notes: null,
    });

    if (!result.success) {
      return result;
    }

    lastResultId = result.resultId;
  }

  return {
    success: true,
    resultId: lastResultId,
    findingId: null,
    message: `Recorded ${testIds.length} manual test${testIds.length === 1 ? "" : "s"} as passing.`,
    errors: [],
  };
}

/**
 * Record a manual test result (pass or fail).
 * On failure, also creates a Human Review Finding.
 */
export async function recordTestResult(
  options: RecordTestResultOptions,
): Promise<RecordTestResultResult> {
  const { context, packId, reviewId, testId, result, actualResult, notes } = options;
  const errors: string[] = [];

  // Verify pack and review
  const pack = await getExactCurrentManualTestPack(context, packId);
  if (!pack) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "Pack is not current or not found.",
      errors: ["Current pack not found."],
    };
  }

  const review = await context.store.getCurrentManualTestReview(context.projectId, context.cardKey);
  if (!review || review.id !== reviewId) {
    return {
      success: false,
      resultId: null,
      findingId: null,
      message: "Review is not valid or not current.",
      errors: ["Current review not found."],
    };
  }

  const resultId = `result-${randomUUID()}`;
  const now = new Date().toISOString();
  let findingId: string | null = null;

  // If failure, create a Human Review Finding
  if (result === "fail") {
    findingId = `finding-feat045-${randomUUID()}`;
    const findingTitle = buildFindingTitle(testId, actualResult ?? "Manual test failure");
    const findingContent = buildFindingContent({
      testId,
      sourceIds: [],
      expectedResult: "",
      actualResult: actualResult ?? "",
      notes,
    });

    try {
      await context.store.createFeatureFinding({
        cardKey: context.cardKey,
        content: findingContent,
        eventId: `event-${randomUUID()}`,
        findingId,
        projectId: context.projectId,
        title: findingTitle,
      });

      await context.store.recordFeatureFindingAgentRun({
        cardKey: context.cardKey,
        findingId,
        projectId: context.projectId,
        runId: `finding-run-${randomUUID()}`,
        status: "agent_running",
        summary: "Manual test failure finding created.",
      });
    } catch (error) {
      errors.push(`Failed to create finding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Persist test result
  const testResultRecord: ManualTestResultRecord = {
    id: resultId,
    projectId: context.projectId,
    cardKey: context.cardKey,
    packId,
    reviewId,
    testId,
    result,
    actualResult,
    notes,
    findingId,
    recordedAt: now,
  };

  try {
    await context.store.recordManualTestResult(testResultRecord);
  } catch (error) {
    errors.push(`Failed to persist test result: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      resultId: null,
      findingId,
      message: "Failed to persist test result.",
      errors,
    };
  }

  return {
    success: true,
    resultId,
    findingId,
    message: result === "pass"
      ? `Test ${testId} recorded as PASS.`
      : `Test ${testId} recorded as FAIL. Finding ${findingId} created.`,
    errors,
  };
}
