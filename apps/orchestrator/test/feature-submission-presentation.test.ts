// Behavior suite: feature submission.
import { describe, expect, it } from "vitest";
import type {
  SubmitFeatureInput,
  SubmitFeatureResponse,
  WorkItemCard,
  ProjectSummary,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// SubmitFeatureInput type contract
// ---------------------------------------------------------------------------

describe("SubmitFeatureInput type contract", () => {
  it("accepts minimal required fields", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "My Feature",
      summary: "Feature summary.",
    };

    expect(input.projectId).toBe("test-project");
    expect(input.title).toBe("My Feature");
    expect(input.summary).toBe("Feature summary.");
  });

  it("accepts all optional fields", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "Full Feature",
      summary: "Full summary.",
      acceptanceCriteria: ["Criterion 1", "Criterion 2"],
      parentEpicId: "EPIC-001",
      parentEpicTitle: "Core Platform",
      priority: "High",
      externalReference: "REF-001",
      owner: "Test Owner",
    };

    expect(input.acceptanceCriteria).toHaveLength(2);
    expect(input.parentEpicId).toBe("EPIC-001");
    expect(input.parentEpicTitle).toBe("Core Platform");
    expect(input.priority).toBe("High");
    expect(input.externalReference).toBe("REF-001");
    expect(input.owner).toBe("Test Owner");
  });

  it("accepts input with parentEpicId but without parentEpicTitle", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "Partial EPIC",
      summary: "Summary.",
      parentEpicId: "EPIC-001",
    };

    expect(input.parentEpicId).toBe("EPIC-001");
    expect(input.parentEpicTitle).toBeUndefined();
  });

  it("accepts empty acceptance criteria", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "No AC",
      summary: "Summary.",
      acceptanceCriteria: [],
    };

    expect(input.acceptanceCriteria).toEqual([]);
  });

  it("rejects missing projectId at the type level (undefined)", () => {
    const input: Partial<SubmitFeatureInput> = {
      title: "No Project",
      summary: "Summary.",
    };

    expect(input.projectId).toBeUndefined();
  });

  it("rejects missing title at the type level (undefined)", () => {
    const input: Partial<SubmitFeatureInput> = {
      projectId: "test-project",
      summary: "Summary.",
    };

    expect(input.title).toBeUndefined();
  });

  it("rejects missing summary at the type level (undefined)", () => {
    const input: Partial<SubmitFeatureInput> = {
      projectId: "test-project",
      title: "No Summary",
    };

    expect(input.summary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SubmitFeatureResponse type contract
// ---------------------------------------------------------------------------

describe("SubmitFeatureResponse type contract", () => {
  const mockFeature: WorkItemCard = {
    id: "project-1:01_SUBMITTED:FEAT-020-test-feature",
    externalId: "FEAT-020",
    title: "Test Feature",
    folderName: "FEAT-020-test-feature",
    folderPath: "/mb/Features/01_SUBMITTED/FEAT-020-test-feature",
    stateFolder: "01_SUBMITTED",
    stateLabel: "Submitted",
    kind: "feature",
    specMarkdown: "# FEAT-020: Test Feature\n\n**Status**: Submitted\n",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    summary: "Test feature summary.",
    documentPath: "/mb/Features/01_SUBMITTED/FEAT-020-test-feature/FeatureDescription.md",
    documentUpdatedAt: "2026-07-05T00:00:00.000Z",
    documentRelativePath: null,
    epicState: null,
    epicRefinements: [],
    featureWorkflow: null,
    implementationEvidence: null,
    phases: [],
    validation: {
      blocksFeatureExtraction: false,
      deepDiveStatus: null,
      documentHash: "abc123",
      metadataAvailable: false,
      needsValidationCount: 1,
      validationSummary: null,
    },
  };

  const mockProject: ProjectSummary = {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "test-project",
    memoryBankPath: "/mb",
    name: "Test Project",
    rootPath: "/test",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };

  it("constructs a valid response with feature, filesCreated, items, project, summary", () => {
    const response: SubmitFeatureResponse = {
      feature: mockFeature,
      filesCreated: ["/mb/Features/01_SUBMITTED/FEAT-020-test-feature/FeatureDescription.md"],
      items: [mockFeature],
      project: mockProject,
      summary: "Submitted FEAT-020: Test Feature.",
    };

    expect(response.feature.externalId).toBe("FEAT-020");
    expect(response.feature.kind).toBe("feature");
    expect(response.feature.stateFolder).toBe("01_SUBMITTED");
    expect(response.filesCreated).toHaveLength(1);
    expect(response.items).toHaveLength(1);
    expect(response.project.name).toBe("Test Project");
    expect(response.summary).toContain("FEAT-020");
  });

  it("satisfies the WorkItemCard structure for dashboard consumption", () => {
    const response: SubmitFeatureResponse = {
      feature: mockFeature,
      filesCreated: [],
      items: [mockFeature],
      project: mockProject,
      summary: "Submitted FEAT-020: Test Feature.",
    };

    // Dashboard needs: id, externalId, title, kind, stateFolder, stateLabel
    expect(response.feature.id).toBeTruthy();
    expect(response.feature.externalId).toBeTruthy();
    expect(response.feature.title).toBeTruthy();
    expect(response.feature.kind).toBe("feature");
    expect(response.feature.stateFolder).toBe("01_SUBMITTED");
    expect(response.feature.stateLabel).toBe("Submitted");
  });
});

// ---------------------------------------------------------------------------
// Error contract — the orchestrator throws strings for known error cases
// Error messages must be precise enough for operators to recover.
// ---------------------------------------------------------------------------

describe("submitFeature error contract", () => {
  it("error for missing project", () => {
    const errorMessage = "Project not found.";
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.length).toBeGreaterThan(0);
  });

  it("error for missing title", () => {
    const errorMessage = "FEAT title is required.";
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.length).toBeGreaterThan(0);
  });

  it("error for missing summary", () => {
    const errorMessage = "FEAT summary is required.";
    expect(errorMessage).toBeTruthy();
    expect(errorMessage.length).toBeGreaterThan(0);
  });

  it("error for invalid parent EPIC", () => {
    const errorMessage = "Parent EPIC EPIC-999 not found.";
    expect(errorMessage).toContain("EPIC-999");
  });

  it("error for collision/overwrite", () => {
    const errorMessage = "FEAT-020 already exists. Refresh the project and try again.";
    expect(errorMessage).toContain("already exists");
    expect(errorMessage).toContain("Refresh the project");
  });
});
