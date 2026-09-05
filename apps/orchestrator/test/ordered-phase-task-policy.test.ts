import { describe, expect, it } from "vitest";

import {
  selectNextOrderedPhaseTask,
  selectOrderedPhaseExit,
  selectDeclaredOrderedLedgerItems,
  selectOrderedTaskTransition,
  type OrderedPhaseTask,
} from "../src/ordered-phase-task-policy.js";

const tasks: OrderedPhaseTask[] = [
  { id: "write-code", executor: "agent", required: true },
  { id: "save-commit", executor: "git_commit", required: true },
  { id: "inspect-change", executor: "code_review", required: true },
  { id: "prove-build", executor: "verification", required: true },
  { id: "publish-branch", executor: "git_push", required: false },
];

describe("generic ordered phase task policy", () => {
  it("selects the first unresolved task without knowing its name or executor", () => {
    expect(selectNextOrderedPhaseTask({ tasks, stateByTaskId: new Map() })).toEqual({
      kind: "execute_task",
      task: tasks[0],
    });

    expect(selectNextOrderedPhaseTask({
      tasks,
      stateByTaskId: new Map([["write-code", "COMPLETED"]]),
    })).toEqual({ kind: "execute_task", task: tasks[1] });
  });

  it("does not invent review or verification when they are absent", () => {
    const declared: OrderedPhaseTask[] = [
      { id: "first", executor: "agent", required: true },
      { id: "second", executor: "git_commit", required: true },
    ];
    expect(selectNextOrderedPhaseTask({
      tasks: declared,
      stateByTaskId: new Map([["first", "COMPLETED"]]),
    })).toEqual({ kind: "execute_task", task: declared[1] });
  });

  it("completes a phase whose only declared documentation task is done", () => {
    const declared: OrderedPhaseTask[] = [
      { id: "document-decision", executor: "agent", required: true },
    ];
    expect(selectNextOrderedPhaseTask({
      tasks: declared,
      stateByTaskId: new Map([["document-decision", "COMPLETED"]]),
    })).toEqual({ kind: "phase_complete" });
  });

  it("ignores checkboxes outside the declared Phase Task Ledger", () => {
    const items = [
      { section: "Acceptance Criteria", text: "[contract:not-a-task] optional prose" },
      { section: "Phase Task Ledger", text: "[contract:document-decision] [executor:agent] write it" },
      { section: "Notes", text: "remember this" },
    ];
    expect(selectDeclaredOrderedLedgerItems({
      items,
      declaredTaskIds: ["document-decision"],
      readTaskId: (text) => /\[contract:([^\]]+)\]/.exec(text)?.[1] ?? null,
    })).toEqual([items[1]]);
  });

  it("follows a checkpoint without review when that is the declared order", () => {
    const declared: OrderedPhaseTask[] = [
      { id: "implementation", executor: "agent", required: true },
      { id: "checkpoint", executor: "verification", required: true },
    ];
    expect(selectNextOrderedPhaseTask({
      tasks: declared,
      stateByTaskId: new Map([["implementation", "COMPLETED"]]),
    })).toEqual({ kind: "execute_task", task: declared[1] });
  });

  it("follows more implementation after an approved review when declared", () => {
    const declared: OrderedPhaseTask[] = [
      { id: "implementation-a", executor: "agent", required: true },
      { id: "review", executor: "code_review", required: true },
      { id: "implementation-b", executor: "agent", required: true },
    ];
    const state = new Map([
      ["implementation-a", "COMPLETED"],
      ["review", "COMPLETED"],
    ] as const);
    expect(selectNextOrderedPhaseTask({ tasks: declared, stateByTaskId: state }))
      .toEqual({ kind: "execute_task", task: declared[2] });
  });

  it("completes a review task on approval and keeps findings on the same task", () => {
    expect(selectOrderedTaskTransition(tasks[2]!, "APPROVED"))
      .toEqual({ kind: "complete_current_task" });
    expect(selectOrderedTaskTransition(tasks[2]!, "NEEDS_CHANGES"))
      .toEqual({ kind: "retry_current_task", worker: "fixer" });
  });

  it("keeps review incomplete after a fixer succeeds and sends it back to an independent reviewer", () => {
    expect(selectOrderedTaskTransition(tasks[2]!, "FIXER_SUCCEEDED"))
      .toEqual({ kind: "retry_current_task", worker: "reviewer" });
  });

  it("does not let checked task prose bypass a missing durable review approval", () => {
    expect(selectOrderedPhaseExit({
      tasksComplete: true,
      reviewRequired: true,
      durableReviewApproved: false,
    })).toEqual({ kind: "blocked", missing: "durable_review_approval" });
    expect(selectOrderedPhaseExit({
      tasksComplete: true,
      reviewRequired: true,
      durableReviewApproved: true,
    })).toEqual({ kind: "complete_phase" });
  });

  it("repairs and reruns a failed verification task", () => {
    expect(selectOrderedTaskTransition(tasks[3]!, "RECOVERABLE_FAILURE"))
      .toEqual({ kind: "retry_current_task", worker: "checkpoint_repair" });
    expect(selectOrderedTaskTransition(tasks[3]!, "PASSED"))
      .toEqual({ kind: "complete_current_task" });
  });

  it("completes the phase only when no declared task remains", () => {
    expect(selectNextOrderedPhaseTask({
      tasks,
      stateByTaskId: new Map(tasks.map((task) => [task.id, "COMPLETED"])),
    })).toEqual({ kind: "phase_complete" });
  });

  it("stops only when the active task records an explicit blocker", () => {
    expect(selectNextOrderedPhaseTask({
      tasks,
      stateByTaskId: new Map([["write-code", "BLOCKED"]]),
    })).toEqual({ kind: "blocked", task: tasks[0] });
  });
});
