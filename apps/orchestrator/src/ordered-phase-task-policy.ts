export type OrderedPhaseTaskExecutor =
  | "agent"
  | "code_review"
  | "verification"
  | "git_commit"
  | "git_push";

export interface OrderedPhaseTask {
  readonly id: string;
  readonly executor: OrderedPhaseTaskExecutor;
  readonly required: boolean;
}

export type OrderedPhaseTaskState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "BLOCKED";

export type OrderedPhaseSelection =
  | Readonly<{ kind: "execute_task"; task: OrderedPhaseTask }>
  | Readonly<{ kind: "phase_complete" }>
  | Readonly<{ kind: "blocked"; task: OrderedPhaseTask }>;

export type OrderedTaskOutcome =
  | "SUCCEEDED"
  | "FIXER_SUCCEEDED"
  | "RECOVERABLE_FAILURE"
  | "NEEDS_CHANGES"
  | "APPROVED"
  | "PASSED"
  | "BLOCKED";

export type OrderedTaskTransition =
  | Readonly<{ kind: "complete_current_task" }>
  | Readonly<{ kind: "retry_current_task"; worker: "agent" | "reviewer" | "fixer" | "checkpoint_repair" }>
  | Readonly<{ kind: "blocked" }>;

export type OrderedPhaseExitTransition =
  | Readonly<{ kind: "complete_phase" }>
  | Readonly<{ kind: "blocked"; missing: "declared_tasks" | "durable_review_approval" }>;

/**
 * Projects a Markdown ledger onto the contract queue. Checkboxes in acceptance
 * criteria, notes, or audit sections are documentation and never become work.
 */
export function selectDeclaredOrderedLedgerItems<
  T extends { readonly section: string; readonly text: string },
>(input: {
  readonly items: readonly T[];
  readonly declaredTaskIds: readonly string[];
  readonly readTaskId: (text: string) => string | null;
}): readonly T[] {
  const itemByTaskId = new Map(
    input.items
      .filter((item) => item.section.trim().toLowerCase() === "phase task ledger")
      .map((item) => [input.readTaskId(item.text), item] as const)
      .filter((entry): entry is readonly [string, T] => entry[0] !== null),
  );
  return input.declaredTaskIds.flatMap((taskId) => {
    const item = itemByTaskId.get(taskId);
    return item ? [item] : [];
  });
}

/** Selects exactly the first unresolved task in declared order. */
export function selectNextOrderedPhaseTask(input: {
  readonly tasks: readonly OrderedPhaseTask[];
  readonly stateByTaskId: ReadonlyMap<string, OrderedPhaseTaskState>;
}): OrderedPhaseSelection {
  for (const task of input.tasks) {
    const state = input.stateByTaskId.get(task.id) ?? "NOT_STARTED";
    if (state === "BLOCKED") return { kind: "blocked", task };
    if (state !== "COMPLETED" && state !== "SKIPPED") return { kind: "execute_task", task };
  }
  return { kind: "phase_complete" };
}

/**
 * Interprets an executor result only for the currently selected task. It never
 * chooses a later task: successful completion returns control to the ordered
 * selector, which reads the phase contract again.
 */
export function selectOrderedTaskTransition(
  task: OrderedPhaseTask,
  outcome: OrderedTaskOutcome,
): OrderedTaskTransition {
  if (outcome === "BLOCKED") return { kind: "blocked" };

  if (task.executor === "code_review") {
    if (outcome === "APPROVED") return { kind: "complete_current_task" };
    if (outcome === "FIXER_SUCCEEDED") return { kind: "retry_current_task", worker: "reviewer" };
    return { kind: "retry_current_task", worker: "fixer" };
  }

  if (task.executor === "verification") {
    if (outcome === "PASSED" || outcome === "SUCCEEDED") return { kind: "complete_current_task" };
    return { kind: "retry_current_task", worker: "checkpoint_repair" };
  }

  if (outcome === "SUCCEEDED") return { kind: "complete_current_task" };
  return { kind: "retry_current_task", worker: "agent" };
}

/**
 * Guards phase completion independently from Markdown checkbox formatting.
 * Declared work must be exhausted and a declared review task must have a
 * durable approval; a successful fixer response is never review authority.
 */
export function selectOrderedPhaseExit(input: {
  readonly tasksComplete: boolean;
  readonly reviewRequired: boolean;
  readonly durableReviewApproved: boolean;
}): OrderedPhaseExitTransition {
  if (!input.tasksComplete) return { kind: "blocked", missing: "declared_tasks" };
  if (input.reviewRequired && !input.durableReviewApproved) {
    return { kind: "blocked", missing: "durable_review_approval" };
  }
  return { kind: "complete_phase" };
}
