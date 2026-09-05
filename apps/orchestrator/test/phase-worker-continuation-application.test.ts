import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseWorkerContinuationApplication } from "../src/workflows/phases/phase-worker-continuation-application.js";

function fixture() {
  const phase = {
    documentPath: "/project/phase.md", fileName: "phase.md", number: 423,
    status: "IN_PROGRESS", title: "Arbitrary Work",
  } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/project/feature", phases: [phase] } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const readBlocker = vi.fn(() => null);
  const readTasks = vi.fn(() => [{ checked: true, id: "task-a" } as never]);
  const reconcile = vi.fn(async () => ({
    feature,
    decision: { kind: "select" as const, phaseNumber: phase.number, taskId: "task-b", reason: "next" },
  }));
  const recordProgress = vi.fn(async () => undefined);
  const application = new PhaseWorkerContinuationApplication({
    absoluteSafetyCap: 7,
    readBlocker,
    readTasks,
    reconcile,
    recordProgress,
    resolvePhase: (current) => current.phases[0] as PhaseSummary & { number: number },
    summarizeEvidence: () => "evidence missing",
  });
  const input = {
    agent: "Implementation Agent", cardKey: "feature:WORK", command: "continue-implementing" as const,
    feature, model: "implementation-model", phase, phaseRef: "Phase 423", project,
    recoveryAttempt: 0, runId: "run",
  };
  return { application, input, phase, readBlocker, readTasks, reconcile, recordProgress };
}

describe("phase worker continuation application", () => {
  it("records durable progress and selects the next same-phase task", async () => {
    const target = fixture();
    const result = await target.application.reconcile(target.input);
    expect(result.decision).toEqual(expect.objectContaining({ kind: "continue", nextTaskId: "task-b" }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "implementing",
      currentStep: expect.stringContaining("scheduling next same-phase task"),
    }));
  });

  it("records completion when reconciliation advances beyond the completed phase", async () => {
    const target = fixture();
    target.phase.status = "COMPLETED";
    target.reconcile.mockResolvedValueOnce({
      feature: target.input.feature,
      decision: { kind: "all_terminal", reason: "done" },
    });
    const result = await target.application.reconcile(target.input);
    expect(result.decision.kind).toBe("phase_completed");
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("fails closed when a durable blocker exists despite checked progress", async () => {
    const target = fixture();
    target.readBlocker.mockReturnValueOnce("external authority required");
    await expect(target.application.reconcile(target.input)).rejects.toThrow(
      "worker returned without completing the phase document",
    );
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining("external authority required"),
      status: "blocked",
    }));
  });

  it("fails closed when the absolute safety cap is exhausted", async () => {
    const target = fixture();
    await expect(target.application.reconcile({ ...target.input, recoveryAttempt: 7 })).rejects.toThrow(
      "absolute safety cap (7) is exhausted",
    );
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "blocked" }));
  });
});
