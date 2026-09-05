// Behavior suite: memorybank scanner freshness.
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanMemoryBankFolders, scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
import { readWorkItemDocument } from "../src/work-item-document-read.js";
import { toWorkItemListResponse } from "../src/projects/work-item-list-response.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-006-int-"));
  tempRoots.push(root);
  return root;
}

const defaultStateFolders = [
  "00_EPICS",
  "01_SUBMITTED",
  "02_READY_TO_DEVELOP",
  "03_IN_PROGRESS",
  "04_COMPLETED",
  "05_CANCELLED",
] as const;

const defaultStateFolderLabels: Record<string, string> = {
  "00_EPICS": "Epics",
  "01_SUBMITTED": "Submitted",
  "02_READY_TO_DEVELOP": "Ready To Develop",
  "03_IN_PROGRESS": "In Progress",
  "04_COMPLETED": "Completed",
  "05_CANCELLED": "Cancelled",
};

function createProject(memoryBankPath: string, rootPath?: string) {
  return {
    id: "feat-006-int-project",
    memoryBankPath,
    rootPath: rootPath ?? memoryBankPath,
  };
}

function createMemoryBankFixture(root: string) {
  const featuresRoot = resolve(root, "Features");

  for (const folder of defaultStateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  function addEpic(epicId: string, title: string, markdown?: string) {
    const folderName = `${epicId}-${slugify(title)}`;
    const folderPath = resolve(featuresRoot, "00_EPICS", folderName);
    mkdirSync(folderPath, { recursive: true });
    const content =
      markdown ??
      [
        `# ${title}`,
        "",
        "| Field | Value |",
        "|-------|-------|",
        `| Epic ID | ${epicId} |`,
        "| State | InProgress |",
        "",
        "## Summary",
        `Description for ${title}.`,
      ].join("\n");
    writeFileSync(resolve(folderPath, "EpicDescription.md"), content, "utf8");
    return { folderName, folderPath };
  }

  function addFeat(
    featId: string,
    title: string,
    stateFolder: string,
    markdown?: string,
  ) {
    const folderName = `${featId}-${slugify(title)}`;
    const folderPath = resolve(featuresRoot, stateFolder, folderName);
    mkdirSync(folderPath, { recursive: true });
    mkdirSync(resolve(folderPath, "Phases"), { recursive: true });
    const content =
      markdown ??
      [
        `# ${title}`,
        "",
        `**Feature ID**: ${featId}`,
        "**Status**: Submitted",
        "",
        "## Summary",
        `Description for ${title}.`,
      ].join("\n");
    writeFileSync(resolve(folderPath, "FeatureDescription.md"), content, "utf8");
    return { folderName, folderPath };
  }

  function slugify(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  return { addEpic, addFeat, featuresRoot, slugify };
}

// ---------------------------------------------------------------------------
// FEAT-006 Integration Tests
// ---------------------------------------------------------------------------

describe("FEAT-006 Integration: EPIC board rescan after Markdown write", () => {
  it("reflects EPIC document edit via work-items response", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);
    const { folderPath } = addEpic("EPIC-100", "Initial Epic");

    const project = createProject(mbPath);
    const scanResult = createScanResponse(project);

    // Verify initial state
    const firstEpic = scanResult.items.find((i) => i.kind === "epic" && i.externalId === "EPIC-100")!;
    expect(firstEpic.title).toBe("Initial Epic");
    expect(firstEpic.documentUpdatedAt).not.toBeNull();

    // Edit document
    const updatedContent = [
      "# Updated Epic Title",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-100 |",
      "| State | InProgress |",
      "",
      "## Summary",
      "Summary was updated.",
    ].join("\n");
    const documentPath = resolve(folderPath, "EpicDescription.md");
    writeFileSync(documentPath, updatedContent, "utf8");
    const updatedAt = new Date(Date.parse(firstEpic.documentUpdatedAt!) + 1_000);
    utimesSync(documentPath, updatedAt, updatedAt);

    // Rescan must reflect update
    const secondScan = createScanResponse(project);
    const secondEpic = secondScan.items.find((i) => i.kind === "epic" && i.externalId === "EPIC-100")!;
    expect(secondEpic.title).toBe("Updated Epic Title");
    expect(secondEpic.specMarkdown).toContain("Summary was updated.");
    expect(secondEpic.documentUpdatedAt).not.toBe(firstEpic.documentUpdatedAt);
  });
});

