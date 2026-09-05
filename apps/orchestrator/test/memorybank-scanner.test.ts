import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanMemoryBankFolders, scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";

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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-memorybank-scanner-"));
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

interface TempFixtureOptions {
  projectId?: string;
  rootPath?: string;
}

function createProject(memoryBankPath: string, options?: TempFixtureOptions) {
  return {
    id: options?.projectId ?? "test-project-001",
    memoryBankPath,
    rootPath: options?.rootPath ?? memoryBankPath,
  };
}

function createMemoryBankFixture(root: string) {
  const featuresRoot = resolve(root, "Features");

  for (const folder of defaultStateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  // Helper to create an EPIC folder with EpicDescription.md
  function addEpic(
    epicId: string,
    title: string,
    markdown?: string,
  ) {
    const folderPath = resolve(featuresRoot, "00_EPICS", `${epicId}-${slugify(title)}`);
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
        "## Executive Summary",
        "",
        "Test EPIC description.",
      ].join("\n");

    writeFileSync(resolve(folderPath, "EpicDescription.md"), content, "utf8");
  }

  // Helper to create a FEAT folder with FeatureDescription.md
  function addFeat(
    featId: string,
    title: string,
    stateFolder: string,
    markdown?: string,
    parentEpicId?: string,
  ) {
    const folderPath = resolve(featuresRoot, stateFolder, `${featId}-${slugify(title)}`);
    mkdirSync(folderPath, { recursive: true });

    const lines = [
      `# ${title}`,
      "",
      "| Field | Value |",
      "|-------|-------|",
      `| Feature ID | ${featId} |`,
      "| Status | IN_PROGRESS |",
      "",
    ];

    if (parentEpicId) {
      lines.push(`**Parent Epic**: ${parentEpicId}`, "");
    }

    lines.push(`## Summary`, ``, `Description for ${title}.`);

    const content = markdown ?? lines.join("\n");
    writeFileSync(resolve(folderPath, "FeatureDescription.md"), content, "utf8");
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
// Tests
// ---------------------------------------------------------------------------

describe("scanMemoryBankFolders", () => {
  it("discovers EPIC records from 00_EPICS folder", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-001", "Scanner Foundation");
    addEpic("EPIC-002", "Board Dashboard");

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epics = results.filter((item) => item.card.kind === "epic");

    expect(epics).toHaveLength(2);

    const epic1 = epics.find((e) => e.card.externalId === "EPIC-001");
    expect(epic1).toBeDefined();
    expect(epic1!.card.title).toBe("Scanner Foundation");
    expect(epic1!.card.stateFolder).toBe("00_EPICS");
    expect(epic1!.card.stateLabel).toBe("Epics");
    expect(epic1!.card.documentPath).toContain("EpicDescription.md");
    expect(epic1!.card.kind).toBe("epic");
    expect(epic1!.metadata.kind).toBe("epic");
    expect(epic1!.metadata.stateFolder).toBe("00_EPICS");
  });

  it("discovers FEAT records from configured state folders only", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-001", "Test Epic");
    addFeat("FEAT-001", "Feature Alpha", "01_SUBMITTED");
    addFeat("FEAT-002", "Feature Beta", "03_IN_PROGRESS");
    addFeat("FEAT-003", "Feature Gamma", "04_COMPLETED");

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const features = results.filter((item) => item.card.kind === "feature");

    // Should have 3 features across different state folders
    expect(features).toHaveLength(3);

    const feat1 = features.find((f) => f.card.externalId === "FEAT-001");
    expect(feat1).toBeDefined();
    expect(feat1!.card.title).toBe("Feature Alpha");
    expect(feat1!.card.stateFolder).toBe("01_SUBMITTED");
    expect(feat1!.card.stateLabel).toBe("Submitted");
    expect(feat1!.card.documentPath).toContain("FeatureDescription.md");

    const feat2 = features.find((f) => f.card.externalId === "FEAT-002");
    expect(feat2).toBeDefined();
    expect(feat2!.card.stateFolder).toBe("03_IN_PROGRESS");
    expect(feat2!.card.stateLabel).toBe("In Progress");

    const feat3 = features.find((f) => f.card.externalId === "FEAT-003");
    expect(feat3).toBeDefined();
    expect(feat3!.card.stateFolder).toBe("04_COMPLETED");
  });

  it("summarizes feature changed files and code-review evidence", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat, featuresRoot } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-999", "Evidence Feature", "03_IN_PROGRESS");

    const featureFolder = resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-999-evidence-feature");
    const phasesFolder = resolve(featureFolder, "Phases");
    const codeReviewsFolder = resolve(featureFolder, "code-reviews");

    mkdirSync(phasesFolder, { recursive: true });
    mkdirSync(codeReviewsFolder, { recursive: true });

    writeFileSync(
      resolve(phasesFolder, "phase-6-integration.md"),
      [
        "# Phase 6 Integration",
        "",
        "Status: COMPLETED",
        "",
        "## Files Changed",
        "",
        "- **Created:** `apps/orchestrator/test/feat-999-integration.test.ts`",
        "- **Modified:** `apps/orchestrator/src/index.ts`",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(codeReviewsFolder, "phase-6-code-review-20260703T100000Z.md"),
      [
        "# Phase 6 Code Review - FEAT-999",
        "",
        "**Timestamp:** 2026-07-03T10:00:00Z",
        "**Reviewer:** Pi subagent review",
        "**Phase:** Phase 6 - Integration",
        "**Verdict:** NEEDS_CHANGES",
        "",
        "## Scope Reviewed",
        "",
        "- `apps/orchestrator/src/index.ts`",
        "- `apps/orchestrator/test/feat-999-integration.test.ts`",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(featureFolder, "completion-report.md"),
      [
        "# Complete Feature Report",
        "",
        "## Files Changed",
        "",
        "### Modified",
        "- `packages/shared/src/index.ts`",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const feature = results.find((item) => item.card.externalId === "FEAT-999")?.card;

    expect(feature).toBeDefined();
    expect(feature!.implementationEvidence).not.toBeNull();
    expect(feature!.implementationEvidence!.codeReviews).toHaveLength(1);
    expect(feature!.implementationEvidence!.codeReviews[0]).toMatchObject({
      fileName: "phase-6-code-review-20260703T100000Z.md",
      phaseNumber: 6,
      phaseTitle: "Integration",
      result: "needs_changes",
      reviewedFiles: [
        "apps/orchestrator/src/index.ts",
        "apps/orchestrator/test/feat-999-integration.test.ts",
      ],
    });

    const changedFiles = feature!.implementationEvidence!.changedFiles;
    const indexSource = changedFiles.find((file) => file.path === "apps/orchestrator/src/index.ts");
    const testSource = changedFiles.find(
      (file) => file.path === "apps/orchestrator/test/feat-999-integration.test.ts",
    );
    const sharedSource = changedFiles.find((file) => file.path === "packages/shared/src/index.ts");

    expect(indexSource).toMatchObject({
      phases: [6],
      sources: ["phase", "code-review"],
    });
    expect(indexSource!.reviewReportPaths).toEqual([
      "Features/03_IN_PROGRESS/FEAT-999-evidence-feature/code-reviews/phase-6-code-review-20260703T100000Z.md",
    ]);
    expect(testSource).toMatchObject({
      phases: [6],
      sources: ["phase", "code-review"],
    });
    expect(sharedSource).toMatchObject({
      phases: [],
      sources: ["completion-report"],
    });

    expect(feature!.implementationEvidence!.phaseQualityGates).toEqual([
      expect.objectContaining({
        changedFiles: [
          "apps/orchestrator/src/index.ts",
          "apps/orchestrator/test/feat-999-integration.test.ts",
        ],
        codeFiles: ["apps/orchestrator/src/index.ts"],
        phaseNumber: 6,
        phaseStatus: "COMPLETED",
        testFiles: ["apps/orchestrator/test/feat-999-integration.test.ts"],
        warnings: [],
      }),
    ]);
    expect(feature!.implementationEvidence!.phaseQualityGates[0].gates).toEqual([
      expect.objectContaining({ gate: "tests", status: "satisfied" }),
      expect.objectContaining({ gate: "gherkin_e2e", status: "not_applicable" }),
      expect.objectContaining({ gate: "code_review", status: "satisfied" }),
    ]);
  });

  it("excludes EPIC folder (00_EPICS) from FEAT records", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-001", "Test Epic");
    addFeat("FEAT-001", "Feature One", "01_SUBMITTED");

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    // Only the EPIC folder should produce epic-kind items
    const features = results.filter((item) => item.card.kind === "feature");
    const epics = results.filter((item) => item.card.kind === "epic");

    expect(epics).toHaveLength(1);
    expect(features).toHaveLength(1);
    expect(epics[0].card.stateFolder).toBe("00_EPICS");
    expect(features[0].card.stateFolder).toBe("01_SUBMITTED");
  });

  it("returns empty array when Features root does not exist", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "EmptyMemoryBank");
    mkdirSync(mbPath, { recursive: true });
    // Do NOT create Features/ subdirectory

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(results).toEqual([]);
  });

  it("reports empty EPIC folder separately from scan failure", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    mkdirSync(resolve(mbPath, "Features", "00_EPICS"), { recursive: true });

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scanResult.items).toEqual([]);
    expect(scanResult.sourceIssues).toEqual([]);
    expect(scanResult.scanStatus).toMatchObject({
      epicDocumentCount: 0,
      epicFolderExists: true,
      epicInvalidSourceCount: 0,
      epicScanFailed: false,
      epicValidItemCount: 0,
      message: null,
    });
  });

  it("keeps valid EPIC records when invalid EPIC sources are present", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, featuresRoot } = createMemoryBankFixture(mbPath);
    addEpic("EPIC-001", "Valid Epic");
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-002-empty"), { recursive: true });
    writeFileSync(resolve(featuresRoot, "00_EPICS", "EPIC-002-empty", "EpicDescription.md"), "", "utf8");

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scanResult.items.filter((item) => item.card.kind === "epic")).toHaveLength(1);
    expect(scanResult.items[0].card.externalId).toBe("EPIC-001");
    expect(scanResult.sourceIssues).toHaveLength(1);
    expect(scanResult.sourceIssues[0].folderName).toBe("EPIC-002-empty");
    expect(scanResult.scanStatus.epicDocumentCount).toBe(2);
    expect(scanResult.scanStatus.epicValidItemCount).toBe(1);
    expect(scanResult.scanStatus.epicInvalidSourceCount).toBe(1);
  });

  it("reports EPIC folder read failures separately from empty folders", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(featuresRoot, { recursive: true });
    writeFileSync(resolve(featuresRoot, "00_EPICS"), "not a directory", "utf8");

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scanResult.items).toEqual([]);
    expect(scanResult.sourceIssues).toEqual([]);
    expect(scanResult.scanStatus.epicFolderExists).toBe(true);
    expect(scanResult.scanStatus.epicScanFailed).toBe(true);
    expect(scanResult.scanStatus.message).toContain("ENOTDIR");
  });

  it("skips non-existent state folders gracefully", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "03_IN_PROGRESS"), { recursive: true });

    // 00_EPICS has content
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-001-test"), { recursive: true });
    writeFileSync(resolve(featuresRoot, "00_EPICS", "EPIC-001-test", "EpicDescription.md"), "# EPIC-001 Test", "utf8");

    // 03_IN_PROGRESS has content
    mkdirSync(resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-010-active"), { recursive: true });
    writeFileSync(
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-010-active", "FeatureDescription.md"),
      "# Active Feature",
      "utf8",
    );

    // Other folders (01_SUBMITTED, 02_READY_TO_DEVELOP, 04_COMPLETED, 05_CANCELLED) do not exist

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    // Should find 2 items from the two existing folders
    expect(results).toHaveLength(2);

    const epic = results.find((r) => r.card.kind === "epic");
    expect(epic).toBeDefined();
    expect(epic!.card.externalId).toBe("EPIC-001");

    const feat = results.find((r) => r.card.kind === "feature");
    expect(feat).toBeDefined();
    expect(feat!.card.externalId).toBe("FEAT-010");
  });

  it("includes all required output fields in scanner records", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-005", "Required Fields Epic");
    addFeat("FEAT-020", "Required Fields Feature", "02_READY_TO_DEVELOP");

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(results).toHaveLength(2);

    for (const item of results) {
      // Card fields
      expect(item.card.id).toBeTruthy();
      expect(item.card.externalId).toBeTruthy();
      expect(item.card.kind).toBeTruthy();
      expect(item.card.title).toBeTruthy();
      expect(item.card.stateFolder).toBeTruthy();
      expect(item.card.stateLabel).toBeTruthy();
      expect(item.card.folderPath).toBeTruthy();
      expect(item.card.specMarkdown).toBeTruthy();
      expect(item.card.summary).toBeTruthy();

      // Document path — null when markdown is missing, but with our fixture it's present
      if (item.card.documentPath) {
        expect(item.card.documentRelativePath).toBeTruthy();
        expect(item.card.documentUpdatedAt).toBeTruthy();
      }

      // Metadata fields
      expect(item.metadata.cardKey).toBeTruthy();
      expect(item.metadata.cardKey).toBe(`${item.card.kind}:${item.card.externalId}`);
      expect(item.metadata.kind).toBe(item.card.kind);
      expect(item.metadata.stateFolder).toBe(item.card.stateFolder);
      expect(item.metadata.title).toBe(item.card.title);
      expect(item.metadata.projectId).toBeTruthy();
      expect(item.metadata.documentHash).toBeTruthy();
      expect(item.metadata.documentSize).toBeGreaterThan(0);
    }
  });

  it("handles invalid or partially parseable documents without crashing", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-099-malformed"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-099-corrupted"), { recursive: true });

    // EPIC with no markdown (empty document)
    writeFileSync(
      resolve(featuresRoot, "00_EPICS", "EPIC-099-malformed", "EpicDescription.md"),
      "",
      "utf8",
    );

    // FEAT with just a heading and no front matter
    writeFileSync(
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-099-corrupted", "FeatureDescription.md"),
      "# Corrupted Feature\n\nNo usable metadata.",
      "utf8",
    );

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    // Invalid EPIC sources become safe issues; partially parseable FEATs still scan without throwing.
    expect(scanResult.items).toHaveLength(1);
    expect(scanResult.sourceIssues).toHaveLength(1);
    expect(scanResult.scanStatus.epicDocumentCount).toBe(1);
    expect(scanResult.scanStatus.epicInvalidSourceCount).toBe(1);
    expect(scanResult.scanStatus.epicValidItemCount).toBe(0);

    const issue = scanResult.sourceIssues[0];
    expect(issue.sourceType).toBe("epic");
    expect(issue.reason).toBe("empty-document");
    expect(issue.sourcePath).toContain("EpicDescription.md");

    const feat = scanResult.items.find((r) => r.card.kind === "feature");
    expect(feat).toBeDefined();
    expect(feat!.card.externalId).toBe("FEAT-099");
    expect(feat!.card.documentPath).toBeTruthy(); // path preserved
    expect(feat!.card.specMarkdown).toBe("# Corrupted Feature\n\nNo usable metadata.");
  });

  it("preserves source-path visibility on invalid partial EPIC documents", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-100-bare"), { recursive: true });
    // Only markdown doc is a minimal file with no EPIC ID in the document.
    writeFileSync(
      resolve(featuresRoot, "00_EPICS", "EPIC-100-bare", "EpicDescription.md"),
      "# Bare Epic",
      "utf8",
    );

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scanResult.items).toHaveLength(0);
    expect(scanResult.sourceIssues).toHaveLength(1);
    expect(scanResult.sourceIssues[0].reason).toBe("missing-required-fields");
    expect(scanResult.sourceIssues[0].sourcePath).toContain("EpicDescription.md");
    expect(scanResult.sourceIssues[0].sourceRelativePath).toContain("EpicDescription.md");
    expect(scanResult.sourceIssues[0].folderPath).toContain("EPIC-100-bare");
  });

  it("distinguishes EPIC records from FEAT records by kind", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-010", "Epic Only Title");
    addFeat("FEAT-030", "Feat Only Title", "01_SUBMITTED");

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epic = results.find((r) => r.card.kind === "epic");
    const feat = results.find((r) => r.card.kind === "feature");

    expect(epic).toBeDefined();
    expect(feat).toBeDefined();
    expect(epic!.card.kind).toBe("epic");
    expect(feat!.card.kind).toBe("feature");
    expect(epic!.metadata.kind).toBe("epic");
    expect(feat!.metadata.kind).toBe("feature");
  });

  it("applies correct state labels based on state folder", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat, addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-020", "Epic Classic");
    addFeat("FEAT-101", "Submitted Feat", "01_SUBMITTED");
    addFeat("FEAT-102", "Ready Feat", "02_READY_TO_DEVELOP");
    addFeat("FEAT-103", "In Progress Feat", "03_IN_PROGRESS");
    addFeat("FEAT-104", "Completed Feat", "04_COMPLETED");
    addFeat("FEAT-105", "Cancelled Feat", "05_CANCELLED");

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const assertLabel = (externalId: string, expectedLabel: string) => {
      const item = results.find((r) => r.card.externalId === externalId);
      expect(item).toBeDefined();
      expect(item!.card.stateLabel).toBe(expectedLabel);
    };

    assertLabel("EPIC-020", "Epics");
    assertLabel("FEAT-101", "Submitted");
    assertLabel("FEAT-102", "Ready To Develop");
    assertLabel("FEAT-103", "In Progress");
    assertLabel("FEAT-104", "Completed");
    assertLabel("FEAT-105", "Cancelled");
  });

  it("does not mutate MemoryBank files during scanning (read-only contract)", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-030", "Read Only Epic", "# Original Content\n\nDo not touch.");

    const featuresRoot = resolve(mbPath, "Features");
    const epicDocPath = resolve(featuresRoot, "00_EPICS", "EPIC-030-read-only-epic", "EpicDescription.md");
    const originalContent = "# Original Content\n\nDo not touch.";

    // Verify original content before scan
    expect(readFileSync(epicDocPath, "utf8")).toBe(originalContent);

    const project = createProject(mbPath);
    scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    // Verify content unchanged after scan
    expect(readFileSync(epicDocPath, "utf8")).toBe(originalContent);
  });

  it("scans only folders whose names match the configured state folders", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-040-epic-only"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-040-active"), { recursive: true });

    // Create a non-state folder that should not be scanned
    mkdirSync(resolve(featuresRoot, "zz_archive", "FEAT-999-archived"), { recursive: true });
    writeFileSync(resolve(featuresRoot, "00_EPICS", "EPIC-040-epic-only", "EpicDescription.md"), "# EPIC-040", "utf8");
    writeFileSync(
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-040-active", "FeatureDescription.md"),
      "# FEAT-040",
      "utf8",
    );
    writeFileSync(
      resolve(featuresRoot, "zz_archive", "FEAT-999-archived", "FeatureDescription.md"),
      "# Archived",
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    // Should only find the two items from configured state folders
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.card.externalId === "EPIC-040")).toBeDefined();
    expect(results.find((r) => r.card.externalId === "FEAT-040")).toBeDefined();
    expect(results.find((r) => r.card.externalId === "FEAT-999")).toBeUndefined();
  });

  it("handles state folders with only directory entries (no Markdown documents)", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });

    // EPIC folder has a subdirectory but no markdown
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-050-empty"), { recursive: true });

    // 01_SUBMITTED has a subdirectory with an empty markdown file
    mkdirSync(resolve(featuresRoot, "01_SUBMITTED", "FEAT-050-nodoc"), { recursive: true });
    writeFileSync(
      resolve(featuresRoot, "01_SUBMITTED", "FEAT-050-nodoc", "notes.txt"),
      "Not a markdown file",
      "utf8",
    );

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    // EPIC-050: no markdown → invalid source issue with unavailable source path.
    expect(scanResult.sourceIssues).toHaveLength(2);

    const epicIssue = scanResult.sourceIssues.find((i) => i.folderName === "EPIC-050-empty");
    expect(epicIssue).toBeDefined();
    expect(epicIssue!.reason).toBe("missing-document");
    expect(epicIssue!.sourcePath).toBeNull();
    expect(epicIssue!.sourceType).toBe("epic");
    expect(scanResult.scanStatus.epicDocumentCount).toBe(0);
    expect(scanResult.scanStatus.epicInvalidSourceCount).toBe(1);

    // FEAT-050: only has notes.txt, no .md → FEAT source issue with missing-document.
    const featIssue = scanResult.sourceIssues.find((i) => i.folderName === "FEAT-050-nodoc");
    expect(featIssue).toBeDefined();
    expect(featIssue!.reason).toBe("missing-document");
    expect(featIssue!.sourceType).toBe("feature");
    expect(featIssue!.sourcePath).toBeNull();

    // FEAT-050 is excluded from scanned items because it has a source issue.
    const feat = scanResult.items.find((r) => r.card.externalId === "FEAT-050");
    expect(feat).toBeUndefined();
  });

  it("handles folder names that do not match the expected ID pattern gracefully", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const featuresRoot = resolve(mbPath, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS", "unrecognized-folder"), { recursive: true });
    writeFileSync(
      resolve(featuresRoot, "00_EPICS", "unrecognized-folder", "EpicDescription.md"),
      "# Epic Without Standard ID",
      "utf8",
    );

    const project = createProject(mbPath);
    const scanResult = scanMemoryBankFoldersWithIssues(project, defaultStateFolders, defaultStateFolderLabels);

    expect(scanResult.items).toHaveLength(0);
    expect(scanResult.sourceIssues).toHaveLength(1);
    expect(scanResult.sourceIssues[0].folderName).toBe("unrecognized-folder");
    expect(scanResult.sourceIssues[0].reason).toBe("missing-required-fields");
    expect(scanResult.sourceIssues[0].sourcePath).toContain("EpicDescription.md");
  });

  it("always sets documentRelativePath relative to project root", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-060", "Relative Path Test");

    // Use a rootPath that is the parent of mbPath to test relative path computation
    const project = createProject(mbPath, { rootPath: resolve(root) });
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epic = results.find((r) => r.card.externalId === "EPIC-060");
    expect(epic).toBeDefined();
    expect(epic!.card.documentRelativePath).toBeTruthy();
    expect(epic!.card.documentRelativePath).toContain("MemoryBank/Features/00_EPICS");
    expect(epic!.card.documentRelativePath).toContain("EpicDescription.md");
  });

  it("parses numbered phase metadata from phase files and FeatureTasks.md", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-200", "Phase Metadata", "03_IN_PROGRESS");

    const featureFolder = resolve(
      mbPath,
      "Features",
      "03_IN_PROGRESS",
      "FEAT-200-phase-metadata",
    );
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });

    writeFileSync(
      resolve(featureFolder, "FeatureTasks.md"),
      [
        "# FEAT-200 Tasks",
        "",
        "| # | Phase | Status |",
        "|---|-------|--------|",
        "| 0 | Health Check | Completed |",
        "| 1 | Planning and Analysis | AWAITING_REVIEW |",
        "| 2 | Data Layer | Not Started |",
        "",
        "## Implementation Timing Summary",
        "",
        "| Phase | Estimated Human Time | Estimated AI Time |",
        "| --- | --- | --- |",
        "| 0 — Health Check | 30m | 15m |",
        "| 1 — Planning and Analysis | 1h | 30m |",
        "| 2 — Data Layer | 2h | 30m |",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(phasesFolder, "phase-2-data-layer.md"),
      [
        "**Status:** IN_PROGRESS",
        "",
        "# Phase 2 - Data Layer",
        "",
        "**Recommended Agent:** Node/TypeScript Developer Agent",
        "**Recommended Model:** `deepseek-v4-flash`",
        "**Estimated Human Time:** 2h",
        "**Estimated AI Time:** 30m",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(phasesFolder, "phase-0-health-check.md"),
      ["**Status:** BLOCKED", "", "# Phase 0 - Health Check"].join("\n"),
      "utf8",
    );
    writeFileSync(
      resolve(phasesFolder, "phase-1-planning-analysis.md"),
      ["**Status:** IN_PROGRESS", "", "# Phase 1 - Planning and Analysis"].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const feat = results.find((r) => r.card.externalId === "FEAT-200");

    expect(feat).toBeDefined();
    expect(feat!.card.phases.map((phase) => phase.number)).toEqual([0, 1, 2]);
    expect(feat!.card.phases.map((phase) => phase.status)).toEqual([
      "BLOCKED",
      "IN_PROGRESS",
      "IN_PROGRESS",
    ]);
    expect(feat!.card.phases.map((phase) => phase.title)).toEqual([
      "Health Check",
      "Planning and Analysis",
      "Data Layer",
    ]);

    const dataLayer = feat!.card.phases[2];
    expect(dataLayer.recommendedAgent).toBe("Node/TypeScript Developer Agent");
    expect(dataLayer.recommendedModel).toBe("deepseek-v4-flash");
    expect(dataLayer.estimatedHumanTime).toBe("2h");
    expect(dataLayer.estimatedAiTime).toBe("30m");
    // Phase-level values take precedence, while the post-process timing table
    // supplies a resilient display fallback for phase documents not yet enriched.
    expect(feat!.card.phases[0].estimatedHumanTime).toBe("30m");
    expect(feat!.card.phases[0].estimatedAiTime).toBe("15m");
  });

  it("attributes paths in a phase-owned task-ledger evidence section to that phase", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-201", "Durable Evidence", "03_IN_PROGRESS");
    const featureFolder = resolve(mbPath, "Features", "03_IN_PROGRESS", "FEAT-201-durable-evidence");
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });
    writeFileSync(resolve(featureFolder, "FeatureTasks.md"), [
      "## Phase 4 Active Implementation Evidence",
      "",
      "- `src/runtime/adapter.ts` was changed.",
      "- `test/runtime/adapter.test.ts` covers the boundary.",
    ].join("\n"));
    writeFileSync(resolve(phasesFolder, "phase-4-runtime.md"), "**Status:** IN_PROGRESS\n\n# Phase 4 - Runtime\n");

    const project = createProject(mbPath);
    const feature = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels)
      .find((result) => result.card.externalId === "FEAT-201")!.card;
    const source = feature.implementationEvidence!.changedFiles.find((file) => file.path === "src/runtime/adapter.ts");

    expect(source).toMatchObject({ phases: [4], sources: ["task-ledger"] });
  });

  it("uses project.memoryBankPath as canonical features scan root", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-070", "Canonical Root Test");

    // Pass a project with a different rootPath but the same memoryBankPath
    // to prove the scanner resolves memoryBankPath, not rootPath
    const project = createProject(mbPath, { rootPath: resolve(root, "different-root") });
    mkdirSync(project.rootPath, { recursive: true });

    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    const epic = results.find((r) => r.card.externalId === "EPIC-070");
    expect(epic).toBeDefined();
    expect(epic!.card.kind).toBe("epic");
    expect(epic!.card.documentPath).toContain("MemoryBank/Features/00_EPICS");
  });

  it("returns deterministic results given the same MemoryBank path", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

    addEpic("EPIC-080", "Deterministic Epic");
    addFeat("FEAT-080", "Deterministic Feat", "02_READY_TO_DEVELOP");

    const project = createProject(mbPath);

    // Scan twice and verify identical results
    const firstScan = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const secondScan = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

    expect(firstScan).toHaveLength(secondScan.length);

    for (let i = 0; i < firstScan.length; i++) {
      expect(firstScan[i].card.externalId).toBe(secondScan[i].card.externalId);
      expect(firstScan[i].card.title).toBe(secondScan[i].card.title);
      expect(firstScan[i].card.kind).toBe(secondScan[i].card.kind);
      expect(firstScan[i].card.stateFolder).toBe(secondScan[i].card.stateFolder);
      // Phases and summary should also match (summary is content-derived)
      expect(firstScan[i].card.summary).toBe(secondScan[i].card.summary);
    }
  });

  it("falls back to phase Markdown when FeatureTasks.md has no phase status", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-201", "Heading Phase", "03_IN_PROGRESS");

    const featureFolder = resolve(
      mbPath,
      "Features",
      "03_IN_PROGRESS",
      "FEAT-201-heading-phase",
    );
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });

    writeFileSync(
      resolve(phasesFolder, "planning-without-number.md"),
      ["# Phase 9 - Final Checkpoint", "", "Current Status: `CHECKPOINT_IN_PROGRESS`"].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const feat = results.find((r) => r.card.externalId === "FEAT-201");

    expect(feat).toBeDefined();
    expect(feat!.card.phases).toHaveLength(1);
    expect(feat!.card.phases[0].number).toBe(9);
    expect(feat!.card.phases[0].status).toBe("CHECKPOINT_IN_PROGRESS");
    expect(feat!.card.phases[0].title).toBe("Final Checkpoint");
  });

  it("infers a completed phase from resolved Hepha task state and quality gates", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-202", "Evidence Phase", "03_IN_PROGRESS");

    const featureFolder = resolve(
      mbPath,
      "Features",
      "03_IN_PROGRESS",
      "FEAT-202-evidence-phase",
    );
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });

    writeFileSync(
      resolve(phasesFolder, "phase-0-health-check.md"),
      [
        "# Phase 0 — Health Check",
        "",
        "## Quality Gate Evidence",
        "",
        "| Gate | Decision | Evidence / Justification |",
        "| --- | --- | --- |",
        "| Changed files | not applicable | Health-check only. |",
        "| Tests | not applicable | No executable behavior changed. |",
        "| Gherkin/Playwright E2E | not applicable | No browser behavior changed. |",
        "| Code review | not applicable | No production code changed. |",
        "",
        "## Hepha Task State",
        "",
        "| Task ID | Task | State | Started | Completed | Duration |",
        "| --- | --- | --- | --- | --- | --- |",
        "| phase-0.health-check | Confirm baseline. | COMPLETED | - | 2026-07-05T06:56:39.433Z | - |",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const feat = results.find((r) => r.card.externalId === "FEAT-202");

    expect(feat).toBeDefined();
    expect(feat!.card.phases).toHaveLength(1);
    expect(feat!.card.phases[0].status).toBe("COMPLETED");
  });

  it("infers a completed phase from completed concrete tasks and resolved quality gates", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-204", "Checklist Evidence Phase", "03_IN_PROGRESS");

    const featureFolder = resolve(
      mbPath,
      "Features",
      "03_IN_PROGRESS",
      "FEAT-204-checklist-evidence-phase",
    );
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });

    writeFileSync(
      resolve(phasesFolder, "phase-1-planning-analysis.md"),
      [
        "# Phase 1 — Planning Analysis",
        "",
        "## Concrete Tasks",
        "",
        "- [x] Create the planning report.",
        "- [x] Map acceptance criteria.",
        "",
        "## Quality Gate Evidence",
        "",
        "| Gate | Decision | Evidence / Justification |",
        "| --- | --- | --- |",
        "| Changed files | recorded | `planning-analysis-report.md` created. |",
        "| Tests | not applicable | Planning-only phase. |",
        "| Gherkin/Playwright E2E | not applicable | No browser behavior changed. |",
        "| Code review | not applicable | No production code changed. |",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const feat = results.find((r) => r.card.externalId === "FEAT-204");

    expect(feat).toBeDefined();
    expect(feat!.card.phases).toHaveLength(1);
    expect(feat!.card.phases[0]).toMatchObject({
      status: "COMPLETED",
      title: "Planning Analysis",
    });
  });

  it("does not infer a completed phase while quality gates are missing", () => {
    const root = createTempRoot();
    const mbPath = resolve(root, "MemoryBank");
    const { addFeat } = createMemoryBankFixture(mbPath);

    addFeat("FEAT-203", "Incomplete Evidence Phase", "03_IN_PROGRESS");

    const featureFolder = resolve(
      mbPath,
      "Features",
      "03_IN_PROGRESS",
      "FEAT-203-incomplete-evidence-phase",
    );
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });

    writeFileSync(
      resolve(phasesFolder, "phase-2-data-layer.md"),
      [
        "# Phase 2 — Data Layer",
        "",
        "## Quality Gate Evidence",
        "",
        "| Gate | Decision | Evidence / Justification |",
        "| --- | --- | --- |",
        "| Changed files | recorded | `apps/orchestrator/src/index.ts` changed. |",
        "| Tests | missing | Implementation worker has not recorded tests yet. |",
        "| Gherkin/Playwright E2E | not applicable | No browser behavior changed. |",
        "| Code review | missing | Review has not run yet. |",
        "",
        "## Hepha Task State",
        "",
        "| Task ID | Task | State | Started | Completed | Duration |",
        "| --- | --- | --- | --- | --- | --- |",
        "| phase-2.data-layer | Update data layer. | COMPLETED | - | 2026-07-05T06:56:39.433Z | - |",
      ].join("\n"),
      "utf8",
    );

    const project = createProject(mbPath);
    const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
    const feat = results.find((r) => r.card.externalId === "FEAT-203");

    expect(feat).toBeDefined();
    expect(feat!.card.phases).toHaveLength(1);
    expect(feat!.card.phases[0].status).toBe("Unknown");
  });

  describe("FEAT source issues", () => {
    it("creates source issue for FEAT with missing document", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });

      // FEAT folder with no markdown files
      mkdirSync(resolve(featuresRoot, "01_SUBMITTED", "FEAT-100-missing-doc"), { recursive: true });

      const project = createProject(mbPath);
      const scanResult = scanMemoryBankFoldersWithIssues(
        project,
        defaultStateFolders,
        defaultStateFolderLabels,
      );

      const featIssue = scanResult.sourceIssues.find(
        (i) => i.folderName === "FEAT-100-missing-doc",
      );
      expect(featIssue).toBeDefined();
      expect(featIssue!.reason).toBe("missing-document");
      expect(featIssue!.sourceType).toBe("feature");
      expect(featIssue!.sourcePath).toBeNull();
      expect(featIssue!.message).toContain("FEAT folder does not contain");

      // FEAT is excluded from valid scanned items
      const feat = scanResult.items.find((r) => r.card.externalId === "FEAT-100");
      expect(feat).toBeUndefined();
    });

    it("creates source issue for FEAT with empty document", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });

      const folderPath = resolve(featuresRoot, "01_SUBMITTED", "FEAT-110-empty-doc");
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(resolve(folderPath, "FeatureDescription.md"), "", "utf8");

      const project = createProject(mbPath);
      const scanResult = scanMemoryBankFoldersWithIssues(
        project,
        defaultStateFolders,
        defaultStateFolderLabels,
      );

      const featIssue = scanResult.sourceIssues.find(
        (i) => i.folderName === "FEAT-110-empty-doc",
      );
      expect(featIssue).toBeDefined();
      expect(featIssue!.reason).toBe("empty-document");
      expect(featIssue!.sourceType).toBe("feature");
      expect(featIssue!.sourcePath).toContain("FeatureDescription.md");
      expect(featIssue!.message).toContain("FEAT source document is empty");

      // FEAT is excluded from valid scanned items
      const feat = scanResult.items.find((r) => r.card.externalId === "FEAT-110");
      expect(feat).toBeUndefined();
    });

    it("creates source issue for FEAT with no FEAT ID pattern", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });

      const folderPath = resolve(featuresRoot, "01_SUBMITTED", "unknown-feature-folder");
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        resolve(folderPath, "FeatureDescription.md"),
        [
          "# Untitled",
          "",
          "## Summary",
          "",
          "Some description without a proper FEAT ID.",
        ].join("\n"),
        "utf8",
      );

      const project = createProject(mbPath);
      const scanResult = scanMemoryBankFoldersWithIssues(
        project,
        defaultStateFolders,
        defaultStateFolderLabels,
      );

      const featIssue = scanResult.sourceIssues.find(
        (i) => i.folderName === "unknown-feature-folder",
      );
      expect(featIssue).toBeDefined();
      expect(featIssue!.reason).toBe("missing-required-fields");
      expect(featIssue!.sourceType).toBe("feature");
      expect(featIssue!.message).toContain("FEAT source is missing required");

      // Item is excluded from valid scanned items
      const feat = scanResult.items.find(
        (r) => r.card.folderName === "unknown-feature-folder",
      );
      expect(feat).toBeUndefined();
    });

    it("keeps valid FEATs when another FEAT source is invalid", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });
      mkdirSync(resolve(featuresRoot, "02_READY_TO_DEVELOP"), { recursive: true });

      // Invalid FEAT: empty document
      const invalidFolder = resolve(featuresRoot, "01_SUBMITTED", "FEAT-120-invalid");
      mkdirSync(invalidFolder, { recursive: true });
      writeFileSync(resolve(invalidFolder, "FeatureDescription.md"), "", "utf8");

      // Valid FEAT: proper document
      const validFolder = resolve(featuresRoot, "02_READY_TO_DEVELOP", "FEAT-121-valid");
      mkdirSync(validFolder, { recursive: true });
      writeFileSync(
        resolve(validFolder, "FeatureDescription.md"),
        [
          "# Valid FEAT",
          "",
          "| Field | Value |",
          "|-------|-------|",
          "| Feature ID | FEAT-121 |",
          "| Status | NOT_STARTED |",
          "",
          "**Parent Epic**: EPIC-001",
          "",
          "## Summary",
          "",
          "A valid FEAT description.",
        ].join("\n"),
        "utf8",
      );

      const project = createProject(mbPath);
      const scanResult = scanMemoryBankFoldersWithIssues(
        project,
        defaultStateFolders,
        defaultStateFolderLabels,
      );

      // Invalid FEAT creates a source issue
      const featIssue = scanResult.sourceIssues.find(
        (i) => i.folderName === "FEAT-120-invalid",
      );
      expect(featIssue).toBeDefined();
      expect(featIssue!.reason).toBe("empty-document");

      // Valid FEAT is still scanned normally
      const validFeat = scanResult.items.find((r) => r.card.externalId === "FEAT-121");
      expect(validFeat).toBeDefined();
      expect(validFeat!.card.title).toBe("Valid FEAT");
      expect(validFeat!.card.stateFolder).toBe("02_READY_TO_DEVELOP");

      // Invalid FEAT is NOT in scanned items
      const invalidFeat = scanResult.items.find((r) => r.card.externalId === "FEAT-120");
      expect(invalidFeat).toBeUndefined();
    });
  });

  // ── FEAT-007 Phase 2: Data-layer freshness and no-aggregation contracts ──

  describe("FEAT-007 data-layer: validation count freshness", () => {
    it("starts with zero validation count when no markers exist", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic("EPIC-701", "Validity Epic");
      addFeat("FEAT-701", "Fresh Count Feat", "02_READY_TO_DEVELOP");

      const project = createProject(mbPath);
      const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const epic = results.find((r) => r.card.externalId === "EPIC-701");
      const feat = results.find((r) => r.card.externalId === "FEAT-701");

      expect(epic).toBeDefined();
      expect(feat).toBeDefined();
      expect(epic!.card.validation.needsValidationCount).toBe(0);
      expect(feat!.card.validation.needsValidationCount).toBe(0);
    });

    it("reflects added validation markers after backing Markdown edit and rescan", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic("EPIC-702", "Freshness Epic");
      addFeat("FEAT-702", "Freshness Feat", "02_READY_TO_DEVELOP");

      const project = createProject(mbPath);

      // Initial scan: no markers
      const results1 = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
      const feat1 = results1.find((r) => r.card.externalId === "FEAT-702");
      expect(feat1).toBeDefined();
      expect(feat1!.card.validation.needsValidationCount).toBe(0);

      // Edit the backing Markdown to add a validation marker
      const featFolder = resolve(
        featuresRoot,
        "02_READY_TO_DEVELOP",
        "FEAT-702-freshness-feat",
      );
      const docPath = resolve(featFolder, "FeatureDescription.md");
      writeFileSync(docPath, readFileSync(docPath, "utf8") + "\n- Decision [NEEDS VALIDATION]\n", "utf8");

      // Rescan: count should reflect the edit
      const results2 = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
      const feat2 = results2.find((r) => r.card.externalId === "FEAT-702");
      expect(feat2).toBeDefined();
      expect(feat2!.card.validation.needsValidationCount).toBe(1);

      // EPIC count remains zero (no markers added to EPIC document)
      const epic2 = results2.find((r) => r.card.externalId === "EPIC-702");
      expect(epic2).toBeDefined();
      expect(epic2!.card.validation.needsValidationCount).toBe(0);
    });

    it("reduces count when validation markers are removed from backing Markdown", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      const { addFeat } = createMemoryBankFixture(mbPath);

      addFeat("FEAT-703", "Removal Feat", "02_READY_TO_DEVELOP");

      const featFolder = resolve(
        featuresRoot,
        "02_READY_TO_DEVELOP",
        "FEAT-703-removal-feat",
      );
      const docPath = resolve(featFolder, "FeatureDescription.md");

      // Add markers, then scan to confirm
      writeFileSync(
        docPath,
        readFileSync(docPath, "utf8") +
          "\n- Open [NEEDS VALIDATION]\n- Another [NEEDS VALIDATION]\n",
        "utf8",
      );

      const project = createProject(mbPath);
      const results1 = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
      const feat1 = results1.find((r) => r.card.externalId === "FEAT-703");
      expect(feat1).toBeDefined();
      expect(feat1!.card.validation.needsValidationCount).toBe(2);

      // Remove the markers by rewriting without them
      writeFileSync(
        docPath,
        readFileSync(docPath, "utf8").replace(/\[NEEDS VALIDATION\]/gi, "Resolved"),
        "utf8",
      );

      const results2 = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
      const feat2 = results2.find((r) => r.card.externalId === "FEAT-703");
      expect(feat2).toBeDefined();
      expect(feat2!.card.validation.needsValidationCount).toBe(0);
    });

    it("counts change deterministically across repeated scans of same content", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic("EPIC-704", "Deterministic Epic");
      addFeat("FEAT-704", "Deterministic Feat", "02_READY_TO_DEVELOP");

      const project = createProject(mbPath);

      for (let i = 0; i < 3; i++) {
        const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
        const epic = results.find((r) => r.card.externalId === "EPIC-704");
        const feat = results.find((r) => r.card.externalId === "FEAT-704");
        expect(epic).toBeDefined();
        expect(feat).toBeDefined();
        expect(epic!.card.validation.needsValidationCount).toBe(0);
        expect(feat!.card.validation.needsValidationCount).toBe(0);
      }
    });
  });

  describe("FEAT-007 data-layer: no child-document aggregation", () => {
    it("EPIC validation count does not include markers from linked FEATs", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      // EPIC with no [NEEDS VALIDATION] in its own document
      addEpic(
        "EPIC-710",
        "No Aggregation Epic",
        [
          "# No Aggregation Epic",
          "",
          "| Field | Value |",
          "|-------|-------|",
          "| Epic ID | EPIC-710 |",
          "| State | InProgress |",
          "",
          "| Feature ID | Title |",
          "|------------|-------|",
          "| FEAT-711 | Child Feat |",
          "| FEAT-712 | Another Child |",
          "",
          "## Summary",
          "",
          "No validation markers here.",
        ].join("\n"),
      );

      // Linked FEAT with markers
      addFeat(
        "FEAT-711",
        "Child Feat",
        "01_SUBMITTED",
        "# Child Feat\n\n- Open topic [NEEDS VALIDATION]\n- Another [NEEDS VALIDATION]\n",
        "EPIC-710",
      );

      // Linked FEAT without markers
      addFeat("FEAT-712", "Another Child", "01_SUBMITTED");

      const project = createProject(mbPath);
      const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const epic = results.find((r) => r.card.externalId === "EPIC-710");
      const feat711 = results.find((r) => r.card.externalId === "FEAT-711");
      const feat712 = results.find((r) => r.card.externalId === "FEAT-712");

      expect(epic).toBeDefined();
      expect(feat711).toBeDefined();
      expect(feat712).toBeDefined();

      // EPIC count is based on EPIC document only — should be 0
      expect(epic!.card.validation.needsValidationCount).toBe(0);

      // FEAT-711 has 2 markers in its own document
      expect(feat711!.card.validation.needsValidationCount).toBe(2);

      // FEAT-712 has 0 markers
      expect(feat712!.card.validation.needsValidationCount).toBe(0);
    });
  });

  describe("FEAT-007 data-layer: source-derived relationship IDs", () => {
    it("extracts EPIC child FEAT IDs from current EPIC Markdown table", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic(
        "EPIC-720",
        "Relationship Epic",
        [
          "# Relationship Epic",
          "",
          "| Field | Value |",
          "|-------|-------|",
          "| Epic ID | EPIC-720 |",
          "| State | InProgress |",
          "",
          "| Feature ID | Title | Status |",
          "|------------|-------|--------|",
          "| FEAT-721 | First Child | IN_PROGRESS |",
          "| FEAT-722 | Second Child | COMPLETED |",
          "",
          "## Summary",
          "",
          "Children are listed in the feature table.",
        ].join("\n"),
      );

      addFeat("FEAT-721", "First Child", "03_IN_PROGRESS");
      addFeat("FEAT-722", "Second Child", "04_COMPLETED");

      const project = createProject(mbPath);
      const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const epic = results.find((r) => r.card.externalId === "EPIC-720");
      expect(epic).toBeDefined();

      // ID set derived from current Markdown table
      expect(epic!.card.linkedFeatureIds).toContain("FEAT-721");
      expect(epic!.card.linkedFeatureIds).toContain("FEAT-722");

      // linkedFeatureIds is sorted and contains only current file IDs
      expect(epic!.card.linkedFeatureIds).toEqual(["FEAT-721", "FEAT-722"]);
    });

    it("extracts FEAT parent EPIC IDs from current FEAT Markdown", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic("EPIC-730", "Parent Epic");

      addFeat(
        "FEAT-731",
        "Child Feat",
        "02_READY_TO_DEVELOP",
        undefined,
        "EPIC-730",
      );

      const project = createProject(mbPath);
      const results = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      const feat = results.find((r) => r.card.externalId === "FEAT-731");
      expect(feat).toBeDefined();

      // Parent EPIC ID extracted from FEAT Markdown
      expect(feat!.card.linkedEpicIds).toContain("EPIC-730");
    });

    it("updates relationship IDs after external edit and rescan", () => {
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic(
        "EPIC-740",
        "Dynamic Epic",
        [
          "# Dynamic Epic",
          "",
          "| Field | Value |",
          "|-------|-------|",
          "| Epic ID | EPIC-740 |",
          "| State | InProgress |",
          "",
          "| Feature ID | Title | Status |",
          "|------------|-------|--------|",
          "| FEAT-741 | Original Child | IN_PROGRESS |",
          "",
          "## Summary",
          "",
          "One child only initially.",
        ].join("\n"),
      );

      addFeat("FEAT-741", "Original Child", "03_IN_PROGRESS");

      const project = createProject(mbPath);

      // First scan: one child
      const results1 = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
      const epic1 = results1.find((r) => r.card.externalId === "EPIC-740");
      expect(epic1).toBeDefined();
      expect(epic1!.card.linkedFeatureIds).toEqual(["FEAT-741"]);

      // Edit EPIC Markdown to add a second child
      const epicFolder = resolve(featuresRoot, "00_EPICS", "EPIC-740-dynamic-epic");
      const epicDocPath = resolve(epicFolder, "EpicDescription.md");
      writeFileSync(
        epicDocPath,
        readFileSync(epicDocPath, "utf8") + "\n| FEAT-742 | Added Child | SUBMITTED |\n",
        "utf8",
      );

      // Second scan: two children
      const results2 = scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);
      const epic2 = results2.find((r) => r.card.externalId === "EPIC-740");
      expect(epic2).toBeDefined();
      expect(epic2!.card.linkedFeatureIds).toEqual(["FEAT-741", "FEAT-742"]);
    });
  });

  describe("FEAT-007 data-layer: read-only scanner contract", () => {
    it("does not write, modify, or delete any MemoryBank file during scanning", () => {
      // This is a companion to the existing "does not mutate MemoryBank files during scanning" test
      // that explicitly checks for no file creation in addition to no file modification.
      const root = createTempRoot();
      const mbPath = resolve(root, "MemoryBank");
      const featuresRoot = resolve(mbPath, "Features");
      const { addEpic, addFeat } = createMemoryBankFixture(mbPath);

      addEpic("EPIC-750", "Read Only Epic");
      addFeat("FEAT-751", "Read Only Feat", "02_READY_TO_DEVELOP");

      // Enumerate all files before scan
      const filesBefore = collectFiles(featuresRoot);

      const project = createProject(mbPath);
      scanMemoryBankFolders(project, defaultStateFolders, defaultStateFolderLabels);

      // Enumerate all files after scan
      const filesAfter = collectFiles(featuresRoot);

      // Same file set — no files created or deleted
      expect(filesAfter.sort()).toEqual(filesBefore.sort());

      // Also verify no content changes on known documents
      for (const filePath of filesBefore) {
        const beforeContent = readFileSync(filePath, "utf8");
        const afterContent = readFileSync(filePath, "utf8");
        expect(afterContent).toBe(beforeContent);
      }
    });
  });
});

function collectFiles(dir: string): string[] {
  const entries: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const { isDirectory, isFile } = (() => {
      try {
        const stats = statSync(current);
        return { isDirectory: stats.isDirectory(), isFile: stats.isFile() };
      } catch {
        return { isDirectory: false, isFile: false };
      }
    })();
    if (isDirectory) {
      for (const entry of readdirSync(current)) {
        stack.push(resolve(current, entry));
      }
    } else if (isFile) {
      entries.push(current);
    }
  }
  return entries;
}
