import { describe, expect, it, vi } from "vitest";
import { PhaseFailureRecordingApplication } from "../src/workflows/phases/phase-failure-recording-application.js";

const phase = { number: 8, title: "Arbitrary" } as any;
const base = {
  activePhase: phase, activeTask: { id: "task" } as any, cardKey: "card",
  command: "continue-implementing" as const, error: new Error("worker failed"), failureContext: null,
  fallbackModel: "model", feature: {} as any, project: {} as any, runId: "run",
};

function target(overrides: Partial<ConstructorParameters<typeof PhaseFailureRecordingApplication>[0]> = {}) {
  const recordProgress = vi.fn().mockResolvedValue(undefined);
  const recordTaskFailure = vi.fn().mockResolvedValue(undefined);
  return {
    application: new PhaseFailureRecordingApplication({
      isTemplateInvalid: () => false, recordProgress, recordTaskFailure, shouldRecord: () => true, ...overrides,
    }),
    recordProgress,
    recordTaskFailure,
  };
}

describe("PhaseFailureRecordingApplication", () => {
  it("records an ordinary phase and active-task failure with the original context", async () => {
    const item = target();
    await item.application.record(base);
    expect(item.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Phase 8 failed", error: "worker failed", status: "failed",
    }));
    expect(item.recordTaskFailure).toHaveBeenCalledWith(expect.objectContaining({ error: "worker failed" }));
  });

  it("records template invalidity as blocked and preserves the selected task", async () => {
    const item = target({ isTemplateInvalid: () => true });
    await item.application.record(base);
    expect(item.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Phase 8 blocked: phase template validation", status: "blocked", summary: "worker failed",
    }));
    expect(item.recordTaskFailure).not.toHaveBeenCalled();
  });

  it("records proven no-progress as blocked without failing a completed task", async () => {
    const item = target();
    await item.application.record({
      ...base,
      error: new Error("WORKFLOW_AWAITING_USER_DECISION: durable state did not change"),
    });

    expect(item.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Phase 8 paused: awaiting user decision after no durable progress",
      status: "blocked",
      summary: expect.stringContaining("WORKFLOW_AWAITING_USER_DECISION"),
    }));
    expect(item.recordTaskFailure).not.toHaveBeenCalled();
  });

  it("does nothing for excluded recovery errors or when no phase is active", async () => {
    const item = target({ shouldRecord: () => false });
    await item.application.record(base);
    await item.application.record({ ...base, activePhase: null });
    expect(item.recordProgress).not.toHaveBeenCalled();
    expect(item.recordTaskFailure).not.toHaveBeenCalled();
  });

  it("never replaces the workflow error with progress-persistence failures", async () => {
    const item = target({
      recordProgress: vi.fn().mockRejectedValue(new Error("progress unavailable")),
      recordTaskFailure: vi.fn().mockRejectedValue(new Error("task store unavailable")),
    });
    await expect(item.application.record(base)).resolves.toBeUndefined();
  });
});
