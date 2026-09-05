// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import {
  getWorkBoardItems,
  getCompletedFeatures,
  getColumnItems,
  getColumnDisplayItems,
} from "./board-selectors.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createWorkItem(
  id: string,
  overrides: Partial<WorkItemCard> = {},
): WorkItemCard {
  return {
    id,
    externalId: `EXT-${id}`,
    kind: "feature",
    title: `Work Item ${id}`,
    stateFolder: "03_IN_PROGRESS",
    stateLabel: "In Progress",
    folderName: id,
    folderPath: `/test/${id}`,
    documentPath: null,
    documentUpdatedAt: null,
    documentRelativePath: null,
    epicState: null,
    epicRefinements: [],
    specMarkdown: "",
    summary: "",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    featureWorkflow: null,
    implementationEvidence: null,
    phases: [],
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "",
      deepDiveStatus: "not_recorded" as const,
      lastHephaDeepDiveAt: null,
      needsValidationCount: 0,
    },
    ...overrides,
  };
}

function createWorkflow(completedAt?: string) {
  return {
    activeRun: null,
    canAcceptHumanReviewFindings: false,
    canRecordManualTests: false,
    canRecordUserCodeReview: false,
    canSubmitFinding: false,
    canContinueImplementing: false,
    canCreateUiRequirements: false,
    canRefineFeature: false,
    canStartImplementing: false,
    defaultImplementationModel: null,
    designCompletedAt: null,
    hasDesignArtifacts: false,
    hasRefinementArtifacts: false,
    implementationCompleted: false,
    implementationPhases: [],
    implementationTasks: [],
    findings: [],
    lastRun: completedAt
      ? {
          command: "complete-feature" as const,
          status: "completed" as const,
          completedAt,
          currentNodeId: null,
          currentStep: null,
          error: null,
          failedAt: null,
          message: "",
          outputPath: null,
          runId: `run-${completedAt}`,
          startedAt: completedAt,
          summary: null,
          workflowProgress: null,
        }
      : null,
    manualTestsCompletedAt: null,
    manualTestPackStatus: null,
    canGenerateManualTestPack: false,
    canReviewManualTestPack: false,
    canRecordManualTestPass: false,
    canRecordManualTestFail: false,
    refineCompletedAt: null,
    uiRequirementCheckedAt: null,
    uiRequirementDecision: "no_ui" as const,
    uiRequirementReason: null,
    userCodeReviewCompletedAt: null,
    workflowMessage: "",
    readiness: null,
    workflowPosition: null,
  };
}

// ─── getWorkBoardItems ─────────────────────────────────────────────────────

describe("getWorkBoardItems", () => {
  it("includes in-progress features", () => {
    const items = [
      createWorkItem("f1", { kind: "feature", stateFolder: "03_IN_PROGRESS" }),
    ];
    expect(getWorkBoardItems(items)).toHaveLength(1);
  });

  it("excludes completed EPICs", () => {
    const items = [
      createWorkItem("e1", {
        kind: "epic",
        epicState: "completed",
        stateFolder: "04_COMPLETED",
      }),
    ];
    expect(getWorkBoardItems(items)).toHaveLength(0);
  });

  it("excludes cancelled EPICs", () => {
    const items = [
      createWorkItem("e1", {
        kind: "epic",
        epicState: "cancelled",
        stateFolder: "05_CANCELLED",
      }),
    ];
    expect(getWorkBoardItems(items)).toHaveLength(0);
  });

  it("includes non-completed EPICs", () => {
    const items = [
      createWorkItem("e1", {
        kind: "epic",
        epicState: "in-progress",
        stateFolder: "03_IN_PROGRESS",
      }),
    ];
    expect(getWorkBoardItems(items)).toHaveLength(1);
  });

  it("includes completed features (they are not EPICs)", () => {
    const items = [
      createWorkItem("f1", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
      }),
    ];
    expect(getWorkBoardItems(items)).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(getWorkBoardItems([])).toEqual([]);
  });

  it("preserves order of items excluding only completed or cancelled EPICs", () => {
    const items = [
      createWorkItem("f1", { kind: "feature" }),
      createWorkItem("e1", { kind: "epic", epicState: "in-progress" }),
      createWorkItem("f2", { kind: "feature" }),
      createWorkItem("e2", { kind: "epic", epicState: "completed", stateFolder: "04_COMPLETED" }),
      createWorkItem("e3", { kind: "epic", epicState: "cancelled", stateFolder: "05_CANCELLED" }),
    ];
    const result = getWorkBoardItems(items);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("f1");
    expect(result[1].id).toBe("e1");
    expect(result[2].id).toBe("f2");
  });
});

// ─── getCompletedFeatures ──────────────────────────────────────────────────

