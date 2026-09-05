import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  isHandoffPlanV1,
  isRuntimeInvocationReceiptV1,
  type HandoffPlanV1,
  type RuntimeAttemptV1,
  type RuntimeInvocationReceiptV1,
  type RuntimeWorkState,
} from "@hepha/shared";
import type { RuntimeInvocationStore, StoredImplementationTaskRun } from "@hepha/db";
import {
  isRuntimeAttemptContextV1,
  type HandoffPlanAttemptResult,
  type HandoffPlanExecutor,
  type RuntimeAttemptContextV1,
  type RuntimeAttemptExecutionHooks,
  type RuntimeRecoveryContextV1,
} from "./handoff-plan-executor.js";

export const RUNTIME_WORK_STATE_SCHEMA_VERSION = "runtime-work-state/v1" as const;

export interface DurableWorkStateSnapshotV1 {
  readonly schemaVersion: typeof RUNTIME_WORK_STATE_SCHEMA_VERSION;
  readonly invocationId: string;
  readonly attemptId: string;
  readonly workState: RuntimeWorkState;
  readonly checkpointId: string | null;
  readonly checkpointCursor: string | null;
  readonly unresolvedTaskCursor: string | null;
  readonly completedTaskIds: readonly string[];
}

export interface DurableWorkStatePort {
  read(input: {
    readonly invocationId: string;
    readonly attemptId: string;
    readonly context: RuntimeAttemptContextV1;
  }): Promise<unknown> | unknown;
}

export interface RuntimeExecutionCoordinatorDependencies {
  readonly executor: Pick<HandoffPlanExecutor, "executeAttempt">;
  readonly now: () => string;
  readonly receipts: Pick<RuntimeInvocationStore, "getInvocation" | "settleAttempt" | "settleInvocation">;
  readonly workState: DurableWorkStatePort;
}

export type RuntimeCoordinatorErrorCode =
  | "RUNTIME_INVALID_PLAN"
  | "RUNTIME_INVALID_CONTEXT"
  | "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED"
  | "RUNTIME_ROUTE_SEQUENCE_EXHAUSTED"
  | "RUNTIME_PERSISTENCE_FAILED";

export type RuntimeExecutionResult =
  | { readonly ok: true; readonly classification: "primary" | "fallback" | "recovery"; readonly attemptResult: Extract<HandoffPlanAttemptResult, { ok: true }> }
  | {
    readonly ok: false;
    readonly code: RuntimeCoordinatorErrorCode;
    readonly classification: "terminal" | "fallback" | "recovery";
    readonly attemptResult: HandoffPlanAttemptResult | null;
  };

interface CoordinatorInput {
  readonly plan: HandoffPlanV1;
  readonly invocationId: string;
  readonly context: RuntimeAttemptContextV1;
  readonly inputRef: string;
}

/** Coordinates one primary attempt and at most one plan-authorized fallback or recovery attempt. */
export class RuntimeExecutionCoordinator {
  constructor(private readonly dependencies: RuntimeExecutionCoordinatorDependencies) {}

  async execute(raw: unknown, hooks: RuntimeAttemptExecutionHooks = {}): Promise<RuntimeExecutionResult> {
    if (!isCoordinatorInput(raw)) return failure("RUNTIME_INVALID_CONTEXT", "terminal", null);
    if (!isHandoffPlanV1(raw.plan)) return failure("RUNTIME_INVALID_PLAN", "terminal", null);
    if (!isRuntimeAttemptContextV1(raw.context) || !safeText(raw.inputRef) || !safeText(raw.invocationId)) {
      return failure("RUNTIME_INVALID_CONTEXT", "terminal", null);
    }
    const input = raw as unknown as CoordinatorInput;
    const primary = await this.dependencies.executor.executeAttempt({
      ...input,
      stepIndex: 0,
      attemptKind: "primary",
    }, hooks);
    if (primary.ok) return { ok: true, classification: "primary", attemptResult: primary };
    if (primary.code === "RUNTIME_PERSISTENCE_FAILED") {
      return this.terminal(primary, "RUNTIME_PERSISTENCE_FAILED");
    }
    if (primary.code === "RUNTIME_ATTEMPT_EXECUTION_STOPPED") {
      return primary.receipt?.status === "running"
        ? this.terminal(primary, "RUNTIME_ROUTE_SEQUENCE_EXHAUSTED")
        : failure("RUNTIME_ROUTE_SEQUENCE_EXHAUSTED", "terminal", primary);
    }
    if (!primary.attempt || !primary.receipt || input.plan.steps.length === 1) {
      return failure("RUNTIME_ROUTE_SEQUENCE_EXHAUSTED", "terminal", primary);
    }

    let snapshot: unknown;
    try {
      snapshot = await this.dependencies.workState.read({
        invocationId: input.invocationId,
        attemptId: primary.attempt.attemptId,
        context: input.context,
      });
    } catch {
      return this.terminal(primary, "RUNTIME_PERSISTENCE_FAILED");
    }
    if (!isDurableWorkStateSnapshotV1(snapshot)
      || snapshot.invocationId !== input.invocationId
      || snapshot.attemptId !== primary.attempt.attemptId
      || snapshot.workState !== primary.attempt.workState) {
      return this.terminal(primary, "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED");
    }
    if (snapshot.workState === "started") {
      return this.terminal(primary, "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED");
    }

    const classification = snapshot.workState === "none" ? "fallback" : "recovery";
    const recoveryContext = classification === "recovery" ? toRecoveryContext(snapshot) : null;
    if (classification === "recovery" && recoveryContext === null) {
      return this.terminal(primary, "RUNTIME_RECOVERY_CHECKPOINT_REQUIRED");
    }
    const second = await this.dependencies.executor.executeAttempt({
      ...input,
      stepIndex: 1,
      attemptKind: classification,
      recoveryContext,
    }, hooks);
    if (second.ok) return { ok: true, classification, attemptResult: second };
    return failure("RUNTIME_ROUTE_SEQUENCE_EXHAUSTED", classification, second);
  }

