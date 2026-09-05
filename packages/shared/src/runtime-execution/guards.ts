import {
  isHandoffPlanV1,
  type HandoffPlanV1,
  type RouteIdentityV1,
} from "../agent-routing.js";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  type RuntimeAttemptStartV1,
  type RuntimeAttemptV1,
  type RuntimeEvidenceSourceV1,
  type RuntimeFeatureInvocationFilterV1,
  type RuntimeInvocationEvidenceV1,
  type RuntimeInvocationOpenV1,
  type RuntimeInvocationReceiptV1,
  type RuntimePersistenceErrorCode,
  type RuntimePersistenceRejectionV1,
  type RuntimeRouteChangeEventV1,
  type RuntimeSafeFailureCode,
} from "./contracts.js";

const ACTION_TYPES = ["discovery_planning", "implementation", "review", "completion", "knowledge_documentation"] as const;
const ROLE_IDS = ["product-architect", "requirements-agent", "ux-design-agent", "planning-agent", "implementation-agent", "code-review-agent", "completion-agent", "phase-lessons-capture-agent", "feature-lessons-writer-agent", "post-complete-lessons-curator-agent"] as const;
const FAILURE_CODES: readonly RuntimeSafeFailureCode[] = [
  "invalid_input", "connection_unavailable", "auth_unavailable", "provider_unsupported",
  "secret_read_failed", "context_preparation_failed", "spawn_failed", "payment_required",
  "quota_exceeded", "rate_limited", "endpoint_unavailable", "provider_unavailable",
  "timed_out", "cancelled", "safety_rejected", "invalid_output", "checkpoint_required",
  "cleanup_failed", "persistence_failed",
];
const REJECTION_MESSAGES: Readonly<Record<RuntimePersistenceErrorCode, string>> = {
  RUNTIME_INVALID_RECEIPT: "Runtime invocation evidence is invalid.",
  RUNTIME_PERSISTENCE_CONFLICT: "Runtime invocation evidence conflicts with an immutable persisted fact.",
  RUNTIME_PERSISTENCE_CORRUPT: "Persisted runtime invocation evidence is invalid.",
  RUNTIME_EVIDENCE_HISTORY_LIMIT: "Runtime invocation evidence exceeds the bounded history limit.",
};

export function runtimePersistenceRejection(code: RuntimePersistenceErrorCode): RuntimePersistenceRejectionV1 {
  return Object.freeze({ ok: false, code, message: REJECTION_MESSAGES[code] });
}

export function isRuntimeInvocationReceiptV1(value: unknown): value is RuntimeInvocationReceiptV1 {
  if (!record(value) || !exactKeys(value, [
    "schemaVersion", "invocationId", "rootInvocationId", "parentInvocationId", "invocationKind",
    "planHash", "actionId", "actionType", "roleId", "promptVersion", "policySource", "revisionId",
    "approvedPrimaryRoute", "approvedSecondRoute", "projectId", "cardKey", "workflowRunId",
    "workflowNodeId", "phaseExecutionContractId", "phaseNumber", "taskId", "correlationId",
    "selectedLessonIds", "attemptIds", "routeChangeEventIds", "status", "openedAt", "settledAt",
    "durationMs", "failureCode",
  ])) return false;

  if (value.schemaVersion !== RUNTIME_EXECUTION_SCHEMA_VERSION
    || !text(value.invocationId, 512) || !text(value.rootInvocationId, 512)
    || !nullableText(value.parentInvocationId, 512)
    || (value.invocationKind !== "root" && value.invocationKind !== "nested")
    || !sha256(value.planHash) || !actionId(value.actionId)
    || !includes(ACTION_TYPES, value.actionType) || !includes(ROLE_IDS, value.roleId)
    || !text(value.promptVersion, 256)
    || (value.policySource !== "global" && value.policySource !== "action_type" && value.policySource !== "action")
    || !text(value.revisionId, 256) || !isRuntimeSafeRouteIdentityV1(value.approvedPrimaryRoute)
    || (value.approvedSecondRoute !== null && !isRuntimeSafeRouteIdentityV1(value.approvedSecondRoute))
    || !text(value.projectId, 512) || !nullableText(value.cardKey, 512)
    || !nullableText(value.workflowRunId, 512) || !nullableText(value.workflowNodeId, 512)
    || !nullableText(value.phaseExecutionContractId, 512)
    || !nullableNonNegativeInteger(value.phaseNumber)
    || !nullableText(value.taskId, 512) || !text(value.correlationId, 512)
    || !sortedUniqueText(value.selectedLessonIds, 128, 512)
    || !orderedIds(value.attemptIds, 1, 2) || !orderedIds(value.routeChangeEventIds, 0, 1)
    || !includes(["running", "completed", "failed", "timed_out", "cancelled"] as const, value.status)
    || !timestamp(value.openedAt) || !nullableTimestamp(value.settledAt)
    || !nullableNonNegativeInteger(value.durationMs) || !nullableFailure(value.failureCode)) return false;

  const receipt = value as unknown as RuntimeInvocationReceiptV1;
  if (receipt.invocationKind === "root") {
    if (receipt.rootInvocationId !== receipt.invocationId || receipt.parentInvocationId !== null) return false;
  } else if (receipt.parentInvocationId === null || receipt.rootInvocationId === receipt.invocationId) return false;

  if ((receipt.phaseExecutionContractId === null) !== (receipt.phaseNumber === null)) return false;
  if (receipt.approvedSecondRoute !== null && sameRoute(receipt.approvedPrimaryRoute, receipt.approvedSecondRoute)) return false;
  if (receipt.attemptIds.length === 2 && (receipt.approvedSecondRoute === null || receipt.routeChangeEventIds.length !== 1)) return false;
  if (receipt.attemptIds.length === 1 && receipt.routeChangeEventIds.length > 1) return false;

  if (receipt.status === "running") {
    return receipt.settledAt === null && receipt.durationMs === null && receipt.failureCode === null;
  }
  if (receipt.settledAt === null || receipt.durationMs === null || !atOrAfter(receipt.settledAt, receipt.openedAt)
    || elapsed(receipt.openedAt, receipt.settledAt) !== receipt.durationMs) return false;
  return receipt.status === "completed" ? receipt.failureCode === null : receipt.failureCode !== null;
}