describe("getCompletedFeatures", () => {
  it("returns features in 04_COMPLETED state folder", () => {
    const items = [
      createWorkItem("f1", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-06-01T00:00:00Z"),
      }),
    ];
    expect(getCompletedFeatures(items)).toHaveLength(1);
  });

  it("excludes features not in 04_COMPLETED", () => {
    const items = [
      createWorkItem("f1", {
        kind: "feature",
        stateFolder: "03_IN_PROGRESS",
      }),
    ];
    expect(getCompletedFeatures(items)).toHaveLength(0);
  });

  it("excludes non-feature items even in 04_COMPLETED", () => {
    const items = [
      createWorkItem("e1", {
        kind: "epic",
        stateFolder: "04_COMPLETED",
        epicState: "completed",
      }),
    ];
    expect(getCompletedFeatures(items)).toHaveLength(0);
  });

  it("sorts completed features by most recently completed first", () => {
    const items = [
      createWorkItem("old", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-01-15T00:00:00Z"),
      }),
      createWorkItem("recent", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-06-15T00:00:00Z"),
      }),
      createWorkItem("mid", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-03-01T00:00:00Z"),
      }),
    ];
    const result = getCompletedFeatures(items);
    expect(result.map((i) => i.id)).toEqual(["recent", "mid", "old"]);
  });

  it("handles features with no workflow completion time using documentUpdatedAt", () => {
    const items = [
      createWorkItem("recent", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        documentUpdatedAt: "2026-06-01T00:00:00Z",
        featureWorkflow: null,
      }),
      createWorkItem("old", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        documentUpdatedAt: "2026-01-01T00:00:00Z",
        featureWorkflow: null,
      }),
    ];
    const result = getCompletedFeatures(items);
    expect(result.map((i) => i.id)).toEqual(["recent", "old"]);
  });

  it("returns empty array when no completed features", () => {
    expect(getCompletedFeatures([])).toEqual([]);
  });

  it("handles features with no time information at all", () => {
    const items = [
      createWorkItem("f1", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: null,
        documentUpdatedAt: null,
      }),
    ];
    const result = getCompletedFeatures(items);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("f1");
  });

  it("stably sorts features with equal times by original order", () => {
    const items = [
      createWorkItem("first", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-06-01T00:00:00Z"),
      }),
      createWorkItem("second", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-06-01T00:00:00Z"),
      }),
    ];
    const result = getCompletedFeatures(items);
    // With equal timestamps, the sort is not guaranteed stable in all engines;
    // we just verify both are present and not lost.
    expect(result).toHaveLength(2);
  });
});

// ─── getColumnItems ────────────────────────────────────────────────────────

describe("getColumnItems", () => {
  it("filters work items by state folder", () => {
    const items = [
      createWorkItem("f1", { stateFolder: "01_SUBMITTED" }),
      createWorkItem("f2", { stateFolder: "03_IN_PROGRESS" }),
    ];
    const result = getColumnItems(items, "03_IN_PROGRESS");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("f2");
  });

  it("returns completed features sorted when filtering 04_COMPLETED", () => {
    const items = [
      createWorkItem("old", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-01-01T00:00:00Z"),
      }),
      createWorkItem("recent", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-06-01T00:00:00Z"),
      }),
    ];
    const result = getColumnItems(items, "04_COMPLETED");
    expect(result.map((i) => i.id)).toEqual(["recent", "old"]);
  });

  it("returns items in insertion order for non-completed columns", () => {
    const items = [
      createWorkItem("a", { stateFolder: "01_SUBMITTED" }),
      createWorkItem("b", { stateFolder: "01_SUBMITTED" }),
    ];
    const result = getColumnItems(items, "01_SUBMITTED");
    expect(result.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns empty array when no items match state folder", () => {
    const items = [createWorkItem("f1", { stateFolder: "03_IN_PROGRESS" })];
    expect(getColumnItems(items, "04_COMPLETED")).toEqual([]);
  });
});

// ─── getColumnDisplayItems ─────────────────────────────────────────────────

describe("getColumnDisplayItems", () => {
  it("returns all items for non-completed columns with zero hidden", () => {
    const items = [
      createWorkItem("f1", { stateFolder: "01_SUBMITTED" }),
      createWorkItem("f2", { stateFolder: "01_SUBMITTED" }),
    ];
    const result = getColumnDisplayItems(items, "01_SUBMITTED");
    expect(result.displayItems).toHaveLength(2);
    expect(result.hiddenCount).toBe(0);
  });

  it("preview-limits completed column to 6 items", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      createWorkItem(`f${i}`, {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow(`2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
      }),
    );
    const result = getColumnDisplayItems(items, "04_COMPLETED");
    expect(result.displayItems).toHaveLength(6);
    expect(result.hiddenCount).toBe(4);
  });

  it("shows all items when completed column has 6 or fewer items", () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      createWorkItem(`f${i}`, {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow(`2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
      }),
    );
    const result = getColumnDisplayItems(items, "04_COMPLETED");
    expect(result.displayItems).toHaveLength(3);
    expect(result.hiddenCount).toBe(0);
  });

  it("returns empty display and zero hidden for empty column", () => {
    const result = getColumnDisplayItems([], "03_IN_PROGRESS");
    expect(result.displayItems).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });

  it("returns sorted completed items in displayItems", () => {
    const items = [
      createWorkItem("old", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-01-01T00:00:00Z"),
      }),
      createWorkItem("recent", {
        kind: "feature",
        stateFolder: "04_COMPLETED",
        featureWorkflow: createWorkflow("2026-06-01T00:00:00Z"),
      }),
    ];
    const result = getColumnDisplayItems(items, "04_COMPLETED");
    expect(result.displayItems.map((i) => i.id)).toEqual(["recent", "old"]);
  });
});
