import { describe, expect, it, vi } from "vitest";
import { PhaseProgressRecorder } from "../src/workflows/phases/phase-progress-recorder.js";

const input = {
  agent: "Worker", cardKey: "card", command: "continue-implementing" as const, currentStep: "Checking",
  error: "optional error", feature: {} as any, model: "model", phase: { number: 12, title: "Any" } as any,
  project: { id: "project" } as any, reportPath: "/report", runId: "run", status: "verifying" as const,
  summary: "Evidence persisted",
};

describe("PhaseProgressRecorder", () => {
  it("checks cancellation and records audit, phase state, then workflow projection", async () => {
    const calls: string[] = [];
    const appendAudit = vi.fn(() => { calls.push("audit"); });
    const recordPhaseRun = vi.fn(async () => { calls.push("phase"); });
    const recordWorkflowProgress = vi.fn(async () => { calls.push("workflow"); });
    const recorder = new PhaseProgressRecorder({
      appendAudit, assertRunActive: () => { calls.push("active"); }, recordPhaseRun, recordWorkflowProgress,
    });
    await recorder.record(input);
    expect(calls).toEqual(["active", "audit", "phase", "workflow"]);
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({ event: "phase_progress", phaseNumber: 12 }));
    expect(recordPhaseRun).toHaveBeenCalledWith(expect.objectContaining({
      error: "optional error", projectId: "project", reportPath: "/report", workflowRunId: "run",
    }));
  });

  it("normalizes absent optional persistence fields to null", async () => {
    const recordPhaseRun = vi.fn();
    const recorder = new PhaseProgressRecorder({
      appendAudit: vi.fn(), assertRunActive: vi.fn(), recordPhaseRun, recordWorkflowProgress: vi.fn(),
    });
    await recorder.record({ ...input, error: undefined, reportPath: undefined });
    expect(recordPhaseRun).toHaveBeenCalledWith(expect.objectContaining({ error: null, reportPath: null }));
  });

  it("does not emit evidence after cancellation denial", async () => {
    const appendAudit = vi.fn();
    const recordPhaseRun = vi.fn();
    const recorder = new PhaseProgressRecorder({
      appendAudit, assertRunActive: () => { throw new Error("cancelled"); }, recordPhaseRun,
      recordWorkflowProgress: vi.fn(),
    });
    await expect(recorder.record(input)).rejects.toThrow("cancelled");
    expect(appendAudit).not.toHaveBeenCalled();
    expect(recordPhaseRun).not.toHaveBeenCalled();
  });
});