export function isRuntimeAttemptV1(value: unknown): value is RuntimeAttemptV1 {
  if (!record(value) || !exactKeys(value, [
    "schemaVersion", "attemptId", "invocationId", "attemptIndex", "attemptKind", "approvedRoute",
    "actualRoute", "providerId", "authenticationConnectionId", "authenticationKind", "credentialVersion",
    "workState", "checkpointId", "checkpointCursor", "status", "preparationStartedAt", "startedAt",
    "spawnedAt", "terminalAt", "durationMs", "exitCode", "timeoutMarker", "failureCode",
  ])) return false;

  if (value.schemaVersion !== RUNTIME_EXECUTION_SCHEMA_VERSION || !text(value.attemptId, 512)
    || !text(value.invocationId, 512) || (value.attemptIndex !== 0 && value.attemptIndex !== 1)
    || !includes(["primary", "fallback", "recovery"] as const, value.attemptKind)
    || !isRuntimeSafeRouteIdentityV1(value.approvedRoute)
    || (value.actualRoute !== null && !isRuntimeSafeRouteIdentityV1(value.actualRoute))
    || !nullableText(value.providerId, 256) || !nullableText(value.authenticationConnectionId, 512)
    || (value.authenticationKind !== null && value.authenticationKind !== "pi_session" && value.authenticationKind !== "injected_connection_secret")
    || !nullablePositiveInteger(value.credentialVersion)
    || !includes(["none", "started", "checkpointed"] as const, value.workState)
    || !nullableText(value.checkpointId, 512) || !nullableText(value.checkpointCursor, 512)
    || !includes(["preparing", "running", "completed", "failed", "timed_out", "cancelled"] as const, value.status)
    || !timestamp(value.preparationStartedAt) || !nullableTimestamp(value.startedAt)
    || !nullableTimestamp(value.spawnedAt) || !nullableTimestamp(value.terminalAt)
    || !nullableNonNegativeInteger(value.durationMs) || !nullableExitCode(value.exitCode)
    || typeof value.timeoutMarker !== "boolean" || !nullableFailure(value.failureCode)) return false;

  const attempt = value as unknown as RuntimeAttemptV1;
  if (attempt.attemptIndex === 0 ? attempt.attemptKind !== "primary" : attempt.attemptKind === "primary") return false;
  if (attempt.actualRoute !== null && !sameRoute(attempt.actualRoute, attempt.approvedRoute)) return false;
  const authAbsent = attempt.providerId === null && attempt.authenticationConnectionId === null
    && value.authenticationKind === null && value.credentialVersion === null;
  const piSession = attempt.providerId !== null && attempt.authenticationConnectionId !== null
    && attempt.authenticationKind === "pi_session" && attempt.credentialVersion === null;
  const injected = attempt.providerId !== null && attempt.authenticationConnectionId !== null
    && attempt.authenticationKind === "injected_connection_secret" && positiveInteger(attempt.credentialVersion);
  if (!authAbsent && !piSession && !injected) return false;
  if (attempt.actualRoute !== null && authAbsent) return false;

  if (attempt.workState === "checkpointed") {
    if (attempt.checkpointId === null || attempt.checkpointCursor === null) return false;
  } else if (attempt.checkpointId !== null || attempt.checkpointCursor !== null) return false;

  if (attempt.status === "preparing") {
    return attempt.actualRoute === null && attempt.startedAt === null && attempt.spawnedAt === null
      && attempt.terminalAt === null && attempt.durationMs === null && attempt.exitCode === null
      && !attempt.timeoutMarker && attempt.failureCode === null && attempt.workState === "none";
  }
  if (attempt.status === "running") {
    return attempt.actualRoute !== null && attempt.startedAt !== null && attempt.spawnedAt !== null
      && atOrAfter(attempt.startedAt, attempt.preparationStartedAt) && atOrAfter(attempt.spawnedAt, attempt.startedAt)
      && attempt.terminalAt === null && attempt.durationMs === null && attempt.exitCode === null
      && !attempt.timeoutMarker && attempt.failureCode === null;
  }
  if (attempt.terminalAt === null || attempt.durationMs === null || !atOrAfter(attempt.terminalAt, attempt.preparationStartedAt)
    || elapsed(attempt.preparationStartedAt, attempt.terminalAt) !== attempt.durationMs) return false;
  if (attempt.actualRoute === null) {
    if (attempt.startedAt !== null || attempt.spawnedAt !== null || attempt.workState !== "none") return false;
  } else if (attempt.startedAt === null || attempt.spawnedAt === null
    || !atOrAfter(attempt.startedAt, attempt.preparationStartedAt)
    || !atOrAfter(attempt.spawnedAt, attempt.startedAt)
    || !atOrAfter(attempt.terminalAt, attempt.spawnedAt)) return false;
  if (attempt.status === "completed") return attempt.actualRoute !== null && attempt.failureCode === null && !attempt.timeoutMarker;
  if (attempt.failureCode === null) return false;
  if (attempt.status === "timed_out") return attempt.actualRoute !== null && attempt.timeoutMarker && attempt.failureCode === "timed_out";
  if (attempt.timeoutMarker) return false;
  return attempt.status === "cancelled" ? attempt.failureCode === "cancelled" : true;
}

