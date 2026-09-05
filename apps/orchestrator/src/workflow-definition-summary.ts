import type {
  WorkflowDefinitionNodeSummary,
  WorkflowDefinitionSummary,
} from "@hepha/shared";
import type {
  HephaFeatureWorkflowNode,
  HephaFeatureWorkflowSpec,
} from "./feature-workflow-spec.js";

/** Projects validated workflow definitions into serialization-safe public summaries. */
export function toWorkflowDefinitionSummary(
  spec: HephaFeatureWorkflowSpec,
): WorkflowDefinitionSummary {
  return {
    command: spec.command,
    name: spec.name,
    description: spec.description,
    path: spec.path,
    nodes: spec.nodes.map(toWorkflowDefinitionNodeSummary),
  };
}

function toWorkflowDefinitionNodeSummary(
  node: HephaFeatureWorkflowNode,
): WorkflowDefinitionNodeSummary {
  return {
    id: node.id,
    kind: node.kind,
    dependsOn: node.dependsOn,
    status: node.status,
    summary: node.summary ?? null,
    action: node.action ?? null,
    agentAction: node.agentAction ?? null,
    prompt: node.prompt ?? null,
    loopUntil: node.loop?.until ?? null,
    toolProfile: node.toolProfile ?? null,
    skill: node.skill ?? null,
  };
}
