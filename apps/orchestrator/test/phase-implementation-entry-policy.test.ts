import { describe, expect, it } from "vitest";
import { buildPhaseImplementationEntryPolicy } from "../src/workflows/prompts/phase-implementation-entry-policy.js";

describe("phase implementation entry policy", () => {
  it("denies implementation for a skipped phase", () => {
    const result = buildPhaseImplementationEntryPolicy({ isCodePhase: true, phaseNumber: 7, phaseStatus: "SKIPPED" });
    expect(result.phaseRef).toBe("Phase 7");
    expect(result.phaseExecutionRule).toContain("already SKIPPED");
    expect(result.phaseExecutionRule).toContain("do not implement work");
  });

  it("selects code implementation with local checks", () => {
    expect(buildPhaseImplementationEntryPolicy({
      isCodePhase: true, phaseNumber: 3, phaseStatus: "IN_PROGRESS",
    }).phaseExecutionRule).toContain("implement the phase tasks, add/update tests");
  });

  it("selects artifact work for a non-code phase", () => {
    expect(buildPhaseImplementationEntryPolicy({
      isCodePhase: false, phaseNumber: 1, phaseStatus: "IN_PROGRESS",
    }).phaseExecutionRule).toContain("non-code/setup/planning phase");
  });

  it("pins a selected task before earlier completed work", () => {
    const result = buildPhaseImplementationEntryPolicy({
      activeTask: { id: "task-x", section: "Declared work", text: "Implement boundary" } as any,
      isCodePhase: true,
      phaseNumber: 4,
      phaseStatus: "IN_PROGRESS",
    });
    expect(result.activeTaskRules).toContain("- Orchestrator-selected active task: task-x");
    expect(result.activeTaskRules).toContain("- Active task section: Declared work");
    expect(result.activeTaskRules).toContain("- Active task text: Implement boundary");
    expect(result.activeTaskRules).toContain("- Work this active task first. Do not restart earlier completed tasks.");
  });

  it("limits an exhausted task ledger to remaining phase finalization", () => {
    expect(buildPhaseImplementationEntryPolicy({
      activeTask: null, isCodePhase: true, phaseNumber: 2, phaseStatus: "IN_PROGRESS",
    }).activeTaskRules).toEqual([
      "- No unchecked phase task was selected by the orchestrator. Reconcile missing checkpoint, review, evidence, or finalization state only.",
    ]);
  });
});
