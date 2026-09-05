// Behavior suite: memorybank scanner freshness.
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanMemoryBankFolders, scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
import { readWorkItemDocument } from "../src/work-item-document-read.js";

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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-006-data-"));
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
    id: "feat-006-test-project",
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
        `This is ${epicId}.`,
      ].join("\n");
    writeFileSync(resolve(folderPath, "EpicDescription.md"), content, "utf8");
    return folderPath;
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
        `This is ${featId}.`,
      ].join("\n");
    writeFileSync(resolve(folderPath, "FeatureDescription.md"), content, "utf8");
    return folderPath;
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
// Phase 2 Data-Layer Tests: Scanner Freshness
// ---------------------------------------------------------------------------

describe("FEAT-006: scanner freshness after disk edits", () => {
  it("re-reads updated EPIC Markdown content on second scan", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);
    const epicPath = addEpic("EPIC-010", "Original Epic");

    const project = createProject(mbPath);

    // First scan
    const firstResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const firstEpic = firstResult.find((r) => r.card.externalId === "EPIC-010")!;
    expect(firstEpic.card.title).toBe("Original Epic");

    // Edit document on disk
    const epicDocPath = resolve(epicPath, "EpicDescription.md");
    const updatedContent = [
      "# Updated Epic",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-010 |",
      "| State | InProgress |",
      "",
      "## Summary",
      "This EPIC was edited after the first scan.",
    ].join("\n");
    writeFileSync(epicDocPath, updatedContent, "utf8");

    // Second scan must reflect the update
    const secondResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const secondEpic = secondResult.find((r) => r.card.externalId === "EPIC-010")!;
    expect(secondEpic.card.title).toBe("Updated Epic");
    expect(secondEpic.card.specMarkdown).toContain("This EPIC was edited after the first scan.");
    // Content hash must differ (proves fresh disk read)
    expect(firstEpic.card.specMarkdown).not.toBe(secondEpic.card.specMarkdown);
  });

  it("re-reads updated FEAT Markdown content on second scan", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);
    const featPath = addFeat("FEAT-010", "Original Feature", "01_SUBMITTED");

    const project = createProject(mbPath);

    // First scan
    const firstResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const firstFeat = firstResult.find((r) => r.card.externalId === "FEAT-010")!;
    expect(firstFeat.card.title).toBe("Original Feature");

    // Edit document on disk
    const featDocPath = resolve(featPath, "FeatureDescription.md");
    const updatedContent = [
      "# Updated Feature",
      "",
      "**Feature ID**: FEAT-010",
      "**Status**: Submitted",
      "",
      "## Summary",
      "This FEAT was edited after the first scan.",
    ].join("\n");
    writeFileSync(featDocPath, updatedContent, "utf8");

    // Second scan must reflect the update
    const secondResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const secondFeat = secondResult.find((r) => r.card.externalId === "FEAT-010")!;
    expect(secondFeat.card.title).toBe("Updated Feature");
    expect(secondFeat.card.specMarkdown).toContain("edited after the first scan");
  });

  it("reflects FEAT folder moves between state folders on new scan", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addFeat, slugify } = createMemoryBankFixture(mbPath);

    // Create FEAT in SUBMITTED
    addFeat("FEAT-020", "Moveable Feat", "01_SUBMITTED");
    const sourcePath = resolve(featuresRoot, "01_SUBMITTED", `FEAT-020-${slugify("Moveable Feat")}`);
    const targetPath = resolve(featuresRoot, "02_READY_TO_DEVELOP", `FEAT-020-${slugify("Moveable Feat")}`);

    const project = createProject(mbPath);

    // First scan — FEAT in SUBMITTED
    const firstResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const firstFeat = firstResult.find((r) => r.card.externalId === "FEAT-020")!;
    expect(firstFeat.card.stateFolder).toBe("01_SUBMITTED");
    expect(firstFeat.card.stateLabel).toBe("Submitted");

    // Move folder on disk
    renameSync(sourcePath, targetPath);

    // Second scan — FEAT must now appear in READY
    const secondResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const secondFeat = secondResult.find((r) => r.card.externalId === "FEAT-020")!;
    expect(secondFeat.card.stateFolder).toBe("02_READY_TO_DEVELOP");
    expect(secondFeat.card.stateLabel).toBe("Ready To Develop");
  });

  it("reflects EPIC folder moves (all EPICs go to 00_EPICS, so verify EPIC folder rename changes folderName)", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addEpic, slugify } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-030", "Renamable Epic");
    const originalPath = resolve(featuresRoot, "00_EPICS", `EPIC-030-${slugify("Renamable Epic")}`);
    const renamedPath = resolve(featuresRoot, "00_EPICS", `EPIC-030-${slugify("Renamed Epic")}`);

    const project = createProject(mbPath);

    // First scan
    const firstResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const firstEpic = firstResult.find((r) => r.card.externalId === "EPIC-030")!;
    expect(firstEpic.card.folderName).toBe(`EPIC-030-${slugify("Renamable Epic")}`);

    // Rename folder on disk
    renameSync(originalPath, renamedPath);

    // Update document title inside the renamed folder
    const updatedContent = [
      "# Renamed Epic",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-030 |",
      "| State | InProgress |",
      "",
      "## Summary",
      "This EPIC folder was renamed.",
    ].join("\n");
    writeFileSync(resolve(renamedPath, "EpicDescription.md"), updatedContent, "utf8");

    // Second scan
    const secondResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const secondEpic = secondResult.find((r) => r.card.externalId === "EPIC-030")!;
    expect(secondEpic.card.folderName).toBe(`EPIC-030-${slugify("Renamed Epic")}`);
    expect(secondEpic.card.title).toBe("Renamed Epic");
    expect(secondEpic.card.specMarkdown).toContain("folder was renamed");
  });

  it("does not include old card location after folder move", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    const { addFeat, slugify } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-040", "Moved Feat", "01_SUBMITTED");
    const sourcePath = resolve(featuresRoot, "01_SUBMITTED", `FEAT-040-${slugify("Moved Feat")}`);

    const project = createProject(mbPath);

    // First scan - find the card
    const firstResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const firstFeat = firstResult.find((r) => r.card.externalId === "FEAT-040")!;
    const oldCardId = firstFeat.card.id;
    expect(oldCardId).toContain("01_SUBMITTED");

    // Move folder
    const targetPath = resolve(featuresRoot, "03_IN_PROGRESS", `FEAT-040-${slugify("Moved Feat")}`);
    renameSync(sourcePath, targetPath);

    // Second scan - old card must be gone
    const secondResult = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const oldCard = secondResult.find((r) => r.card.id === oldCardId);
    expect(oldCard).toBeUndefined();

    // New card must exist with new state
    const movedCard = secondResult.find((r) => r.card.externalId === "FEAT-040")!;
    expect(movedCard.card.stateFolder).toBe("03_IN_PROGRESS");
    expect(movedCard.card.id).toContain("03_IN_PROGRESS");
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Data-Layer Tests: Document-Read Freshness
// ---------------------------------------------------------------------------

describe("FEAT-006: document-read freshness after disk edits", () => {
  it("returns updated content when backing EPIC document is edited", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);
    const epicPath = addEpic("EPIC-050", "Freshness Epic");

    const project = createProject(mbPath);
    const epicCardId = "feat-006-test-project:00_EPICS:EPIC-050-freshness-epic";

    // First read
    const firstRead = readWorkItemDocument(project, epicCardId);
    expect(firstRead.readStatus).toBe("ok");
    expect(firstRead.content).toContain("Freshness Epic");

    // Edit document
    const epicDocPath = resolve(epicPath, "EpicDescription.md");
    writeFileSync(
      epicDocPath,
      [
        "# Freshness Epic (Edited)",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-050 |",
        "| State | InProgress |",
        "",
        "## Summary",
        "This content was updated after the first document read.",
      ].join("\n"),
      "utf8",
    );

    // Second read must return new content
    const secondRead = readWorkItemDocument(project, epicCardId);
    expect(secondRead.readStatus).toBe("ok");
    expect(secondRead.content).toContain("Freshness Epic (Edited)");
    expect(secondRead.content).toContain("updated after the first document read");
    const firstHashValue = createHash("sha256").update(firstRead.content).digest("hex");
    const secondHashValue = createHash("sha256").update(secondRead.content).digest("hex");
    expect(firstHashValue).not.toBe(secondHashValue);
  });

  it("returns updated content when backing FEAT document is edited", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);
    const featPath = addFeat("FEAT-060", "Freshness Feat", "03_IN_PROGRESS");

    const project = createProject(mbPath);
    const featCardId = "feat-006-test-project:03_IN_PROGRESS:FEAT-060-freshness-feat";

    // First read
    const firstRead = readWorkItemDocument(project, featCardId);
    expect(firstRead.readStatus).toBe("ok");
    expect(firstRead.content).toContain("Freshness Feat");

    // Edit document
    const featDocPath = resolve(featPath, "FeatureDescription.md");
    writeFileSync(
      featDocPath,
      [
        "# Freshness Feat (Edited)",
        "",
        "**Feature ID**: FEAT-060",
        "**Status**: In Progress",
        "",
        "## Summary",
        "This FEAT document was edited directly on disk.",
      ].join("\n"),
      "utf8",
    );

    // Second read must return new content
    const secondRead = readWorkItemDocument(project, featCardId);
    expect(secondRead.readStatus).toBe("ok");
    expect(secondRead.content).toContain("Freshness Feat (Edited)");
    expect(secondRead.content).toContain("edited directly on disk");
    // Content hash changed because content is different
    const firstHashValue = createHash("sha256").update(firstRead.content).digest("hex");
    const secondHashValue = createHash("sha256").update(secondRead.content).digest("hex");
    expect(firstHashValue).not.toBe(secondHashValue);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Data-Layer Tests: No-Write Side Effect
// ---------------------------------------------------------------------------

describe("FEAT-006: scanner and document-read remain read-only", () => {
  it("scanner does not write MemoryBank files during scan", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);
    addEpic("EPIC-070", "Read Only Check", "# Original\n\nDo not modify.");

    const featuresRoot = resolve(mbPath, "Features");
    const epicDocPath = resolve(featuresRoot, "00_EPICS", "EPIC-070-read-only-check", "EpicDescription.md");
    const originalContent = readFileContents(epicDocPath);

    const project = createProject(mbPath);
    scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(readFileContents(epicDocPath)).toBe(originalContent);
  });

  it("document-read does not write MemoryBank files", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);
    addEpic("EPIC-080", "Read Only Doc", "# Original\n\nDo not modify.");

    const featuresRoot = resolve(mbPath, "Features");
    const epicDocPath = resolve(featuresRoot, "00_EPICS", "EPIC-080-read-only-doc", "EpicDescription.md");
    const originalContent = readFileContents(epicDocPath);
    const originalDirContents = readDirectoryContents(resolve(featuresRoot, "00_EPICS", "EPIC-080-read-only-doc"));

    const project = createProject(mbPath);
    const cardId = "feat-006-test-project:00_EPICS:EPIC-080-read-only-doc";

    readWorkItemDocument(project, cardId);

    // Verify no files were created, modified, or deleted
    expect(readFileContents(epicDocPath)).toBe(originalContent);
    expect(readDirectoryContents(resolve(featuresRoot, "00_EPICS", "EPIC-080-read-only-doc"))).toEqual(
      originalDirContents,
    );
  });

  it("scanner with issues variant does not write MemoryBank files", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);
    addEpic("EPIC-090", "Full Scan Check");
    addFeat("FEAT-090", "Full Scan Feat", "01_SUBMITTED");

    const featuresRoot = resolve(mbPath, "Features");
    const epicDocPath = resolve(featuresRoot, "00_EPICS", "EPIC-090-full-scan-check", "EpicDescription.md");
    const featDocPath = resolve(
      featuresRoot,
      "01_SUBMITTED",
      "FEAT-090-full-scan-feat",
      "FeatureDescription.md",
    );
    const originalEpicContent = readFileContents(epicDocPath);
    const originalFeatContent = readFileContents(featDocPath);

    const project = createProject(mbPath);
    scanMemoryBankFoldersWithIssues(project, defaultStateFolders as unknown as string[], defaultStateFolderLabels);

    expect(readFileContents(epicDocPath)).toBe(originalEpicContent);
    expect(readFileContents(featDocPath)).toBe(originalFeatContent);
  });
});

// ---------------------------------------------------------------------------
// Internal helpers — avoids re-importing node:fs just for readFileSync
// ---------------------------------------------------------------------------

function readFileContents(path: string): string {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8");
}

function readDirectoryContents(path: string): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(path).sort();
}
