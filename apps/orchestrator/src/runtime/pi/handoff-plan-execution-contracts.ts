import {
  isHandoffPlanV1,
  type HandoffPlanV1,
  type ProviderConnectionRecord,
  type RuntimeAttemptKind,
  type RuntimeInvocationKind,
  type RuntimeSafeFailureCode,
} from "@hepha/shared";

export interface RuntimeAttemptContextV1 {
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly workflowRunId: string | null;
  readonly workflowNodeId: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly taskId: string | null;
  readonly correlationId: string;
  readonly selectedLessonIds: readonly string[];
  readonly invocationKind: RuntimeInvocationKind;
  readonly rootInvocationId: string;
  readonly parentInvocationId: string | null;
}

export interface RuntimeRecoveryContextV1 {
  readonly priorInvocationId: string;
  readonly checkpointId: string;
  readonly checkpointCursor: string;
  readonly unresolvedTaskCursor: string;
  readonly completedTaskIds: readonly string[];
}

export interface RuntimeExecutorInput {
  readonly plan: HandoffPlanV1;
  readonly stepIndex: number;
  readonly attemptKind: RuntimeAttemptKind;
  readonly invocationId: string;
  readonly context: RuntimeAttemptContextV1;
  readonly inputRef: string;
  readonly recoveryContext?: RuntimeRecoveryContextV1 | null;
}

export type RuntimeAuthenticationProjection =
  | { readonly kind: "pi_session" }
  | { readonly kind: "injected_connection_secret"; readonly secretRef: string; readonly version: number };

export interface PiAttemptProcessResult {
  readonly status: "completed" | "failed" | "timed_out" | "cancelled";
  readonly exitCode: number | null;
  readonly failureCode: RuntimeSafeFailureCode | null;
  readonly output?: string;
}

export function isRuntimeExecutorInput(value: unknown): value is RuntimeExecutorInput {
  if (!record(value)) return false;
  const keys = ["plan", "stepIndex", "attemptKind", "invocationId", "context", "inputRef"];
  if (Object.hasOwn(value, "recoveryContext")) keys.push("recoveryContext");
  return exactKeys(value, keys) && isHandoffPlanV1(value.plan) && isRuntimeAttemptContextV1(value.context)
    && safeText(value.inputRef, 512) && safeText(value.invocationId, 512);
}

export function isLegalRuntimeStepSelection(input: RuntimeExecutorInput): boolean {
  if (input.stepIndex === 0) return input.attemptKind === "primary" && input.plan.steps[0]?.kind === "primary";
  return input.stepIndex === 1 && (input.attemptKind === "fallback" || input.attemptKind === "recovery")
    && input.plan.steps[1]?.kind === "recovery";
}

export function isRecoveryContextForSelection(input: RuntimeExecutorInput): boolean {
  if (input.attemptKind !== "recovery") return input.recoveryContext === undefined || input.recoveryContext === null;
  return isRuntimeRecoveryContextV1(input.recoveryContext) && input.recoveryContext.priorInvocationId === input.invocationId;
}

export function isRuntimeAttemptContextV1(value: unknown): value is RuntimeAttemptContextV1 {
  if (!record(value) || !exactKeys(value, [
    "projectId", "cardKey", "workflowRunId", "workflowNodeId", "phaseExecutionContractId", "phaseNumber",
    "taskId", "correlationId", "selectedLessonIds", "invocationKind", "rootInvocationId", "parentInvocationId",
  ])) return false;
  if (!safeText(value.projectId, 512) || !nullableText(value.cardKey, 512) || !nullableText(value.workflowRunId, 512)
    || !nullableText(value.workflowNodeId, 512) || !nullableText(value.phaseExecutionContractId, 512)
    || !(value.phaseNumber === null || nonNegativeInteger(value.phaseNumber)) || !nullableText(value.taskId, 512)
    || !safeText(value.correlationId, 512) || !sortedUniqueText(value.selectedLessonIds)
    || (value.invocationKind !== "root" && value.invocationKind !== "nested")
    || !safeText(value.rootInvocationId, 512) || !nullableText(value.parentInvocationId, 512)) return false;
  if ((value.phaseExecutionContractId === null) !== (value.phaseNumber === null)) return false;
  return value.invocationKind === "root" ? value.parentInvocationId === null : value.parentInvocationId !== null;
}