describe("FEAT-006 Integration: FEAT board rescan after Markdown write", () => {
  it("reflects FEAT document edit via work-items response", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);
    const { folderPath } = addFeat("FEAT-110", "Initial FEAT", "01_SUBMITTED");

    const project = createProject(mbPath);
    const scanResult = createScanResponse(project);

    const firstFeat = scanResult.items.find((i) => i.kind === "feature" && i.externalId === "FEAT-110")!;
    expect(firstFeat.title).toBe("Initial FEAT");

    // Edit document
    const updatedContent = [
      "# Updated FEAT Title",
      "",
      "**Feature ID**: FEAT-110",
      "**Status**: Submitted",
      "",
      "## Summary",
      "This FEAT summary was updated after the scan.",
    ].join("\n");
    const documentPath = resolve(folderPath, "FeatureDescription.md");
    writeFileSync(documentPath, updatedContent, "utf8");
    const updatedAt = new Date(Date.parse(firstFeat.documentUpdatedAt!) + 1_000);
    utimesSync(documentPath, updatedAt, updatedAt);

    // Rescan
    const secondScan = createScanResponse(project);
    const secondFeat = secondScan.items.find((i) => i.kind === "feature" && i.externalId === "FEAT-110")!;
    expect(secondFeat.title).toBe("Updated FEAT Title");
    expect(secondFeat.specMarkdown).toContain("summary was updated");
    expect(secondFeat.documentUpdatedAt).not.toBe(firstFeat.documentUpdatedAt);
  });
});

describe("FEAT-006 Integration: FEAT folder move between lifecycle folders", () => {
  it("reflects folder move via work-items response without restart", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addFeat, slugify } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-120", "Moved FEAT Integration", "01_SUBMITTED");
    const sourcePath = resolve(featuresRoot, "01_SUBMITTED", `FEAT-120-${slugify("Moved FEAT Integration")}`);
    const targetPath = resolve(featuresRoot, "02_READY_TO_DEVELOP", `FEAT-120-${slugify("Moved FEAT Integration")}`);

    const project = createProject(mbPath);

    // First scan — FEAT in SUBMITTED
    const firstScan = createScanResponse(project);
    const firstFeat = firstScan.items.find((i) => i.externalId === "FEAT-120")!;
    expect(firstFeat.stateFolder).toBe("01_SUBMITTED");
    expect(firstFeat.stateLabel).toBe("Submitted");

    // Move folder on disk
    renameSync(sourcePath, targetPath);

    // Second scan — FEAT must now appear in READY
    const secondScan = createScanResponse(project);
    const secondFeat = secondScan.items.find((i) => i.externalId === "FEAT-120")!;
    expect(secondFeat.stateFolder).toBe("02_READY_TO_DEVELOP");
    expect(secondFeat.stateLabel).toBe("Ready To Develop");

    // Old card must not exist in SUBMITTED
    const submittedFeats = secondScan.items.filter(
      (i) => i.stateFolder === "01_SUBMITTED" && i.externalId === "FEAT-120",
    );
    expect(submittedFeats).toHaveLength(0);
  });
});

describe("FEAT-006 Integration: Selected-document reload after disk edits", () => {
  it("returns updated content after a disk edit without restart", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);
    const { folderPath } = addEpic("EPIC-130", "Selectable Epic");

    const project = createProject(mbPath);
    const cardId = "feat-006-int-project:00_EPICS:EPIC-130-selectable-epic";

    // First read
    const firstRead = readWorkItemDocument(project, cardId);
    expect(firstRead.content).toContain("Selectable Epic");

    // Edit document
    const updatedContent = [
      "# Selectable Epic (Reloaded)",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-130 |",
      "| State | InProgress |",
      "",
      "## Summary",
      "This content was loaded after the document was edited on disk.",
    ].join("\n");
    writeFileSync(resolve(folderPath, "EpicDescription.md"), updatedContent, "utf8");

    // Second read without restart
    const secondRead = readWorkItemDocument(project, cardId);
    expect(secondRead.content).toContain("Selectable Epic (Reloaded)");
    expect(secondRead.content).toContain("loaded after the document was edited on disk");
  });
});

describe("FEAT-006 Integration: Selected-card behavior after folder move", () => {
  it("old card ID is absent from rescan after folder move", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addFeat, slugify } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-140", "Moved FEAT Doc", "01_SUBMITTED");

    const project = createProject(mbPath);

    // First scan — record the original card ID
    const firstScan = createScanResponse(project);
    const oldCard = firstScan.items.find((i) => i.externalId === "FEAT-140")!;
    const oldCardId = oldCard.id;
    expect(oldCardId).toContain("01_SUBMITTED");

    // Move folder
    const sourcePath = resolve(featuresRoot, "01_SUBMITTED", `FEAT-140-${slugify("Moved FEAT Doc")}`);
    const targetPath = resolve(featuresRoot, "03_IN_PROGRESS", `FEAT-140-${slugify("Moved FEAT Doc")}`);
    renameSync(sourcePath, targetPath);

    // Second scan — old card ID must be absent, new card ID present
    const secondScan = createScanResponse(project);
    expect(secondScan.items.find((i) => i.id === oldCardId)).toBeUndefined();

    const movedCard = secondScan.items.find((i) => i.externalId === "FEAT-140")!;
    expect(movedCard.stateFolder).toBe("03_IN_PROGRESS");
    expect(movedCard.id).toContain("03_IN_PROGRESS");
  });
});

