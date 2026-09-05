import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { ReconcilePhaseStateOnDiskInput } from "../src/phase-state-reconciliation-adapter.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseStateReconciliationApplication } from "../src/workflows/phases/phase-state-reconciliation-application.js";

const project = { id: "project" } as StoredProject;
const run = { cardKey: "card", project, runId: "run" };

function fixture() {
  const phase = { documentPath: "/tmp/phase-any.md", number: 9, status: "IN_PROGRESS", title: "Anything" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/tmp/work", phases: [phase] } as WorkItemCard;
  const refreshed = { ...feature, title: "refreshed" } as WorkItemCard;
  const recordImplementationTaskRun = vi.fn(async () => undefined);
  const reconcileOnDisk = vi.fn(async () => ({
    changed: false,
    decision: { kind: "select" as const, phaseNumber: 9, taskId: "task", reason: "next" },
    promotedAt: null,
  }));
  const refreshFeature = vi.fn(async () => refreshed);
  const application = new PhaseStateReconciliationApplication({
    isReviewRequired: () => false,
    orderPhases: () => [phase],
    readTasks: () => [{ checked: true, id: "task", lineNumber: 12, section: "Work", taskIndex: 0, text: "Do work" }],
    reconcileOnDisk,
    refreshFeature,
    store: { listImplementationTaskRuns: async () => [], recordImplementationTaskRun },
  });
  return { application, feature, reconcileOnDisk, recordImplementationTaskRun, refreshed, refreshFeature };
}

describe("phase state reconciliation application", () => {
  it("returns the first converged deterministic decision without refreshing", async () => {
    const target = fixture();
    await expect(target.application.reconcile(run, target.feature)).resolves.toMatchObject({
      allTerminal: false,
      decision: { kind: "select", phaseNumber: 9 },
      feature: target.feature,
    });
    expect(target.refreshFeature).not.toHaveBeenCalled();
  });

  it("refreshes after a mutation and rescans until all phases are terminal", async () => {
    const target = fixture();
    target.reconcileOnDisk
      .mockResolvedValueOnce({ changed: true, decision: { kind: "promote", phaseNumber: 9, taskIds: ["task"], reason: "settled" }, promotedAt: "now" })
      .mockResolvedValueOnce({ changed: false, decision: { kind: "all_terminal", reason: "done" }, promotedAt: null });
    await expect(target.application.reconcile(run, target.feature)).resolves.toEqual({
      allTerminal: true,
      decision: { kind: "all_terminal", reason: "done" },
      feature: target.refreshed,
    });
    expect(target.refreshFeature).toHaveBeenCalledOnce();
  });

  it("fails closed on a blocked durable state", async () => {
    const target = fixture();
    target.reconcileOnDisk.mockResolvedValue({
      changed: false,
      decision: { kind: "blocked", phaseNumber: 9, reason: "unsafe mismatch" },
      promotedAt: null,
    });
    await expect(target.application.reconcile(run, target.feature)).rejects.toThrow(
      "Phase-state reconciliation blocked: unsafe mismatch",
    );
  });

  it("uses the phase-count bound when a broken writer never converges", async () => {
    const target = fixture();
    target.reconcileOnDisk.mockResolvedValue({
      changed: true,
      decision: { kind: "initialize", phaseNumber: 9, reason: "changed" },
      promotedAt: null,
    });
    await expect(target.application.reconcile(run, target.feature)).rejects.toThrow("did not converge");
    expect(target.reconcileOnDisk).toHaveBeenCalledTimes(2);
  });

  it("maps adapter reset and completion writes to complete operational task records", async () => {
    const target = fixture();
    let captured: ReconcilePhaseStateOnDiskInput | undefined;
    target.reconcileOnDisk.mockImplementation(async (input) => {
      captured = input;
      return { changed: false, decision: { kind: "select", phaseNumber: 9, taskId: "task", reason: "next" }, promotedAt: null };
    });
    await target.application.reconcile(run, target.feature);
    const descriptor = captured!.phases[0]!;
    const task = captured!.readTasks(descriptor)[0]!;
    await captured!.store.resetTaskRun({ phase: descriptor, task });
    await captured!.store.recordCompletedTask({ completedAt: "2026-01-01T00:00:00.000Z", phase: descriptor, task });
    expect(target.recordImplementationTaskRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      cardKey: "card", phaseNumber: 9, projectId: "project", status: "NOT_STARTED", taskId: "task", workflowRunId: "run",
    }));
    expect(target.recordImplementationTaskRun).toHaveBeenNthCalledWith(2, expect.objectContaining({
      completedAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:00.000Z", status: "COMPLETED",
    }));
  });
});
