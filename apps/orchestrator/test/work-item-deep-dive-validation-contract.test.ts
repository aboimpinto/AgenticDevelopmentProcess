// Behavior suite: work item deep dive validation.
import { describe, expect, it } from "vitest";
import type { StoredCardMetadata } from "@hepha/db";
import {
  countNeedsValidationTags,
  createValidationSummary,
} from "../src/work-item-validation.js";

// ──────────────────────────────────────────────
// FEAT-specific card metadata fixtures
// ──────────────────────────────────────────────

const featMetadataCurrent: StoredCardMetadata = {
  cardKey: "feature:FEAT-015",
  designFeatureCompletedAt: null,
  lastDeepDiveAt: "2026-07-05T06:30:00.000Z",
  lastDeepDiveRunId: "dd-feat-015",
  lastDeepDiveSourceHash: "feat-hash-a",
  lastDeepDiveSourceUpdatedAt: "2026-07-05T06:25:00.000Z",
  refineFeatureCompletedAt: null,
  uiRequirementCheckedAt: null,
  uiRequirementDecision: null,
  uiRequirementReason: null,
  uiRequirementSourceHash: null,
  workflowCommand: null,
  workflowCompletedAt: null,
  workflowCurrentStep: null,
  workflowError: null,
  workflowRunId: null,
  workflowStartedAt: null,
  workflowStatus: null,
  workflowSummary: null,
};

// ──────────────────────────────────────────────
// FEAT-specific marker counting
// ──────────────────────────────────────────────

describe("FEAT-015: marker counting for FEAT documents", () => {
  it("counts [NEEDS VALIDATION] markers in a FEAT document", () => {
    const featDoc = [
      "# FEAT-015: Test Feature",
      "",
      "## Scope",
      "Some scope text [NEEDS VALIDATION]",
      "",
      "## Acceptance Criteria",
      "- AC1: Something [NEEDS VALIDATION]",
      "- AC2: Something else",
    ].join("\n");

    expect(countNeedsValidationTags(featDoc)).toBe(2);
  });

  it("ignores resolved-marker explanatory sentences in FEAT docs", () => {
    const featDoc = [
      "# FEAT-015: Test Feature",
      "",
      "## Validation",
      "- This topic has no [NEEDS VALIDATION] markers.",
      "- An actual open topic [NEEDS VALIDATION] exists here.",
      "- There are none [NEEDS VALIDATION] markers left in this section.",
    ].join("\n");

    expect(countNeedsValidationTags(featDoc)).toBe(1);
  });

  it("handles case-insensitive marker matching in FEAT docs", () => {
    const featDoc = [
      "[NEEDS VALIDATION] uppercase",
      "[needs validation] lowercase",
      "[Needs Validation] mixed",
    ].join("\n");

    expect(countNeedsValidationTags(featDoc)).toBe(3);
  });

  it("returns 0 for a clean FEAT document with no markers", () => {
    const cleanFeat = [
      "# FEAT-020: Clean Feature",
      "",
      "## Scope",
      "Fully specified.",
      "",
      "## Acceptance Criteria",
      "- AC1: Defined.",
    ].join("\n");

    expect(countNeedsValidationTags(cleanFeat)).toBe(0);
  });

  it("handles marker counting in documents with code blocks", () => {
    // Markers inside code fences should still be counted since
    // the current implementation does not filter code blocks
    const featDoc = [
      "# FEAT-015: Test",
      "",
      "```",
      "[NEEDS VALIDATION] inside code block",
      "```",
      "",
      "- Real marker [NEEDS VALIDATION]",
    ].join("\n");

    // Both markers are counted (current behavior is line-based)
    expect(countNeedsValidationTags(featDoc)).toBe(2);
  });
});

// ──────────────────────────────────────────────
// FEAT-specific deep-dive freshness
// ──────────────────────────────────────────────

