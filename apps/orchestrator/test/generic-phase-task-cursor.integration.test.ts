import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseTaskCursorResolver } from "../src/workflows/phases/phase-task-cursor-resolver.js";

const featurePath = fileURLToPath(new URL("./generic-phase-task-cursor.feature", import.meta.url));

describe("generic phase task cursor Gherkin integration", () => {
  it("follows supplied execution order across arbitrary titles", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-generic-cursor-"));
    try {
      mkdirSync(join(root, "Phases"));
      const createPhase = (number: number, title: string, status: string, task: string) => {
        const documentPath = join(root, "Phases", `phase-${number}-anything.md`);
        writeFileSync(documentPath, `## Phase Task Ledger\n${task}`, "utf8");
        return { documentPath, fileName: `phase-${number}-anything.md`, number, status, title } as PhaseSummary & { number: number };
      };
      const resolved = createPhase(12, "First Arbitrary Name", "COMPLETED", "- [x] Done");
      const pending = createPhase(3, "Second Arbitrary Name", "PENDING", "- [ ] Observe");
      const feature = { externalId: "WORK", folderPath: root, phases: [pending, resolved] } as WorkItemCard;
      const project = { id: "project", rootPath: root } as StoredProject;
      const resolver = new PhaseTaskCursorResolver({
        findFirstMissingQualityGate: () => null, findHumanReviewPhase: () => undefined,
        isAwaitingCodeReviewRerun: () => false, isPhaseResolved: (phase) => phase.status === "COMPLETED",
        isPlanningArtifactMissing: () => false, listTaskRuns: async () => [],
        orderPhases: () => [resolved, pending], planningArtifactFileName: "planning.md",
        reconcileCheckedTasks: async () => undefined,
      });
      const result = await resolver.resolve({ cardKey: "feature:WORK", feature, project, runId: "run" });
      expect(result.currentStep).toBe("Phase 3 task 1/1");
      expect(result.summary).toContain("Observe (selected from existing phase Markdown checkboxes)");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