// ── FEAT-007 Phase 6: Integration tests ──

describe("FEAT-007 Integration: relationship and readiness badges", () => {
  it("initial scan populates linkedFeatureIds and validation count from current documents", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addEpic, addFeat, slugify } = createMemoryBankFixture(mbPath);

    // EPIC with child feature table
    addEpic(
      "EPIC-700",
      "Integration Epic",
      [
        "# Integration Epic",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-700 |",
        "| State | InProgress |",
        "",
        "| Feature ID | Title |",
        "|------------|-------|",
        "| FEAT-701 | First Child |",
        "| FEAT-702 | Second Child |",
        "",
        "## Summary",
        "",
        "Parent to multiple FEATs.",
      ].join("\n"),
    );

    // FEAT with parent EPIC reference and a validation marker
    const featFolder = resolve(featuresRoot, "01_SUBMITTED", `FEAT-701-${slugify("First Child")}`);
    mkdirSync(featFolder, { recursive: true });
    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      [
        "# First Child",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Feature ID | FEAT-701 |",
        "| Status | IN_PROGRESS |",
        "",
        "**Parent Epic**: EPIC-700",
        "",
        "- Open decision [NEEDS VALIDATION]",
        "",
        "## Summary",
        "",
        "Child FEAT linked to EPIC-700.",
      ].join("\n"),
      "utf8",
    );

    addFeat("FEAT-702", "Second Child", "01_SUBMITTED");

    const project = createProject(mbPath);
    const response = createScanResponse(project);

    const epic = response.items.find((i) => i.externalId === "EPIC-700")!;
    const feat701 = response.items.find((i) => i.externalId === "FEAT-701")!;
    const feat702 = response.items.find((i) => i.externalId === "FEAT-702")!;

    expect(epic).toBeDefined();
    expect(feat701).toBeDefined();
    expect(feat702).toBeDefined();

    // EPIC: linkedFeatureIds from current table
    expect(epic.linkedFeatureIds).toContain("FEAT-701");
    expect(epic.linkedFeatureIds).toContain("FEAT-702");
    expect(epic.validation.needsValidationCount).toBe(0);

    // FEAT-701: parent EPIC reference + validation marker
    expect(feat701.linkedEpicIds).toContain("EPIC-700");
    expect(feat701.validation.needsValidationCount).toBe(1);

    // FEAT-702: no marker
    expect(feat702.linkedEpicIds).toEqual([]);
    expect(feat702.validation.needsValidationCount).toBe(0);
  });

  it("rescan reflects edited Markdown validation counts and relationship changes", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addEpic, addFeat, slugify } = createMemoryBankFixture(mbPath);

    addEpic(
      "EPIC-710",
      "Editable Epic",
      [
        "# Editable Epic",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-710 |",
        "| State | InProgress |",
        "",
        "| Feature ID | Title |",
        "|------------|-------|",
        "| FEAT-711 | Only Child |",
        "",
        "## Summary",
        "",
        "Epic with one child.",
      ].join("\n"),
    );

    addFeat("FEAT-711", "Only Child", "01_SUBMITTED");

    const project = createProject(mbPath);

    // Initial scan: one linked FEAT, no markers
    const response1 = createScanResponse(project);
    const epic1 = response1.items.find((i) => i.externalId === "EPIC-710")!;
    expect(epic1.linkedFeatureIds).toEqual(["FEAT-711"]);
    expect(epic1.validation.needsValidationCount).toBe(0);

    // Edit EPIC: add a second child + a validation marker
    const epicFolder = resolve(featuresRoot, "00_EPICS", `EPIC-710-${slugify("Editable Epic")}`);
    const epicDocPath = resolve(epicFolder, "EpicDescription.md");
    writeFileSync(
      epicDocPath,
      readFileSync(epicDocPath, "utf8") + "\n| FEAT-712 | Added Child | SUBMITTED |\n\n- [NEEDS VALIDATION] Confirm scope.\n",
      "utf8",
    );

    // Rescan: two linked FEATs + validation marker on EPIC
    const response2 = createScanResponse(project);
    const epic2 = response2.items.find((i) => i.externalId === "EPIC-710")!;
    expect(epic2.linkedFeatureIds).toContain("FEAT-711");
    expect(epic2.linkedFeatureIds).toContain("FEAT-712");
    expect(epic2.validation.needsValidationCount).toBe(1);
  });

  it("EPIC validation count does not include markers from linked FEATs (no child aggregation)", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat, slugify } = createMemoryBankFixture(mbPath);
    const featuresRoot = resolve(mbPath, "Features");

    addEpic(
      "EPIC-720",
      "No Aggregate Epic",
      [
        "# No Aggregate Epic",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-720 |",
        "| State | InProgress |",
        "",
        "| Feature ID | Title |",
        "|------------|-------|",
        "| FEAT-721 | Child With Markers |",
        "",
        "## Summary",
        "",
        "EPIC document has no markers.",
      ].join("\n"),
    );

    // FEAT with many markers
    const featFolder = resolve(featuresRoot, "01_SUBMITTED", `FEAT-721-${slugify("Child With Markers")}`);
    mkdirSync(featFolder, { recursive: true });
    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      [
        "# Child With Markers",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Feature ID | FEAT-721 |",
        "| Status | IN_PROGRESS |",
        "",
        "**Parent Epic**: EPIC-720",
        "",
        "- Open topic [NEEDS VALIDATION]",
        "- Another [NEEDS VALIDATION]",
        "- Third [NEEDS VALIDATION]",
        "",
        "## Summary",
        "",
        "This FEAT has 3 markers.",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const response = createScanResponse(project);

    const epic = response.items.find((i) => i.externalId === "EPIC-720")!;
    const feat = response.items.find((i) => i.externalId === "FEAT-721")!;

    // EPIC count is from EPIC document only
    expect(epic.validation.needsValidationCount).toBe(0);

    // FEAT has 3 markers in its own document
    expect(feat.validation.needsValidationCount).toBe(3);
  });
});