export function isRuntimeRouteChangeEventV1(value: unknown): value is RuntimeRouteChangeEventV1 {
  return record(value) && exactKeys(value, [
    "schemaVersion", "eventId", "invocationId", "eventIndex", "sourceInvocationId", "sourceAttemptId",
    "targetInvocationId", "targetAttemptId", "kind", "reasonCode", "occurredAt", "sourceApprovedRoute",
    "targetApprovedRoute", "result",
  ]) && value.schemaVersion === RUNTIME_EXECUTION_SCHEMA_VERSION && text(value.eventId, 512)
    && text(value.invocationId, 512) && value.eventIndex === 0 && text(value.sourceInvocationId, 512)
    && text(value.sourceAttemptId, 512) && text(value.targetInvocationId, 512) && text(value.targetAttemptId, 512)
    && includes(["fallback", "recovery"] as const, value.kind)
    && failure(value.reasonCode) && timestamp(value.occurredAt)
    && isRuntimeSafeRouteIdentityV1(value.sourceApprovedRoute) && isRuntimeSafeRouteIdentityV1(value.targetApprovedRoute)
    && !sameRoute(value.sourceApprovedRoute, value.targetApprovedRoute)
    && includes(["started", "completed", "failed"] as const, value.result);
}

export function isRuntimeInvocationEvidenceV1(value: unknown): value is RuntimeInvocationEvidenceV1 {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "receipt", "attempts", "routeChangeEvents"])
    || value.schemaVersion !== RUNTIME_EXECUTION_SCHEMA_VERSION || !isRuntimeInvocationReceiptV1(value.receipt)
    || !Array.isArray(value.attempts) || !value.attempts.every(isRuntimeAttemptV1)
    || !Array.isArray(value.routeChangeEvents) || !value.routeChangeEvents.every(isRuntimeRouteChangeEventV1)) return false;
  const receipt = value.receipt;
  if (value.attempts.length !== receipt.attemptIds.length || value.routeChangeEvents.length !== receipt.routeChangeEventIds.length) return false;
  if (value.attempts.some((attempt, index) => attempt.invocationId !== receipt.invocationId
    || attempt.attemptIndex !== index || attempt.attemptId !== receipt.attemptIds[index])) return false;
  if (value.routeChangeEvents.some((event, index) => event.invocationId !== receipt.invocationId
    || event.eventIndex !== index || event.eventId !== receipt.routeChangeEventIds[index])) return false;
  const primary = value.attempts[0];
  if (!primary || primary.attemptKind !== "primary" || !sameRoute(primary.approvedRoute, receipt.approvedPrimaryRoute)
    || value.attempts.some((attempt) => !atOrAfter(attempt.preparationStartedAt, receipt.openedAt))) return false;
  if (value.attempts.length === 2) {
    const second = value.attempts[1];
    const event = value.routeChangeEvents[0];
    if (!second || !event || receipt.approvedSecondRoute === null || !sameRoute(second.approvedRoute, receipt.approvedSecondRoute)
      || second.attemptKind !== event.kind || !isTerminalAttempt(primary) || primary.status === "completed"
      || primary.failureCode === null || event.reasonCode !== primary.failureCode
      || event.sourceInvocationId !== receipt.invocationId || event.targetInvocationId !== receipt.invocationId
      || event.sourceAttemptId !== primary.attemptId || event.targetAttemptId !== second.attemptId
      || !sameRoute(event.sourceApprovedRoute, primary.approvedRoute)
      || !sameRoute(event.targetApprovedRoute, second.approvedRoute)
      || !atOrAfter(event.occurredAt, primary.terminalAt!)
      || !atOrAfter(second.preparationStartedAt, event.occurredAt)
      || (event.kind === "fallback" && primary.workState !== "none")
      || (event.kind === "recovery" && primary.workState !== "checkpointed")
      || !eventResultMatchesAttempt(event.result, second.status)) return false;
  } else if (value.routeChangeEvents.length !== 0) return false;

  if (receipt.status === "running") return true;
  const finalAttempt = value.attempts.at(-1);
  if (!finalAttempt || value.attempts.some((attempt) => !isTerminalAttempt(attempt))
    || !chainMatchesFinalAttempt(receipt, finalAttempt) || receipt.settledAt === null
    || value.attempts.some((attempt) => !atOrAfter(receipt.settledAt!, attempt.terminalAt!))
    || value.routeChangeEvents.some((event) => !atOrAfter(receipt.settledAt!, event.occurredAt))) return false;
  if (value.attempts.length === 2) {
    const event = value.routeChangeEvents[0]!;
    if (!eventResultMatchesTerminalAttempt(event.result, finalAttempt.status)) return false;
  }
  return true;
}

