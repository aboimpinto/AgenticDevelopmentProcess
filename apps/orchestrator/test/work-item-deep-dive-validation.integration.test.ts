// Behavior suite: work item deep dive validation.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanMemoryBankFolders, scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
import { toWorkItemListResponse } from "../src/projects/work-item-list-response.js";
import type { StoredProject } from "../src/projects/stored-project.js";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-015-int-"));
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
  const now = new Date().toISOString();
  return {
    id: "test-project-001",
    createdAt: now,
    memoryBankPath,
    name: "FEAT-015 Integration Test",
    rootPath: rootPath ?? memoryBankPath,
    updatedAt: now,
  } satisfies StoredProject;
}

function createMemoryBank(path: string) {
  mkdirSync(resolve(path), { recursive: true });
  for (const folder of defaultStateFolders) {
    mkdirSync(resolve(path, "Features", folder), { recursive: true });
  }
}

function createEpic(
  memoryBankPath: string,
  epicId: string,
  title: string,
  featReferences: string[],
) {
  const slug = epicId.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const folderPath = resolve(memoryBankPath, "Features", "00_EPICS", `${epicId}-${slug}`);
  mkdirSync(folderPath, { recursive: true });

  const featuresTable = featReferences
    .map((featId) => `| ${featId} | Related | SUBMITTED | | P1 |`)
    .join("\n");

  writeFileSync(
    resolve(folderPath, "EpicDescription.md"),
    [
      `# ${epicId}: ${title}`,
      "",
      "| Field | Value |",
      "|-------|-------|",
      `| Epic ID | ${epicId} |`,
      "| State | InProgress |",
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status | Dependencies | Priority |",
      "|------------|-------|--------|--------------|----------|",
      featuresTable,
      "",
      "## Feature Details",
      "",
      featReferences
        .map((featId, index) => `### Feature ${index + 1}: Related (${featId})`)
        .join("\n\n"),
    ].join("\n"),
    "utf8",
  );
}

function createFeat(
  memoryBankPath: string,
  stateFolder: string,
  featId: string,
  title: string,
  markdown: string,
) {
  const slug = featId.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const folderPath = resolve(memoryBankPath, "Features", stateFolder, `${featId}-${slug}`);
  mkdirSync(resolve(folderPath, "Phases"), { recursive: true });
  writeFileSync(resolve(folderPath, "FeatureDescription.md"), markdown, "utf8");
}

// ──────────────────────────────────────────────
// FEAT MemoryBank fixture: standalone with markers
// ──────────────────────────────────────────────

const standaloneWithMarkersMarkdown = [
  "# FEAT-050: Standalone Test With Markers",
  "",
  "**Feature ID:** FEAT-050",
  "**Status:** Submitted",
  "",
  "## Summary",
  "A standalone FEAT for deep-dive integration testing.",
  "",
  "## Scope",
  "Full implementation of the feature. [NEEDS VALIDATION]",
  "",
  "## Acceptance Criteria",
  "- AC1: The system works. [NEEDS VALIDATION]",
  "- AC2: Edge cases handled.",
  "",
  "## Technical Notes",
  "- Uses SQLite for storage.",
  "- API routes under `/api/deep-dive-sessions/*`. [NEEDS VALIDATION]",
  "",
  "## Table Test",
  "| Option | Description |",
  "|--------|-------------|",
  "| A | Option A |",
  "| B | Option B |",
  "",
  "## Link Test",
  "See [EPIC-004](#) for parent context.",
].join("\n");

const markerFreeMarkdown = [
  "# FEAT-051: Standalone Marker-Free Test",
  "",
  "**Feature ID:** FEAT-051",
  "**Status:** Submitted",
  "",
  "## Summary",
  "A marker-free FEAT for readiness question path testing.",
  "",
  "## Scope",
  "Fully specified with no unresolved decisions.",
  "",
  "## Acceptance Criteria",
  "- AC1: Works correctly.",
  "- AC2: All edge cases documented.",
  "",
  "## Technical Notes",
  "- Uses existing Hepha infrastructure.",
].join("\n");

// ──────────────────────────────────────────────
// Integration tests
// ──────────────────────────────────────────────