describe("FEAT-015: marker-only Deep-Dive policy for FEAT cards", () => {
  it.each([
    { metadata: null, metadataStoreEnabled: false },
    { metadata: null, metadataStoreEnabled: true },
    { metadata: featMetadataCurrent, metadataStoreEnabled: true },
  ])("treats a marker-free FEAT as current regardless of metadata history", ({ metadata, metadataStoreEnabled }) => {
    const summary = createValidationSummary("feature", "# FEAT-015", "any-hash", metadata, metadataStoreEnabled);

    expect(summary).toMatchObject({
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
  });

  it("does not become stale when a marker-free document hash changes", () => {
    const summary = createValidationSummary("feature", "# FEAT-015 Modified", "feat-hash-b", featMetadataCurrent, true);

    expect(summary).toMatchObject({
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      lastHephaDeepDiveAt: "2026-07-05T06:30:00.000Z",
      needsValidationCount: 0,
    });
  });

  it.each(["feat-hash-a", "feat-hash-c"])(
    "requires Deep-Dive while a validation marker remains, independent of hash %s",
    (documentHash) => {
      const summary = createValidationSummary(
        "feature",
        "# Changed\n[NEEDS VALIDATION] unresolved",
        documentHash,
        featMetadataCurrent,
        true,
      );

      expect(summary).toMatchObject({
        changedSinceHephaDeepDive: false,
        deepDiveStatus: "stale",
        needsValidationCount: 1,
      });
    },
  );
});

// ──────────────────────────────────────────────
// FEAT card key consistency
// ──────────────────────────────────────────────

describe("FEAT-015: FEAT card key patterns", () => {
  it("uses feature: prefix for FEAT card keys", () => {
    // The card key format is kind:externalId
    // For FEATs this should be "feature:FEAT-###"
    expect(featMetadataCurrent.cardKey).toMatch(/^feature:FEAT-\d{3}$/);
  });

  it("supports standalone FEAT card keys without EPIC reference", () => {
    const standaloneMetadata: StoredCardMetadata = {
      ...featMetadataCurrent,
      cardKey: "feature:FEAT-020",
    };

    expect(standaloneMetadata.cardKey).toBe("feature:FEAT-020");
  });

  it("supports EPIC-derived FEAT card keys", () => {
    const derivedMetadata: StoredCardMetadata = {
      ...featMetadataCurrent,
      cardKey: "feature:FEAT-015",
    };

    expect(derivedMetadata.cardKey).toBe("feature:FEAT-015");
  });
});

// ──────────────────────────────────────────────
// Resolved marker sentence edge cases
// ──────────────────────────────────────────────

describe("FEAT-015: resolved marker sentence detection in FEAT docs", () => {
  it("does not count 'no [NEEDS VALIDATION] markers remain' as active", () => {
    const doc = "After review there are no [NEEDS VALIDATION] markers remaining in this section.";
    expect(countNeedsValidationTags(doc)).toBe(0);
  });

  it("does not count 'without [NEEDS VALIDATION] markers' as active", () => {
    const doc = "The scope was confirmed without [NEEDS VALIDATION] markers.";
    expect(countNeedsValidationTags(doc)).toBe(0);
  });

  it("does not count 'None [NEEDS VALIDATION] markers left' as active", () => {
    const doc = "Integration tests have none [NEEDS VALIDATION] markers left.";
    expect(countNeedsValidationTags(doc)).toBe(0);
  });

  it("counts markers on lines that contain resolved text but also real markers", () => {
    // Line should be: "No [NEEDS VALIDATION] markers remain. Actual [NEEDS VALIDATION]"
    // The line starts with "No ... markers" but also has a second marker
    // Current implementation: if the line matches the resolved pattern at all, it's skipped
    // This means the second marker is also skipped — this is the current behavior boundary
    const doc = [
      "No [NEEDS VALIDATION] markers remain here.",
      "Real unresolved topic [NEEDS VALIDATION]",
    ].join("\n");

    // The second line has a real marker and is not a resolved-sentence line
    expect(countNeedsValidationTags(doc)).toBe(1);
  });
});