describe("FEAT-007 Integration: phase status and deep-dive freshness", () => {
  it("FEAT with phases has phase summaries populated in scan response", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat, slugify } = createMemoryBankFixture(mbPath);
    const featuresRoot = resolve(mbPath, "Features");

    addFeat("FEAT-730", "Phased Feat", "03_IN_PROGRESS");

    const featFolder = resolve(featuresRoot, "03_IN_PROGRESS", `FEAT-730-${slugify("Phased Feat")}`);
    const phasesFolder = resolve(featFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });

    writeFileSync(
      resolve(featFolder, "FeatureTasks.md"),
      [
        "# FEAT-730 Tasks",
        "",
        "| # | Phase | Status |",
        "|---|-------|--------|",
        "| 0 | Health Check | Completed |",
        "| 1 | Planning | In Progress |",
        "| 2 | Implementation | Not Started |",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(phasesFolder, "phase-0-health-check.md"),
      "# Phase 0 - Health Check\n\n**Status:** COMPLETED\n",
      "utf8",
    );
    writeFileSync(
      resolve(phasesFolder, "phase-1-planning.md"),
      "# Phase 1 - Planning\n\n**Status:** IN_PROGRESS\n",
      "utf8",
    );
    writeFileSync(
      resolve(phasesFolder, "phase-2-implementation.md"),
      "# Phase 2 - Implementation\n\n**Status:** PENDING\n",
      "utf8",
    );

    const project = createProject(mbPath);
    const response = createScanResponse(project);

    const feat = response.items.find((i) => i.externalId === "FEAT-730")!;
    expect(feat.phases).toHaveLength(3);

    // Statuses from FeatureTasks.md
    expect(feat.phases.map((p) => p.status)).toEqual(["COMPLETED", "IN_PROGRESS", "PENDING"]);

    // All phases have required fields
    for (const phase of feat.phases) {
      expect(phase.number).toBeGreaterThanOrEqual(0);
      expect(phase.title).toBeTruthy();
      expect(phase.status).toBeTruthy();
      expect(phase.fileName).toMatch(/\.md$/);
      expect(phase.documentPath).toBeTruthy();
      expect(phase.documentRelativePath).toBeTruthy();
    }
  });

  it("marker-free FEAT is current without SQLite metadata", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-740", "No Metadata Feat", "02_READY_TO_DEVELOP");

    const project = createProject(mbPath);
    const response = createScanResponse(project);

    const feat = response.items.find((i) => i.externalId === "FEAT-740")!;
    expect(feat.validation.deepDiveStatus).toBe("current");
    expect(feat.validation.needsValidationCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helper: simulate the work-items API response shape
// ---------------------------------------------------------------------------

function createScanResponse(project: ReturnType<typeof createProject>) {
  const scanResult = scanMemoryBankFoldersWithIssues(
    project,
    defaultStateFolders as unknown as string[],
    defaultStateFolderLabels,
  );

  // Reconstruct the response as the API would
  const items = scanResult.items.map((item) => ({
    ...item.card,
    sourceIssueCount: scanResult.sourceIssues.filter((si) => si.cardId === item.card.id).length,
  }));

  return {
    items,
    sourceIssues: scanResult.sourceIssues,
    scanStatus: scanResult.scanStatus,
    scannedAt: new Date().toISOString(),
  };
}
