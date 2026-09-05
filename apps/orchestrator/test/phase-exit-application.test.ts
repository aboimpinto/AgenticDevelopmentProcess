import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { assessPhaseExitCheckpoint } from "../src/phase-exit-checkpoint.js";
import { selectOrderedPhaseExit } from "../src/ordered-phase-task-policy.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseExitApplication } from "../src/workflows/phases/phase-exit-application.js";

function fixture() {
  const project = { id: "project", rootPath: "/work" } as StoredProject;
  const phase = { number: 19, status: "IN_PROGRESS", title: "Anything" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", phases: [phase] } as WorkItemCard;
  const refreshedPhase = { ...phase, status: "COMPLETED" };
  const refreshed = { ...feature, phases: [refreshedPhase] } as WorkItemCard;
  const dependencies = {
    assessCheckpoint: vi.fn(assessPhaseExitCheckpoint),
    getQualityGates: vi.fn(() => []),
    hasCheckedTaskLedger: vi.fn(() => true),
    hasCompletionEvidence: vi.fn(() => true),
    markCompletedAfterReview: vi.fn(),
    markCompletedFromTasks: vi.fn(),
    openReviewStore: vi.fn(() => undefined),
    recordProgress: vi.fn(async () => undefined),
    refreshFeature: vi.fn(async () => refreshed),
    selectOrderedExit: vi.fn(selectOrderedPhaseExit),
  };
  const application = new PhaseExitApplication(dependencies);
  const input = { cardKey: "card", command: "continue-implementing" as const, feature, orderedReviewRequired: false, orderedTaskWorkflow: true, orderedTasksComplete: true, phase, project, runId: "run", v1ReviewRequired: false };
  return { application, dependencies, feature, input, phase, refreshed, refreshedPhase };
}

describe("phase exit application", () => {
  it("completes and refreshes an ordered phase only after declared tasks are exhausted", async () => {
    const target = fixture();
    await expect(target.application.authorize(target.input)).resolves.toMatchObject({ feature: target.refreshed, phase: target.refreshedPhase });
    expect(target.dependencies.markCompletedFromTasks).toHaveBeenCalledWith(target.feature, target.phase);
    expect(target.dependencies.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "checkpoint" }));
  });

  it("fails before mutation when an ordered task remains unresolved", async () => {
    const target = fixture();
    await expect(target.application.authorize({ ...target.input, orderedTasksComplete: false })).rejects.toThrow(
      "cannot exit while a declared task remains unresolved",
    );
    expect(target.dependencies.markCompletedFromTasks).not.toHaveBeenCalled();
    expect(target.dependencies.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
  });

  it("denies a legacy exit when a durable quality gate remains missing", async () => {
    const target = fixture();
    target.dependencies.getQualityGates.mockReturnValue([{ gate: "tests", status: "missing" }]);
    await expect(target.application.authorize({ ...target.input, orderedTaskWorkflow: false, orderedTasksComplete: false })).rejects.toThrow(
      "required quality gates are missing (tests)",
    );
  });

  it("fails a V1-reviewed exit closed when its receipt or store is unavailable", async () => {
    const target = fixture();
    await expect(target.application.authorize({
      ...target.input, orderedReviewRequired: true, reviewReceipt: undefined,
      orderedTaskWorkflow: false, orderedTasksComplete: false, v1ReviewRequired: true,
    })).rejects.toThrow("REVIEW_CONTRACT_V1_GATE_DENIED");
    expect(target.dependencies.markCompletedAfterReview).not.toHaveBeenCalled();
  });

  it("closes an opened authoritative store and marks only an authorized review exit", async () => {
    const target = fixture();
    const close = vi.fn();
    target.dependencies.openReviewStore.mockReturnValue({ close } as never);
    target.dependencies.assessCheckpoint.mockReturnValue({ allowed: true, missingGates: [], reason: "authorized" });
    const scope = { projectId: "project", featureId: "work", phaseNumber: 19, reviewGateId: "code-review" };
    await target.application.authorize({
      ...target.input, orderedTaskWorkflow: false, orderedTasksComplete: false, v1ReviewRequired: true,
      reviewReceipt: { contentHash: "a".repeat(64), databasePath: "/db", scope },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(target.dependencies.markCompletedAfterReview).toHaveBeenCalledWith(target.feature, target.phase, "project", scope);
  });
});
