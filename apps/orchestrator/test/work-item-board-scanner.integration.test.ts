// Behavior suite: work item board scanner.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEpicBoardModel } from "@hepha/shared";
import { scanMemoryBankFoldersWithIssues } from "../src/memorybank-scanner.js";
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
  const root = mkdtempSync(resolve(tmpdir(), "hepha-feat-003-int-"));
  tempRoots.push(root);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  const memoryBankPath = resolve(root, "MemoryBank");
  const featuresRoot = resolve(memoryBankPath, "Features");

  for (const folder of stateFolders) {
    mkdirSync(resolve(featuresRoot, folder), { recursive: true });
  }

  const project: StoredProject = {
    createdAt: "2026-07-01T00:00:00.000Z",
    defaultBranch: "master",
    id: "project-feat-003",
    memoryBankPath,
    name: "FEAT-003 Integration",
    rootPath: root,
    updatedAt: "2026-07-01T00:00:00.000Z",
  };

  return { featuresRoot, memoryBankPath, project, root };
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

describe("FEAT-003 scanner-to-API-to-board integration", () => {
  it("renders valid EPIC cards and invalid source issues from the same scan", () => {
    const { featuresRoot, project } = createFixture();
    writeEpic(
      featuresRoot,
      "EPIC-001-valid",
      [
        "# EPIC-001: Valid Board Epic",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-001 |",
        "| State | InProgress |",
        "",
        "## Features",
        "- FEAT-010-dashboard-child",
      ].join("\n"),
    );
    writeEpic(featuresRoot, "EPIC-002-empty", "");

    const scanResult = scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels);
    const response = toCardResponse(project, scanResult, "2026-07-01T00:00:00.000Z");
    const boardModel = buildEpicBoardModel(response.items, response.sourceIssues, response.scanStatus);

    expect(response.items.map((item) => item.externalId)).toEqual(["EPIC-001"]);
    expect(response.items[0]).toMatchObject({
      documentRelativePath: "MemoryBank/Features/00_EPICS/EPIC-001-valid/EpicDescription.md",
      epicState: "in-progress",
      kind: "epic",
      linkedFeatureIds: ["FEAT-010"],
      stateLabel: "Epics",
      title: "Valid Board Epic",
    });
    expect(response.items[0].validation.needsValidationCount).toBe(0);
    expect(response.sourceIssues).toHaveLength(1);
    expect(response.sourceIssues[0].sourcePath).toContain("EPIC-002-empty/EpicDescription.md");
    const inProgressCard = boardModel.columns.find((column) => column.id === "in-progress")!.items[0];
    expect(inProgressCard.title).toBe("Valid Board Epic");
    expect(inProgressCard.epicState).toBe("in-progress");
    expect(inProgressCard.stateLabel).toBe("Epics");
    expect(inProgressCard.linkedFeatureIds).toEqual(["FEAT-010"]);
    expect(inProgressCard.validation.needsValidationCount).toBe(0);
    expect(boardModel.columns.find((column) => column.id === "invalid-sources")!.sourceIssues).toHaveLength(1);
    expect(boardModel.empty).toBe(false);
    expect(boardModel.hasInvalidSources).toBe(true);
  });

  it("keeps empty EPIC folder state distinct until a manual rescan sees new documents", () => {
    const { featuresRoot, project } = createFixture();

    const emptyResponse = toCardResponse(
      project,
      scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels),
      "2026-07-01T00:00:00.000Z",
    );
    expect(buildEpicBoardModel(emptyResponse.items, emptyResponse.sourceIssues, emptyResponse.scanStatus).empty).toBe(true);

    writeEpic(
      featuresRoot,
      "EPIC-003-after-rescan",
      [
        "# EPIC-003: After Rescan",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-003 |",
        "| State | NotStarted |",
      ].join("\n"),
    );

    const rescannedResponse = toCardResponse(
      project,
      scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels),
      "2026-07-01T00:01:00.000Z",
    );
    const rescannedModel = buildEpicBoardModel(
      rescannedResponse.items,
      rescannedResponse.sourceIssues,
      rescannedResponse.scanStatus,
    );

    expect(rescannedResponse.scannedAt).toBe("2026-07-01T00:01:00.000Z");
    expect(rescannedModel.empty).toBe(false);
    expect(rescannedModel.columns.find((column) => column.id === "not-started")!.items).toHaveLength(1);
  });

  it("propagates source paths for valid details and missing invalid-source paths", () => {
    const { featuresRoot, project } = createFixture();
    writeEpic(
      featuresRoot,
      "EPIC-004-source-path",
      [
        "# EPIC-004: Source Path",
        "",
        "| Field | Value |",
        "|-------|-------|",
        "| Epic ID | EPIC-004 |",
      ].join("\n"),
    );
    mkdirSync(resolve(featuresRoot, "00_EPICS", "EPIC-005-no-markdown"), { recursive: true });

    const response = toCardResponse(
      project,
      scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels),
      "2026-07-01T00:00:00.000Z",
    );

    expect(response.items[0].documentPath).toContain("EPIC-004-source-path/EpicDescription.md");
    expect(response.sourceIssues[0]).toMatchObject({
      folderName: "EPIC-005-no-markdown",
      reason: "missing-document",
      sourcePath: null,
      sourceRelativePath: null,
    });
  });
});
