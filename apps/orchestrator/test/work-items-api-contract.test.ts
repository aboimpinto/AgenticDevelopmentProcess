import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanMemoryBankFolders, scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
import { toWorkItemListResponse } from "../src/projects/work-item-list-response.js";
import { toProjectSummary } from "../src/projects/project-summary.js";
import type { ProjectSummary, WorkItemCard, WorkItemListResponse, WorkItemDocumentDetail } from "@hepha/shared";

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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-work-items-api-"));
  tempRoots.push(root);
  return root;
}

function createTempGitRoot(): string {
  const root = createTempRoot();
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
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
    id: "test-project-001",
    memoryBankPath,
    rootPath: rootPath ?? memoryBankPath,
  };
}

function createMemoryBankFixture(root: string) {
  const featuresRoot = resolve(root, "Features");

  for (const folder of defaultStateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  function addEpic(epicId: string, title: string) {
    const folderPath = resolve(featuresRoot, "00_EPICS", `${epicId}-${slugify(title)}`);
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      resolve(folderPath, "EpicDescription.md"),
      [
        `# ${title}`,
        "",
        "| Field | Value |",
        "|-------|-------|",
        `| Epic ID | ${epicId} |`,
        "| State | InProgress |",
        "",
        "## Executive Summary",
        "",
        `Description for ${title}.`,
      ].join("\n"),
      "utf8",
    );
  }

  function addFeat(featId: string, title: string, stateFolder: string) {
    const folderPath = resolve(featuresRoot, stateFolder, `${featId}-${slugify(title)}`);
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      resolve(folderPath, "FeatureDescription.md"),
      [
        `# ${title}`,
        "",
        "| Field | Value |",
        "|-------|-------|",
        `| Feature ID | ${featId} |`,
        "| Status | IN_PROGRESS |",
        "",
        "## Summary",
        "",
        `Description for ${title}.`,
      ].join("\n"),
      "utf8",
    );
  }

  return { addEpic, addFeat, featuresRoot };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// API Contract Tests
// ---------------------------------------------------------------------------

