import type { AgentActionId } from "../agent-routing.js";

export const AGENT_DISPATCH_SCHEMA_VERSION = "agent-dispatch/v1" as const;
export type AgentDispatchSchemaVersion = typeof AGENT_DISPATCH_SCHEMA_VERSION;
export type AgentDispatchKindV1 = "root" | "nested";

export type AgentDispatchContractErrorCode =
  | "AGENT_ACTION_MISSING"
  | "AGENT_ACTION_INVALID_LOCATION"
  | "AGENT_ACTION_UNKNOWN"
  | "AGENT_DISPATCH_INVALID";

export interface SerializedAgentDispatchEnvelopeV1 {
  readonly schemaVersion: AgentDispatchSchemaVersion;
  readonly agent_action: AgentActionId;
  readonly dispatchKind: AgentDispatchKindV1;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly workflowRunId: string | null;
  readonly workflowNodeId: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly taskId: string | null;
  readonly correlationId: string;
  readonly inputRef: string;
  readonly selectedLessonIds: readonly string[];
  readonly rootInvocationId: string | null;
  readonly parentInvocationId: string | null;
}

export interface AgentDispatchEnvelopeV1 {
  readonly schemaVersion: AgentDispatchSchemaVersion;
  readonly agentAction: AgentActionId;
  readonly dispatchKind: AgentDispatchKindV1;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly workflowRunId: string | null;
  readonly workflowNodeId: string | null;
  readonly phaseExecutionContractId: string | null;
  readonly phaseNumber: number | null;
  readonly taskId: string | null;
  readonly correlationId: string;
  readonly inputRef: string;
  readonly selectedLessonIds: readonly string[];
  readonly rootInvocationId: string | null;
  readonly parentInvocationId: string | null;
}

export class AgentDispatchContractError extends Error {
  constructor(readonly code: AgentDispatchContractErrorCode) {
    super(dispatchErrorMessage(code));
    this.name = "AgentDispatchContractError";
  }
}

/** Parses the exact serialized dispatch authority only after structural and registry validation. */
export function parseAgentDispatchEnvelopeV1(
  value: unknown,
  registeredActionIds: readonly AgentActionId[],
): AgentDispatchEnvelopeV1 {
  if (!record(value)) fail("AGENT_DISPATCH_INVALID");
  if (hasInvalidActionLocation(value)) fail("AGENT_ACTION_INVALID_LOCATION");
  if (!("agent_action" in value)) fail("AGENT_ACTION_MISSING");
  if (!exactKeys(value, [
    "schemaVersion", "agent_action", "dispatchKind", "projectId", "cardKey", "workflowRunId",
    "workflowNodeId", "phaseExecutionContractId", "phaseNumber", "taskId", "correlationId",
    "inputRef", "selectedLessonIds", "rootInvocationId", "parentInvocationId",
  ]) || value.schemaVersion !== AGENT_DISPATCH_SCHEMA_VERSION || !actionId(value.agent_action)
    || (value.dispatchKind !== "root" && value.dispatchKind !== "nested")
    || !text(value.projectId, 512) || !nullableText(value.cardKey, 512)
    || !nullableText(value.workflowRunId, 512) || !nullableText(value.workflowNodeId, 512)
    || !nullableText(value.phaseExecutionContractId, 512) || !nullableNonNegativeInteger(value.phaseNumber)
    || !nullableText(value.taskId, 512) || !text(value.correlationId, 512) || !text(value.inputRef, 2_048)
    || !sortedUniqueText(value.selectedLessonIds, 128, 512)
    || !nullableText(value.rootInvocationId, 512) || !nullableText(value.parentInvocationId, 512)) {
    fail("AGENT_DISPATCH_INVALID");
  }

  if (!registeredActionIds.includes(value.agent_action)) fail("AGENT_ACTION_UNKNOWN");
  if ((value.workflowRunId === null) !== (value.workflowNodeId === null)
    || (value.phaseExecutionContractId === null) !== (value.phaseNumber === null)
    || (value.taskId !== null && value.phaseExecutionContractId === null)) {
    fail("AGENT_DISPATCH_INVALID");
  }
  if (value.dispatchKind === "root") {
    if (value.rootInvocationId !== null || value.parentInvocationId !== null) fail("AGENT_DISPATCH_INVALID");
  } else if (value.rootInvocationId === null || value.parentInvocationId === null) {
    fail("AGENT_DISPATCH_INVALID");
  }

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    agentAction: value.agent_action,
    dispatchKind: value.dispatchKind,
    projectId: value.projectId,
    cardKey: value.cardKey,
    workflowRunId: value.workflowRunId,
    workflowNodeId: value.workflowNodeId,
    phaseExecutionContractId: value.phaseExecutionContractId,
    phaseNumber: value.phaseNumber,
    taskId: value.taskId,
    correlationId: value.correlationId,
    inputRef: value.inputRef,
    selectedLessonIds: Object.freeze([...value.selectedLessonIds]),
    rootInvocationId: value.rootInvocationId,
    parentInvocationId: value.parentInvocationId,
  });
}

export function isAgentDispatchEnvelopeV1(
  value: unknown,
  registeredActionIds: readonly AgentActionId[],
): value is SerializedAgentDispatchEnvelopeV1 {
  try {
    parseAgentDispatchEnvelopeV1(value, registeredActionIds);
    return true;
  } catch {
    return false;
  }
}

function hasInvalidActionLocation(value: Record<string, unknown>): boolean {
  if ("agentAction" in value) return true;
  return Object.entries(value).some(([key, nested]) => key !== "agent_action" && containsActionKey(nested));
}
function containsActionKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if ((typeof value !== "object" || value === null) || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsActionKey(item, seen));
  if (!record(value)) return false;
  return "agent_action" in value || "agentAction" in value
    || Object.values(value).some((item) => containsActionKey(item, seen));
}
function dispatchErrorMessage(code: AgentDispatchContractErrorCode): string {
  const messages: Record<AgentDispatchContractErrorCode, string> = {
    AGENT_ACTION_MISSING: "Agent dispatch envelope is missing agent_action.",
    AGENT_ACTION_INVALID_LOCATION: "Agent action identity must use the exact top-level agent_action field.",
    AGENT_ACTION_UNKNOWN: "Agent dispatch action is not registered.",
    AGENT_DISPATCH_INVALID: "Agent dispatch envelope is invalid.",
  };
  return messages[code];
}
function fail(code: AgentDispatchContractErrorCode): never { throw new AgentDispatchContractError(code); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value); }
function nullableText(value: unknown, max: number): value is string | null { return value === null || text(value, max); }
function actionId(value: unknown): value is AgentActionId { return text(value, 128) && /^[a-z][a-z0-9-]*$/u.test(value); }
function nullableNonNegativeInteger(value: unknown): value is number | null { return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0); }
function sortedUniqueText(value: unknown, maxCount: number, maxLength: number): value is readonly string[] { return Array.isArray(value) && value.length <= maxCount && value.every((item) => text(item, maxLength)) && value.every((item, index) => index === 0 || value[index - 1]! < item); }