describe("FEAT-015 Integration: FEAT deep-dive MemoryBank fixtures", () => {
  it("scans a standalone FEAT with validation markers", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);
    createFeat(mbPath, "01_SUBMITTED", "FEAT-050", "standalone-test-with-markers", standaloneWithMarkersMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-050");
    expect(feat).toBeDefined();
    expect(feat!.card.kind).toBe("feature");
    expect(feat!.card.title).toContain("Standalone Test");
    expect(feat!.card.stateFolder).toBe("01_SUBMITTED");

    // Scanner passes null metadata, so deepDiveStatus is metadata_unavailable
    expect(feat!.card.validation.deepDiveStatus).toBe("metadata_unavailable");
    expect(feat!.card.validation.needsValidationCount).toBe(3);
  });

  it("scans a marker-free FEAT", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);
    createFeat(mbPath, "02_READY_TO_DEVELOP", "FEAT-051", "standalone-marker-free-test", markerFreeMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-051");
    expect(feat).toBeDefined();
    expect(feat!.card.kind).toBe("feature");
    expect(feat!.card.validation.needsValidationCount).toBe(0);
  });

  it("scans an EPIC-derived FEAT with traceability", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);

    // Create EPIC
    createEpic(mbPath, "EPIC-010", "Integration Test", ["FEAT-050"]);

    // Create FEAT with linked epic reference
    const featMarkdown = [
      "# FEAT-050: Standalone Test",
      "",
      "**Parent EPIC:** EPIC-010",
      "**Status:** Submitted",
      "",
      "## Summary",
      "EPIC-derived FEAT test. [NEEDS VALIDATION]",
    ].join("\n");
    createFeat(mbPath, "01_SUBMITTED", "FEAT-050", "epic-derived-test", featMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-050");
    expect(feat).toBeDefined();
    expect(feat!.card.kind).toBe("feature");
    expect(feat!.card.validation.needsValidationCount).toBe(1);

    // The EPIC should be discoverable
    const epic = scannedItems.find((item) => item.card.externalId === "EPIC-010");
    expect(epic).toBeDefined();
    expect(epic!.card.kind).toBe("epic");
  });

  it("detects no validation markers in a clean FEAT document", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);

    const cleanFeatMarkdown = [
      "# FEAT-052: Clean Test",
      "",
      "## Summary",
      "A fully specified FEAT.",
      "",
      "## Scope",
      "Everything is defined.",
      "",
      "## Acceptance Criteria",
      "- AC1: Done.",
    ].join("\n");
    createFeat(mbPath, "01_SUBMITTED", "FEAT-052", "clean-test", cleanFeatMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-052");
    expect(feat).toBeDefined();
    expect(feat!.card.validation.needsValidationCount).toBe(0);
  });

  it("scans FEATs across multiple state folders", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);

    createFeat(mbPath, "01_SUBMITTED", "FEAT-060", "submitted-feat", "# FEAT-060: Submitted\nNo markers.");
    createFeat(mbPath, "03_IN_PROGRESS", "FEAT-061", "in-progress-feat", "# FEAT-061: In Progress\n[NEEDS VALIDATION]");
    createFeat(mbPath, "04_COMPLETED", "FEAT-062", "completed-feat", "# FEAT-062: Completed\nDone.");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat060 = scannedItems.find((item) => item.card.externalId === "FEAT-060");
    const feat061 = scannedItems.find((item) => item.card.externalId === "FEAT-061");
    const feat062 = scannedItems.find((item) => item.card.externalId === "FEAT-062");

    expect(feat060).toBeDefined();
    expect(feat060!.card.stateFolder).toBe("01_SUBMITTED");

    expect(feat061).toBeDefined();
    expect(feat061!.card.stateFolder).toBe("03_IN_PROGRESS");
    expect(feat061!.card.validation.needsValidationCount).toBe(1);

    expect(feat062).toBeDefined();
    expect(feat062!.card.stateFolder).toBe("04_COMPLETED");
  });
});

// ──────────────────────────────────────────────
// FEAT document content verification
// ──────────────────────────────────────────────

describe("FEAT-015 Integration: FEAT document content and Markdown preservation", () => {
  it("preserves tables in scanned FEAT document", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);
    createFeat(mbPath, "01_SUBMITTED", "FEAT-050", "table-test", standaloneWithMarkersMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-050");
    expect(feat).toBeDefined();
    expect(feat!.card.specMarkdown).toContain("| Option | Description |");
    expect(feat!.card.specMarkdown).toContain("| A | Option A |");
  });

  it("preserves links in scanned FEAT document", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);
    createFeat(mbPath, "01_SUBMITTED", "FEAT-050", "link-test", standaloneWithMarkersMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-050");
    expect(feat).toBeDefined();
    expect(feat!.card.specMarkdown).toContain("[EPIC-004]");
  });
});

// ──────────────────────────────────────────────
// FEAT validation summary through API response
// ──────────────────────────────────────────────

describe("FEAT-015 Integration: FEAT validation summary in API response", () => {
  it("includes deepDiveStatus and needsValidationCount for a FEAT with markers", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);
    createFeat(mbPath, "01_SUBMITTED", "FEAT-050", "validation-test", standaloneWithMarkersMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);
    const response = toWorkItemListResponse(project, {
      items: scannedItems.items.map((item) => item.card),
      scanStatus: scannedItems.scanStatus,
      sourceIssues: scannedItems.sourceIssues,
    });

    const featItem = response.items.find((item) => item.externalId === "FEAT-050");
    expect(featItem).toBeDefined();

    const validation = featItem!.validation;
    expect(validation).toHaveProperty("deepDiveStatus");
    expect(validation).toHaveProperty("needsValidationCount");
    expect(validation.needsValidationCount).toBe(3);
  });

  it("includes deepDiveStatus for a marker-free FEAT", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    createMemoryBank(mbPath);
    createFeat(mbPath, "02_READY_TO_DEVELOP", "FEAT-051", "clean-validation-test", markerFreeMarkdown);

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);
    const response = toWorkItemListResponse(project, {
      items: scannedItems.items.map((item) => item.card),
      scanStatus: scannedItems.scanStatus,
      sourceIssues: scannedItems.sourceIssues,
    });

    const featItem = response.items.find((item) => item.externalId === "FEAT-051");
    expect(featItem).toBeDefined();

    const validation = featItem!.validation;
    expect(validation).toHaveProperty("deepDiveStatus");
    expect(validation).toHaveProperty("needsValidationCount");
    expect(validation.needsValidationCount).toBe(0);
  });
});
