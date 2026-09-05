import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectRefinementArtifactProgress,
  RefinementArtifactProgressReporter,
} from "../src/application/features/refinement-artifact-progress.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function featureFolder() {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-refine-progress-"));
  roots.push(root);
  mkdirSync(resolve(root, "Phases"));
  for (const file of ["ArchitectureDebtTouchPlan.json", "FeatureTasks.md", "planning-analysis-report.md"]) {
    writeFileSync(resolve(root, file), "content\n");
  }
  writeFileSync(resolve(root, "PhaseExecutionContract.json"), JSON.stringify({
    schemaVersion: "hepha-phase-execution/v3",
    phases: [
      { id: "arbitrary-first", order: 0, document: "Phases/phase-0-any-name.md" },
      { id: "arbitrary-second", order: 1, document: "Phases/phase-1-another-name.md" },
      { id: "arbitrary-final", order: 2, document: "Phases/phase-2-final-name.md" },
    ],
  }));
  return root;
}

describe("Refinement artifact progress", () => {
  it("projects the first missing contract phase without depending on titles or a fixed count", () => {
    const root = featureFolder();
    writeFileSync(resolve(root, "Phases/phase-0-any-name.md"), "phase zero\n");

    expect(projectRefinementArtifactProgress(root)).toEqual({
      currentStep: "Generating Phase 1 of 3",
      lastCompletedArtifact: "Phases/phase-0-any-name.md",
      nextExpectedArtifact: "Phases/phase-1-another-name.md",
      phaseOrder: 1,
      totalPhases: 3,
    });
  });

  it("persists generating and saved milestones from trusted write events", async () => {
    const root = featureFolder();
    const record = vi.fn(async () => undefined);
    const reporter = new RefinementArtifactProgressReporter({ folderPath: root, record });
    const path = resolve(root, "Phases/phase-0-any-name.md");

    reporter.start();
    reporter.observe({ type: "tool_execution_start", toolCallId: "call-1", toolName: "write", args: { path } });
    writeFileSync(path, "phase zero\n");
    reporter.observe({ type: "tool_execution_end", toolCallId: "call-1", toolName: "write", isError: false });
    await reporter.drain();

    expect(record.mock.calls.map(([step]) => step)).toEqual([
      "Analysing feature and dependency context",
      "Generating Phase 0 of 3",
      "Phase 0 of 3 saved",
    ]);
  });

  it("labels an existing phase edit as repair instead of new generation", async () => {
    const root = featureFolder();
    const path = resolve(root, "Phases/phase-0-any-name.md");
    writeFileSync(path, "existing phase\n");
    const record = vi.fn(async () => undefined);
    const reporter = new RefinementArtifactProgressReporter({ folderPath: root, record });

    reporter.observe({ type: "tool_execution_start", toolCallId: "repair", toolName: "edit", args: { path } });
    writeFileSync(path, "repaired phase\n");
    reporter.observe({ type: "tool_execution_end", toolCallId: "repair", toolName: "edit", isError: false });
    await reporter.drain();

    expect(record.mock.calls.map(([step]) => step)).toEqual([
      "Repairing Phase 0 of 3",
      "Phase 0 of 3 repaired",
    ]);
  });

  it("ignores writes outside the selected FEAT folder", async () => {
    const root = featureFolder();
    const record = vi.fn(async () => undefined);
    const reporter = new RefinementArtifactProgressReporter({ folderPath: root, record });

    reporter.observe({
      type: "tool_execution_start",
      toolCallId: "outside",
      toolName: "write",
      args: { path: resolve(root, "..", "outside.md") },
    });
    await reporter.drain();

    expect(record).not.toHaveBeenCalled();
  });
});
