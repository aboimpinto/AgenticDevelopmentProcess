// Behavior suite: epic board scanner.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildFeatureBoardModel } from "@hepha/shared";
import { scanMemoryBankFolders, scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
import { toWorkItemListResponse } from "../src/projects/work-item-list-response.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import type { ScannedMemoryBankResult } from "../src/memorybank-scanner.js";

const tempRoots: string[] = [];

const stateFolders = [
  "00_EPICS",
  "01_SUBMITTED",
  "02_READY_TO_DEVELOP",
  "03_IN_PROGRESS",
  "04_COMPLETED",
  "05_CANCELLED",
] as const;

const stateFolderLabels = {
  "00_EPICS": "Epics",
  "01_SUBMITTED": "Submitted",
  "02_READY_TO_DEVELOP": "Ready To Develop",
  "03_IN_PROGRESS": "In Progress",
  "04_COMPLETED": "Completed",
  "05_CANCELLED": "Cancelled",
};

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }

  tempRoots.length = 0;
});

function createFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-004-int-"));
  tempRoots.push(root);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  const memoryBankPath = resolve(root, "MemoryBank");
  const featuresRoot = resolve(memoryBankPath, "Features");

  for (const folder of stateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  const project: StoredProject = {
    createdAt: "2026-07-02T00:00:00.000Z",
    defaultBranch: "master",
    id: "project-feat-004",
    memoryBankPath,
    name: "FEAT-004 Integration",
    rootPath: root,
    updatedAt: "2026-07-02T00:00:00.000Z",
  };

  return { featuresRoot, memoryBankPath, project, root };
}

