// Behavior suite: memorybank scanner api.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanMemoryBankFolders } from "../src/memorybank-scanner.js";
import { toProjectSummary } from "../src/projects/project-summary.js";

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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-integration-"));
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

function createProject(
  id: string,
  memoryBankPath: string,
  rootPath: string,
) {
  return { id, memoryBankPath, rootPath };
}

function createCanonicalFixture(root: string) {
  const featuresRoot = resolve(root, "MemoryBank", "Features");

  for (const folder of defaultStateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  // EPIC-001
  const epicDir = resolve(featuresRoot, "00_EPICS", "EPIC-001-scanner-foundation");
  mkdirSync(epicDir, { recursive: true });
  writeFileSync(
    resolve(epicDir, "EpicDescription.md"),
    [
      "# Scanner Foundation",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| State | InProgress |",
      "",
      "## Executive Summary",
      "",
      "Build the scanner foundation for MemoryBank work-item scanning.",
    ].join("\n"),
    "utf8",
  );

  // EPIC-002
  const epic2Dir = resolve(featuresRoot, "00_EPICS", "EPIC-002-board-dashboard");
  mkdirSync(epic2Dir, { recursive: true });
  writeFileSync(
    resolve(epic2Dir, "EpicDescription.md"),
    [
      "# Board Dashboard",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-002 |",
      "| State | NotStarted |",
      "",
      "## Executive Summary",
      "",
      "Build the board dashboard for Hepha.",
    ].join("\n"),
    "utf8",
  );

  // FEAT-001 in SUBMITTED
  const feat1Dir = resolve(featuresRoot, "01_SUBMITTED", "FEAT-001-project-registration");
  mkdirSync(feat1Dir, { recursive: true });
  writeFileSync(
    resolve(feat1Dir, "FeatureDescription.md"),
    [
      "# Project Registration",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Feature ID | FEAT-001 |",
      "| Status | COMPLETED |",
      "",
      "**Parent Epic**: EPIC-001",
      "",
      "## Summary",
      "",
      "Register and resolve Hepha projects.",
    ].join("\n"),
    "utf8",
  );

  // FEAT-002 in IN_PROGRESS
  const feat2Dir = resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-002-memorybank-scanner");
  mkdirSync(feat2Dir, { recursive: true });
  writeFileSync(
    resolve(feat2Dir, "FeatureDescription.md"),
    [
      "# MemoryBank Scanner Foundation",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Feature ID | FEAT-002 |",
      "| Status | IN_PROGRESS |",
      "",
      "**Parent Epic**: EPIC-001",
      "",
      "## Summary",
      "",
      "Build the scanner foundation for MemoryBank work items.",
    ].join("\n"),
    "utf8",
  );

  // FEAT-003 in COMPLETED
  const feat3Dir = resolve(featuresRoot, "04_COMPLETED", "FEAT-003-testing-setup");
  mkdirSync(feat3Dir, { recursive: true });
  writeFileSync(
    resolve(feat3Dir, "FeatureDescription.md"),
    [
      "# Testing Setup",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Feature ID | FEAT-003 |",
      "| Status | COMPLETED |",
      "",
      "**Parent Epic**: EPIC-002",
      "",
      "## Summary",
      "",
      "Setup the initial testing framework.",
    ].join("\n"),
    "utf8",
  );

  return { featuresRoot };
}

// ---------------------------------------------------------------------------
// Integration Tests — Canonical Fixture → Scanner → API Shape
// ---------------------------------------------------------------------------

describe("FEAT-002 Integration — Canonical Fixture", () => {
  it("scanner returns EPIC records from canonical MemoryBank/Features/00_EPICS", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    const project = createProject("test-project", memoryBankPath, root);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epics = results.filter((item) => item.card.kind === "epic");
    expect(epics).toHaveLength(2);

    const epicIds = epics.map((e) => e.card.externalId).sort();
    expect(epicIds).toEqual(["EPIC-001", "EPIC-002"]);
  });

  it("scanner returns FEAT records from all configured state folders", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    const project = createProject("test-project", memoryBankPath, root);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const features = results.filter((item) => item.card.kind === "feature");
    expect(features).toHaveLength(3);

    const featIds = features.map((f) => f.card.externalId).sort();
    expect(featIds).toEqual(["FEAT-001", "FEAT-002", "FEAT-003"]);

    const featStates = features.map((f) => f.card.stateFolder).sort();
    expect(featStates).toEqual(["01_SUBMITTED", "03_IN_PROGRESS", "04_COMPLETED"]);
  });

  it("scanner output fields survive end-to-end: ID, title, state, document path, source type, metadata", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    const project = createProject("test-project", memoryBankPath, root);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(results.length).toBeGreaterThan(0);

    for (const item of results) {
      // ID
      expect(item.card.id).toBeTruthy();
      expect(item.card.externalId).toBeTruthy();

      // Title
      expect(item.card.title).toBeTruthy();

      // State
      expect(item.card.stateFolder).toBeTruthy();
      expect(item.card.stateLabel).toBeTruthy();

      // Document path
      expect(item.card.documentPath).toBeTruthy();
      expect(item.card.folderPath).toBeTruthy();

      // Source type
      expect(["epic", "feature"]).toContain(item.card.kind);

      // Metadata
      expect(item.metadata.cardKey).toBeTruthy();
      expect(item.metadata.kind).toBe(item.card.kind);
      expect(item.metadata.stateFolder).toBe(item.card.stateFolder);
      expect(item.metadata.title).toBe(item.card.title);
      expect(item.metadata.documentHash).toBeTruthy();
    }
  });

  it("toProjectSummary integrates with scanner project info correctly", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    // Simulate a StoredProject as it would be persisted by createProject
    const storedProject = {
      id: "test-project-001",
      name: "Test Project",
      rootPath: root,
      memoryBankPath,
      defaultBranch: "master",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      originalRootPathInput: root,
      originalMemoryBankPathInput: "MemoryBank",
    };

    const summary = toProjectSummary(storedProject);
    expect(summary.id).toBe("test-project-001");
    expect(summary.memoryBankPath).toBe(memoryBankPath);
    expect(summary.memoryBankRelativePath).toBe("MemoryBank");

    // Now scan with matching project
    const project = createProject(summary.id, summary.memoryBankPath, summary.rootPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(results.length).toBe(5); // 2 epics + 3 features
    expect(results.filter((r) => r.card.kind === "epic")).toHaveLength(2);
    expect(results.filter((r) => r.card.kind === "feature")).toHaveLength(3);
  });

  it("scanner uses the canonical configured MemoryBank path (not a relative fallback)", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    // Project has memoryBankPath pointing to the canonical fixture
    const project = createProject("test-project", memoryBankPath, root);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    // All document paths should be under the canonical memoryBankPath
    for (const item of results) {
      expect(item.card.documentPath).toContain(memoryBankPath);
      expect(item.card.folderPath).toContain(memoryBankPath);
    }
  });

  it("EPIC state metadata flows from Markdown through scanner to card output", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    const project = createProject("test-project", memoryBankPath, root);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epics = results.filter((i) => i.card.kind === "epic");
    const epic001 = epics.find((e) => e.card.externalId === "EPIC-001");
    const epic002 = epics.find((e) => e.card.externalId === "EPIC-002");

    expect(epic001).toBeDefined();
    expect(epic001!.card.epicState).toBe("in-progress");

    expect(epic002).toBeDefined();
    expect(epic002!.card.epicState).toBe("not-started");
  });

  it("FEAT parent EPIC relationships flow from Markdown through scanner", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    createCanonicalFixture(root);

    const project = createProject("test-project", memoryBankPath, root);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat001 = results.find((i) => i.card.externalId === "FEAT-001");
    const feat002 = results.find((i) => i.card.externalId === "FEAT-002");
    const feat003 = results.find((i) => i.card.externalId === "FEAT-003");

    expect(feat001).toBeDefined();
    expect(feat001!.card.linkedEpicIds).toContain("EPIC-001");

    expect(feat002).toBeDefined();
    expect(feat002!.card.linkedEpicIds).toContain("EPIC-001");

    expect(feat003).toBeDefined();
    expect(feat003!.card.linkedEpicIds).toContain("EPIC-002");
  });

  it("no MemoryBank documents are created, modified, or deleted during scanning (read-only)", () => {
    const root = createTempRoot();
    const memoryBankPath = resolve(root, "MemoryBank");

    // Create fixture and record checksums
    createCanonicalFixture(root);

    function collectFiles(dir: string, target: Map<string, { mtime: Date; size: number; content: string }>) {
      for (const entry of readdirSync(dir)) {
        const fullPath = resolve(dir, entry);
        if (statSync(fullPath).isDirectory()) {
          collectFiles(fullPath, target);
        } else {
          target.set(fullPath, {
            mtime: statSync(fullPath).mtime,
            size: statSync(fullPath).size,
            content: readFileSync(fullPath, "utf8"),
          });
        }
      }
    }

    const filesBefore = new Map<string, { mtime: Date; size: number; content: string }>();
    collectFiles(memoryBankPath, filesBefore);

    // Run scanner
    const project = createProject("test-project", memoryBankPath, root);
    scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    // Verify no files changed
    const filesAfter = new Map<string, { mtime: Date; size: number; content: string }>();
    collectFiles(memoryBankPath, filesAfter);

    expect(filesAfter.size).toBe(filesBefore.size);
    for (const [filePath, before] of filesBefore) {
      const after = filesAfter.get(filePath);
      expect(after).toBeDefined();
      expect(after!.content).toBe(before.content);
      expect(after!.size).toBe(before.size);
    }
  });
});
