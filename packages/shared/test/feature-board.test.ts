import { describe, expect, it } from "vitest";
import {
  buildFeatureBoardModel,
  featBoardColumnDefinitions,
  type FeatBoardColumnId,
} from "../src/feature-board.js";
import type { WorkItemCard, WorkItemSourceIssue } from "../src/index.js";

function featCard(
  overrides: Partial<WorkItemCard> & Pick<WorkItemCard, "externalId" | "stateFolder">,
): WorkItemCard {
  const stateLabels: Record<string, string> = {
    "01_SUBMITTED": "Submitted",
    "02_READY_TO_DEVELOP": "Ready To Develop",
    "03_IN_PROGRESS": "In Progress",
    "04_COMPLETED": "Completed",
    "05_CANCELLED": "Cancelled",
  };

  return {
    documentPath: `/tmp/${overrides.externalId}/FeatureDescription.md`,
    documentRelativePath: `MemoryBank/Features/${overrides.stateFolder}/${overrides.externalId}/FeatureDescription.md`,
    documentUpdatedAt: "2026-07-01T00:00:00.000Z",
    epicRefinements: [],
    epicState: null,
    externalId: overrides.externalId,
    featureWorkflow: null,
    folderName: overrides.externalId,
    folderPath: `/tmp/${overrides.externalId}`,
    id: `project:${overrides.stateFolder}:${overrides.externalId}`,
    implementationEvidence: null,
    kind: "feature",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    phases: [],
    specMarkdown: `# ${overrides.externalId}`,
    stateFolder: overrides.stateFolder,
    stateLabel: stateLabels[overrides.stateFolder] ?? overrides.stateFolder,
    summary: "FEAT summary",
    title: overrides.externalId,
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "Ready",
      deepDiveStatus: "current",
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
    ...overrides,
  };
}

function featIssue(
  overrides: Partial<WorkItemSourceIssue> & Pick<WorkItemSourceIssue, "folderName">,
): WorkItemSourceIssue {
  return {
    folderName: overrides.folderName,
    folderPath: `/tmp/${overrides.folderName}`,
    id: `issue:${overrides.folderName}`,
    kind: "invalid-source",
    message: "Invalid FEAT source",
    reason: "missing-required-fields",
    severity: "invalid",
    sourcePath: `/tmp/${overrides.folderName}/FeatureDescription.md`,
    sourceRelativePath: `MemoryBank/Features/01_SUBMITTED/${overrides.folderName}/FeatureDescription.md`,
    sourceType: "feature",
    ...overrides,
  };
}

function columnIds(model = buildFeatureBoardModel([])) {
  return model.columns.map((column) => column.id);
}

