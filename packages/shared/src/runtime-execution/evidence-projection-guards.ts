import { RUNTIME_EXECUTION_SCHEMA_VERSION } from "./contracts.js";
import type {
  RuntimeExecutionEvidenceViewV1,
  RuntimePhaseExecutionEvidencePageV1,
} from "./evidence-projection-contracts.js";
import { isDirectHostRuntimeEvidenceShapeV1 } from "./evidence-guards.js";
import { isRuntimeInvocationChainViewV1 } from "./projection-guards.js";

export function isRuntimeExecutionEvidenceViewV1(
  value: unknown,
): value is RuntimeExecutionEvidenceViewV1 {
  if (!record(value)) return false;
  if (value.mode === "direct_host") return isDirectHostRuntimeEvidenceShapeV1(value);
  if (value.mode !== "orchestrated" || !exact(value, [
    "mode", "invocationId", "rootInvocationId", "parentInvocationId", "invocationKind", "approvedPlan",
    "phaseExecutionContractId", "phaseNumber", "status", "openedAt", "settledAt", "durationMs",
    "failureCode", "attempts", "routeChangeEvents",
  ])) return false;
  const { mode: _mode, ...chain } = value;
  return isRuntimeInvocationChainViewV1(chain)
    && chain.routeChangeEvents.every((event) => event.kind === "fallback" || event.kind === "recovery");
}

export function isRuntimePhaseExecutionEvidencePageV1(
  value: unknown,
): value is RuntimePhaseExecutionEvidencePageV1 {
  if (!record(value) || !exact(value, [
    "schemaVersion", "projectId", "cardKey", "phaseExecutionContractId", "executions", "nextCursor",
  ]) || value.schemaVersion !== RUNTIME_EXECUTION_SCHEMA_VERSION || !text(value.projectId, 512)
    || !text(value.cardKey, 512) || !text(value.phaseExecutionContractId, 512)
    || !Array.isArray(value.executions) || value.executions.length > 64
    || !value.executions.every(isRuntimeExecutionEvidenceViewV1)
    || !nullableCursor(value.nextCursor)) return false;
  const executions = value.executions as readonly RuntimeExecutionEvidenceViewV1[];
  return executions.every((execution) => execution.phaseExecutionContractId === value.phaseExecutionContractId
      && (execution.mode === "orchestrated"
        || execution.projectId === value.projectId && execution.cardKey === value.cardKey))
    && ordered(executions.map(executionOrder));
}

function executionOrder(value: RuntimeExecutionEvidenceViewV1): readonly [string, string, string] {
  return value.mode === "orchestrated"
    ? [value.openedAt, value.mode, value.invocationId]
    : [value.startedAt, value.mode, value.evidenceId];
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function nullableCursor(value: unknown): boolean { return value === null || typeof value === "string" && value.length > 0 && value.length <= 512 && /^[A-Za-z0-9_-]+$/u.test(value); }
function ordered(values: readonly (readonly [string, string, string])[]): boolean {
  return values.every((value, index) => index === 0 || comparePosition(values[index - 1]!, value) < 0);
}
function comparePosition(left: readonly [string, string, string], right: readonly [string, string, string]): number {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1
    : left[1] < right[1] ? -1 : left[1] > right[1] ? 1
    : left[2] < right[2] ? -1 : left[2] > right[2] ? 1
    : 0;
}
