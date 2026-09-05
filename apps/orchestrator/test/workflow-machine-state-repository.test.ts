import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  readFeatureTasksPhaseStatus,
  readMarkdownSection,
  WorkflowMachineStateRepository,
} from "../src/workflows/recovery/workflow-machine-state-repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createFeature() {
  const folderPath = mkdtempSync(join(tmpdir(), "hepha-machine-state-"));
  const phasePath = join(folderPath, "Phases", "phase-arbitrary.md");
  const featureTasksPath = join(folderPath, "FeatureTasks.md");
  temporaryDirectories.push(folderPath);
  mkdirSync(join(folderPath, "Phases"));
  writeFileSync(phasePath, [
    "# Arbitrary work",
    "",
    "**Status:** IN_PROGRESS",
    "",
    "## Phase Task Ledger",
    "",
    "- [ ] stable-task-id",
    "",
    "## Hepha Task State",
    "",
    "Active: stable-task-id",
    "",
    "## Quality Gate Evidence",
    "",
    "| Gate | Decision |",
    "| --- | --- |",
    "| tests | missing |",
  ].join("\n"));
  writeFileSync(featureTasksPath, [
    "| Phase | Title | Status |",
    "| --- | --- | --- |",
    "| 73 | Arbitrary work | IN_PROGRESS |",
  ].join("\n"));
  const phase = {
    documentPath: phasePath,
    number: 73,
    status: "IN_PROGRESS",
    title: "Arbitrary work",
  } as never;
  const feature = { folderPath, phases: [phase] } as never;
  return { feature, featureTasksPath, phase, phasePath };
}

describe("workflow machine state repository", () => {
  it("restores phase lifecycle, task, gate, and inventory fields changed by a worker", () => {
    const target = createFeature();
    const repository = new WorkflowMachineStateRepository();
    const snapshot = repository.capturePhaseWorker(target.feature, target.phase);
    writeFileSync(target.phasePath, readFileSync(target.phasePath, "utf8")
      .replace("IN_PROGRESS", "COMPLETED")
      .replace("stable-task-id", "invented-task-id")
      .replace("missing", "satisfied"));
    writeFileSync(target.featureTasksPath, readFileSync(target.featureTasksPath, "utf8").replace("IN_PROGRESS", "COMPLETED"));

    expect(repository.restorePhaseWorker(snapshot)).toEqual(["phase-arbitrary.md", "FeatureTasks.md"]);
    expect(readFileSync(target.phasePath, "utf8")).toContain("**Status:** IN_PROGRESS");
    expect(readFileSync(target.phasePath, "utf8")).toContain("stable-task-id");
    expect(readFileSync(target.phasePath, "utf8")).toContain("| tests | missing |");
    expect(readFileSync(target.featureTasksPath, "utf8")).toContain("| IN_PROGRESS |");
  });

  it("restores every changed recovery document and leaves unchanged snapshots alone", () => {
    const target = createFeature();
    const repository = new WorkflowMachineStateRepository();
    const snapshot = repository.captureRecovery(target.feature);

    expect(repository.restoreRecovery(snapshot)).toEqual([]);
    writeFileSync(target.phasePath, "agent mutation\n");
    writeFileSync(target.featureTasksPath, "agent mutation\n");
    expect(repository.restoreRecovery(snapshot)).toEqual(["FeatureTasks.md", "phase-arbitrary.md"]);
    expect(readFileSync(target.phasePath, "utf8")).toContain("stable-task-id");
  });

  it("reads exact machine-owned Markdown sections and phase inventory status", () => {
    const target = createFeature();
    const phaseMarkdown = readFileSync(target.phasePath, "utf8");
    const tasksMarkdown = readFileSync(target.featureTasksPath, "utf8");

    expect(readMarkdownSection(phaseMarkdown, "Phase Task Ledger")).toBe(
      "## Phase Task Ledger\n\n- [ ] stable-task-id",
    );
    expect(readMarkdownSection(phaseMarkdown, "Absent Section")).toBeNull();
    expect(readFeatureTasksPhaseStatus(tasksMarkdown, 73)).toBe("IN_PROGRESS");
    expect(readFeatureTasksPhaseStatus(tasksMarkdown, 74)).toBeNull();
    expect(readFeatureTasksPhaseStatus("no table", 73)).toBeNull();
  });
});