export function isRuntimeInvocationOpenV1(value: unknown): value is RuntimeInvocationOpenV1 {
  return record(value) && exactKeys(value, ["schemaVersion", "plan", "receipt"])
    && value.schemaVersion === RUNTIME_EXECUTION_SCHEMA_VERSION && isHandoffPlanV1(value.plan)
    && isRuntimeInvocationReceiptV1(value.receipt) && runtimeReceiptMatchesPlan(value.receipt, value.plan)
    && value.receipt.status === "running" && value.receipt.attemptIds.length === 1
    && value.receipt.routeChangeEventIds.length === 0;
}

export function isRuntimeAttemptStartV1(value: unknown): value is RuntimeAttemptStartV1 {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "attempt", "routeChangeEvent"])
    || value.schemaVersion !== RUNTIME_EXECUTION_SCHEMA_VERSION || !isRuntimeAttemptV1(value.attempt)
    || value.attempt.status !== "preparing") return false;
  if (value.attempt.attemptIndex === 0) return value.routeChangeEvent === null;
  return isRuntimeRouteChangeEventV1(value.routeChangeEvent)
    && value.routeChangeEvent.result === "started"
    && value.routeChangeEvent.kind === value.attempt.attemptKind
    && value.routeChangeEvent.invocationId === value.attempt.invocationId
    && value.routeChangeEvent.sourceInvocationId === value.attempt.invocationId
    && value.routeChangeEvent.targetInvocationId === value.attempt.invocationId
    && value.routeChangeEvent.targetAttemptId === value.attempt.attemptId;
}

export function isRuntimeFeatureInvocationFilterV1(value: unknown): value is RuntimeFeatureInvocationFilterV1 {
  return record(value) && exactKeys(value, ["schemaVersion", "projectId", "cardKey", "limit"])
    && value.schemaVersion === RUNTIME_EXECUTION_SCHEMA_VERSION && text(value.projectId, 512)
    && nullableText(value.cardKey, 512) && positiveInteger(value.limit) && value.limit <= 256;
}