describe("WorkItemListResponse contract", () => {
  it("response shape includes items, project, and scannedAt", () => {
    const response: WorkItemListResponse = {
      items: [],
      scanStatus: {
        epicDocumentCount: 0,
        epicFolderExists: false,
        epicInvalidSourceCount: 0,
        epicScanFailed: false,
        epicValidItemCount: 0,
        message: null,
      },
      sourceIssues: [],
      project: {
        id: "test",
        name: "Test",
        rootPath: "/tmp",
        memoryBankPath: "/tmp/MemoryBank",
        memoryBankRelativePath: "MemoryBank",
        defaultBranch: "master",
        detectedStack: [],
        featuresRootExists: false,
        needsInitialization: false,
        counts: {} as Record<string, number>,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      scannedAt: new Date().toISOString(),
    };

    expect(response).toHaveProperty("items");
    expect(response).toHaveProperty("project");
    expect(response).toHaveProperty("scannedAt");
    expect(response).toHaveProperty("scanStatus");
    expect(response).toHaveProperty("sourceIssues");
    expect(Array.isArray(response.items)).toBe(true);
    expect(Array.isArray(response.sourceIssues)).toBe(true);
    expect(typeof response.scannedAt).toBe("string");
    expect(response.project).toHaveProperty("id");
    expect(response.project).toHaveProperty("name");
    expect(response.project).toHaveProperty("rootPath");
    expect(response.project).toHaveProperty("memoryBankPath");
  });

  it("toWorkItemListResponse maps scan status and invalid source issues into the API response", () => {
    const root = createTempGitRoot();
    const storedProject = {
      id: "test-project-001",
      name: "Test Project",
      rootPath: root,
      memoryBankPath: resolve(root, "MemoryBank"),
      defaultBranch: "master",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const sourceIssue = {
      folderName: "EPIC-011-invalid",
      folderPath: "/tmp/test-project/MemoryBank/Features/00_EPICS/EPIC-011-invalid",
      id: "issue:EPIC-011-invalid",
      kind: "invalid-source" as const,
      message: "EPIC source document is empty.",
      reason: "empty-document" as const,
      severity: "invalid" as const,
      sourcePath: "/tmp/test-project/MemoryBank/Features/00_EPICS/EPIC-011-invalid/EpicDescription.md",
      sourceRelativePath: "MemoryBank/Features/00_EPICS/EPIC-011-invalid/EpicDescription.md",
      sourceType: "epic" as const,
    };

    const response = toWorkItemListResponse(
      storedProject,
      {
        items: [],
        scanStatus: {
          epicDocumentCount: 1,
          epicFolderExists: true,
          epicInvalidSourceCount: 1,
          epicScanFailed: false,
          epicValidItemCount: 0,
          message: null,
        },
        sourceIssues: [sourceIssue],
      },
      "2026-07-01T00:00:00.000Z",
    );

    expect(response.scannedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(response.scanStatus.epicInvalidSourceCount).toBe(1);
    expect(response.sourceIssues).toEqual([sourceIssue]);
    expect(response.project.id).toBe("test-project-001");
  });

  it("scanner output items include all required WorkItemCard fields", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-001", "Scanner Epic");
    addFeat("FEAT-001", "Scanner Feature", "03_IN_PROGRESS");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const cards: WorkItemCard[] = scannedItems.map((item) => item.card);

    // Verify items array has both epic and feature
    expect(cards.length).toBeGreaterThanOrEqual(2);

    for (const card of cards) {
      // Required base fields
      expect(card).toHaveProperty("id");
      expect(card).toHaveProperty("externalId");
      expect(card).toHaveProperty("kind");
      expect(card).toHaveProperty("title");
      expect(card).toHaveProperty("stateFolder");
      expect(card).toHaveProperty("stateLabel");
      expect(card).toHaveProperty("folderPath");
      expect(card).toHaveProperty("documentPath");
      expect(card).toHaveProperty("implementationEvidence");

      // Summary (satisfies "source type and metadata" via specMarkdown + summary)
      expect(card).toHaveProperty("summary");
      expect(typeof card.summary).toBe("string");

      // State fields have correct types
      expect(["epic", "feature"]).toContain(card.kind);
      expect(card.stateFolder).toBeTruthy();
      expect(card.stateLabel).toBeTruthy();
    }
  });

  it("scanner EPIC records have the correct source type (kind)", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-010", "Epic Source Type");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epic = scannedItems.find((item) => item.card.kind === "epic");
    expect(epic).toBeDefined();
    expect(epic!.card.kind).toBe("epic");
    expect(epic!.card.stateFolder).toBe("00_EPICS");
    expect(epic!.card.stateLabel).toBe("Epics");
  });

  it("scanner issue contract preserves invalid EPIC source paths separately from valid items", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, featuresRoot } = createMemoryBankFixture(mbPath);
    addEpic("EPIC-010", "Epic Source Type");
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-011-invalid"), { recursive: true });
    writeFileSync(resolve(featuresRoot, "00_EPICS", "EPIC-011-invalid", "EpicDescription.md"), "", "utf8");

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scanResult.items.filter((item) => item.card.kind === "epic")).toHaveLength(1);
    expect(scanResult.sourceIssues).toHaveLength(1);
    expect(scanResult.sourceIssues[0]).toMatchObject({
      kind: "invalid-source",
      reason: "empty-document",
      severity: "invalid",
      sourceType: "epic",
    });
    expect(scanResult.sourceIssues[0].sourcePath).toContain("EpicDescription.md");
    expect(scanResult.scanStatus).toMatchObject({
      epicDocumentCount: 2,
      epicInvalidSourceCount: 1,
      epicScanFailed: false,
      epicValidItemCount: 1,
    });
  });

  it("scanner FEAT records have the correct source type (kind)", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-020", "Feature Source Type", "02_READY_TO_DEVELOP");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.kind === "feature");
    expect(feat).toBeDefined();
    expect(feat!.card.kind).toBe("feature");
    expect(feat!.card.stateFolder).toBe("02_READY_TO_DEVELOP");
    expect(feat!.card.stateLabel).toBe("Ready To Develop");
  });

  it("requires at minimum one EPIC and one FEAT in the response for a canonical fixture with both", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-030", "Required Epic");
    addFeat("FEAT-030", "Required Feat", "01_SUBMITTED");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const kinds = new Set(scannedItems.map((item) => item.card.kind));
    expect(kinds.has("epic")).toBe(true);
    expect(kinds.has("feature")).toBe(true);
  });

  it("returns an empty items array when no work items exist", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "EmptyMemoryBank");
    mkdirSync(mbPath, { recursive: true });

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scannedItems).toEqual([]);
  });

  it("toProjectSummary produces a valid ProjectSummary for API response", () => {
    const root = createTempGitRoot();
    const storedProject = {
      id: "test-project-001",
      name: "Test Project",
      rootPath: root,
      memoryBankPath: resolve(root, "MemoryBank"),
      defaultBranch: "master",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      originalRootPathInput: root,
      originalMemoryBankPathInput: "MemoryBank",
    };

    // Dynamically create a minimal callable wrapper without full project store
    const summary = toProjectSummary(storedProject);

    expect(summary).toHaveProperty("id", "test-project-001");
    expect(summary).toHaveProperty("name", "Test Project");
    expect(summary).toHaveProperty("rootPath");
    expect(summary).toHaveProperty("memoryBankPath");
    expect(summary).toHaveProperty("memoryBankRelativePath");
    expect(summary).toHaveProperty("defaultBranch");
    expect(summary).toHaveProperty("featuresRootExists");
    expect(summary).toHaveProperty("needsInitialization");
    expect(summary).toHaveProperty("counts");
  });

  it("WorkItemCard ID is in the canonical format projectId:stateFolder:folderName", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-040", "ID Format Test");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epic = scannedItems[0];
    expect(epic.card.id).toMatch(/^test-project-001:00_EPICS:/);
    expect(epic.card.id).toContain("EPIC-040");
  });

  it("scannedAt timestamp is an ISO string when constructing API response manually", () => {
    const scannedAt = new Date().toISOString();
    expect(scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("FEAT cards in scan result include parent EPIC relationship fields", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-060", "Parent EPIC");

    // Write a FEAT document with explicit parent EPIC reference
    const featFolder = resolve(mbPath, "Features", "01_SUBMITTED", "FEAT-060-child-feat");
    mkdirSync(featFolder, { recursive: true });
    writeFileSync(
      resolve(featFolder, "FeatureDescription.md"),
      [
        "# Child FEAT",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Feature ID | FEAT-060 |",
        "| Status | IN_PROGRESS |",
        "",
        "**Parent Epic**: EPIC-060",
        "",
        "## Summary",
        "",
        "Description for Child FEAT.",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-060");
    expect(feat).toBeDefined();
    expect(feat!.card.linkedEpicIds).toContain("EPIC-060");
  });

  it("FEAT cards in scan result include validation marker count", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-070", "Validation Feat", "02_READY_TO_DEVELOP");

    // Add a validation marker to the FEAT document
    const featFolder = resolve(mbPath, "Features", "02_READY_TO_DEVELOP", "FEAT-070-validation-feat");
    const docPath = resolve(featFolder, "FeatureDescription.md");
    writeFileSync(
      docPath,
      [
        "# Validation Feat",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Feature ID | FEAT-070 |",
        "| Status | NOT_STARTED |",
        "",
        "[NEEDS VALIDATION] This requirement needs confirmation.",
        "",
        "## Summary",
        "",
        "Feature description.",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-070");
    expect(feat).toBeDefined();
    expect(feat!.card.validation.needsValidationCount).toBe(1);
  });

  it("FEAT source issues appear in scan result with sourceType feature", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });

    // FEAT folder with empty document
    const folderPath = resolve(featuresRoot, "01_SUBMITTED", "FEAT-080-empty");
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(resolve(folderPath, "FeatureDescription.md"), "", "utf8");

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    const featIssue = scanResult.sourceIssues.find((issue) => issue.sourceType === "feature");
    expect(featIssue).toBeDefined();
    expect(featIssue!.reason).toBe("empty-document");
    expect(featIssue!.sourceType).toBe("feature");

    // Empty FEAT is NOT in scanned items (excluded via source issue)
    const emptyFeat = scanResult.items.find((item) => item.card.externalId === "FEAT-080");
    expect(emptyFeat).toBeUndefined();
  });

  it("FEAT card in scan result includes all required board fields", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-090", "Complete FEAT", "03_IN_PROGRESS");

    const project = createProject(mbPath);
    const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const feat = scannedItems.find((item) => item.card.externalId === "FEAT-090");
    expect(feat).toBeDefined();

    const card = feat!.card;

    // Required FEAT board fields
    expect(card.externalId).toBe("FEAT-090");
    expect(card.kind).toBe("feature");
    expect(card.title).toBeTruthy();
    expect(typeof card.summary).toBe("string");
    expect(card.stateFolder).toBe("03_IN_PROGRESS");
    expect(card.stateLabel).toBe("In Progress");
    expect(card.documentPath).toBeTruthy();
    expect(card.documentRelativePath).toBeTruthy();
    expect(card.folderPath).toBeTruthy();
    expect(card.validation).toBeDefined();
    expect(typeof card.validation.needsValidationCount).toBe("number");
    expect(Array.isArray(card.linkedEpicIds)).toBe(true);
    expect(Array.isArray(card.linkedEpics)).toBe(true);
  });

  // ── FEAT-007 Phase 4: API contract extensions ──

  describe("FEAT-007 API contract: phase summaries, missing features, deep-dive status, workflow", () => {
    it("FEAT card phases array contains phase summaries in scan response", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addFeat } = createMemoryBankFixture(mbPath);

      addFeat("FEAT-400", "Phased Feat", "03_IN_PROGRESS");

      const featureFolder = resolve(
        mbPath,
        "Features",
        "03_IN_PROGRESS",
        "FEAT-400-phased-feat",
      );
      const phasesFolder = resolve(featureFolder, "Phases");
      mkdirSync(phasesFolder, { recursive: true });

      writeFileSync(
        resolve(featureFolder, "FeatureTasks.md"),
        [
          "# FEAT-400 Tasks",
          "",
          "| # | Phase | Status |",
          "|---|-------|--------|",
          "| 0 | Health Check | Completed |",
          "| 1 | Planning | Not Started |",
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

      const project = createProject(mbPath);
      const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const feat = scannedItems.find((item) => item.card.externalId === "FEAT-400");
      expect(feat).toBeDefined();

      expect(Array.isArray(feat!.card.phases)).toBe(true);
      expect(feat!.card.phases.length).toBeGreaterThanOrEqual(2);

      for (const phase of feat!.card.phases) {
        expect(phase).toHaveProperty("number");
        expect(phase).toHaveProperty("title");
        expect(phase).toHaveProperty("status");
        expect(phase).toHaveProperty("fileName");
        expect(phase).toHaveProperty("documentPath");
        expect(phase).toHaveProperty("documentRelativePath");
      }
    });

    it("EPIC card linkedFeatureIds contains referenced child FEATs from current document", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      const { addEpic } = createMemoryBankFixture(mbPath);

      addEpic("EPIC-410", "Missing Children");

      // Append child feature table referencing non-existent FEATs
      const epicFolder = resolve(featuresRoot, "00_EPICS", "EPIC-410-missing-children");
      const epicDocPath = resolve(epicFolder, "EpicDescription.md");
      writeFileSync(
        epicDocPath,
        readFileSync(epicDocPath, "utf8") + "\n| Feature ID | Title |\n|------------|-------|\n| FEAT-411 | Missing Feat |\n| FEAT-412 | Also Missing |\n",
        "utf8",
      );

      const project = createProject(mbPath);
      const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const epic = scannedItems.find((item) => item.card.externalId === "EPIC-410");
      expect(epic).toBeDefined();

      // linkedFeatureIds comes from the current document's FEAT table
      expect(Array.isArray(epic!.card.linkedFeatureIds)).toBe(true);
      expect(epic!.card.linkedFeatureIds).toContain("FEAT-411");
      expect(epic!.card.linkedFeatureIds).toContain("FEAT-412");

      // missingFeatureIds is computed by orchestrator hydration (not scanner),
      // but the field contract exists and is an array
      expect(Array.isArray(epic!.card.missingFeatureIds)).toBe(true);
    });

    it("EPIC without linked FEATs has empty missingFeatureIds", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addEpic } = createMemoryBankFixture(mbPath);

      // EPIC with no child table
      addEpic("EPIC-420", "No Children");

      const project = createProject(mbPath);
      const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const epic = scannedItems.find((item) => item.card.externalId === "EPIC-420");
      expect(epic).toBeDefined();
      expect(epic!.card.missingFeatureIds).toEqual([]);
    });

    it("marker-free FEAT validation is current at scanner level", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addFeat } = createMemoryBankFixture(mbPath);

      addFeat("FEAT-430", "No Metadata", "02_READY_TO_DEVELOP");

      const project = createProject(mbPath);
      const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const feat = scannedItems.find((item) => item.card.externalId === "FEAT-430");
      expect(feat).toBeDefined();

      expect(feat!.card.validation).toHaveProperty("deepDiveStatus");
      // Deep-Dive readiness derives from unresolved markers, not metadata history.
      expect(feat!.card.validation.deepDiveStatus).toBe("current");
    });

    it("FEAT card with phase files has featureWorkflow null at scanner level (no SQLite)", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addFeat } = createMemoryBankFixture(mbPath);

      addFeat("FEAT-440", "Workflow Test", "03_IN_PROGRESS");

      const featureFolder = resolve(
        mbPath,
        "Features",
        "03_IN_PROGRESS",
        "FEAT-440-workflow-test",
      );
      const phasesFolder = resolve(featureFolder, "Phases");
      mkdirSync(phasesFolder, { recursive: true });
      writeFileSync(
        resolve(phasesFolder, "phase-0-check.md"),
        "# Phase 0 - Check\n\n**Status:** COMPLETED\n",
        "utf8",
      );

      const project = createProject(mbPath);
      const scannedItems = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const feat = scannedItems.find((item) => item.card.externalId === "FEAT-440");
      expect(feat).toBeDefined();

      // At scanner level (no SQLite metadata store), featureWorkflow is null
      expect(feat!.card.featureWorkflow).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// WorkItemDocumentDetail contract tests (FEAT-005)
