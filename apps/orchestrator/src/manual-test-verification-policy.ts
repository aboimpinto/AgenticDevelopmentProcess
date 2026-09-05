// ---------------------------------------------------------------------------
// manual-test-verification-policy.ts — FEAT-045 Phase 3: Business Logic
//
// Pure, deterministic functions for manual test verification.
// No I/O, no side effects, no database calls, no filesystem access.
//
// All functions are synchronous and take structured inputs.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import type {
  ManualTestPackState,
  ManualTestReviewState,
  ManualTestResultOutcome,
  ManualTestSourceManifestEntry,
  ManualTestSourceManifest,
  ManualTestPackRecord,
  ManualTestReviewRecord,
  ManualTestResultRecord,
  ManualTestPackStatus,
  FailedTestSubmission,
  ManualTestFindingLink,
  AcceptanceCriterionClassification,
} from "./manual-test-verification-types.js";

export type {
  ManualTestPackState,
  ManualTestReviewState,
  ManualTestResultOutcome,
  ManualTestSourceManifestEntry,
  ManualTestSourceManifest,
  ManualTestPackRecord,
  ManualTestReviewRecord,
  ManualTestResultRecord,
  ManualTestPackStatus,
  FailedTestSubmission,
  ManualTestFindingLink,
} from "./manual-test-verification-types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum preview characters for a criterion in the manifest.
 */
const CRITERION_PREVIEW_MAX_LENGTH = 200;

/**
 * Source category labels for stable ID generation.
 */
const CATEGORY_PREFIXES: Record<string, string> = {
  "feat-ac": "AC",
  "epic-ac": "EAC",
  "epic-ac-test-file": "EAT",
  gherkin: "GHERKIN",
  "phase-ac": "PAC",
  "evidence-revision": "EVID",
};

// ---------------------------------------------------------------------------
// Source types (internal)
// ---------------------------------------------------------------------------

/**
 * Raw source item extracted from a document.
 */
export interface RawSourceItem {
  /** Category of the source. */
  readonly category: ManualTestSourceManifestEntry["category"];
  /** Project-relative path to the source file. */
  readonly relativePath: string;
  /** The actual criterion text. */
  readonly text: string;
  /** Optional stable identifier override (e.g., from explicit anchors). */
  readonly explicitId?: string;
}

// ---------------------------------------------------------------------------
// Extraction and Normalization
// ---------------------------------------------------------------------------

/**
 * Accept a list of raw acceptance criteria items ordered by their
 * discovery priority, deduplicate exact text matches, and assign
 * stable source IDs.
 *
 * @param items - Ordered raw source items from all discovery phases.
 * @returns Ordered array with stable source IDs assigned.
 */
export function normalizeSourceItems(
  items: readonly RawSourceItem[],
): ManualTestSourceManifestEntry[] {
  const seenTexts = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const result: ManualTestSourceManifestEntry[] = [];

  for (const item of items) {
    const normalizedText = normalizeCriterionText(item.text);
    const textKey = normalizedText.toLowerCase().trim();

    // Deduplicate exact normalized text matches
    if (seenTexts.has(textKey)) {
      continue;
    }
    seenTexts.add(textKey);

    const prefix = CATEGORY_PREFIXES[item.category] ?? "SRC";
    const count = (categoryCounts.get(item.category) ?? 0) + 1;
    categoryCounts.set(item.category, count);

    const sourceId = item.explicitId ?? `${prefix}-${String(count).padStart(2, "0")}`;

    result.push({
      sourceId,
      category: item.category,
      relativePath: item.relativePath,
      contentHash: hashCriterionText(normalizedText),
      criterionPreview: normalizedText.length > CRITERION_PREVIEW_MAX_LENGTH
        ? `${normalizedText.slice(0, CRITERION_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`
        : normalizedText,
    });
  }

  return result;
}

/**
 * Normalize criterion text for deterministic hashing and deduplication.
 * Removes whitespace artifacts that shouldn't affect identity.
 */
export function normalizeCriterionText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Hash normalized criterion text with SHA-256.
 */
export function hashCriterionText(normalizedText: string): string {
  return createHash("sha256").update(normalizedText, "utf8").digest("hex");
}

/**
 * Hash an entire manifest JSON object deterministically.
 * Produces the same hash regardless of key ordering in the input.
 */
