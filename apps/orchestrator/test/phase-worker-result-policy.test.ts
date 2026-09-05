import { describe, expect, it } from "vitest";
import {
  evaluatePhaseRepairLoop,
  evaluatePhaseWorkerResultContinuation,
} from "../src/phase-worker-result-policy.js";

const nextSamePhaseTask = {
  kind: "select" as const,
  phaseNumber: 3,
  taskId: "phase-3.task-2",
  reason: "Selected the first unchecked task in the earliest non-terminal phase.",
};

function evaluate(overrides: Partial<Parameters<typeof evaluatePhaseWorkerResultContinuation>[0]> = {}) {
  return evaluatePhaseWorkerResultContinuation({
    absoluteSafetyCap: 15,
    blocker: null,
    hasDurableTaskProgress: true,
    phaseNumber: 3,
    phaseStatus: "IN_PROGRESS",
    reconciliationDecision: nextSamePhaseTask,
    recoveryAttempt: 0,
    ...overrides,
  });
}

describe("phase worker result continuation policy", () => {
  it("continues the same phase only when reconciliation selects its next durable task", () => {
    expect(evaluate()).toEqual({
      kind: "continue",
      nextTaskId: "phase-3.task-2",
      reason: "Phase 3 has durable task-ledger progress; dispatch the reconciled next same-phase task phase-3.task-2.",
    });
  });

  it.each([
    [3, 9, "phase-9.task-1"],
    // Contract order, rather than numeric ordering, owns the handoff. This
    // deliberately proves a different phase ordering has the same behaviour.
    [12, 4, "phase-4.task-1"],
  ])("advances generically after completed contract phase %i selects phase %i", (completedPhase, nextPhase, nextTaskId) => {
    const decision = evaluate({
      phaseNumber: completedPhase,
      phaseStatus: "COMPLETED",
      reconciliationDecision: {
        kind: "select",
        phaseNumber: nextPhase,
        taskId: nextTaskId,
        reason: "Selected the first unchecked task in the next declared contract phase.",
      },
    });

    expect(decision).toMatchObject({ kind: "phase_completed" });
    expect(decision.reason).toContain("declared durable tasks and settled gates");
  });

  it("advances a completed terminal checkpoint without requiring a same-phase task", () => {
    const decision = evaluate({
      phaseStatus: "COMPLETED",
      reconciliationDecision: {
        kind: "all_terminal",
        reason: "Every declared phase is terminal.",
      },
    });

    expect(decision).toMatchObject({ kind: "phase_completed" });
  });

  it.each([
    ["no durable progress", { hasDurableTaskProgress: false }, "no durable checked-task progress"],
    ["a durable blocker", { blocker: "Blocked: waiting for credentials" }, "durable blocker"],
    ["missing completion state", { phaseStatus: "PENDING" }, "not IN_PROGRESS"],
    ["a next task in another phase", {
      reconciliationDecision: { ...nextSamePhaseTask, phaseNumber: 4 },
    }, "no safely selectable next same-phase task"],
    ["missing durable quality-gate evidence", {
      reconciliationDecision: {
        kind: "blocked" as const,
        phaseNumber: 3,
        reason: "Phase 3 has no readable Quality Gate Evidence table.",
      },
    }, "Quality Gate Evidence"],
    ["an exhausted safety cap", { recoveryAttempt: 15 }, "absolute safety cap (15) is exhausted"],
  ])("fails closed for %s", (_name, overrides, reason) => {
    const decision = evaluate(overrides);

    expect(decision).toMatchObject({ kind: "fail_closed" });
    expect(decision.reason).toContain(reason);
  });
});

describe("generic phase repair-and-rerun transition", () => {
  it.each(["test_coverage_restored", "quality_gate_failed", "authoritative_handoff_invalid"] as const)(
    "keeps the active phase running for %s",
    (trigger) => {
      expect(evaluatePhaseRepairLoop({
        detail: "verification must be repaired",
        failurePolicy: "repair_and_rerun",
        phaseNumber: 7,
        trigger,
      })).toEqual({
        kind: "retry_same_phase",
        reason: "Phase 7 requires repair and rerun: verification must be repaired",
      });
    },
  );

  it("does not invent repair authority when the contract lacks repair_and_rerun", () => {
    expect(evaluatePhaseRepairLoop({
      detail: "verification must be repaired",
      failurePolicy: null,
      phaseNumber: 7,
      trigger: "quality_gate_failed",
    })).toEqual({
      kind: "fail_workflow",
      reason: "Phase 7 cannot automatically repair because its failure policy is missing.",
    });
  });
});