// ---------------------------------------------------------------------------

describe("WorkItemDocumentDetail contract", () => {
  it("response shape includes required fields", () => {
    const detail: WorkItemDocumentDetail = {
      cardId: "test-project:03_IN_PROGRESS:FEAT-001",
      content: "# Test\n\nContent.",
      documentPath: "/tmp/MemoryBank/Features/03_IN_PROGRESS/FEAT-001/FeatureDescription.md",
      documentRelativePath: "MemoryBank/Features/03_IN_PROGRESS/FEAT-001/FeatureDescription.md",
      documentUpdatedAt: new Date().toISOString(),
      externalId: "FEAT-001",
      folderName: "FEAT-001",
      kind: "feature",
      readError: null,
      readStatus: "ok",
      stateFolder: "03_IN_PROGRESS",
      stateLabel: "In Progress",
      title: "Test Feature",
    };

    expect(detail).toHaveProperty("cardId");
    expect(detail).toHaveProperty("content");
    expect(detail).toHaveProperty("documentPath");
    expect(detail).toHaveProperty("documentRelativePath");
    expect(detail).toHaveProperty("documentUpdatedAt");
    expect(detail).toHaveProperty("externalId");
    expect(detail).toHaveProperty("folderName");
    expect(detail).toHaveProperty("kind");
    expect(detail).toHaveProperty("readError");
    expect(detail).toHaveProperty("readStatus");
    expect(detail).toHaveProperty("stateFolder");
    expect(detail).toHaveProperty("stateLabel");
    expect(detail).toHaveProperty("title");
    expect(detail.readStatus).toMatch(/^ok|missing|unreadable$/);
    expect(detail.kind).toMatch(/^epic|feature$/);
    expect(typeof detail.content).toBe("string");
  });

  it("error response has readStatus missing or unreadable with content empty", () => {
    const detail: WorkItemDocumentDetail = {
      cardId: "test-project:03_IN_PROGRESS:MISSING",
      content: "",
      documentPath: null,
      documentRelativePath: null,
      documentUpdatedAt: null,
      externalId: "",
      folderName: "",
      kind: "feature",
      readError: "No Markdown document found in work item folder.",
      readStatus: "missing",
      stateFolder: "03_IN_PROGRESS",
      stateLabel: "In Progress",
      title: "",
    };

    expect(detail.readStatus).toBe("missing");
    expect(detail.content).toBe("");
    expect(detail.documentPath).toBeNull();
    expect(detail.readError).toBeTruthy();
  });
});
