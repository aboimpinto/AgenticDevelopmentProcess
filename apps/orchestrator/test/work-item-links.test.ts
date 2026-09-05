import { describe, expect, it } from "vitest";
import type { StoredCardMetadata } from "@hepha/db";
import {
  extractEpicChildFeatureIds,
  extractFeatureParentEpicIds,
  extractLinkedIds,
} from "../src/work-item-links.js";
import { createValidationSummary } from "../src/work-item-validation.js";

describe("work item relation extraction", () => {
  it("extracts EPIC child FEATs from feature tables", () => {
    const markdown = [
      "# EPIC-002",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-004 | Layer 4.0 | IN_PROGRESS |",
      "| FEAT-005 | Layer 4.1 | READY_TO_DEVELOP |",
    ].join("\n");

    expect(extractEpicChildFeatureIds(markdown)).toEqual(["FEAT-004", "FEAT-005"]);
  });

  it("does not treat historical FEAT mentions as EPIC child FEATs", () => {
    const markdown = [
      "# EPIC-003",
      "",
      "- EPIC-001 FEAT-002 completed the original Layer 5 user-command boundary work.",
      "- Read EPIC-001 FEAT-002 as historical evidence.",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| TBD | Current target branch follow-up | SUBMITTED |",
    ].join("\n");

    expect(extractLinkedIds(markdown, "FEAT")).toEqual(["FEAT-002"]);
    expect(extractEpicChildFeatureIds(markdown)).toEqual([]);
  });

  it("extracts explicit parent EPICs from FEAT documents", () => {
    const markdown = [
      "# FEAT-008",
      "",
      "**Parent Epic**: EPIC-002",
      "",
      "- Historical comparison: EPIC-001 FEAT-003",
    ].join("\n");

    expect(extractLinkedIds(markdown, "EPIC")).toEqual(["EPIC-001", "EPIC-002"]);
    expect(extractFeatureParentEpicIds(markdown)).toEqual(["EPIC-002"]);
  });

  // ── FEAT-007 Phase 3: Business logic edge cases ──

  describe("FEAT-007 business logic: relationship edge cases", () => {
    it("extracts no child FEATs when EPIC table has no matching IDs", () => {
      const markdown = [
        "# EPIC-100",
        "",
        "| ID | Title |",
        "|----|-------|",
        "| TBD | Future feature |",
        "| ABC-123 | Unknown |",
      ].join("\n");

      expect(extractEpicChildFeatureIds(markdown)).toEqual([]);
    });

    it("deduplicates duplicate FEAT IDs in EPIC child extraction", () => {
      const markdown = [
        "# EPIC-101",
        "",
        "| Feature ID | Title | Status |",
        "|------------|-------|--------|",
        "| FEAT-050 | Alpha | IN_PROGRESS |",
        "| FEAT-050 | Alpha (duplicate row) | IN_PROGRESS |",
        "| FEAT-051 | Beta | COMPLETED |",
      ].join("\n");

      expect(extractEpicChildFeatureIds(markdown)).toEqual(["FEAT-050", "FEAT-051"]);
    });

    it("extracts no parent EPIC when FEAT document has no parent reference", () => {
      const markdown = [
        "# FEAT-100",
        "",
        "## Summary",
        "",
        "A standalone FEAT with no EPIC reference.",
      ].join("\n");

      expect(extractFeatureParentEpicIds(markdown)).toEqual([]);
    });

    it("extracts multiple parent EPICs from table row", () => {
      const markdown = [
        "# FEAT-101",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Parent Epics | EPIC-010, EPIC-011 |",
      ].join("\n");

      expect(extractFeatureParentEpicIds(markdown)).toEqual(["EPIC-010", "EPIC-011"]);
    });

    it("handles FEAT ID at end of bold table cell", () => {
      const markdown = [
        "# EPIC-103",
        "",
        "| **Feature ID** | Title |",
        "|----------------|-------|",
        "| **FEAT-070** | Implementation |",
      ].join("\n");

      expect(extractEpicChildFeatureIds(markdown)).toEqual(["FEAT-070"]);
    });

    it("handles FEAT ID with markdown heading or list prefix inside EPIC child table", () => {
      const markdown = [
        "# EPIC-104",
        "",
        "| Feature ID | Title | Status |",
        "|------------|-------|--------|",
        "| ## FEAT-080 | Styled | PENDING |",
        "| - FEAT-081 | Dashed | DONE |",
      ].join("\n");

      expect(extractEpicChildFeatureIds(markdown)).toEqual(["FEAT-080", "FEAT-081"]);
    });
  });

  describe("FEAT-007 business logic: validation and deep-dive independence", () => {
    it("deep-dive metadata never replaces needsValidationCount from current file", () => {
      const markdownWithMarkers = "- Decision [NEEDS VALIDATION]\n";
      const markdownWithoutMarkers = "- Decision finalised.\n";

      const metadata: StoredCardMetadata = {
        cardKey: "epic:EPIC-001",
        lastDeepDiveAt: "2026-06-10T10:00:00.000Z",
        lastDeepDiveRunId: "dd-1",
        lastDeepDiveSourceHash: "hash-a",
        lastDeepDiveSourceUpdatedAt: "2026-06-10T09:55:00.000Z",
        designFeatureCompletedAt: null,
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

      const withMarkers = createValidationSummary("epic", markdownWithMarkers, "hash-a", metadata, true);
      const withoutMarkers = createValidationSummary("epic", markdownWithoutMarkers, "hash-a", metadata, true);

      expect(withMarkers.needsValidationCount).toBe(1);
      expect(withoutMarkers.needsValidationCount).toBe(0);
    });
  });
});
