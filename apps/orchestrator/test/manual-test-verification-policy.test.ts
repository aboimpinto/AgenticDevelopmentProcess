// Behavior suite: manual test verification policy.
/**
 * FEAT-045 Phase 7: Policy Module Unit Tests
 *
 * Pure function tests for manual-test-verification-policy.ts.
 * No I/O, no side effects — all functions are synchronous and deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeSourceItems,
  normalizeCriterionText,
  hashCriterionText,
  hashManifestJson,
  buildCoverageMap,
  hasAcceptableCoverage,
  generateManualTests,
  validateManualTestCase,
  isPackFresh,
  detectChangedSources,
  canGeneratePack,
  canReviewPack,
  canRecordManualTests,
  canRecordFailedTest,
  computePackState,
  isReviewValidForPack,
  buildPackStatus,
  validateFailedTestSubmission,
  buildFindingTitle,
  buildFindingContent,
} from "../src/manual-test-verification-policy.js";
import type {
  ManualTestSourceManifestEntry,
  ManualTestPackRecord,
  ManualTestReviewRecord,
  ManualTestResultRecord,
  ManualTestPackStatus,
} from "../src/manual-test-verification-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ManualTestSourceManifestEntry> = {}): ManualTestSourceManifestEntry {
  return {
    sourceId: "AC-01",
    category: "feat-ac",
    relativePath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-045/FeatureDescription.md",
    contentHash: "abc123",
    criterionPreview: "Test criterion preview",
    ...overrides,
  };
}

function makePackRecord(overrides: Partial<ManualTestPackRecord> = {}): ManualTestPackRecord {
  return {
    id: "FEAT-045-2026-07-10T080000Z-v1",
    projectId: "proj-1",
    cardKey: "FEAT-045",
    version: "2026-07-10T080000Z-v1",
    state: "current",
    manifestHash: "hash123",
    markdownPath: "some/path/ManualTestVerification.md",
    pdfPath: "some/path/ManualTestVerification.pdf",
    renderError: null,
    createdAt: "2026-07-10T08:00:00.000Z",
    supersededAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizeCriterionText", () => {
  it("trims whitespace", () => {
    expect(normalizeCriterionText("  hello world  ")).toBe("hello world");
  });

  it("normalizes CRLF to LF", () => {
    expect(normalizeCriterionText("line1\r\nline2")).toBe("line1\nline2");
  });

  it("removes trailing spaces per line", () => {
    expect(normalizeCriterionText("line1   \nline2  ")).toBe("line1\nline2");
  });

  it("collapses triple+ newlines to double", () => {
    expect(normalizeCriterionText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("handles empty string", () => {
    expect(normalizeCriterionText("")).toBe("");
  });
});

describe("hashCriterionText", () => {
  it("produces a deterministic SHA-256 hex string", () => {
    const hash = hashCriterionText("some criterion text");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic (same input → same hash)", () => {
    const input = "Generate a deterministic Manual Test Verification Pack";
    expect(hashCriterionText(input)).toBe(hashCriterionText(input));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashCriterionText("criterion A")).not.toBe(hashCriterionText("criterion B"));
  });
});

describe("normalizeSourceItems", () => {
  it("assigns stable source IDs in order", () => {
    const items = [
      { category: "feat-ac" as const, relativePath: "path1.md", text: "Criterion A" },
      { category: "feat-ac" as const, relativePath: "path2.md", text: "Criterion B" },
    ];
    const entries = normalizeSourceItems(items);
    expect(entries[0]!.sourceId).toBe("AC-01");
    expect(entries[1]!.sourceId).toBe("AC-02");
  });

  it("deduplicates exact text matches", () => {
    const items = [
      { category: "feat-ac" as const, relativePath: "path1.md", text: "Duplicate text" },
      { category: "feat-ac" as const, relativePath: "path2.md", text: "Duplicate text" },
    ];
    const entries = normalizeSourceItems(items);
    expect(entries).toHaveLength(1);
  });

  it("handles empty input", () => {
    expect(normalizeSourceItems([])).toEqual([]);
  });

  it("preserves explicitId when provided", () => {
    const items = [
      { category: "feat-ac" as const, relativePath: "path.md", text: "Explicit test", explicitId: "MY-ID-01" },
    ];
    const entries = normalizeSourceItems(items);
    expect(entries[0]!.sourceId).toBe("MY-ID-01");
  });

  it("generates content hash for each entry", () => {
    const items = [
      { category: "feat-ac" as const, relativePath: "path.md", text: "Hash me" },
    ];
    const entries = normalizeSourceItems(items);
    expect(entries[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashManifestJson", () => {
  it("produces deterministic hash for entries", () => {
    const entries = [makeEntry({ sourceId: "AC-01" }), makeEntry({ sourceId: "AC-02" })];
    expect(hashManifestJson(entries)).toBe(hashManifestJson(entries));
  });

  it("is order-independent (sorts by sourceId)", () => {
    const entriesA = [makeEntry({ sourceId: "AC-02" }), makeEntry({ sourceId: "AC-01" })];
    const entriesB = [makeEntry({ sourceId: "AC-01" }), makeEntry({ sourceId: "AC-02" })];
    expect(hashManifestJson(entriesA)).toBe(hashManifestJson(entriesB));
  });

  it("produces 64-char hex string", () => {
    expect(hashManifestJson([makeEntry()])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles empty array", () => {
    expect(hashManifestJson([])).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Coverage Map
// ---------------------------------------------------------------------------

describe("buildCoverageMap", () => {
  it("marks feat-ac entries without evidence as uncovered", () => {
    const entries = [makeEntry({ sourceId: "AC-01", category: "feat-ac" })];
    const map = buildCoverageMap(entries, new Set(), new Set());
    expect(map[0]!.coverageStatus).toBe("uncovered");
  });

  it("marks epic-ac entries without evidence as uncovered", () => {
    const entries = [makeEntry({ sourceId: "EAC-01", category: "epic-ac" })];
    const map = buildCoverageMap(entries, new Set(), new Set());
    expect(map[0]!.coverageStatus).toBe("uncovered");
  });

  it("requires coverage for skipped-task manual obligations but not Gherkin inventory", () => {
    const entries = [
      makeEntry({ sourceId: "GHERKIN-01", category: "gherkin" }),
      makeEntry({ sourceId: "MT-PHYSICAL-001", category: "phase-ac" }),
    ];
    const map = buildCoverageMap(entries, new Set(), new Set());
    expect(map[0]!.coverageStatus).toBe("automated");
    expect(map[1]!.coverageStatus).toBe("uncovered");
  });

  it("marks explicit deferred source IDs as deferred", () => {
    const entries = [makeEntry({ sourceId: "AC-01", category: "feat-ac" })];
    const map = buildCoverageMap(entries, new Set(), new Set(["AC-01"]));
    expect(map[0]!.coverageStatus).toBe("deferred");
  });

  it("reports rationale for uncovered criteria", () => {
    const entries = [makeEntry({ sourceId: "AC-01", category: "feat-ac" })];
    const map = buildCoverageMap(entries, new Set(), new Set());
    expect(map[0]!.rationale).toContain("No validated manual workflow");
  });

  it("classifies criteria with automated evidence as automated", () => {
    const entries = [makeEntry({ sourceId: "AC-01", category: "feat-ac" })];
    const map = buildCoverageMap(entries, new Set(), new Set(), new Map([
      ["AC-01", ["unit-tests: exact behavior passed"]],
    ]));
    expect(map[0]).toEqual(expect.objectContaining({ coverageStatus: "automated", manualTestId: null }));
  });

  it("classifies only validated case sources as manual", () => {
    const entries = [makeEntry({ sourceId: "AC-01", category: "feat-ac" })];
    const map = buildCoverageMap(entries, new Set(["AC-01"]), new Set());
    expect(map[0]!.coverageStatus).toBe("manual");
  });
});

describe("hasAcceptableCoverage", () => {
  it("returns true when all entries are covered", () => {
    const map = [
      { sourceId: "AC-01", category: "feat-ac" as const, criterionPreview: "", coverageStatus: "manual" as const, manualTestId: "MT-001", rationale: null, evidence: [] },
      { sourceId: "EAC-01", category: "epic-ac" as const, criterionPreview: "", coverageStatus: "deferred" as const, manualTestId: null, rationale: "Deferred", evidence: [] },
    ];
    expect(hasAcceptableCoverage(map)).toBe(true);
  });

  it("returns false when any entry is missing coverage", () => {
    const map = [
      { sourceId: "AC-01", category: "feat-ac" as const, criterionPreview: "", coverageStatus: "uncovered" as const, manualTestId: null, rationale: "No test", evidence: [] },
    ];
    expect(hasAcceptableCoverage(map)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Manual Test Generation
// ---------------------------------------------------------------------------

describe("generateManualTests", () => {
  const validCase = {
    id: "MT-001", title: "Change profile", purpose: "Verify the visible profile change", sourceIds: ["AC-01"],
    role: "Account owner", application: "Example web client account settings",
    preconditions: ["The staging deployment is available", "A licensed test account exists"],
    setupData: "Test account owner@example.test with the Direct Free plan",
    steps: ["Open the example account settings page", "Select Licence details"],
    expectedResult: "The Direct Free plan name and 100-voter limit are visible.",
  };

  it("retains a concrete human-executable case", () => {
    expect(generateManualTests([validCase])).toEqual([validCase]);
    expect(validateManualTestCase(validCase)).toEqual([]);
  });

  it.each([
    "Navigate to the feature area related to the criterion",
    "Perform the expected user workflow",
    "Verify the observed behavior matches the acceptance criterion",
  ])("rejects placeholder action: %s", (placeholder) => {
    const invalid = { ...validCase, steps: [placeholder] };
    expect(generateManualTests([invalid])).toEqual([]);
    expect(validateManualTestCase(invalid)).not.toEqual([]);
  });

  it("does not manufacture cases from acceptance criteria", () => {
    expect(generateManualTests([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Freshness & Staleness
// ---------------------------------------------------------------------------

describe("isPackFresh", () => {
  it("returns true when manifest hashes match", () => {
    const entries = [makeEntry()];
    const hash = hashManifestJson(entries);
    expect(isPackFresh(hash, entries)).toBe(true);
  });

  it("returns false when manifest hashes differ", () => {
    const storedHash = hashManifestJson([makeEntry({ sourceId: "AC-01" })]);
    const currentEntries = [makeEntry({ sourceId: "AC-02" })];
    expect(isPackFresh(storedHash, currentEntries)).toBe(false);
  });
});

describe("detectChangedSources", () => {
  it("returns empty array when no changes", () => {
    const entries = [makeEntry()];
    expect(detectChangedSources(entries, entries)).toEqual([]);
  });

  it("detects new source entries", () => {
    const stored = [makeEntry({ sourceId: "AC-01" })];
    const current = [makeEntry({ sourceId: "AC-01" }), makeEntry({ sourceId: "AC-02" })];
    expect(detectChangedSources(stored, current)).toContain("AC-02");
  });

  it("detects removed source entries", () => {
    const stored = [makeEntry({ sourceId: "AC-01" }), makeEntry({ sourceId: "AC-02" })];
    const current = [makeEntry({ sourceId: "AC-01" })];
    expect(detectChangedSources(stored, current)).toContain("AC-02");
  });

  it("detects changed content hashes", () => {
    const stored = [makeEntry({ sourceId: "AC-01", contentHash: "oldhash" })];
    const current = [makeEntry({ sourceId: "AC-01", contentHash: "newhash" })];
    expect(detectChangedSources(stored, current)).toContain("AC-01");
  });

  it("deduplicates changed source IDs", () => {
    const stored = [makeEntry({ sourceId: "AC-01", contentHash: "old" })];
    const current = [
      makeEntry({ sourceId: "AC-01", contentHash: "new" }),
    ];
    const changes = detectChangedSources(stored, current);
    expect(changes.filter((id) => id === "AC-01")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Eligibility Rules
// ---------------------------------------------------------------------------

describe("canGeneratePack", () => {
  it("returns true when all phases resolved", () => {
    expect(canGeneratePack({
      currentPackState: null,
      hasCurrentPack: false,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(true);
  });

  it("returns false when phases not resolved", () => {
    expect(canGeneratePack({
      currentPackState: null,
      hasCurrentPack: false,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: false,
    })).toBe(false);
  });
});

describe("canReviewPack", () => {
  it("returns true when pack is current, not stale, not reviewed", () => {
    expect(canReviewPack({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(true);
  });

  it("returns false when pack is stale", () => {
    expect(canReviewPack({
      currentPackState: "stale",
      hasCurrentPack: true,
      isPackStale: true,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });

  it("returns false when already reviewed", () => {
    expect(canReviewPack({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: true,
      reviewIsValid: true,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });
});

describe("canRecordManualTests", () => {
  it("returns true only when all gate conditions are satisfied", () => {
    expect(canRecordManualTests({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: true,
      reviewIsValid: true,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(true);
  });

  it("returns false when no current pack", () => {
    expect(canRecordManualTests({
      currentPackState: null,
      hasCurrentPack: false,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });

  it("returns false when pack is stale", () => {
    expect(canRecordManualTests({
      currentPackState: "stale",
      hasCurrentPack: true,
      isPackStale: true,
      isPackReviewed: true,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });

  it("returns false when not reviewed", () => {
    expect(canRecordManualTests({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });

  it("returns false when review is invalid", () => {
    expect(canRecordManualTests({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: true,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });

  it("returns false when open findings exist", () => {
    expect(canRecordManualTests({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: true,
      reviewIsValid: true,
      hasOpenFindings: true,
      allPhasesResolved: true,
    })).toBe(false);
  });
});

describe("canRecordFailedTest", () => {
  it("returns true when pack is current and not stale", () => {
    expect(canRecordFailedTest({
      currentPackState: "current",
      hasCurrentPack: true,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(true);
  });

  it("returns false when no current pack", () => {
    expect(canRecordFailedTest({
      currentPackState: null,
      hasCurrentPack: false,
      isPackStale: false,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });

  it("returns false when pack is stale", () => {
    expect(canRecordFailedTest({
      currentPackState: "stale",
      hasCurrentPack: true,
      isPackStale: true,
      isPackReviewed: false,
      reviewIsValid: false,
      hasOpenFindings: false,
      allPhasesResolved: true,
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------

describe("computePackState", () => {
  it("returns render_failed when render error exists", () => {
    expect(computePackState(true, true, false)).toBe("render_failed");
  });

  it("returns stale when stale", () => {
    expect(computePackState(true, false, true)).toBe("stale");
  });

  it("returns current when fresh and no error", () => {
    expect(computePackState(true, false, false)).toBe("current");
  });

  it("returns current even if was not current before", () => {
    expect(computePackState(false, false, false)).toBe("current");
  });
});

describe("isReviewValidForPack", () => {
  it("returns true when both review and pack are current", () => {
    expect(isReviewValidForPack("current", "current")).toBe(true);
  });

  it("returns false when review is invalidated", () => {
    expect(isReviewValidForPack("invalidated", "current")).toBe(false);
  });

  it("returns false when pack is not current", () => {
    expect(isReviewValidForPack("current", "stale")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Build Pack Status (read-model)
// ---------------------------------------------------------------------------

describe("buildPackStatus", () => {
  it("returns missing state when no current pack", () => {
    const status = buildPackStatus({
      currentPack: null,
      currentReview: null,
      testResults: [],
      isStale: false,
      allPhasesResolved: true,
      applicability: "applicable",
      manualTestCount: 1,
    });
    expect(status.state).toBe("missing");
    expect(status.currentPackId).toBeNull();
    expect(status.canRecordTests).toBe(false);
  });

  it("returns current state when pack exists and is fresh", () => {
    const pack = makePackRecord({ state: "current" });
    const status = buildPackStatus({
      currentPack: pack,
      currentReview: null,
      testResults: [],
      isStale: false,
      allPhasesResolved: true,
      applicability: "applicable",
      manualTestCount: 1,
    });
    expect(status.state).toBe("current");
    expect(status.isStale).toBe(false);
    expect(status.isReviewed).toBe(false);
    expect(status.canRecordTests).toBe(false); // Not reviewed yet
  });

  it("shows reviewed state when review exists", () => {
    const pack = makePackRecord({ state: "current" });
    const review: ManualTestReviewRecord = {
      id: "review-1",
      projectId: "proj-1",
      cardKey: "FEAT-045",
      packId: pack.id,
      reviewedAt: "2026-07-10T10:00:00.000Z",
      state: "current",
      invalidatedAt: null,
      invalidatedReason: null,
    };
    const status = buildPackStatus({
      currentPack: pack,
      currentReview: review,
      testResults: [],
      isStale: false,
      allPhasesResolved: true,
      applicability: "applicable",
      manualTestCount: 1,
    });
    expect(status.isReviewed).toBe(true);
    expect(status.canRecordTests).toBe(true);
  });

  it("does not project a review from a superseded pack onto the current pack", () => {
    const currentPack = makePackRecord({ id: "pack-current" });
    const supersededPackReview: ManualTestReviewRecord = {
      id: "review-superseded",
      projectId: "proj-1",
      cardKey: "FEAT-045",
      packId: "pack-superseded",
      reviewedAt: "2026-07-10T10:00:00.000Z",
      state: "current",
      invalidatedAt: null,
      invalidatedReason: null,
    };

    const status = buildPackStatus({
      currentPack,
      currentReview: supersededPackReview,
      testResults: [],
      isStale: false,
      allPhasesResolved: true,
      applicability: "applicable",
      manualTestCount: 1,
    });

    expect(status.isReviewed).toBe(false);
    expect(status.currentReviewId).toBeNull();
    expect(status.reviewState).toBeNull();
    expect(status.canRecordTests).toBe(false);
    expect(status.message).toContain("has not been reviewed");
  });

  it("shows stale state when isStale is true", () => {
    const pack = makePackRecord({ state: "current" });
    const status = buildPackStatus({
      currentPack: pack,
      currentReview: null,
      testResults: [],
      isStale: true,
      allPhasesResolved: true,
    });
    expect(status.isStale).toBe(true);
    expect(status.canRecordTests).toBe(false);
  });

  it("counts test results correctly", () => {
    const pack = makePackRecord({ state: "current" });
    const review: ManualTestReviewRecord = {
      id: "review-1",
      projectId: "proj-1",
      cardKey: "FEAT-045",
      packId: pack.id,
      reviewedAt: "2026-07-10T10:00:00.000Z",
      state: "current",
      invalidatedAt: null,
      invalidatedReason: null,
    };
    const results: ManualTestResultRecord[] = [
      { id: "r1", projectId: "proj-1", cardKey: "FEAT-045", packId: pack.id, reviewId: "review-1", testId: "MT-001", result: "pass", actualResult: null, notes: null, findingId: null, recordedAt: "" },
      { id: "r2", projectId: "proj-1", cardKey: "FEAT-045", packId: pack.id, reviewId: "review-1", testId: "MT-002", result: "fail", actualResult: "Unexpected error", notes: null, findingId: "finding-1", recordedAt: "" },
    ];
    const status = buildPackStatus({
      currentPack: pack,
      currentReview: review,
      testResults: results,
      isStale: false,
      allPhasesResolved: true,
    });
    expect(status.passedCount).toBe(1);
    expect(status.failedCount).toBe(1);
    expect(status.hasResults).toBe(true);
    expect(status.canRecordTests).toBe(false); // Open findings
  });

  it("generates appropriate status message for missing state", () => {
    const status = buildPackStatus({
      currentPack: null,
      currentReview: null,
      testResults: [],
      isStale: false,
      allPhasesResolved: true,
    });
    expect(status.message).toContain("No verification pack has been generated");
    expect(status.hasMarkdown).toBe(false);
    expect(status.hasPdf).toBe(false);
  });

  it("generates appropriate message when phases not resolved", () => {
    const status = buildPackStatus({
      currentPack: null,
      currentReview: null,
      testResults: [],
      isStale: false,
      allPhasesResolved: false,
    });
    expect(status.message).toContain("All implementation phases must be resolved");
  });
});

// ---------------------------------------------------------------------------
// Failure Validation
// ---------------------------------------------------------------------------

describe("validateFailedTestSubmission", () => {
  const knownTestIds = new Set(["MT-001", "MT-002"]);
  const knownPackId = "FEAT-045-2026-07-10T080000Z-v1";

  const validSubmission = {
    packId: knownPackId,
    reviewId: "review-1",
    testId: "MT-001",
    sourceIds: ["AC-01"],
    expectedResult: "System responds",
    actualResult: "System crashed",
    notes: null,
    findingTitle: "[Manual Test] MT-001: System crashed",
    findingContent: "## Manual Test Failure\n\n**Test:** MT-001\n",
  };

  it("returns valid for a valid submission", () => {
    const result = validateFailedTestSubmission(validSubmission, knownTestIds, knownPackId);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing packId", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, packId: "" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Pack ID is required.");
  });

  it("rejects wrong packId", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, packId: "WRONG-PACK" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('does not match current pack'))).toBe(true);
  });

  it("rejects missing reviewId", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, reviewId: "" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Review ID is required.");
  });

  it("rejects missing testId", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, testId: "" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Test ID is required.");
  });

  it("rejects unknown testId", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, testId: "MT-999" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("not a valid test for this pack"))).toBe(true);
  });

  it("rejects missing sourceIds", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, sourceIds: [] }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one source criterion ID is required.");
  });

  it("rejects missing expectedResult", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, expectedResult: "" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Expected result is required.");
  });

  it("rejects missing actualResult", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, actualResult: "" }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Actual result is required.");
  });

  it("rejects whitespace-only actualResult", () => {
    const result = validateFailedTestSubmission({ ...validSubmission, actualResult: "   " }, knownTestIds, knownPackId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Actual result is required.");
  });
});

// ---------------------------------------------------------------------------
// Finding Builder
// ---------------------------------------------------------------------------

describe("buildFindingTitle", () => {
  it("includes test ID and first 80 chars of actual result", () => {
    const title = buildFindingTitle("MT-001", "System crashed with error code 500");
    expect(title).toContain("MT-001");
    expect(title).toContain("System crashed");
  });
});

describe("buildFindingContent", () => {
  it("includes test ID, source criteria, expected and actual", () => {
    const content = buildFindingContent({
      testId: "MT-001",
      sourceIds: ["AC-01", "EAC-02"],
      expectedResult: "System responds",
      actualResult: "System crashed",
      notes: "Happens consistently",
    });
    expect(content).toContain("MT-001");
    expect(content).toContain("AC-01");
    expect(content).toContain("EAC-02");
    expect(content).toContain("System responds");
    expect(content).toContain("System crashed");
    expect(content).toContain("Happens consistently");
  });

  it("omits notes section when notes are null", () => {
    const content = buildFindingContent({
      testId: "MT-001",
      sourceIds: ["AC-01"],
      expectedResult: "OK",
      actualResult: "FAIL",
      notes: null,
    });
    expect(content).not.toContain("### Notes");
  });
});
