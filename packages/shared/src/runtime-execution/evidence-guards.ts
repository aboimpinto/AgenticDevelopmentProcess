import type { AgentActionId } from "../agent-routing.js";
import { RUNTIME_EXECUTION_SCHEMA_VERSION, type RuntimeSafeFailureCode } from "./contracts.js";
import type {
  DirectHostModelEvidenceV1,
  DirectHostRuntimeEvidenceV1,
  DirectHostStateSyncV1,
  OrchestratedRuntimeEvidenceV1,
  RuntimeEvidenceGuardContextV1,
  RuntimeEvidenceRecordV1,
} from "./evidence-contracts.js";
import { isRuntimeInvocationEvidenceV1 } from "./guards.js";

const FAILURE_CODES: readonly RuntimeSafeFailureCode[] = [
  "invalid_input", "connection_unavailable", "auth_unavailable", "provider_unsupported",
  "secret_read_failed", "context_preparation_failed", "spawn_failed", "payment_required",
  "quota_exceeded", "rate_limited", "endpoint_unavailable", "provider_unavailable",
  "timed_out", "cancelled", "safety_rejected", "invalid_output", "checkpoint_required",
  "cleanup_failed", "persistence_failed",
];

/** Guards the explicit execution mode before reading fields owned by either evidence variant. */
export function isRuntimeEvidenceRecordV1(
  value: unknown,
  context: RuntimeEvidenceGuardContextV1,
): value is RuntimeEvidenceRecordV1 {
  if (!record(value)) return false;
  if (value.mode === "orchestrated") return isOrchestratedRuntimeEvidenceV1(value, context);
  if (value.mode === "direct_host") return isDirectHostRuntimeEvidenceV1(value, context);
  return false;
}

export function isOrchestratedRuntimeEvidenceV1(
  value: unknown,
  context: RuntimeEvidenceGuardContextV1,
): value is OrchestratedRuntimeEvidenceV1 {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "mode", "receipt", "attempts", "routeChangeEvents"])
    || value.mode !== "orchestrated") return false;
  const payload = {
    schemaVersion: value.schemaVersion,
    receipt: value.receipt,
    attempts: value.attempts,
    routeChangeEvents: value.routeChangeEvents,
  };
  return isRuntimeInvocationEvidenceV1(payload)
    && payload.routeChangeEvents.every((event) => event.kind === "fallback" || event.kind === "recovery")
    && context.isRegisteredAction(payload.receipt.actionId);
}

export function isDirectHostRuntimeEvidenceV1(
  value: unknown,
  context: RuntimeEvidenceGuardContextV1,
): value is DirectHostRuntimeEvidenceV1 {
  if (!isDirectHostRuntimeEvidenceShapeV1(value)) return false;
  return (value.actionId === null || context.isRegisteredAction(value.actionId))
    && (value.modelEvidence.status === "not_recorded" || context.isTrustedDirectInstrumentation({
      hostKind: value.hostKind,
      instrumentationSource: value.modelEvidence.instrumentationSource,
    }));
}