  private terminal(primary: Extract<HandoffPlanAttemptResult, { ok: false }>, code: RuntimeCoordinatorErrorCode): RuntimeExecutionResult {
    if (!primary.attempt || !primary.receipt || !isTerminalAttempt(primary.attempt)) {
      return failure(code === "RUNTIME_PERSISTENCE_FAILED" ? code : "RUNTIME_PERSISTENCE_FAILED", "terminal", primary);
    }
    if (!this.dependencies.receipts.settleAttempt(primary.attempt).ok) {
      return failure("RUNTIME_PERSISTENCE_FAILED", "terminal", primary);
    }
    const current = this.dependencies.receipts.getInvocation(primary.receipt.invocationId);
    if (!current.ok || current.value === null) return failure("RUNTIME_PERSISTENCE_FAILED", "terminal", primary);
    const attempt = current.value.attempts.find((candidate) => candidate.attemptId === primary.attempt!.attemptId);
    if (!attempt || !isTerminalAttempt(attempt)) return failure("RUNTIME_PERSISTENCE_FAILED", "terminal", primary);
    const settled = settleFromAttempt(current.value.receipt, attempt, this.dependencies.now());
    if (!isRuntimeInvocationReceiptV1(settled) || !this.dependencies.receipts.settleInvocation(settled).ok) {
      return failure("RUNTIME_PERSISTENCE_FAILED", "terminal", primary);
    }
    return failure(code, "terminal", { ...primary, attempt, receipt: settled });
  }
}

/** Reads only normalized persisted work/checkpoint facts; it never inspects model output or elapsed time. */
export class RuntimeInvocationDurableWorkStatePort implements DurableWorkStatePort {
  constructor(protected readonly receipts: Pick<RuntimeInvocationStore, "getInvocation">) {}

  read(input: {
    readonly invocationId: string;
    readonly attemptId: string;
    readonly context: RuntimeAttemptContextV1;
  }): DurableWorkStateSnapshotV1 | null | Promise<DurableWorkStateSnapshotV1 | null> {
    const attempt = this.readAttempt(input.invocationId, input.attemptId);
    if (!attempt) return null;
    return snapshotFromAttempt(input.invocationId, attempt, attempt.checkpointCursor, []);
  }

  protected readAttempt(invocationId: string, attemptId: string): RuntimeAttemptV1 | null {
    const evidence = this.receipts.getInvocation(invocationId);
    if (!evidence.ok || evidence.value === null) return null;
    return evidence.value.attempts.find((candidate) => candidate.attemptId === attemptId) ?? null;
  }
}

/** Adds authoritative phase-task cursor facts to normalized attempt work state for no-replay recovery. */
export class WorkflowTaskDurableWorkStatePort extends RuntimeInvocationDurableWorkStatePort {
  constructor(
    receipts: Pick<RuntimeInvocationStore, "getInvocation">,
    private readonly tasks: {
      listImplementationTaskRuns(projectId: string, cardKey: string, phaseNumber: number): Promise<StoredImplementationTaskRun[]>;
    },
  ) { super(receipts); }