function writeFeat(
  featuresRoot: string,
  stateFolder: string,
  folderName: string,
  markdown: string,
) {
  const folderPath = resolve(featuresRoot, stateFolder, folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(resolve(folderPath, "FeatureDescription.md"), markdown, "utf8");
}

function writeEpic(featuresRoot: string, folderName: string, markdown: string) {
  const folderPath = resolve(featuresRoot, "00_EPICS", folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(resolve(folderPath, "EpicDescription.md"), markdown, "utf8");
}

function toCardResponse(project: StoredProject, scanResult: ScannedMemoryBankResult, scannedAt: string) {
  return toWorkItemListResponse(
    project,
    {
      items: scanResult.items.map((item) => item.card),
      scanStatus: scanResult.scanStatus,
      sourceIssues: scanResult.sourceIssues,
    },
    scannedAt,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeatMarkdown(
  featId: string,
  title: string,
  parentEpicId?: string,
  validationMarkers?: string[],
) {
  const lines = [
    `# ${title}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Feature ID | ${featId} |`,
    "| Status | NOT_STARTED |",
    "",
  ];

  if (parentEpicId) {
    lines.push(`**Parent Epic**: ${parentEpicId}`, "");
  }

  lines.push("## Summary", "", `Description for ${title}.`);

  if (validationMarkers && validationMarkers.length > 0) {
    lines.push("");
    for (const marker of validationMarkers) {
      lines.push(`[NEEDS VALIDATION] ${marker}`);
    }
  }

  return lines.join("\n");
}

describe("FEAT-004 scanner-to-API-to-board integration", () => {
  it("maps all lifecycle folders to FEAT board columns", () => {
    const { featuresRoot, project } = createFixture();

    writeFeat(featuresRoot, "01_SUBMITTED", "FEAT-001-submitted", makeFeatMarkdown("FEAT-001", "Submitted Feat"));
    writeFeat(featuresRoot, "02_READY_TO_DEVELOP", "FEAT-002-ready", makeFeatMarkdown("FEAT-002", "Ready Feat"));
    writeFeat(featuresRoot, "03_IN_PROGRESS", "FEAT-003-in-progress", makeFeatMarkdown("FEAT-003", "In Progress Feat"));
    writeFeat(featuresRoot, "04_COMPLETED", "FEAT-004-completed", makeFeatMarkdown("FEAT-004", "Completed Feat"));
    writeFeat(featuresRoot, "05_CANCELLED", "FEAT-005-cancelled", makeFeatMarkdown("FEAT-005", "Cancelled Feat"));

    const scanResult = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response = toCardResponse(project, scanResult, "2026-07-02T00:00:00.000Z");
    const boardModel = buildFeatureBoardModel(response.items, response.sourceIssues);

    expect(response.items).toHaveLength(5);
    expect(boardModel.empty).toBe(false);

    const submittedCol = boardModel.columns.find((c) => c.id === "01_SUBMITTED")!;
    expect(submittedCol.items).toHaveLength(1);
    expect(submittedCol.items[0].externalId).toBe("FEAT-001");

    const readyCol = boardModel.columns.find((c) => c.id === "02_READY_TO_DEVELOP")!;
    expect(readyCol.items).toHaveLength(1);
    expect(readyCol.items[0].externalId).toBe("FEAT-002");

    const progressCol = boardModel.columns.find((c) => c.id === "03_IN_PROGRESS")!;
    expect(progressCol.items).toHaveLength(1);
    expect(progressCol.items[0].externalId).toBe("FEAT-003");

    const completedCol = boardModel.columns.find((c) => c.id === "04_COMPLETED")!;
    expect(completedCol.items).toHaveLength(1);
    expect(completedCol.items[0].externalId).toBe("FEAT-004");

    const cancelledCol = boardModel.columns.find((c) => c.id === "05_CANCELLED")!;
    expect(cancelledCol.items).toHaveLength(1);
    expect(cancelledCol.items[0].externalId).toBe("FEAT-005");

    const invalidCol = boardModel.columns.find((c) => c.id === "invalid-sources")!;
    expect(invalidCol.items).toHaveLength(0);
    expect(invalidCol.sourceIssues).toHaveLength(0);
  });

  it("propagates parent EPIC references from FEAT markdown through to board model", () => {
    const { featuresRoot, project } = createFixture();

    writeEpic(
      featuresRoot,
      "EPIC-010-parent",
      [
        "# EPIC-010: Parent",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-010 |",
        "| State | NotStarted |",
      ].join("\n"),
    );

    writeFeat(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-010-child",
      makeFeatMarkdown("FEAT-010", "Child Feat", "EPIC-010"),
    );

    const scannedItems = scanMemoryBankFolders(project, stateFolders, stateFolderLabels);
    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-010")!;

    expect(feat.card.linkedEpicIds).toContain("EPIC-010");
    expect(feat.card.stateFolder).toBe("01_SUBMITTED");
    expect(feat.card.stateLabel).toBe("Submitted");

    // Board model preserves the parent EPIC data
    const scanResult = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response = toCardResponse(project, scanResult, "2026-07-02T00:00:00.000Z");
    const boardModel = buildFeatureBoardModel(response.items, response.sourceIssues);

    const boardFeat = boardModel.validItems.find((item) => item.externalId === "FEAT-010")!;
    expect(boardFeat.linkedEpicIds).toContain("EPIC-010");
  });

  it("handles validation marker count variants through the board data path", () => {
    const { featuresRoot, project } = createFixture();

    // No markers
    writeFeat(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-020-no-markers",
      makeFeatMarkdown("FEAT-020", "No Markers"),
    );

    // One marker
    writeFeat(
      featuresRoot,
      "02_READY_TO_DEVELOP",
      "FEAT-021-one-marker",
      makeFeatMarkdown("FEAT-021", "One Marker", undefined, ["Confirm requirement A."]),
    );

    // Multiple markers
    writeFeat(
      featuresRoot,
      "03_IN_PROGRESS",
      "FEAT-022-multi-marker",
      makeFeatMarkdown("FEAT-022", "Multi Marker", undefined, [
        "Confirm requirement A.",
        "Verify edge case B.",
        "Check performance C.",
      ]),
    );

    const scannedItems = scanMemoryBankFolders(project, stateFolders, stateFolderLabels);

    const feat0 = scannedItems.find((item) => item.card.externalId === "FEAT-020")!;
    expect(feat0.card.validation.needsValidationCount).toBe(0);

    const feat1 = scannedItems.find((item) => item.card.externalId === "FEAT-021")!;
    expect(feat1.card.validation.needsValidationCount).toBe(1);

    const feat3 = scannedItems.find((item) => item.card.externalId === "FEAT-022")!;
    expect(feat3.card.validation.needsValidationCount).toBe(3);

    // Board model preserves the counts
    const scanResult = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response = toCardResponse(project, scanResult, "2026-07-02T00:00:00.000Z");
    const boardModel = buildFeatureBoardModel(response.items, response.sourceIssues);

    const boardFeat0 = boardModel.validItems.find((item) => item.externalId === "FEAT-020")!;
    expect(boardFeat0.validation.needsValidationCount).toBe(0);

    const boardFeat1 = boardModel.validItems.find((item) => item.externalId === "FEAT-021")!;
    expect(boardFeat1.validation.needsValidationCount).toBe(1);

    const boardFeat3 = boardModel.validItems.find((item) => item.externalId === "FEAT-022")!;
    expect(boardFeat3.validation.needsValidationCount).toBe(3);
  });

  it("handles invalid FEAT sources without hiding valid FEATs", () => {
    const { featuresRoot, project } = createFixture();

    // Valid FEAT
    writeFeat(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-030-valid",
      makeFeatMarkdown("FEAT-030", "Valid Feat"),
    );

    // Invalid FEAT: empty document
    const emptyFolder = resolve(featuresRoot, "01_SUBMITTED", "FEAT-031-empty");
    mkdirSync(emptyFolder, { recursive: true });
    writeFileSync(resolve(emptyFolder, "FeatureDescription.md"), "", "utf8");

    // Invalid FEAT: no markdown file
    mkdirSync(resolve(featuresRoot, "02_READY_TO_DEVELOP", "FEAT-032-nodoc"), { recursive: true });

    const scanResult = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response = toCardResponse(project, scanResult, "2026-07-02T00:00:00.000Z");
    const boardModel = buildFeatureBoardModel(response.items, response.sourceIssues);

    // Valid FEAT still appears
    const validFeat = response.items.find((item) => item.externalId === "FEAT-030");
    expect(validFeat).toBeDefined();
    expect(validFeat!.stateFolder).toBe("01_SUBMITTED");

    // Invalid FEATs are NOT in items
    const emptyFeat = response.items.find((item) => item.externalId === "FEAT-031");
    expect(emptyFeat).toBeUndefined();
    const noDocFeat = response.items.find((item) => item.externalId === "FEAT-032");
    expect(noDocFeat).toBeUndefined();

    // Source issues exist for both invalid FEATs
    const emptyIssue = response.sourceIssues.find((issue) => issue.folderName === "FEAT-031-empty");
    expect(emptyIssue).toBeDefined();
    expect(emptyIssue!.reason).toBe("empty-document");
    expect(emptyIssue!.sourceType).toBe("feature");

    const noDocIssue = response.sourceIssues.find((issue) => issue.folderName === "FEAT-032-nodoc");
    expect(noDocIssue).toBeDefined();
    expect(noDocIssue!.reason).toBe("missing-document");
    expect(noDocIssue!.sourceType).toBe("feature");

    // Board model puts issues in invalid-sources column
    const invalidColumn = boardModel.columns.find((c) => c.id === "invalid-sources")!;
    expect(invalidColumn.sourceIssues).toHaveLength(2);
    expect(boardModel.hasInvalidSources).toBe(true);
    expect(boardModel.empty).toBe(false);
  });

  it("reflects folder-move lifecycle changes after rescan without mutation", () => {
    const { featuresRoot, project } = createFixture();

    // Create a FEAT in Submitted
    writeFeat(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-040-moving",
      makeFeatMarkdown("FEAT-040", "Moving Feat"),
    );

    // Read the document content to verify non-mutation later
    const origDocPath = resolve(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-040-moving",
      "FeatureDescription.md",
    );
    const origContent = readFileSync(origDocPath, "utf8");

    // Scan: FEAT should be in Submitted column
    const scan1 = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response1 = toCardResponse(project, scan1, "2026-07-02T00:00:00.000Z");
    const model1 = buildFeatureBoardModel(response1.items, response1.sourceIssues);

    expect(
      model1.columns.find((c) => c.id === "01_SUBMITTED")!.items,
    ).toHaveLength(1);
    expect(
      model1.columns.find((c) => c.id === "03_IN_PROGRESS")!.items,
    ).toHaveLength(0);

    // Move the FEAT folder to In Progress
    const oldPath = resolve(featuresRoot, "01_SUBMITTED", "FEAT-040-moving");
    const newPath = resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-040-moving");
    renameSync(oldPath, newPath);

    // Rescan: FEAT should now be in In Progress column
    const scan2 = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response2 = toCardResponse(project, scan2, "2026-07-02T00:01:00.000Z");
    const model2 = buildFeatureBoardModel(response2.items, response2.sourceIssues);

    expect(
      model2.columns.find((c) => c.id === "01_SUBMITTED")!.items,
    ).toHaveLength(0);
    expect(
      model2.columns.find((c) => c.id === "03_IN_PROGRESS")!.items,
    ).toHaveLength(1);
    expect(
      model2.columns.find((c) => c.id === "03_IN_PROGRESS")!.items[0].externalId,
    ).toBe("FEAT-040");

    // Document content is NOT mutated by scanning
    const movedDocPath = resolve(newPath, "FeatureDescription.md");
    const movedContent = readFileSync(movedDocPath, "utf8");
    expect(movedContent).toBe(origContent);
  });

  it("excludes EPIC items and only includes FEAT items in the board model", () => {
    const { featuresRoot, project } = createFixture();

    writeEpic(
      featuresRoot,
      "EPIC-100-epic-only",
      [
        "# EPIC-100: Epic Only",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-100 |",
        "| State | NotStarted |",
      ].join("\n"),
    );

    writeFeat(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-100-feat-only",
      makeFeatMarkdown("FEAT-100", "Feat Only"),
    );

    const scanResult = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response = toCardResponse(project, scanResult, "2026-07-02T00:00:00.000Z");
    const boardModel = buildFeatureBoardModel(response.items, response.sourceIssues);

    expect(boardModel.validItems).toHaveLength(1);
    expect(boardModel.validItems[0].externalId).toBe("FEAT-100");
    expect(boardModel.validItems[0].kind).toBe("feature");

    // No EPIC items leak into FEAT columns
    const allFeatIds = boardModel.columns.flatMap((col) => col.items.map((item) => item.externalId));
    expect(allFeatIds).not.toContain("EPIC-100");
  });
});