/** Guards the closed direct-host shape without claiming that its provenance is trusted. */
export function isDirectHostRuntimeEvidenceShapeV1(
  value: unknown,
): value is DirectHostRuntimeEvidenceV1 {
  if (!record(value) || !exactKeys(value, [
    "schemaVersion", "mode", "evidenceId", "projectId", "cardKey", "phaseExecutionContractId",
    "phaseNumber", "taskId", "procedureId", "actionId", "hostKind", "hostIdentity", "startedAt",
    "settledAt", "durationMs", "outcome", "failureCode", "stateSync", "modelEvidence",
  ]) || value.schemaVersion !== RUNTIME_EXECUTION_SCHEMA_VERSION || value.mode !== "direct_host"
    || !text(value.evidenceId, 512) || !text(value.projectId, 512) || !nullableText(value.cardKey, 512)
    || !nullableText(value.phaseExecutionContractId, 512) || !nullableNonNegativeInteger(value.phaseNumber)
    || !nullableText(value.taskId, 512) || !nullableText(value.procedureId, 256)
    || !nullableActionId(value.actionId)
    || !includes(["pi", "codex", "claude_code", "unknown"] as const, value.hostKind)
    || !nullableText(value.hostIdentity, 512) || !timestamp(value.startedAt) || !nullableTimestamp(value.settledAt)
    || !nullableNonNegativeInteger(value.durationMs)
    || !includes(["running", "completed", "failed", "timed_out", "cancelled"] as const, value.outcome)
    || !nullableFailure(value.failureCode) || !isDirectHostStateSyncV1(value.stateSync)
    || (value.procedureId === null && value.actionId === null)
    || (value.phaseExecutionContractId === null) !== (value.phaseNumber === null)
    || (value.taskId !== null && value.phaseExecutionContractId === null)) return false;

  if (value.outcome === "running") {
    if (value.settledAt !== null || value.durationMs !== null || value.failureCode !== null) return false;
  } else {
    if (value.settledAt === null || value.durationMs === null || !atOrAfter(value.settledAt, value.startedAt)
      || elapsed(value.startedAt, value.settledAt) !== value.durationMs) return false;
    if (value.outcome === "completed" ? value.failureCode !== null : value.failureCode === null) return false;
    if (value.outcome === "timed_out" && value.failureCode !== "timed_out") return false;
    if (value.outcome === "cancelled" && value.failureCode !== "cancelled") return false;
    if (value.outcome === "failed" && (value.failureCode === "timed_out" || value.failureCode === "cancelled")) return false;
  }

  return isDirectHostModelEvidenceV1(value.modelEvidence, {
    startedAt: value.startedAt,
    settledAt: value.settledAt,
  });
}

function isDirectHostStateSyncV1(value: unknown): value is DirectHostStateSyncV1 {
  if (!record(value)) return false;
  if (value.status === "not_requested") return exactKeys(value, ["status"]);
  if (value.status === "completed") return exactKeys(value, ["status", "operationId"]) && text(value.operationId, 512);
  return value.status === "failed" && exactKeys(value, ["status", "code"]) && failure(value.code);
}

function isDirectHostModelEvidenceV1(
  value: unknown,
  run: {
    readonly startedAt: string;
    readonly settledAt: string | null;
  },
): value is DirectHostModelEvidenceV1 {
  if (!record(value)) return false;
  if (value.status === "not_recorded") return exactKeys(value, ["status"]);
  return value.status === "recorded" && exactKeys(value, [
    "status", "modelId", "providerId", "instrumentationSource", "observedAt",
  ]) && text(value.modelId, 512) && nullableText(value.providerId, 512)
    && text(value.instrumentationSource, 512) && timestamp(value.observedAt)
    && atOrAfter(value.observedAt, run.startedAt)
    && (run.settledAt === null || atOrAfter(run.settledAt, value.observedAt));
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
const SECRET_CONTENT = [
  /(?:api[ _-]?key|authorization|bearer|password|passwd|pwd|credential|secret|token)\s*[:=]\s*\S+/iu,
  /\bbearer\s+[A-Za-z0-9._~+/-]{8,}/iu,
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/iu,
  /\bsk-[A-Za-z0-9_-]{12,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
] as const;
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
    && wellFormedUnicode(value) && !SECRET_CONTENT.some((pattern) => pattern.test(value));
}
function wellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function nullableText(value: unknown, max: number): value is string | null { return value === null || text(value, max); }
function actionId(value: unknown): value is AgentActionId { return text(value, 128) && /^[a-z][a-z0-9-]*$/u.test(value); }
function nullableActionId(value: unknown): value is AgentActionId | null { return value === null || actionId(value); }
function timestamp(value: unknown): value is string { if (typeof value !== "string") return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
function nullableTimestamp(value: unknown): value is string | null { return value === null || timestamp(value); }
function nullableNonNegativeInteger(value: unknown): value is number | null { return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0); }
function failure(value: unknown): value is RuntimeSafeFailureCode { return includes(FAILURE_CODES, value); }
function nullableFailure(value: unknown): value is RuntimeSafeFailureCode | null { return value === null || failure(value); }
function includes<T extends string>(values: readonly T[], value: unknown): value is T { return typeof value === "string" && values.includes(value as T); }
function elapsed(start: string, end: string): number { return new Date(end).getTime() - new Date(start).getTime(); }
function atOrAfter(candidate: string, baseline: string): boolean { return new Date(candidate).getTime() >= new Date(baseline).getTime(); }