export function runtimeReceiptMatchesPlan(receipt: RuntimeInvocationReceiptV1, plan: HandoffPlanV1): boolean {
  const action = plan.resolvedRoute.action;
  return receipt.actionId === action.actionId && receipt.actionType === action.actionType
    && receipt.roleId === action.roleId && receipt.promptVersion === action.promptVersion
    && receipt.policySource === plan.resolvedRoute.policySource && receipt.revisionId === plan.resolvedRoute.revisionId
    && sameRoute(receipt.approvedPrimaryRoute, plan.steps[0]!.route)
    && (plan.steps.length === 1 ? receipt.approvedSecondRoute === null
      : receipt.approvedSecondRoute !== null && sameRoute(receipt.approvedSecondRoute, plan.steps[1]!.route));
}

export function canonicalizeRuntimeJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeRuntimeJson).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeRuntimeJson(value[key])}`).join(",")}}`;
  throw new TypeError("Value cannot be represented by canonical runtime JSON.");
}

export function canonicalizeHandoffPlanV1(plan: unknown): string | null {
  return isHandoffPlanV1(plan) ? canonicalizeRuntimeJson(plan) : null;
}

export function classifyRuntimeEvidenceSource(hasCurrentReceipt: boolean, hasLegacyActivity: boolean, hasAuthoritativeActivity: boolean): RuntimeEvidenceSourceV1 {
  return hasCurrentReceipt ? "current" : hasLegacyActivity || hasAuthoritativeActivity ? "not_recorded" : "not_yet_run";
}

function isRuntimeSafeRouteIdentityV1(value: unknown): value is RouteIdentityV1 {
  return record(value) && exactKeys(value, ["connectionId", "modelId"])
    && text(value.connectionId, 512) && text(value.modelId, 512);
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function nullableText(value: unknown, max: number): boolean { return value === null || text(value, max); }
function actionId(value: unknown): value is string { return text(value, 128) && /^[a-z][a-z0-9-]*$/u.test(value); }
function sha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function timestamp(value: unknown): value is string { if (typeof value !== "string") return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
function nullableTimestamp(value: unknown): boolean { return value === null || timestamp(value); }
function positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nullablePositiveInteger(value: unknown): boolean { return value === null || positiveInteger(value); }
function nullableNonNegativeInteger(value: unknown): boolean { return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0); }
function nullableExitCode(value: unknown): boolean { return value === null || (typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647); }
function failure(value: unknown): value is RuntimeSafeFailureCode { return includes(FAILURE_CODES, value); }
function nullableFailure(value: unknown): boolean { return value === null || failure(value); }
function orderedIds(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => text(item, 512)) && new Set(value).size === value.length; }
function sortedUniqueText(value: unknown, maxCount: number, maxLength: number): value is readonly string[] { return Array.isArray(value) && value.length <= maxCount && value.every((item) => text(item, maxLength)) && value.every((item, index) => index === 0 || value[index - 1]! < item); }
function includes<T extends string>(values: readonly T[], value: unknown): value is T { return typeof value === "string" && values.includes(value as T); }
function sameRoute(left: RouteIdentityV1, right: RouteIdentityV1): boolean { return left.connectionId === right.connectionId && left.modelId === right.modelId; }
function elapsed(start: string, end: string): number { return new Date(end).getTime() - new Date(start).getTime(); }
function atOrAfter(candidate: string, baseline: string): boolean { return new Date(candidate).getTime() >= new Date(baseline).getTime(); }
function isTerminalAttempt(value: RuntimeAttemptV1): boolean { return value.status === "completed" || value.status === "failed" || value.status === "timed_out" || value.status === "cancelled"; }
function eventResultMatchesAttempt(result: RuntimeRouteChangeEventV1["result"], status: RuntimeAttemptV1["status"]): boolean {
  if (result === "started") return true;
  return result === "completed" ? status === "completed" : status === "failed" || status === "timed_out" || status === "cancelled";
}
function eventResultMatchesTerminalAttempt(result: RuntimeRouteChangeEventV1["result"], status: RuntimeAttemptV1["status"]): boolean {
  return status === "completed" ? result === "completed" : result === "failed";
}
function chainMatchesFinalAttempt(receipt: RuntimeInvocationReceiptV1, attempt: RuntimeAttemptV1): boolean {
  if (attempt.status === "completed") return receipt.status === "completed" && receipt.failureCode === null;
  if (attempt.status === "timed_out") return receipt.status === "timed_out" && receipt.failureCode === "timed_out";
  if (attempt.status === "cancelled") return receipt.status === "cancelled" && receipt.failureCode === "cancelled";
  return attempt.status === "failed" && receipt.status === "failed" && receipt.failureCode === attempt.failureCode;
}
