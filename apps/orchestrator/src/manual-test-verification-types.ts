// ---------------------------------------------------------------------------
// manual-test-verification-types.ts — FEAT-045 Phase 2: Data Layer
//
// Domain types for manual test verification packs, source manifests,
// pack reviews, manual test results, and structured finding links.
//
// These types are pure data contracts: no I/O, no side effects.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pack state machine
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a manual test verification pack.
 */
export type ManualTestPackState =
  | "missing"       // No pack has ever been generated
  | "generating"    // Generation in progress
  | "current"       // Pack matches current traced source hashes
  | "stale"         // Traced source hashes have changed since generation
  | "render_failed" // Pack Markdown exists but PDF derivation failed
  ;

/**
 * Lifecycle state of a pack review.
 */
export type ManualTestReviewState =
  | "current"       // Review is valid for the current pack version
  | "invalidated"   // Review invalidated because pack is stale
  ;

/**
 * Outcome of a single manual test step.
 */
export type ManualTestResultOutcome = "pass" | "fail";

// ---------------------------------------------------------------------------
// Source Manifest Entry
// ---------------------------------------------------------------------------

/**
 * A single traced source input to the verification pack.
 */
export interface ManualTestSourceManifestEntry {
  /** Stable source identifier (e.g., "FEAT-045-AC-01", "EPIC-008-F7-03"). */
  readonly sourceId: string;

  /** Category of the source. */
  readonly category:
    | "feat-ac"          // FEAT acceptance criteria
    | "epic-ac"          // EPIC Feature 7 acceptance criteria
    | "epic-ac-test-file" // EpicAcceptanceTests.md
    | "gherkin"          // Gherkin/E2E scenario
    | "phase-ac"         // Phase-level acceptance criteria
    | "evidence-revision" // Implementation revision evidence
    ;

  /** Project-relative path to the source file. */
  readonly relativePath: string;

  /** SHA-256 hex hash of normalized source content. */
  readonly contentHash: string;

  /** First 200 characters of the criterion text for display. */
  readonly criterionPreview: string;
}

// ---------------------------------------------------------------------------
// Manifest (full source manifest for one pack version)
// ---------------------------------------------------------------------------

/**
 * Immutable source manifest for a single pack version.
 * Normalized traced inputs and their hashes.
 */
export interface ManualTestSourceManifest {
  /** Pack version string (e.g., "2026-07-10T080000Z-v1"). */
  readonly version: string;

  /** When this manifest was created. */
  readonly createdAt: string;

  /** Ordered array of traced source entries. */
  readonly entries: readonly ManualTestSourceManifestEntry[];

  /** SHA-256 hex hash of the full normalized manifest JSON (sorted keys). */
  readonly manifestHash: string;
}

// ---------------------------------------------------------------------------
// Pack Record
// ---------------------------------------------------------------------------

/**
 * Durable record of a single manual test verification pack version.
 */
export interface ManualTestPackRecord {
  /** Pack identifier: "{featExternalId}-{version}" (e.g., "FEAT-045-2026-07-10T080000Z-v1"). */
  readonly id: string;
  readonly projectId: string;
  readonly cardKey: string;
  readonly version: string;
  readonly state: ManualTestPackState;
  readonly manifestHash: string;
  /** Relative path (from project root) to the archived canonical Markdown. */
  readonly markdownPath: string;
  /** Relative path (from project root) to the derived PDF, or null if render failed or missing. */
  readonly pdfPath: string | null;
  /** Human-readable render error when state is "render_failed". */
  readonly renderError: string | null;
  readonly createdAt: string;
  /** When a newer version superseded this one (null if still current). */
  readonly supersededAt: string | null;
}

// ---------------------------------------------------------------------------
// Review Record
// ---------------------------------------------------------------------------

/**
 * Durable record of an explicit pack review acknowledgement.
 */
export interface ManualTestReviewRecord {
  readonly id: string;
  readonly projectId: string;
  readonly cardKey: string;
  /** Pack ID that was reviewed. */
  readonly packId: string;
  readonly reviewedAt: string;
  readonly state: ManualTestReviewState;
  readonly invalidatedAt: string | null;
  readonly invalidatedReason: string | null;
}

// ---------------------------------------------------------------------------
// Manual Test Result Record
// ---------------------------------------------------------------------------

/**
 * Durable record of a single manual test pass/fail outcome.
 */
export interface ManualTestResultRecord {
  readonly id: string;
  readonly projectId: string;
  readonly cardKey: string;
  readonly packId: string;
  readonly reviewId: string;
  readonly testId: string;     // e.g., "MT-001"
  readonly result: ManualTestResultOutcome;
  readonly actualResult: string | null;
  readonly notes: string | null;
  /** Finding ID when result is "fail" (links to existing hepha_feature_findings). */
  readonly findingId: string | null;
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Read-Model: Pack Status
// ---------------------------------------------------------------------------

/**
 * Read-model used by the dashboard and completion gate.
 */
export interface ManualTestPackStatus {
  readonly state: ManualTestPackState;
  readonly currentPackId: string | null;
  readonly currentVersion: string | null;
  readonly hasMarkdown: boolean;
  readonly hasPdf: boolean;
  readonly isStale: boolean;
  readonly isReviewed: boolean;
  readonly currentReviewId: string | null;
  readonly reviewState: ManualTestReviewState | null;
  readonly canRecordTests: boolean;
  /** Count of failed tests in the current pack. */
  readonly failedCount: number;
  /** Count of passing tests in the current pack. */
  readonly passedCount: number;
  /** Whether the current pack has any recorded test results. */
  readonly hasResults: boolean;
  /** Whether human execution is required by the classified acceptance criteria. */
  readonly applicability: "applicable" | "not_applicable" | "incomplete";
  /** Number of validated, executable manual cases in the current artifact. */
  readonly manualTestCount: number;
  /** Number of rejected manual-case definitions. */
  readonly invalidManualTestCount: number;
  /** True only when at least one validated executable manual case exists. */
  readonly isReady: boolean;
  /** Human-readable message for the dashboard. */
  readonly message: string;
}

export type AcceptanceCriterionClassification = "manual" | "automated" | "deferred" | "uncovered";

export type AutomatedExecutionStatus =
  | "executed-passed"
  | "executed-failed"
  | "zero-tests-discovered"
  | "not-executed";

export interface AutomatedEvidenceSummary {
  readonly id: string;
  readonly title: string;
  readonly status: AutomatedExecutionStatus;
  readonly detail: string;
  readonly sourcePath: string | null;
  readonly command: string | null;
}

// ---------------------------------------------------------------------------
// Failure Payload (from UI → adapter)
// ---------------------------------------------------------------------------

/**
 * Structured submission payload when a manual test fails.
 */
export interface FailedTestSubmission {
  readonly packId: string;
  readonly reviewId: string;
  readonly testId: string;
  readonly sourceIds: readonly string[];
  readonly expectedResult: string;
  readonly actualResult: string;
  readonly notes: string | null;
  readonly findingTitle: string;
  readonly findingContent: string;
}

// ---------------------------------------------------------------------------
// Finding Linkage
// ---------------------------------------------------------------------------

/**
 * Structured linkage from a failed manual test to its Human Review Finding.
 * Stored as metadata alongside the existing finding record.
 */
export interface ManualTestFindingLink {
  readonly findingId: string;
  readonly packId: string;
  readonly reviewId: string;
  readonly testId: string;
  readonly sourceIds: readonly string[];
  readonly expectedResult: string;
  readonly actualResult: string;
  readonly linkedAt: string;
}
