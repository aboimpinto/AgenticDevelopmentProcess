// Behavior suite: feature extraction preview.
import { describe, expect, it, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { renderSubmittedFeatureDocument } from "../src/feature-extraction.js";
import { parseEpicFeatureTable } from "../src/batch-preview/epic-feature-table.js";
import {
  buildPreviewPlan,
  calculatePlanHash,
} from "../src/batch-preview/plan-builder.js";
import type { WorkItemCard } from "@hepha/shared";

// ──────────────────────────────────────────────
// Preview plan construction and determinism
// ──────────────────────────────────────────────

describe("buildPreviewPlan", () => {
  const epicMarkdown = `
# EPIC-003: EPIC Lifecycle Automation

## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | Layer 1 | COMPLETED | | P1 |
| TBD | New Batch Feature | SUBMITTED | FEAT-001 | P1 |
`;

  const mockEpic: WorkItemCard = {
    id: "project-1:00_EPICS:EPIC-003-epic-lifecycle-automation",
    externalId: "EPIC-003",
    title: "EPIC Lifecycle Automation",
    folderName: "EPIC-003-epic-lifecycle-automation",
    folderPath: "/tmp/mock/Features/00_EPICS/EPIC-003-epic-lifecycle-automation",
    stateFolder: "00_EPICS",
    stateLabel: "Epics",
    kind: "epic",
    specMarkdown: epicMarkdown,
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    summary: "Mock EPIC for testing",
    documentPath: "/tmp/mock/Features/00_EPICS/EPIC-003-epic-lifecycle-automation/EpicDescription.md",
    documentUpdatedAt: "2026-07-03T00:00:00.000Z",
    documentRelativePath: null,
    epicState: null,
    epicRefinements: [],
    featureWorkflow: null,
    implementationEvidence: null,
    phases: [],
    validation: {
      blocksFeatureExtraction: false,
      deepDiveStatus: "current",
      documentHash: null,
      metadataAvailable: false,
      needsValidationCount: 0,
      validationSummary: null,
    },
  };

  it("produces a deterministic plan for the same input", () => {
    const plan1 = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [],
    });

    const plan2 = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [],
    });

    expect(plan1.planHash).toBe(plan2.planHash);
    expect(plan1.explicitCandidates).toEqual(plan2.explicitCandidates);
    expect(plan1.discoveredCandidates).toEqual(plan2.discoveredCandidates);
    expect(plan1.warnings).toEqual(plan2.warnings);
  });

  it("uses the full EPIC document hash expected by apply validation", () => {
    const plan = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [],
    });
    const expectedCurrentDocumentHash = createHash("sha256").update(epicMarkdown, "utf8").digest("hex");

    expect(plan.epicDocumentHash).toBe(expectedCurrentDocumentHash);
  });

  it("returns no explicit candidates when all FEATs already exist", () => {
    const plan = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [],
    });

    // FEAT-001 exists, TBD has no FEAT ID, so no explicit candidates
    expect(plan.explicitCandidates).toHaveLength(0);
  });

  it("returns discovered candidates from planned features", () => {
    const plan = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [
        {
          acceptanceCriteria: ["Preview shows before write."],
          dependencyIds: ["FEAT-001"],
          description: "Implement preview flow.",
          priority: "P1",
          title: "Preview Implementation",
        },
      ],
    });

    const candidate = plan.discoveredCandidates.find(({ title }) => title === "Preview Implementation");

    expect(candidate).toMatchObject({
      dependencyIds: ["FEAT-001"],
      fromExplicitLink: false,
      title: "Preview Implementation",
    });
  });

  it("includes EPIC updates and warnings in the plan", () => {
    const plan = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [
        {
          acceptanceCriteria: ["Test."],
          dependencyIds: [],
          description: "Discovered feature.",
          priority: "P2",
          title: "Discovered",
        },
      ],
    });

    expect(plan.epicUpdates.length).toBeGreaterThan(0);
    expect(plan.epicUpdates.some((u) => u.section === "feature-table")).toBe(true);
    expect(plan.warnings.some((w) => w.type === "tbd-row")).toBe(true);
  });

  it("sets applyAllowed to false when no candidates exist", () => {
    const plan = buildPreviewPlan({
      epic: { ...mockEpic, specMarkdown: "# EPIC-003\n\nNo table here." },
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [],
    });

    expect(plan.applyAllowed).toBe(false);
  });

  it("sets applyAllowed to true when candidates exist", () => {
    const plan = buildPreviewPlan({
      epic: mockEpic,
      epicDocumentPath: "/tmp/mock/missing/EpicDescription.md",
      existingFeatureIds: new Set(),
      memoryBankPath: "/tmp/mock",
      discoveredFeatures: [
        {
          acceptanceCriteria: ["Test."],
          dependencyIds: [],
          description: "A feature.",
          priority: null,
          title: "New Feature",
        },
      ],
    });

    expect(plan.applyAllowed).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Plan hash and change detection
// ──────────────────────────────────────────────

describe("plan hash change detection", () => {
  it("produces different plan hashes for different input", () => {
    const hash1 = calculatePlanHash("source-hash-1", [], [], []);
    const hash2 = calculatePlanHash("source-hash-2", [], [], []);

    expect(hash1).not.toBe(hash2);
  });

  it("produces the same hash for identical input", () => {
    const hash1 = calculatePlanHash("source-hash-1", [], [], []);
    const hash2 = calculatePlanHash("source-hash-1", [], [], []);

    expect(hash1).toBe(hash2);
  });
});

// ──────────────────────────────────────────────
// EPIC table parsing edge cases
// ──────────────────────────────────────────────

describe("parseEpicFeatureTable edge cases", () => {
  it("extracts FEAT ID from the first column regardless of header order", () => {
    const result = parseEpicFeatureTable(`
| Feature ID | Status | Title |
|------------|--------|-------|
| FEAT-001 | COMPLETED | Core Work |
`);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.featureId).toBe("FEAT-001");
    // Title is mapped from the second column cell when column order differs
    expect(result.rows[0]?.title).toBe("COMPLETED");
  });

  it("handles tables with extra columns", () => {
    const result = parseEpicFeatureTable(`
| Feature ID | Title | Status | Dependencies | Priority | Owner |
|------------|-------|--------|--------------|----------|-------|
| FEAT-001 | Feature One | COMPLETED | | P1 | Paulo |
`);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.featureId).toBe("FEAT-001");
  });

  it("extracts priority from later columns", () => {
    const result = parseEpicFeatureTable(`
| Feature ID | Title | Status | Notes | Priority |
|------------|-------|--------|-------|----------|
| FEAT-001 | Feature | COMPLETED | Some note | P1 |
`);

    expect(result.rows[0]?.priority).toBe("P1");
  });

  it("handles empty tables", () => {
    const result = parseEpicFeatureTable("");

    expect(result.rows).toHaveLength(0);
    expect(result.headerRowIndex).toBe(-1);
  });

  it("does not treat progress tracking rows as feature breakdown rows", () => {
    const result = parseEpicFeatureTable(`
# EPIC-004

## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-014 | Native Submit Feature Command | MISSING | | P1 |

## Progress Tracking

| Feature ID | Status | Started | Completed | Notes |
|------------|--------|---------|-----------|-------|
| FEAT-014 | MISSING | 2026-07-04 | | |
`);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.title).toBe("Native Submit Feature Command");
    expect(result.rows[0]?.rowIndex).toBeLessThan(10);
  });
});
