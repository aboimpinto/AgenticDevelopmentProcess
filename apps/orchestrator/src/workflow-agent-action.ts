import type { AgentActionId } from "@hepha/shared";
import { parseDocument } from "yaml";

export type WorkflowAgentActionErrorCode =
  | "WORKFLOW_YAML_INVALID"
  | "AGENT_ACTION_MISSING"
  | "AGENT_ACTION_DUPLICATE"
  | "AGENT_ACTION_INVALID_LOCATION"
  | "AGENT_ACTION_UNKNOWN";

export interface WorkflowAgentActionRegistry {
  get(actionId: AgentActionId): unknown | null;
}

export class WorkflowAgentActionError extends Error {
  constructor(readonly code: WorkflowAgentActionErrorCode) {
    super(`${code}: ${actionErrorMessage(code)}`);
    this.name = "WorkflowAgentActionError";
  }
}

/** Parses YAML without permitting duplicate agent_action keys to collapse during object conversion. */
export function parseWorkflowYamlDocument(source: string, _path: string): unknown {
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(source, { uniqueKeys: true });
  } catch {
    throw new WorkflowAgentActionError("WORKFLOW_YAML_INVALID");
  }
  const duplicateAction = document.errors.find((error) =>
    error.code === "DUPLICATE_KEY" && error.message.includes("agent_action"));
  if (duplicateAction) throw new WorkflowAgentActionError("AGENT_ACTION_DUPLICATE");
  if (document.errors.length > 0) throw new WorkflowAgentActionError("WORKFLOW_YAML_INVALID");
  try {
    return document.toJS();
  } catch {
    throw new WorkflowAgentActionError("WORKFLOW_YAML_INVALID");
  }
}

/** Validates and normalizes the sole action authority for a workflow launch node. */
export function parseWorkflowAgentAction(
  node: Record<string, unknown>,
  nodeKind: "action" | "prompt" | "loop" | "gate",
  registry: WorkflowAgentActionRegistry,
  _location: string,
): AgentActionId | undefined {
  if ("agentAction" in node || hasNestedActionIdentity(node)) {
    throw new WorkflowAgentActionError("AGENT_ACTION_INVALID_LOCATION");
  }
  if (nodeKind !== "prompt") {
    if ("agent_action" in node) throw new WorkflowAgentActionError("AGENT_ACTION_INVALID_LOCATION");
    return undefined;
  }
  if (!("agent_action" in node)) throw new WorkflowAgentActionError("AGENT_ACTION_MISSING");
  if (!actionId(node.agent_action)) throw new WorkflowAgentActionError("AGENT_ACTION_INVALID_LOCATION");
  if (registry.get(node.agent_action) === null) throw new WorkflowAgentActionError("AGENT_ACTION_UNKNOWN");
  return node.agent_action;
}

function hasNestedActionIdentity(node: Record<string, unknown>): boolean {
  return Object.entries(node).some(([key, value]) => key !== "agent_action" && containsActionIdentity(value));
}
function containsActionIdentity(value: unknown, seen = new WeakSet<object>()): boolean {
  if ((typeof value !== "object" || value === null) || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsActionIdentity(item, seen));
  if (!record(value)) return false;
  return "agent_action" in value || "agentAction" in value
    || Object.values(value).some((item) => containsActionIdentity(item, seen));
}
function actionErrorMessage(code: WorkflowAgentActionErrorCode): string {
  const messages: Record<WorkflowAgentActionErrorCode, string> = {
    WORKFLOW_YAML_INVALID: "Workflow YAML is invalid.",
    AGENT_ACTION_MISSING: "Launch-bearing workflow node must define top-level agent_action.",
    AGENT_ACTION_DUPLICATE: "Workflow agent_action must appear exactly once.",
    AGENT_ACTION_INVALID_LOCATION: "Workflow agent action must be one top-level kebab-case agent_action on a prompt node.",
    AGENT_ACTION_UNKNOWN: "Workflow agent_action is not registered.",
  };
  return messages[code];
}
function actionId(value: unknown): value is AgentActionId {
  return typeof value === "string" && value.length <= 128 && value.trim() === value
    && /^[a-z][a-z0-9-]*$/u.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
