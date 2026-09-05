import { describe, expect, it, vi } from "vitest";
import { PhaseSameRunRepairApplication } from "../src/workflows/phases/phase-same-run-repair-application.js";

const phase = { number: 731, status: "IN_PROGRESS", title: "Arbitrary work" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const project = { id: "arbitrary-project" } as never;
const activeTask = { id: "arbitrary-task", text: "Arbitrary task" } as never;

function createTarget(decision: { kind: "retry_same_phase" | "fail_workflow"; reason: string }) {
  const events: string[] = [];
  const evaluate = vi.fn(() => decision);
  const recordTaskFailure = vi.fn(async () => { events.push("task-failure"); });
  const recordProgress = vi.fn(async () => { events.push("progress"); });
  return {
    application: new PhaseSameRunRepairApplication({ evaluate, recordProgress, recordTaskFailure }),
    evaluate,
    events,
    recordProgress,
    recordTaskFailure,
  };
}

const input = {
  activeTask,
  agent: "Arbitrary Agent",
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  feature,
  failurePolicy: "repair_and_rerun",
  model: "arbitrary-model",
  phase,
  phaseRef: "Phase 731",
  project,
  repair: { detail: "A required check failed.", trigger: "quality_gate_failed" as const },
  runId: "arbitrary-run",
};

describe("PhaseSameRunRepairApplication", () => {
  it("persists the active-task failure before progress and returns a reusable repair brief", async () => {
    const target = createTarget({ kind: "retry_same_phase", reason: "Repair the same phase." });

    const result = await target.application.prepare(input);

    expect(target.events).toEqual(["task-failure", "progress"]);
    expect(target.evaluate).toHaveBeenCalledWith({
      detail: "A required check failed.",
      failurePolicy: "repair_and_rerun",
      phaseNumber: 731,
      trigger: "quality_gate_failed",
    });
    expect(target.recordTaskFailure).toHaveBeenCalledWith(expect.objectContaining({ activeTask }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      status: "implementing",
      summary: "Repair the same phase.",
    }));
    expect(result).toEqual({
      brief: expect.stringContaining("Repair trigger: quality_gate_failed"),
      summary: "Repair the same phase.",
    });
  });

  it("supports a phase repair when no checkbox-backed task is active", async () => {
    const target = createTarget({ kind: "retry_same_phase", reason: "Retry." });

    await target.application.prepare({ ...input, activeTask: null });

    expect(target.recordTaskFailure).toHaveBeenCalledWith(expect.objectContaining({ activeTask: null }));
    expect(target.recordProgress).toHaveBeenCalledOnce();
  });

  it("fails before persistence when the declared policy denies automatic repair", async () => {
    const target = createTarget({ kind: "fail_workflow", reason: "Automatic repair is not allowed." });

    await expect(target.application.prepare({ ...input, failurePolicy: null }))
      .rejects.toThrow("Automatic repair is not allowed.");
    expect(target.recordTaskFailure).not.toHaveBeenCalled();
    expect(target.recordProgress).not.toHaveBeenCalled();
  });
});
