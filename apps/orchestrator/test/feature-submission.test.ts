import { describe, expect, it } from "vitest";
import {
  deriveFeatureDocumentPath,
  deriveFeatureFolderPath,
  renderSubmitFeatureDocument,
  type RenderSubmitFeatureDocumentInput,
} from "../src/feature-submission.js";

// ---------------------------------------------------------------------------
// renderSubmitFeatureDocument
// ---------------------------------------------------------------------------

describe("renderSubmitFeatureDocument", () => {
  const minimalInput: RenderSubmitFeatureDocumentInput = {
    featureId: "FEAT-020",
    title: "Native Submit Feature Command",
    summary: "Allow standalone FEAT submission from the dashboard/API.",
  };

  it("includes the FEAT heading", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    expect(doc).toContain("# FEAT-020: Native Submit Feature Command");
  });

  it("includes Status: Submitted", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    expect(doc).toContain("**Status**: Submitted");
  });

  it("includes the summary text", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    expect(doc).toContain("Allow standalone FEAT submission from the dashboard/API.");
  });

  it("omits parent EPIC metadata when not supplied", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    expect(doc).not.toContain("**Parent Epic**");
    expect(doc).toContain("Standalone FEAT submission (no parent EPIC).");
  });

  it("includes parent EPIC ID and title when supplied", () => {
    const doc = renderSubmitFeatureDocument({
      ...minimalInput,
      parentEpicId: "EPIC-004",
      parentEpicTitle: "FEAT Planning Lifecycle",
    });

    expect(doc).toContain("**Parent Epic**: EPIC-004");
    expect(doc).toContain("EPIC: EPIC-004 - FEAT Planning Lifecycle");
    expect(doc).not.toContain("Standalone FEAT submission (no parent EPIC).");
  });

  it("includes parent EPIC ID only when title is not supplied", () => {
    const doc = renderSubmitFeatureDocument({
      ...minimalInput,
      parentEpicId: "EPIC-004",
    });

    expect(doc).toContain("**Parent Epic**: EPIC-004");
    expect(doc).toContain("EPIC: EPIC-004");
    expect(doc).toContain("Submitted as a standalone FEAT under the above EPIC.");
  });

  it("includes priority when supplied", () => {
    const doc = renderSubmitFeatureDocument({
      ...minimalInput,
      priority: "High",
    });

    expect(doc).toContain("**Priority**: High");
  });

  it("includes owner when supplied", () => {
    const doc = renderSubmitFeatureDocument({
      ...minimalInput,
      owner: "Paulo Aboim Pinto",
    });

    expect(doc).toContain("**Owner**: Paulo Aboim Pinto");
  });

  it("includes external reference when supplied", () => {
    const doc = renderSubmitFeatureDocument({
      ...minimalInput,
      externalReference: "https://github.com/aboimpinto/AgenticDevelopmentProcess/issues/1",
    });

    expect(doc).toContain("**External Reference**");
  });

  it("includes acceptance criteria when supplied", () => {
    const doc = renderSubmitFeatureDocument({
      ...minimalInput,
      acceptanceCriteria: [
        "Standalone FEAT can be created without EPIC extraction.",
        "FEAT ID is allocated from the stable counter.",
      ],
    });

    expect(doc).toContain("## Acceptance Criteria");
    expect(doc).toContain("- Standalone FEAT can be created without EPIC extraction.");
    expect(doc).toContain("- FEAT ID is allocated from the stable counter.");
  });

  it("omits acceptance criteria section when none supplied", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    expect(doc).not.toContain("## Acceptance Criteria");
  });

  it("includes validation marker for unrefined FEATs", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    expect(doc).toContain("[NEEDS VALIDATION] Confirm this FEAT scope before refinement or implementation.");
  });

  it("renders a document that is readable as complete Markdown", () => {
    const doc = renderSubmitFeatureDocument(minimalInput);

    // Should have all required structural elements
    expect(doc).toMatch(/^# FEAT-\d+: .+/m);
    expect(doc).toMatch(/^\*\*Feature ID\*\*/m);
    expect(doc).toMatch(/^\*\*Status\*\*/m);
    expect(doc).toMatch(/^## Summary/m);
    expect(doc).toMatch(/^## Source/m);
    expect(doc).toMatch(/^## Validation/m);
  });

  it("renders a standalone FEAT with all optional fields populated", () => {
    const doc = renderSubmitFeatureDocument({
      featureId: "FEAT-021",
      title: "Full Example Feature",
      summary: "A feature with all optional fields for testing.",
      acceptanceCriteria: ["Criterion 1", "Criterion 2"],
      parentEpicId: "EPIC-001",
      parentEpicTitle: "Core Platform",
      priority: "High",
      externalReference: "REF-001",
      owner: "Test Owner",
    });

    expect(doc).toContain("# FEAT-021: Full Example Feature");
    expect(doc).toContain("**Parent Epic**: EPIC-001");
    expect(doc).toContain("**Priority**: High");
    expect(doc).toContain("**Owner**: Test Owner");
    expect(doc).toContain("**External Reference**: REF-001");
    expect(doc).toContain("EPIC: EPIC-001 - Core Platform");
    expect(doc).toContain("## Acceptance Criteria");
    expect(doc).toContain("- Criterion 1");
    expect(doc).toContain("- Criterion 2");
  });
});

// ---------------------------------------------------------------------------
// deriveFeatureFolderPath
// ---------------------------------------------------------------------------

describe("deriveFeatureFolderPath", () => {
  it("creates path with slugified title", () => {
    const path = deriveFeatureFolderPath("/mb", "FEAT-020", "Native Submit Feature Command");

    expect(path).toBe("/mb/Features/01_SUBMITTED/FEAT-020-native-submit-feature-command");
  });

  it("handles titles with special characters", () => {
    const path = deriveFeatureFolderPath("/mb", "FEAT-021", "Hello World! @#$% Special");

    expect(path).toBe("/mb/Features/01_SUBMITTED/FEAT-021-hello-world-special");
  });

  it("truncates long titles to 80 characters", () => {
    const longTitle =
      "This is an extremely long feature title that should be truncated at eighty characters in the slug for filesystem safety";
    const path = deriveFeatureFolderPath("/mb", "FEAT-022", longTitle);
    const folderName = path.split("/").pop()!;

    // The slug part should not exceed 80 characters
    const slugPart = folderName.replace("FEAT-022-", "");

    expect(slugPart.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// deriveFeatureDocumentPath
// ---------------------------------------------------------------------------

describe("deriveFeatureDocumentPath", () => {
  it("returns the FeatureDescription.md path inside the FEAT folder", () => {
    const path = deriveFeatureDocumentPath("/mb", "FEAT-020", "Test Feature");

    expect(path).toBe("/mb/Features/01_SUBMITTED/FEAT-020-test-feature/FeatureDescription.md");
  });
});