export function isRuntimeRecoveryContextV1(value: unknown): value is RuntimeRecoveryContextV1 {
  return record(value) && exactKeys(value, [
    "priorInvocationId", "checkpointId", "checkpointCursor", "unresolvedTaskCursor", "completedTaskIds",
  ]) && safeText(value.priorInvocationId, 512) && safeText(value.checkpointId, 512)
    && safeText(value.checkpointCursor, 512) && safeText(value.unresolvedTaskCursor, 512)
    && sortedUniqueText(value.completedTaskIds);
}

export function runtimeAuthenticationFor(connection: ProviderConnectionRecord): RuntimeAuthenticationProjection | null {
  if (connection.kind === "pi_session") {
    return connection.secretRef === null && connection.secretVersion === null ? { kind: "pi_session" } : null;
  }
  return typeof connection.secretRef === "string" && connection.secretRef.length > 0
    && typeof connection.secretVersion === "number" && positiveInteger(connection.secretVersion)
    ? { kind: "injected_connection_secret", secretRef: connection.secretRef, version: connection.secretVersion }
    : null;
}

export function isUsableRuntimeConnection(connection: ProviderConnectionRecord, expectedId: string): boolean {
  return connection.connectionId === expectedId && connection.lifecycleState === "active"
    && ((connection.kind === "pi_session" && connection.provider.kind === "pi_session")
      || (connection.kind === "known" && connection.provider.kind === "known")
      || (connection.kind === "custom" && connection.provider.kind === "custom"));
}

export function normalizePiAttemptProcessResult(result: unknown): Required<PiAttemptProcessResult> {
  if (!isProcessResult(result)) return invalidProcessResult();
  const output = result.output ?? "";
  if (result.status === "completed") return result.failureCode === null
    ? { status: "completed", exitCode: result.exitCode, failureCode: null, output } : invalidProcessResult();
  if (result.status === "timed_out") return result.failureCode === null || result.failureCode === "timed_out"
    ? { status: "timed_out", exitCode: result.exitCode, failureCode: "timed_out", output } : invalidProcessResult();
  if (result.status === "cancelled") return result.failureCode === null || result.failureCode === "cancelled"
    ? { status: "cancelled", exitCode: result.exitCode, failureCode: "cancelled", output } : invalidProcessResult();
  if (result.failureCode === "timed_out" || result.failureCode === "cancelled") return invalidProcessResult();
  return { status: "failed", exitCode: result.exitCode, failureCode: result.failureCode ?? "provider_unavailable", output };
}

const SAFE_FAILURE_CODES: readonly RuntimeSafeFailureCode[] = [
  "invalid_input", "connection_unavailable", "auth_unavailable", "provider_unsupported", "secret_read_failed",
  "context_preparation_failed", "spawn_failed", "payment_required", "quota_exceeded", "rate_limited",
  "endpoint_unavailable", "provider_unavailable", "timed_out", "cancelled", "safety_rejected", "invalid_output",
  "checkpoint_required", "cleanup_failed", "persistence_failed",
];

function isProcessResult(value: unknown): value is PiAttemptProcessResult {
  if (!record(value)) return false;
  const keys = ["status", "exitCode", "failureCode", ...(Object.hasOwn(value, "output") ? ["output"] : [])];
  return exactKeys(value, keys)
    && includes(["completed", "failed", "timed_out", "cancelled"] as const, value.status)
    && (value.exitCode === null || (typeof value.exitCode === "number" && Number.isSafeInteger(value.exitCode)))
    && (value.failureCode === null || (typeof value.failureCode === "string" && SAFE_FAILURE_CODES.includes(value.failureCode as RuntimeSafeFailureCode)))
    && (value.output === undefined || typeof value.output === "string");
}
function invalidProcessResult(): Required<PiAttemptProcessResult> { return { status: "failed", exitCode: null, failureCode: "invalid_output", output: "" }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function safeText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function nullableText(value: unknown, maximum: number): boolean { return value === null || safeText(value, maximum); }
function positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function sortedUniqueText(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 128 && value.every((item) => safeText(item, 512)) && value.every((item, index) => index === 0 || value[index - 1]! < item); }
function includes<T extends string>(values: readonly T[], value: unknown): value is T { return typeof value === "string" && values.includes(value as T); }
