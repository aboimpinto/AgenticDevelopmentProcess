// Behavior suite: epic lifecycle.
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync, readFileSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEpicBoardModel, buildFeatureBoardModel } from "@hepha/shared";
import { scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
import { toWorkItemListResponse } from "../src/projects/work-item-list-response.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { renderSubmittedEpicDocument, normalizeSubmitEpicInput } from "../src/epic-submission.js";
import { renderSubmittedFeatureDocument } from "../src/feature-extraction.js";
import { deriveEpicStateFromFeatureStateFolders, upsertEpicState, extractEpicState } from "../src/epic-state/lifecycle-state.js";
import { extractEpicChildFeatureIds, extractFeatureParentEpicIds } from "../src/work-item-links.js";
import type { ScannedMemoryBankResult } from "../src/memorybank-scanner.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

const stateFolders = [
  "00_EPICS",
  "01_SUBMITTED",
  "02_READY_TO_DEVELOP",
  "03_IN_PROGRESS",
  "04_COMPLETED",
  "05_CANCELLED",
] as const;

const stateFolderLabels: Record<string, string> = {
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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-008-int-"));
  tempRoots.push(root);
  const memoryBankPath = resolve(root, "MemoryBank");
  const featuresRoot = resolve(memoryBankPath, "Features");

  for (const folder of stateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  writeFileSync(resolve(featuresRoot, "NEXT_FEATURE_ID.txt"), "1\n", "utf8");

  const project: StoredProject = {
    createdAt: "2026-07-01T00:00:00.000Z",
    defaultBranch: "master",
    id: "project-feat-008",
    memoryBankPath,
    name: "FEAT-008 Integration",
    rootPath: root,
    updatedAt: "2026-07-01T00:00:00.000Z",
  };

  return { featuresRoot, memoryBankPath, project, root };
}

function scan(project: StoredProject) {
  return scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
}

function toResponse(project: StoredProject, scanResult: ScannedMemoryBankResult, scannedAt: string) {
  return toWorkItemListResponse(project, {
    items: scanResult.items.map((item) => item.card),
    scanStatus: scanResult.scanStatus,
    sourceIssues: scanResult.sourceIssues,
  }, scannedAt);
}

function writeEpicDoc(featuresRoot: string, folderName: string, markdown: string) {
  const folderPath = resolve(featuresRoot, "00_EPICS", folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(resolve(folderPath, "EpicDescription.md"), markdown, "utf8");
}

function writeFeatDoc(featuresRoot: string, stateFolder: string, folderName: string, markdown: string) {
  const folderPath = resolve(featuresRoot, stateFolder, folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(resolve(folderPath, "FeatureDescription.md"), markdown, "utf8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FEAT-008 EPIC lifecycle end-to-end regression", () => {
  it("Step 1: Submit EPIC — renders scanned EPIC card from document", () => {
    const { featuresRoot, project } = createFixture();
    const epicInput = normalizeSubmitEpicInput({
      description: "Automated CI pipeline setup for Hepha projects.",
      priority: "High",
      projectId: "project-feat-008",
      successCriteria: "CI pipeline is configured\nTests run automatically on push",
      title: "CI Pipeline Automation",
    });
    const epicId = "EPIC-101";
    const epicFolder = `${epicId}-ci-pipeline-automation`;
    const epicMarkdown = renderSubmittedEpicDocument({
      createdDate: "2026-07-03",
      epicId,
      input: epicInput,
    });

    writeEpicDoc(featuresRoot, epicFolder, epicMarkdown);

    const scanResult = scan(project);
    const response = toResponse(project, scanResult, "2026-07-03T00:00:00.000Z");
    const epicCard = response.items.find((item) => item.externalId === epicId);

    expect(epicCard).toBeDefined();
    expect(epicCard!.kind).toBe("epic");
    expect(epicCard!.title).toContain("CI Pipeline Automation");
    expect(epicCard!.stateFolder).toBe("00_EPICS");
    expect(epicCard!.stateLabel).toBe("Epics");
    expect(epicCard!.epicState).toBe("not-started");
    expect(epicCard!.validation.needsValidationCount).toBeGreaterThan(0);
    expect(epicCard!.documentRelativePath).toContain(`00_EPICS/${epicFolder}/EpicDescription.md`);
  });

  it("Step 2: FEAT document rendering — correct EPIC backlink and scan discovery", () => {
    const { featuresRoot, project } = createFixture();

    // Write an EPIC document that references FEATs in its feature table
    writeEpicDoc(featuresRoot, "EPIC-201-new-feature-development", [
      "# EPIC-201: New Feature Development",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-201 |",
      "| State | NotStarted |",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-001 | Core Feature Implementation | SUBMITTED |",
      "| FEAT-002 | Feature Test Coverage | SUBMITTED |",
    ].join("\n"));

    // Create two FEAT documents with EPIC backlinks
    const feat1Markdown = renderSubmittedFeatureDocument({
      epicId: "EPIC-201",
      epicTitle: "New Feature Development",
      feature: {
        acceptanceCriteria: ["Feature works as expected"],
        dependencyIds: [],
        description: "Implement the core feature logic.",
        priority: null,
        title: "Core Feature Implementation",
      },
      featureId: "FEAT-001",
    });
    const feat2Markdown = renderSubmittedFeatureDocument({
      epicId: "EPIC-201",
      epicTitle: "New Feature Development",
      feature: {
        acceptanceCriteria: ["Tests pass"],
        dependencyIds: [],
        description: "Add test coverage for the feature.",
        priority: null,
        title: "Feature Test Coverage",
      },
      featureId: "FEAT-002",
    });

    writeFeatDoc(featuresRoot, "01_SUBMITTED", "FEAT-001-core-feature-implementation", feat1Markdown);
    writeFeatDoc(featuresRoot, "01_SUBMITTED", "FEAT-002-feature-test-coverage", feat2Markdown);

    const scanResult = scan(project);
    const items = scanResult.items.map((item) => item.card);
    const epic = items.find((item) => item.externalId === "EPIC-201");
    const feat1Card = items.find((item) => item.externalId === "FEAT-001");
    const feat2Card = items.find((item) => item.externalId === "FEAT-002");

    // FEAT cards exist with correct state
    expect(feat1Card).toBeDefined();
    expect(feat1Card!.kind).toBe("feature");
    expect(feat1Card!.stateFolder).toBe("01_SUBMITTED");
    expect(feat1Card!.stateLabel).toBe("Submitted");

    expect(feat2Card).toBeDefined();
    expect(feat2Card!.kind).toBe("feature");
    expect(feat2Card!.title).toBe("Feature Test Coverage");

    // EPIC backlinks from FEAT Markdown
    expect(extractFeatureParentEpicIds(feat1Markdown)).toEqual(["EPIC-201"]);
    expect(extractFeatureParentEpicIds(feat2Markdown)).toEqual(["EPIC-201"]);

    // EPIC document's feature table → linkedFeatureIds via scanner
    expect(epic).toBeDefined();
    expect(epic!.linkedFeatureIds).toContain("FEAT-001");
    expect(epic!.linkedFeatureIds).toContain("FEAT-002");
  });

  it("Step 3: Scanner is deterministic and read-only", () => {
    const { featuresRoot, project } = createFixture();

    writeEpicDoc(featuresRoot, "EPIC-301-deterministic-scan-test", [
      "# EPIC-301: Deterministic Scan Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-301 |",
      "| State | NotStarted |",
    ].join("\n"));

    const firstResult = scan(project);
    const secondResult = scan(project);

    // Scanner items must be deterministic
    expect(firstResult.items).toEqual(secondResult.items);
    expect(firstResult.sourceIssues).toEqual(secondResult.sourceIssues);

    // Scanner is read-only: run three times, verify no mtime changes
    const beforeMtime = new Map<string, number>();
    const entries = readdirSync(featuresRoot, { recursive: true }) as string[];
    for (const entry of entries) {
      const fullPath = resolve(featuresRoot, entry);
      try { beforeMtime.set(entry, statSync(fullPath).mtimeMs); } catch { /* skip */ }
    }

    scan(project);
    scan(project);
    scan(project);

    for (const [entry, mtime] of beforeMtime) {
      const fullPath = resolve(featuresRoot, entry);
      try { expect(statSync(fullPath).mtimeMs).toBe(mtime); } catch { /* path removed during cleanup — ignore */ }
    }
  });

  it("Step 4: EPIC state derivation and upsert — correct logic for all state transitions", () => {
    const { featuresRoot, project } = createFixture();

    // Create EPIC document with initial NotStarted state
    writeEpicDoc(featuresRoot, "EPIC-401-state-sync-test", [
      "# EPIC-401: State Sync Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-401 |",
      "| State | NotStarted |",
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-010 | Child Feat A | SUBMITTED |",
      "| FEAT-011 | Child Feat B | READY_TO_DEVELOP |",
    ].join("\n"));

    // Create FEATs at various lifecycle stages
    writeFeatDoc(featuresRoot, "01_SUBMITTED", "FEAT-010-child-feat-a", [
      "# FEAT-010: Child Feat A",
      "",
      "**Feature ID**: FEAT-010",
      "**Parent Epic**: EPIC-401",
      "**Status**: Submitted",
    ].join("\n"));
    writeFeatDoc(featuresRoot, "02_READY_TO_DEVELOP", "FEAT-011-child-feat-b", [
      "# FEAT-011: Child Feat B",
      "",
      "**Feature ID**: FEAT-011",
      "**Parent Epic**: EPIC-401",
      "**Status**: Ready To Develop",
    ].join("\n"));

    // --- Initial state: one SUBMITTED + one READY → not-started ---
    expect(deriveEpicStateFromFeatureStateFolders(
      ["01_SUBMITTED", "02_READY_TO_DEVELOP"],
      false,
    )).toBe("not-started");

    // --- Move FEAT-011 to IN_PROGRESS → in-progress ---
    renameSync(
      resolve(featuresRoot, "02_READY_TO_DEVELOP", "FEAT-011-child-feat-b"),
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-011-child-feat-b"),
    );
    // Also move FEAT-010 to IN_PROGRESS
    renameSync(
      resolve(featuresRoot, "01_SUBMITTED", "FEAT-010-child-feat-a"),
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-010-child-feat-a"),
    );

    expect(deriveEpicStateFromFeatureStateFolders(
      ["03_IN_PROGRESS", "03_IN_PROGRESS"],
      false,
    )).toBe("in-progress");

    // --- Move all to COMPLETED → completed ---
    renameSync(
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-010-child-feat-a"),
      resolve(featuresRoot, "04_COMPLETED", "FEAT-010-child-feat-a"),
    );
    renameSync(
      resolve(featuresRoot, "03_IN_PROGRESS", "FEAT-011-child-feat-b"),
      resolve(featuresRoot, "04_COMPLETED", "FEAT-011-child-feat-b"),
    );

    expect(deriveEpicStateFromFeatureStateFolders(
      ["04_COMPLETED", "04_COMPLETED"],
      false,
    )).toBe("completed");

    // --- Missing features prevent completed state ---
    expect(deriveEpicStateFromFeatureStateFolders(
      ["04_COMPLETED", "04_COMPLETED"],
      true,
    )).toBe("in-progress");

    // --- upsertEpicState correctly updates document ---
    const epicDocPath = resolve(featuresRoot, "00_EPICS", "EPIC-401-state-sync-test", "EpicDescription.md");
    const epicMarkdown = readFileSync(epicDocPath, "utf8");
    expect(extractEpicState(epicMarkdown)).toBe("not-started");

    const updatedMarkdown = upsertEpicState(epicMarkdown, "in-progress");
    expect(extractEpicState(updatedMarkdown)).toBe("in-progress");
    // Only State field changed
    expect(updatedMarkdown).toContain("Epic ID | EPIC-401");
    expect(updatedMarkdown).toContain("FEAT-010 | Child Feat A");
    expect(updatedMarkdown).toContain("FEAT-011 | Child Feat B");
  });

  it("Steps 5-6: Full integration — submit → FEATs → scan → move → state sync", () => {
    const { featuresRoot, project } = createFixture();

    // --- Step 1: Submit EPIC with feature table references ---
    const epicId = "EPIC-501";
    const epicInput = normalizeSubmitEpicInput({
      description: "A full lifecycle integration test feature.",
      priority: "High",
      projectId: "project-feat-008",
      successCriteria: "Lifecycle is proven end to end",
      title: "Full Lifecycle Test",
    });
    const epicMarkdown = renderSubmittedEpicDocument({
      createdDate: "2026-07-03",
      epicId,
      input: epicInput,
    });

    // The rendered EPIC has suggestedFeatures with TBD IDs — scanner won't link
    // non-existent FEATs. For FEAT linking, add explicit references.
    const epicFolder = `${epicId}-full-lifecycle-test`;
    // Augment rendered markdown with a feature table referencing our child FEATs
    const augmentedMarkdown = epicMarkdown + [
      "",
      "| Feature ID | Title | Status |",
      "|------------|-------|--------|",
      "| FEAT-020 | Feature A | SUBMITTED |",
      "| FEAT-021 | Feature B | SUBMITTED |",
    ].join("\n");
    writeEpicDoc(featuresRoot, epicFolder, augmentedMarkdown);

    // --- Step 2: Create two submitted FEATs ---
    const feat1Id = "FEAT-020";
    const feat2Id = "FEAT-021";
    const feat1Markdown = renderSubmittedFeatureDocument({
      epicId,
      epicTitle: "Full Lifecycle Test",
      feature: {
        acceptanceCriteria: ["Feature A is implemented"],
        dependencyIds: [],
        description: "First child feature.",
        priority: null,
        title: "Feature A",
      },
      featureId: feat1Id,
    });
    const feat2Markdown = renderSubmittedFeatureDocument({
      epicId,
      epicTitle: "Full Lifecycle Test",
      feature: {
        acceptanceCriteria: ["Feature B is implemented"],
        dependencyIds: [],
        description: "Second child feature.",
        priority: null,
        title: "Feature B",
      },
      featureId: feat2Id,
    });
    writeFeatDoc(featuresRoot, "01_SUBMITTED", `${feat1Id}-feature-a`, feat1Markdown);
    writeFeatDoc(featuresRoot, "01_SUBMITTED", `${feat2Id}-feature-b`, feat2Markdown);

    // --- Step 3: Scan and verify ---
    const initialScan = scan(project);
    const initialResponse = toResponse(project, initialScan, "2026-07-03T00:00:00.000Z");
    expect(initialResponse.items).toHaveLength(3); // 1 EPIC + 2 FEATs

    const epic = initialResponse.items.find((item) => item.externalId === epicId)!;
    expect(epic.kind).toBe("epic");
    expect(epic.epicState).toBe("not-started");

    const feat1 = initialResponse.items.find((item) => item.externalId === feat1Id)!;
    expect(feat1.kind).toBe("feature");
    expect(feat1.stateFolder).toBe("01_SUBMITTED");

    const feat2 = initialResponse.items.find((item) => item.externalId === feat2Id)!;
    expect(feat2.kind).toBe("feature");
    expect(feat2.stateFolder).toBe("01_SUBMITTED");

    // EPIC-FEAT links from document feature table
    expect(epic.linkedFeatureIds).toContain(feat1Id);
    expect(epic.linkedFeatureIds).toContain(feat2Id);

    // FEAT parent EPIC links from Markdown
    expect(extractFeatureParentEpicIds(feat1Markdown)).toEqual([epicId]);
    expect(extractFeatureParentEpicIds(feat2Markdown)).toEqual([epicId]);

    // --- Step 4: EPIC board model ---
    const epicBoard = buildEpicBoardModel(initialResponse.items, initialResponse.sourceIssues, initialResponse.scanStatus);
    expect(epicBoard.empty).toBe(false);
    expect(epicBoard.hasInvalidSources).toBe(false);
    const notStartedCol = epicBoard.columns.find((col) => col.id === "not-started");
    expect(notStartedCol!.items).toHaveLength(1);
    expect(notStartedCol!.items[0].externalId).toBe(epicId);

    // --- Step 5: FEAT board model ---
    const featBoard = buildFeatureBoardModel(initialResponse.items, initialResponse.sourceIssues);
    const submittedCol = featBoard.columns.find((col) => col.id === "01_SUBMITTED");
    expect(submittedCol!.items).toHaveLength(2);

    // --- Step 6: Move FEATs and verify state derivation ---
    // Move FEAT-020 to IN_PROGRESS
    renameSync(
      resolve(featuresRoot, "01_SUBMITTED", `${feat1Id}-feature-a`),
      resolve(featuresRoot, "03_IN_PROGRESS", `${feat1Id}-feature-a`),
    );
    // Move FEAT-021 to IN_PROGRESS
    renameSync(
      resolve(featuresRoot, "01_SUBMITTED", `${feat2Id}-feature-b`),
      resolve(featuresRoot, "03_IN_PROGRESS", `${feat2Id}-feature-b`),
    );

    // Derive state from folder positions
    expect(deriveEpicStateFromFeatureStateFolders(
      ["03_IN_PROGRESS", "03_IN_PROGRESS"],
      false,
    )).toBe("in-progress");

    // Move both to COMPLETED
    renameSync(
      resolve(featuresRoot, "03_IN_PROGRESS", `${feat1Id}-feature-a`),
      resolve(featuresRoot, "04_COMPLETED", `${feat1Id}-feature-a`),
    );
    renameSync(
      resolve(featuresRoot, "03_IN_PROGRESS", `${feat2Id}-feature-b`),
      resolve(featuresRoot, "04_COMPLETED", `${feat2Id}-feature-b`),
    );

    expect(deriveEpicStateFromFeatureStateFolders(
      ["04_COMPLETED", "04_COMPLETED"],
      false,
    )).toBe("completed");

    // --- Step 7: Verify EPIC document state can be updated ---
    const epicDocPath = resolve(featuresRoot, "00_EPICS", epicFolder, "EpicDescription.md");
    const currentEpicMarkdown = readFileSync(epicDocPath, "utf8");
    const updatedMarkdown = upsertEpicState(currentEpicMarkdown, "completed");
    expect(extractEpicState(updatedMarkdown)).toBe("completed");
    expect(updatedMarkdown).toContain(epicId);
    expect(updatedMarkdown).toContain("Full Lifecycle Test");
  });

  it("Counter file and folder discovery: scanner finds FEATs in all lifecycle folders", () => {
    const { featuresRoot, project } = createFixture();

    // Create FEATs in different lifecycle folders
    writeFeatDoc(featuresRoot, "01_SUBMITTED", "FEAT-005-manually-created", "# FEAT-005: Manual\n");
    writeFeatDoc(featuresRoot, "02_READY_TO_DEVELOP", "FEAT-006-ready", "# FEAT-006: Ready\n");
    writeFeatDoc(featuresRoot, "03_IN_PROGRESS", "FEAT-007-wip", "# FEAT-007: WIP\n");
    writeFeatDoc(featuresRoot, "04_COMPLETED", "FEAT-008-done", "# FEAT-008: Done\n");

    const scanResult = scan(project);
    const items = scanResult.items.map((item) => item.card);

    expect(items.find((item) => item.externalId === "FEAT-005")!.stateFolder).toBe("01_SUBMITTED");
    expect(items.find((item) => item.externalId === "FEAT-006")!.stateFolder).toBe("02_READY_TO_DEVELOP");
    expect(items.find((item) => item.externalId === "FEAT-007")!.stateFolder).toBe("03_IN_PROGRESS");
    expect(items.find((item) => item.externalId === "FEAT-008")!.stateFolder).toBe("04_COMPLETED");
  });

  it("Scanner reports scan status object with metadata about the scan", () => {
    const { featuresRoot, project } = createFixture();

    // Empty scan (folder exists but has no EPIC documents)
    const emptyResult = scan(project);
    expect(emptyResult.scanStatus).toMatchObject({
      epicDocumentCount: 0,
      epicFolderExists: true,   // folder exists, just empty
      epicInvalidSourceCount: 0,
      epicScanFailed: false,
      epicValidItemCount: 0,
    });

    // With EPIC
    writeEpicDoc(featuresRoot, "EPIC-601-status-test", [
      "# EPIC-601: Status Test",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-601 |",
      "| State | NotStarted |",
    ].join("\n"));

    const withEpic = scan(project);
    expect(withEpic.scanStatus).toMatchObject({
      epicDocumentCount: 1,
      epicFolderExists: true,
      epicValidItemCount: 1,
      epicScanFailed: false,
    });
    expect(withEpic.scanStatus.message).toBeNull();
  });
});
