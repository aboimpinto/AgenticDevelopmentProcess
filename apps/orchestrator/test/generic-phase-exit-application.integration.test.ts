import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { assessPhaseExitCheckpoint } from "../src/phase-exit-checkpoint.js";
import { selectOrderedPhaseExit } from "../src/ordered-phase-task-policy.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseExitApplication } from "../src/workflows/phases/phase-exit-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-exit-application.feature", import.meta.url));

describe("generic phase exit application Gherkin integration", () => {
  it("uses real exit policies to complete only exhausted arbitrary work", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const project = { id: "project" } as StoredProject;
    const phase = { number: 62, status: "IN_PROGRESS", title: "Random synthesis" } as PhaseSummary & { number: number };
    const feature = { externalId: "WORK", phases: [phase] } as WorkItemCard;
    const refreshed = { ...feature, phases: [{ ...phase, status: "COMPLETED" }] } as WorkItemCard;
    const markCompletedFromTasks = vi.fn();
    const application = new PhaseExitApplication({
      assessCheckpoint: assessPhaseExitCheckpoint,
      getQualityGates: () => [],
      hasCheckedTaskLedger: () => true,
      hasCompletionEvidence: () => true,
      markCompletedAfterReview: () => undefined,
      markCompletedFromTasks,
      openReviewStore: () => undefined,
      recordProgress: async () => undefined,
      refreshFeature: async () => refreshed,
      selectOrderedExit: selectOrderedPhaseExit,
    });
    const result = await application.authorize({ cardKey: "card", command: "continue-implementing", feature, orderedReviewRequired: false, orderedTaskWorkflow: true, orderedTasksComplete: true, phase, project, runId: "run", v1ReviewRequired: false });
    expect(result.feature).toBe(refreshed);
    expect(markCompletedFromTasks).toHaveBeenCalledOnce();
    await expect(application.authorize({ cardKey: "card", command: "continue-implementing", feature, orderedReviewRequired: false, orderedTaskWorkflow: true, orderedTasksComplete: false, phase, project, runId: "run", v1ReviewRequired: false })).rejects.toThrow("declared task remains unresolved");
    expect(markCompletedFromTasks).toHaveBeenCalledOnce();
  });
});