  override async read(input: {
    readonly invocationId: string;
    readonly attemptId: string;
    readonly context: RuntimeAttemptContextV1;
  }): Promise<DurableWorkStateSnapshotV1 | null> {
    const attempt = this.readAttempt(input.invocationId, input.attemptId);
    if (!attempt || attempt.workState !== "checkpointed") {
      return attempt ? snapshotFromAttempt(input.invocationId, attempt, null, []) : null;
    }
    if (input.context.cardKey === null || input.context.phaseNumber === null) return null;
    const rows = await this.tasks.listImplementationTaskRuns(
      input.context.projectId,
      input.context.cardKey,
      input.context.phaseNumber,
    );
    const ordered = [...rows].sort((left, right) => left.taskIndex - right.taskIndex || left.taskId.localeCompare(right.taskId));
    const completedTaskIds = ordered
      .filter((row) => row.status === "COMPLETED" || row.status === "SKIPPED")
      .map((row) => row.taskId)
      .sort();
    const unresolved = ordered.find((row) => row.status === "IN_PROGRESS")
      ?? ordered.find((row) => row.status === "NOT_STARTED");
    if (!unresolved) return null;
    return snapshotFromAttempt(input.invocationId, attempt, unresolved.taskId, completedTaskIds);
  }
}

export function isDurableWorkStateSnapshotV1(value: unknown): value is DurableWorkStateSnapshotV1 {
  if (!record(value) || !exactKeys(value, [
    "schemaVersion", "invocationId", "attemptId", "workState", "checkpointId", "checkpointCursor",
    "unresolvedTaskCursor", "completedTaskIds",
  ])) return false;
  if (value.schemaVersion !== RUNTIME_WORK_STATE_SCHEMA_VERSION || !safeText(value.invocationId)
    || !safeText(value.attemptId) || !includes(["none", "started", "checkpointed"] as const, value.workState)
    || !nullableText(value.checkpointId) || !nullableText(value.checkpointCursor)
    || !nullableText(value.unresolvedTaskCursor) || !sortedUniqueText(value.completedTaskIds)) return false;
  if (value.workState === "checkpointed") {
    return value.checkpointId !== null && value.checkpointCursor !== null && value.unresolvedTaskCursor !== null;
  }
  return value.checkpointId === null && value.checkpointCursor === null && value.unresolvedTaskCursor === null
    && value.completedTaskIds.length === 0;
}

function snapshotFromAttempt(
  invocationId: string,
  attempt: RuntimeAttemptV1,
  unresolvedTaskCursor: string | null,
  completedTaskIds: readonly string[],
): DurableWorkStateSnapshotV1 {
  return {
    schemaVersion: RUNTIME_WORK_STATE_SCHEMA_VERSION,
    invocationId,
    attemptId: attempt.attemptId,
    workState: attempt.workState,
    checkpointId: attempt.checkpointId,
    checkpointCursor: attempt.checkpointCursor,
    unresolvedTaskCursor: attempt.workState === "checkpointed" ? unresolvedTaskCursor : null,
    completedTaskIds: attempt.workState === "checkpointed" ? completedTaskIds : [],
  };
}

function toRecoveryContext(snapshot: DurableWorkStateSnapshotV1): RuntimeRecoveryContextV1 | null {
  if (snapshot.workState !== "checkpointed" || snapshot.checkpointId === null
    || snapshot.checkpointCursor === null || snapshot.unresolvedTaskCursor === null) return null;
  return {
    priorInvocationId: snapshot.invocationId,
    checkpointId: snapshot.checkpointId,
    checkpointCursor: snapshot.checkpointCursor,
    unresolvedTaskCursor: snapshot.unresolvedTaskCursor,
    completedTaskIds: snapshot.completedTaskIds,
  };
}

function isTerminalAttempt(attempt: RuntimeAttemptV1): boolean {
  return attempt.status === "completed" || attempt.status === "failed"
    || attempt.status === "timed_out" || attempt.status === "cancelled";
}

function settleFromAttempt(receipt: RuntimeInvocationReceiptV1, attempt: RuntimeAttemptV1, settledAt: string): RuntimeInvocationReceiptV1 {
  const status = attempt.status === "timed_out" ? "timed_out"
    : attempt.status === "cancelled" ? "cancelled" : "failed";
  return {
    ...receipt,
    status,
    settledAt,
    durationMs: Math.max(0, new Date(settledAt).getTime() - new Date(receipt.openedAt).getTime()),
    failureCode: attempt.failureCode,
  };
}

function isCoordinatorInput(value: unknown): value is Record<string, unknown> {
  return record(value) && exactKeys(value, ["plan", "invocationId", "context", "inputRef"]);
}
function failure(code: RuntimeCoordinatorErrorCode, classification: "terminal" | "fallback" | "recovery", attemptResult: HandoffPlanAttemptResult | null): RuntimeExecutionResult {
  return { ok: false, code, classification, attemptResult };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function safeText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function nullableText(value: unknown): boolean { return value === null || safeText(value); }
function sortedUniqueText(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 128 && value.every(safeText) && value.every((item, index) => index === 0 || value[index - 1]! < item); }
function includes<T extends string>(values: readonly T[], value: unknown): value is T { return typeof value === "string" && values.includes(value as T); }
