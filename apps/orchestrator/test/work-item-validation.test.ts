import { describe, expect, it } from "vitest";
import type { StoredCardMetadata } from "@hepha/db";
import {
  assertDeepDiveMetadataStoreEnabled,
  countNeedsValidationTags,
  createValidationSummary,
  HephaConfigurationError,
  sanitizeValidationMarkerReferences,
  sqliteDeepDiveRequiredMessage,
} from "../src/work-item-validation.js";

const currentMetadata: StoredCardMetadata = {
  cardKey: "epic:EPIC-001",
  designFeatureCompletedAt: null,
  lastDeepDiveAt: "2026-06-10T10:00:00.000Z",
  lastDeepDiveRunId: "dd-1",
  lastDeepDiveSourceHash: "hash-a",
  lastDeepDiveSourceUpdatedAt: "2026-06-10T09:55:00.000Z",
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

describe("deep-dive metadata guard", () => {
  it("throws an actionable error when SQLite metadata is unavailable", () => {
    expect(() => assertDeepDiveMetadataStoreEnabled(false)).toThrow(sqliteDeepDiveRequiredMessage);
  });

  it("marks missing SQLite metadata as a configuration failure", () => {
    expect.assertions(2);

    try {
      assertDeepDiveMetadataStoreEnabled(false);
    } catch (error) {
      expect(error).toBeInstanceOf(HephaConfigurationError);
      expect((error as HephaConfigurationError).statusCode).toBe(503);
    }
  });

  it("allows deep-dive startup when SQLite metadata is available", () => {
    expect(() => assertDeepDiveMetadataStoreEnabled(true)).not.toThrow();
  });
});

describe("work item validation summary", () => {
  it("counts validation markers case-insensitively", () => {
    expect(
      countNeedsValidationTags("[NEEDS VALIDATION]\ntext\n[needs validation]\n[Needs Validation]"),
    ).toBe(3);
  });

  it("does not count resolved-status prose as an active validation marker", () => {
    expect(
      countNeedsValidationTags(
        [
          "- Scope confirmed.",
          "- No remaining [NEEDS VALIDATION] markers.",
          "- Actual open topic [NEEDS VALIDATION]",
        ].join("\n"),
      ),
    ).toBe(1);
  });

  it("sanitizes validation marker references for deep-dive decision transcripts", () => {
    const transcript = [
      "Question: How should Hepha handle [NEEDS VALIDATION] markers before Ready?",
      "Decision: Keep [NEEDS VALIDATION] tags visible until accepted.",
      "Additional detail: Replace the literal [NEEDS VALIDATION] token in explanatory prose.",
    ].join("\n");

    const sanitized = sanitizeValidationMarkerReferences(transcript);

    expect(sanitized).toContain("validation markers before Ready");
    expect(sanitized).toContain("validation tags visible until accepted");
    expect(sanitized).toContain("literal validation marker token");
    expect(countNeedsValidationTags(sanitized)).toBe(0);
  });

  it("does not let sanitized deep-dive decision prose block EPIC extraction", () => {
    const markdown = sanitizeValidationMarkerReferences(
      [
        "# EPIC-008: Autonomous Implementation Review And Completion",
        "",
        "## Hepha Deep-Dive Decisions",
        "Question: How should Hepha handle [NEEDS VALIDATION] markers before Ready?",
        "Decision: Keep [NEEDS VALIDATION] markers visible until accepted.",
      ].join("\n"),
    );

    const summary = createValidationSummary("epic", markdown, "hash-a", currentMetadata, true);

    expect(summary).toMatchObject({
      blocksFeatureExtraction: false,
      needsValidationCount: 0,
    });
  });

  it("allows marker-free EPIC extraction without metadata or Deep-Dive history", () => {
    const withoutMetadata = createValidationSummary("epic", "# EPIC", "hash-a", null, false);
    const withoutHistory = createValidationSummary("epic", "# EPIC", "hash-a", null, true);

    expect(withoutMetadata).toMatchObject({
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
    expect(withoutHistory).toMatchObject({
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
  });

  it("blocks EPIC feature extraction only when validation tags remain", () => {
    const summary = createValidationSummary(
      "epic",
      "- Decision [NEEDS VALIDATION]",
      "hash-a",
      currentMetadata,
      true,
    );

    expect(summary).toMatchObject({
      blocksFeatureExtraction: true,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "stale",
      needsValidationCount: 1,
    });
  });

  it("does not require another Deep-Dive when a marker-free document changes", () => {
    const summary = createValidationSummary("epic", "# EPIC", "hash-b", currentMetadata, true);

    expect(summary).toMatchObject({
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
  });

  it("recognizes the underscore validation-marker spelling", () => {
    expect(countNeedsValidationTags("Decision [NEEDS_VALIDATION]")).toBe(1);
  });

  it("clears EPIC feature extraction when metadata is current and no validation tags remain", () => {
    const summary = createValidationSummary("epic", "# EPIC", "hash-a", currentMetadata, true);

    expect(summary).toMatchObject({
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
  });

  it("does not block FEAT cards when SQLite metadata is unavailable", () => {
    const summary = createValidationSummary("feature", "# FEAT", "hash-a", null, false);

    expect(summary).toMatchObject({
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveStatus: "current",
      needsValidationCount: 0,
    });
  });
});
