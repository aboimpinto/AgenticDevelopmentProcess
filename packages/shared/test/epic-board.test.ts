import { describe, expect, it } from "vitest";
import {
  buildEpicBoardModel,
  epicBoardColumnDefinitions,
  getEpicStateForBoard,
  type EpicBoardColumnId,
} from "../src/epic-board.js";
import type { WorkItemCard, WorkItemScanStatus, WorkItemSourceIssue } from "../src/index.js";

const baseScanStatus: WorkItemScanStatus = {
  epicDocumentCount: 0,
  epicFolderExists: true,
  epicInvalidSourceCount: 0,
  epicScanFailed: false,
  epicValidItemCount: 0,
  message: null,
};

function card(overrides: Partial<WorkItemCard> & Pick<WorkItemCard, "externalId">): WorkItemCard {
  return {
    documentPath: `/tmp/${overrides.externalId}/EpicDescription.md`,
    documentRelativePath: `MemoryBank/Features/00_EPICS/${overrides.externalId}/EpicDescription.md`,
    documentUpdatedAt: "2026-07-01T00:00:00.000Z",
    epicRefinements: [],
    epicState: "not-started",
    externalId: overrides.externalId,
    featureWorkflow: null,
    folderName: overrides.externalId,
    folderPath: `/tmp/${overrides.externalId}`,
    id: `project:00_EPICS:${overrides.externalId}`,
    implementationEvidence: null,
    kind: "epic",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    phases: [],
    specMarkdown: `# ${overrides.externalId}`,
    stateFolder: "00_EPICS",
    stateLabel: "Epics",
    summary: "Summary",
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

function issue(overrides: Partial<WorkItemSourceIssue> & Pick<WorkItemSourceIssue, "folderName">): WorkItemSourceIssue {
  return {
    folderName: overrides.folderName,
    folderPath: `/tmp/${overrides.folderName}`,
    id: `issue:${overrides.folderName}`,
    kind: "invalid-source",
    message: "Invalid EPIC source",
    reason: "missing-required-fields",
    severity: "invalid",
    sourcePath: `/tmp/${overrides.folderName}/EpicDescription.md`,
    sourceRelativePath: `MemoryBank/Features/00_EPICS/${overrides.folderName}/EpicDescription.md`,
    sourceType: "epic",
    ...overrides,
  };
}

function columnIds(model = buildEpicBoardModel([])) {
  return model.columns.map((column) => column.id);
}

describe("EPIC board model", () => {
  it("defines canonical lifecycle and invalid-source columns", () => {
    expect(epicBoardColumnDefinitions.map((column) => column.id)).toEqual([
      "not-started",
      "in-progress",
      "completed",
      "cancelled",
      "invalid-sources",
    ] satisfies EpicBoardColumnId[]);
    expect(columnIds()).toEqual(epicBoardColumnDefinitions.map((column) => column.id));
  });

  it("groups valid EPIC cards by parsed state with deterministic ordering", () => {
    const model = buildEpicBoardModel([
      card({ externalId: "EPIC-010", epicState: "completed" }),
      card({ externalId: "EPIC-002", epicState: "in-progress" }),
      card({ externalId: "EPIC-001", epicState: null }),
      card({ externalId: "EPIC-011", epicState: "cancelled" }),
      card({ externalId: "FEAT-001", kind: "feature", stateFolder: "03_IN_PROGRESS", stateLabel: "In Progress" }),
    ]);

    expect(model.columns.find((column) => column.id === "not-started")!.items.map((item) => item.externalId)).toEqual([
      "EPIC-001",
    ]);
    expect(model.columns.find((column) => column.id === "in-progress")!.items.map((item) => item.externalId)).toEqual([
      "EPIC-002",
    ]);
    expect(model.columns.find((column) => column.id === "completed")!.items.map((item) => item.externalId)).toEqual([
      "EPIC-010",
    ]);
    expect(model.columns.find((column) => column.id === "cancelled")!.items.map((item) => item.externalId)).toEqual([
      "EPIC-011",
    ]);
  });

  it("routes invalid EPIC source records into the Invalid Sources column", () => {
    const model = buildEpicBoardModel(
      [card({ externalId: "EPIC-001", epicState: "not-started" })],
      [issue({ folderName: "EPIC-002-empty" }), issue({ folderName: "FEAT-001-empty", sourceType: "feature" })],
    );

    const invalidColumn = model.columns.find((column) => column.id === "invalid-sources")!;
    expect(invalidColumn.count).toBe(1);
    expect(invalidColumn.items).toEqual([]);
    expect(invalidColumn.sourceIssues.map((sourceIssue) => sourceIssue.folderName)).toEqual(["EPIC-002-empty"]);
    expect(model.hasInvalidSources).toBe(true);
    expect(model.validItems).toHaveLength(1);
  });

  it("distinguishes empty, invalid-only, mixed, and failed board states", () => {
    expect(buildEpicBoardModel([], [], baseScanStatus).empty).toBe(true);

    const invalidOnly = buildEpicBoardModel([], [issue({ folderName: "EPIC-001-invalid" })], {
      ...baseScanStatus,
      epicInvalidSourceCount: 1,
    });
    expect(invalidOnly.empty).toBe(false);
    expect(invalidOnly.hasInvalidSources).toBe(true);
    expect(invalidOnly.validItems).toHaveLength(0);

    const mixed = buildEpicBoardModel([card({ externalId: "EPIC-001" })], [issue({ folderName: "EPIC-002-invalid" })]);
    expect(mixed.empty).toBe(false);
    expect(mixed.validItems).toHaveLength(1);
    expect(mixed.hasInvalidSources).toBe(true);

    const failed = buildEpicBoardModel([], [], {
      ...baseScanStatus,
      epicScanFailed: true,
      message: "ENOTDIR: not a directory",
    });
    expect(failed.empty).toBe(false);
    expect(failed.failed).toBe(true);
    expect(failed.message).toContain("ENOTDIR");
  });

  it("defaults unknown or missing EPIC state to not-started", () => {
    expect(getEpicStateForBoard(card({ externalId: "EPIC-001", epicState: null }))).toBe("not-started");
  });
});