export function hashManifestJson(entries: readonly ManualTestSourceManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  // Include the delivery-policy version so packs made by the legacy
  // "one placeholder case per criterion" generator cannot be reused.
  const json = JSON.stringify({ schemaVersion: "hepha-test-delivery/v2", entries: sorted });
  return createHash("sha256").update(json, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Coverage Map Generation
// ---------------------------------------------------------------------------

/**
 * Report on acceptance coverage for a set of manifest entries.
 * Every entry from `feat-ac` and `epic-ac` categories must have an
 * associated manual test or explicit waiver.
 */
export interface CoverageMapEntry {
  readonly sourceId: string;
  readonly category: ManualTestSourceManifestEntry["category"];
  readonly criterionPreview: string;
  readonly coverageStatus: AcceptanceCriterionClassification;
  readonly manualTestId: string | null;
  readonly rationale: string | null;
  readonly evidence: readonly string[];
}

/**
 * Determine coverage status for each source entry.
 *
 * @param entries - All manifest entries.
 * @param manualTestIds - Set of manual test IDs that have been defined.
 * @param manualOnlySourceIds - Set of source IDs explicitly marked manual-only.
 * @returns Coverage report.
 */
export function buildCoverageMap(
  entries: readonly ManualTestSourceManifestEntry[],
  manualCoverage: ReadonlySet<string> | ReadonlyMap<string, string>,
  deferredSourceIds: ReadonlySet<string>,
  automatedEvidence: ReadonlyMap<string, readonly string[]> = new Map(),
): CoverageMapEntry[] {
  return entries.map((entry) => {
    if (entry.category !== "feat-ac" && entry.category !== "epic-ac" && entry.category !== "phase-ac") {
      return {
        sourceId: entry.sourceId,
        category: entry.category,
        criterionPreview: entry.criterionPreview,
        coverageStatus: "automated",
        manualTestId: null,
        rationale: "Executable specification or supporting evidence source.",
        evidence: [],
      };
    }

    if (manualCoverage.has(entry.sourceId)) {
      const mappedTestId = "get" in manualCoverage
        ? manualCoverage.get(entry.sourceId) ?? null
        : entry.sourceId.startsWith("MT-") ? entry.sourceId : null;
      return {
        sourceId: entry.sourceId,
        category: entry.category,
        criterionPreview: entry.criterionPreview,
        coverageStatus: "manual",
        manualTestId: mappedTestId,
        rationale: "Covered by a validated human-executable test case.",
        evidence: [],
      };
    }

    if (deferredSourceIds.has(entry.sourceId)) {
      return {
        sourceId: entry.sourceId,
        category: entry.category,
        criterionPreview: entry.criterionPreview,
        coverageStatus: "deferred",
        manualTestId: null,
        rationale: "Owned by a later feature or an explicitly deferred surface.",
        evidence: [],
      };
    }

    const evidence = automatedEvidence.get(entry.sourceId) ?? [];
    if (evidence.length > 0) {
      return {
        sourceId: entry.sourceId,
        category: entry.category,
        criterionPreview: entry.criterionPreview,
        coverageStatus: "automated",
        manualTestId: null,
        rationale: "Verified by automated evidence.",
        evidence,
      };
    }

    return {
      sourceId: entry.sourceId,
      category: entry.category,
      criterionPreview: entry.criterionPreview,
      coverageStatus: "uncovered",
      manualTestId: null,
      rationale: "No validated manual workflow, automated evidence, or explicit deferral was found.",
      evidence: [],
    };
  });
}

/**
 * Test whether every acceptance-critical source item has coverage.
 */
export function hasAcceptableCoverage(coverageMap: readonly CoverageMapEntry[]): boolean {
  return coverageMap.every((entry) => entry.coverageStatus !== "uncovered");
}

// ---------------------------------------------------------------------------
// Manual Test Generation
// ---------------------------------------------------------------------------

/**
 * A single manual test case model (before rendering).
 */
export interface ManualTestCase {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly sourceIds: readonly string[];
  readonly role: string;
  readonly application: string;
  readonly preconditions: readonly string[];
  readonly setupData: string | null;
  readonly steps: readonly string[];
  readonly expectedResult: string;
}

const PLACEHOLDER_INSTRUCTION = /(?:navigate to the feature area|perform the expected (?:user )?workflow|verify the observed behavior matches|target feat implementation|feature under test|qualified environment|perform the manual procedure|observable pass condition|\b(?:todo|tbd|placeholder)\b)/i;

export function validateManualTestCase(test: ManualTestCase): string[] {
  const errors: string[] = [];
  const check = (label: string, value: string | undefined) => {
    if (!value?.trim()) errors.push(`${label} is required.`);
    else if (PLACEHOLDER_INSTRUCTION.test(value)) errors.push(`${label} contains a generic or unresolved placeholder.`);
  };
  check("Application or interface", test.application);
  if (test.preconditions.length === 0) errors.push("Exact preconditions are required.");
  test.preconditions.forEach((value, index) => check(`Precondition ${index + 1}`, value));
  if (!test.setupData?.trim()) errors.push("Test account or test-data requirements are required (use an explicit 'none required' statement when applicable).");
  else check("Test account or test data", test.setupData);
  if (test.steps.length === 0) errors.push("At least one executable action is required.");
  test.steps.forEach((value, index) => check(`Step ${index + 1}`, value));
  check("Expected result", test.expectedResult);
  if (!/^(?:open|launch|start|connect|sign in|log in|select|click|tap|enter|submit|run)\b/i.test(test.steps[0] ?? "")) {
    errors.push("The first step must name a concrete action the tester can perform.");
  }
  return errors;
}

/**
 * Generate a deterministic set of manual test cases from a coverage map
 * and source entries.
 *
 * @param entries - Source manifest entries.
 * @param coverageMap - Coverage map from buildCoverageMap.
 * @returns Ordered list of manual test cases.
 */
export function generateManualTests(
  candidates: readonly ManualTestCase[],
): ManualTestCase[] {
  return candidates.filter((test) => validateManualTestCase(test).length === 0);
}

// ---------------------------------------------------------------------------
// Freshness and Staleness
// ---------------------------------------------------------------------------

/**
 * Compare a stored manifest hash against recomputed hashes for the
 * current source content.
 *
 * @param storedManifestHash - The hash recorded in the pack manifest.
 * @param currentEntries - The current source entries with fresh hashes.
 * @returns True if the pack is still fresh (hashes match).
 */
export function isPackFresh(
  storedManifestHash: string,
  currentEntries: readonly ManualTestSourceManifestEntry[],
): boolean {
  const currentHash = hashManifestJson(currentEntries);
  return storedManifestHash === currentHash;
}

/**
 * Determine which source entries have changed between two manifests.
 *
 * @param storedEntries - Entries from the stored pack manifest.
 * @param currentEntries - Current source entries with fresh hashes.
 * @returns List of source IDs whose content hash has changed or are new.
 */
export function detectChangedSources(
  storedEntries: readonly ManualTestSourceManifestEntry[],
  currentEntries: readonly ManualTestSourceManifestEntry[],
): string[] {
  const storedMap = new Map(storedEntries.map((e) => [e.sourceId, e]));
  const changed: string[] = [];

  for (const current of currentEntries) {
    const stored = storedMap.get(current.sourceId);
    if (!stored) {
      // New source entry
      changed.push(current.sourceId);
    } else if (stored.contentHash !== current.contentHash) {
      // Content hash changed
      changed.push(current.sourceId);
    }
  }

  // Removed source entries are also relevant changes
  const currentIds = new Set(currentEntries.map((e) => e.sourceId));
  for (const stored of storedEntries) {
    if (!currentIds.has(stored.sourceId)) {
      changed.push(stored.sourceId);
    }
  }

  return [...new Set(changed)];
}

// ---------------------------------------------------------------------------
// Eligibility Rules
// ---------------------------------------------------------------------------

/**
 * Eligibility context — pure data needed to make gate decisions.
 */
export interface EligibilityContext {
  readonly currentPackState: ManualTestPackState | null;
  readonly hasCurrentPack: boolean;
  readonly isPackStale: boolean;
  readonly isPackReviewed: boolean;
  readonly reviewIsValid: boolean;
  readonly hasOpenFindings: boolean;
  readonly allPhasesResolved: boolean;
}

/**
 * Can the user generate (or regenerate) a verification pack?
 */
export function canGeneratePack(context: EligibilityContext): boolean {
  return context.allPhasesResolved;
}

/**
 * Can the user review the current pack?
 */
export function canReviewPack(context: EligibilityContext): boolean {
  return context.hasCurrentPack && !context.isPackStale && !context.isPackReviewed;
}

/**
 * Can the user record manual tests as passing?
 */
export function canRecordManualTests(context: EligibilityContext): boolean {
  if (!context.hasCurrentPack) return false;
  if (context.isPackStale) return false;
  if (!context.isPackReviewed) return false;
  if (!context.reviewIsValid) return false;
  if (context.hasOpenFindings) return false;
  return true;
}

/**
 * Can the user record a failed test (regardless of review state)?
 * Failures can always be recorded as long as a current pack exists,
 * because findings document issues rather than blocking further testing.
 */
export function canRecordFailedTest(context: EligibilityContext): boolean {
  return context.hasCurrentPack && !context.isPackStale;
}

// ---------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------

/**
 * Determine the new pack state after freshness check.
 */
export function computePackState(
  wasCurrent: boolean,
  hasRenderError: boolean,
  isStale: boolean,
): ManualTestPackState {
  if (hasRenderError) return "render_failed";
  if (isStale) return "stale";
  if (wasCurrent) return "current";
  return "current";
}

/**
 * Determine whether a review is still valid for the current pack state.
 */
export function isReviewValidForPack(
  reviewState: ManualTestReviewState,
  packState: ManualTestPackState,
): boolean {
  if (reviewState !== "current") return false;
  if (packState !== "current") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Read-Model Builders
// ---------------------------------------------------------------------------

/**
 * Build a user-facing pack status from the underlying data.
 * Pure transformation: no I/O.
 */
export function buildPackStatus(options: {
  currentPack: ManualTestPackRecord | null;
  currentReview: ManualTestReviewRecord | null;
  testResults: readonly ManualTestResultRecord[];
  isStale: boolean;
  allPhasesResolved: boolean;
  applicability?: "applicable" | "not_applicable" | "incomplete";
  manualTestCount?: number;
  invalidManualTestCount?: number;
}): ManualTestPackStatus {
  const { currentPack, currentReview, testResults, isStale, allPhasesResolved } = options;

  const hasCurrentPack = currentPack !== null;
  const packState: ManualTestPackState = hasCurrentPack
    ? computePackState(currentPack!.state === "current", currentPack!.state === "render_failed", isStale)
    : "missing";
  // A review is authority only for the exact pack version it names. A newer
  // pack and an older still-current review must never be combined into a
  // synthetic "reviewed" dashboard state.
  const reviewMatchesCurrentPack = currentPack !== null
    && currentReview !== null
    && currentReview.packId === currentPack.id;
  const isReviewed = reviewMatchesCurrentPack && currentReview.state === "current";
  const reviewIsValid = isReviewValidForPack(
    currentReview?.state ?? "invalidated",
    packState,
  );

  const failedCount = testResults.filter((r) => r.result === "fail").length;
  const passedCount = testResults.filter((r) => r.result === "pass").length;
  const hasResults = testResults.length > 0;
  const applicability = options.applicability ?? "incomplete";
  const manualTestCount = options.manualTestCount ?? 0;
  const invalidManualTestCount = options.invalidManualTestCount ?? 0;
  const isReady = applicability === "applicable" && manualTestCount > 0 && invalidManualTestCount === 0;

  const canRecordTests = isReady && canRecordManualTests({
    currentPackState: packState,
    hasCurrentPack,
    isPackStale: isStale,
    isPackReviewed: isReviewed,
    reviewIsValid,
    hasOpenFindings: failedCount > 0,
    allPhasesResolved,
  });

  const message = buildStatusMessage({
    packState,
    isStale,
    isReviewed,
    reviewIsValid,
    hasCurrentPack,
    failedCount,
    hasResults,
    allPhasesResolved,
    applicability,
    manualTestCount,
    invalidManualTestCount,
  });

  return {
    state: packState,
    currentPackId: currentPack?.id ?? null,
    currentVersion: currentPack?.version ?? null,
    hasMarkdown: hasCurrentPack,
    hasPdf: currentPack?.pdfPath != null,
    isStale,
    isReviewed,
    currentReviewId: isReviewed ? currentReview.id : null,
    reviewState: isReviewed ? currentReview.state : null,
    canRecordTests,
    failedCount,
    passedCount,
    hasResults,
    applicability,
    manualTestCount,
    invalidManualTestCount,
    isReady,
    message,
  };
}

/**
 * Build a human-readable status message.
 */
function buildStatusMessage(options: {
  packState: ManualTestPackState;
  isStale: boolean;
  isReviewed: boolean;
  reviewIsValid: boolean;
  hasCurrentPack: boolean;
  failedCount: number;
  hasResults: boolean;
  allPhasesResolved: boolean;
  applicability: "applicable" | "not_applicable" | "incomplete";
  manualTestCount: number;
  invalidManualTestCount: number;
}): string {
  const { packState, isStale, isReviewed, reviewIsValid, failedCount, hasResults, allPhasesResolved,
    applicability, manualTestCount, invalidManualTestCount } = options;

  if (!allPhasesResolved) {
    return "All implementation phases must be resolved before generating a verification pack.";
  }

  if (packState === "missing") {
    return "No verification pack has been generated.";
  }

  if (packState === "generating") {
    return "Verification pack generation is in progress.";
  }

  if (packState === "render_failed") {
    return "Verification pack Markdown was generated but PDF rendering failed. Markdown is available for review.";
  }

  if (isStale) {
    return "The verification pack is outdated (traced source content has changed). Regenerate and re-review before recording manual tests.";
  }

  if (applicability === "not_applicable") {
    return "Manual Tests: Not Applicable. This informational delivery contains automated and deferred evidence only.";
  }

  if (applicability === "incomplete") {
    return invalidManualTestCount > 0
      ? `Manual test package is incomplete: ${invalidManualTestCount} invalid case definition(s) were rejected.`
      : "Manual test package is incomplete: one or more criteria are uncovered and no executable manual case exists.";
  }

  if (manualTestCount === 0) {
    return "Manual test package is not ready because it contains no executable manual tests.";
  }

  if (!isReviewed) {
    return "The verification pack is current but has not been reviewed. Review the pack before recording manual tests.";
  }

  if (!reviewIsValid) {
    return "The previous pack review has been invalidated. Regenerate and re-review before recording manual tests.";
  }

  if (hasResults && failedCount > 0) {
    return `Manual tests recorded: ${failedCount} failure(s) found. Resolve findings before completing the feature.`;
  }

  if (hasResults && failedCount === 0) {
    return "Manual tests recorded: all passing. Feature is eligible for completion.";
  }

  return "The verification pack is current and reviewed. Record manual test results.";
}

// ---------------------------------------------------------------------------
// Failure Validation
// ---------------------------------------------------------------------------

/**
 * Validate a failed-test submission payload.
 *
 * @param submission - The structured failure payload.
 * @param knownTestIds - Set of valid test IDs for the current pack.
 * @param knownPackId - The current pack ID to validate against.
 * @returns Validation result with errors array.
 */
export function validateFailedTestSubmission(
  submission: {
    packId: string;
    reviewId: string;
    testId: string;
    sourceIds: readonly string[];
    expectedResult: string;
    actualResult: string;
    notes: string | null;
    findingTitle: string;
    findingContent: string;
  },
  knownTestIds: ReadonlySet<string>,
  knownPackId: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!submission.packId) {
    errors.push("Pack ID is required.");
  } else if (submission.packId !== knownPackId) {
    errors.push(`Pack ID "${submission.packId}" does not match current pack "${knownPackId}".`);
  }

  if (!submission.reviewId) {
    errors.push("Review ID is required.");
  }

  if (!submission.testId) {
    errors.push("Test ID is required.");
  } else if (!knownTestIds.has(submission.testId)) {
    errors.push(`Test ID "${submission.testId}" is not a valid test for this pack.`);
  }

  if (!submission.sourceIds || submission.sourceIds.length === 0) {
    errors.push("At least one source criterion ID is required.");
  }

  if (!submission.expectedResult?.trim()) {
    errors.push("Expected result is required.");
  }

  if (!submission.actualResult?.trim()) {
    errors.push("Actual result is required.");
  }

  if (!submission.findingTitle?.trim()) {
    errors.push("Finding title is required.");
  }

  if (!submission.findingContent?.trim()) {
    errors.push("Finding content is required.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build the finding title for a failed manual test.
 */
export function buildFindingTitle(
  testId: string,
  actualResult: string,
): string {
  return `[Manual Test] ${testId}: ${actualResult.slice(0, 80)}`;
}

/**
 * Build the finding content for a failed manual test.
 */
export function buildFindingContent(options: {
  testId: string;
  sourceIds: readonly string[];
  expectedResult: string;
  actualResult: string;
  notes: string | null;
}): string {
  const { testId, sourceIds, expectedResult, actualResult, notes } = options;
  const sourceIdsStr = sourceIds.join(", ");

  let content = `## Manual Test Failure\n\n`;
  content += `**Test:** ${testId}\n`;
  content += `**Source Criteria:** ${sourceIdsStr}\n\n`;
  content += `### Expected\n\n${expectedResult}\n\n`;
  content += `### Actual\n\n${actualResult}\n\n`;

  if (notes?.trim()) {
    content += `### Notes\n\n${notes}\n\n`;
  }

  return content;
}