describe("FEAT board model", () => {
  it("defines canonical lifecycle and invalid-source columns", () => {
    expect(featBoardColumnDefinitions.map((column) => column.id)).toEqual([
      "01_SUBMITTED",
      "02_READY_TO_DEVELOP",
      "03_IN_PROGRESS",
      "04_COMPLETED",
      "05_CANCELLED",
      "invalid-sources",
    ]);
  });

  it("places FEAT cards in the correct lifecycle column based on stateFolder", () => {
    const items = [
      featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" }),
      featCard({ externalId: "FEAT-002", stateFolder: "03_IN_PROGRESS" }),
      featCard({ externalId: "FEAT-003", stateFolder: "04_COMPLETED" }),
    ];

    const model = buildFeatureBoardModel(items);

    const submittedColumn = model.columns.find((c) => c.id === "01_SUBMITTED")!;
    const inProgressColumn = model.columns.find((c) => c.id === "03_IN_PROGRESS")!;
    const completedColumn = model.columns.find((c) => c.id === "04_COMPLETED")!;

    expect(submittedColumn.items).toHaveLength(1);
    expect(submittedColumn.items[0].externalId).toBe("FEAT-001");

    expect(inProgressColumn.items).toHaveLength(1);
    expect(inProgressColumn.items[0].externalId).toBe("FEAT-002");

    expect(completedColumn.items).toHaveLength(1);
    expect(completedColumn.items[0].externalId).toBe("FEAT-003");
  });

  it("excludes EPIC items from FEAT columns", () => {
    const items: WorkItemCard[] = [
      featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" }),
      {
        ...featCard({ externalId: "EPIC-001", stateFolder: "00_EPICS" }),
        kind: "epic",
        stateLabel: "Epics",
      },
    ];

    const model = buildFeatureBoardModel(items);

    const totalFeatItems = model.columns.reduce((sum, col) => sum + col.items.length, 0);
    expect(totalFeatItems).toBe(1);

    const allExternalIds = model.columns.flatMap((col) => col.items.map((item) => item.externalId));
    expect(allExternalIds).toEqual(["FEAT-001"]);
    expect(allExternalIds).not.toContain("EPIC-001");
  });

  it("sorts FEAT cards deterministically by externalId", () => {
    const items = [
      featCard({ externalId: "FEAT-010", stateFolder: "01_SUBMITTED" }),
      featCard({ externalId: "FEAT-002", stateFolder: "01_SUBMITTED" }),
      featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" }),
    ];

    const model = buildFeatureBoardModel(items);
    const submittedColumn = model.columns.find((c) => c.id === "01_SUBMITTED")!;

    expect(submittedColumn.items.map((item) => item.externalId)).toEqual([
      "FEAT-001",
      "FEAT-002",
      "FEAT-010",
    ]);
  });

  it("preserves FEAT cards across multiple lifecycle columns", () => {
    const items = [
      featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" }),
      featCard({ externalId: "FEAT-002", stateFolder: "02_READY_TO_DEVELOP" }),
      featCard({ externalId: "FEAT-003", stateFolder: "03_IN_PROGRESS" }),
      featCard({ externalId: "FEAT-004", stateFolder: "04_COMPLETED" }),
      featCard({ externalId: "FEAT-005", stateFolder: "05_CANCELLED" }),
    ];

    const model = buildFeatureBoardModel(items);

    expect(model.columns[0].items).toHaveLength(1);
    expect(model.columns[1].items).toHaveLength(1);
    expect(model.columns[2].items).toHaveLength(1);
    expect(model.columns[3].items).toHaveLength(1);
    expect(model.columns[4].items).toHaveLength(1);
    expect(model.columns[5].items).toHaveLength(0); // invalid-sources

    expect(model.validItems).toHaveLength(5);
    expect(model.empty).toBe(false);
  });

  it("shows empty state when no FEAT items exist", () => {
    const model = buildFeatureBoardModel([]);

    expect(model.empty).toBe(true);
    expect(model.validItems).toHaveLength(0);
    expect(model.hasInvalidSources).toBe(false);
    model.columns.forEach((col) => {
      expect(col.items).toHaveLength(0);
    });
  });

  it("separates FEAT source issues into invalid-sources column", () => {
    const items = [
      featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" }),
    ];
    const issues: WorkItemSourceIssue[] = [
      featIssue({ folderName: "FEAT-999-missing" }),
    ];

    const model = buildFeatureBoardModel(items, issues);

    const invalidColumn = model.columns.find((c) => c.id === "invalid-sources")!;
    expect(invalidColumn.sourceIssues).toHaveLength(1);
    expect(invalidColumn.sourceIssues[0].folderName).toBe("FEAT-999-missing");

    // Valid FEAT still appears in its lifecycle column
    const submittedColumn = model.columns.find((c) => c.id === "01_SUBMITTED")!;
    expect(submittedColumn.items).toHaveLength(1);
    expect(submittedColumn.items[0].externalId).toBe("FEAT-001");

    expect(model.hasInvalidSources).toBe(true);
  });

  it("filters out non-FEAT source issues from FEAT board", () => {
    const items = [featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" })];
    const issues: WorkItemSourceIssue[] = [
      featIssue({ folderName: "FEAT-999-invalid", sourceType: "feature" }),
      {
        folderName: "EPIC-999",
        folderPath: "/tmp/EPIC-999",
        id: "issue:EPIC-999",
        kind: "invalid-source",
        message: "Invalid EPIC",
        reason: "missing-document",
        severity: "invalid",
        sourcePath: null,
        sourceRelativePath: null,
        sourceType: "epic",
      },
    ];

    const model = buildFeatureBoardModel(items, issues);

    const invalidColumn = model.columns.find((c) => c.id === "invalid-sources")!;
    expect(invalidColumn.sourceIssues).toHaveLength(1);
    expect(invalidColumn.sourceIssues[0].folderName).toBe("FEAT-999-invalid");
    expect(model.sourceIssues).toHaveLength(1);
  });

  it("preserves validation summary metadata through board model", () => {
    const items = [
      featCard({
        externalId: "FEAT-001",
        stateFolder: "01_SUBMITTED",
        validation: {
          blocksFeatureExtraction: false,
          changedSinceHephaDeepDive: false,
          deepDiveMessage: "Ready",
          deepDiveStatus: "current",
          lastHephaDeepDiveAt: null,
          needsValidationCount: 3,
        },
      }),
    ];

    const model = buildFeatureBoardModel(items);
    const card = model.validItems[0];

    expect(card.validation.needsValidationCount).toBe(3);
    expect(card.validation.deepDiveStatus).toBe("current");
  });

  it("preserves parent EPIC relationship data through board model", () => {
    const items = [
      featCard({
        externalId: "FEAT-001",
        stateFolder: "01_SUBMITTED",
        linkedEpicIds: ["EPIC-001"],
        linkedEpics: [
          {
            externalId: "EPIC-001",
            id: "project:00_EPICS:EPIC-001",
            kind: "epic",
            stateFolder: "00_EPICS",
            stateLabel: "Epics",
            title: "Test Epic",
          },
        ],
      }),
    ];

    const model = buildFeatureBoardModel(items);
    const card = model.validItems[0];

    expect(card.linkedEpicIds).toEqual(["EPIC-001"]);
    expect(card.linkedEpics).toHaveLength(1);
    expect(card.linkedEpics[0].externalId).toBe("EPIC-001");
  });

  it("reports column counts correctly", () => {
    const items = [
      featCard({ externalId: "FEAT-001", stateFolder: "01_SUBMITTED" }),
      featCard({ externalId: "FEAT-002", stateFolder: "01_SUBMITTED" }),
      featCard({ externalId: "FEAT-003", stateFolder: "03_IN_PROGRESS" }),
    ];
    const issues: WorkItemSourceIssue[] = [
      featIssue({ folderName: "FEAT-999-missing" }),
    ];

    const model = buildFeatureBoardModel(items, issues);

    const submittedCol = model.columns.find((c) => c.id === "01_SUBMITTED")!;
    expect(submittedCol.count).toBe(2); // 2 FEAT cards

    const inProgressCol = model.columns.find((c) => c.id === "03_IN_PROGRESS")!;
    expect(inProgressCol.count).toBe(1);

    const invalidCol = model.columns.find((c) => c.id === "invalid-sources")!;
    expect(invalidCol.count).toBe(1); // 1 source issue
  });
});
