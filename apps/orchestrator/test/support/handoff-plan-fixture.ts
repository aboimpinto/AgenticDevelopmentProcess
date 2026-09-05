import type { AgentActionId, HandoffPlanV1 } from "@hepha/shared";

export function handoffPlan(
  modelId = "selected",
  actionId: AgentActionId = "continue-implementing",
): HandoffPlanV1 {
  return {
    schemaVersion: "agent-routing/v1",
    resolvedRoute: {
      schemaVersion: "agent-routing/v1",
      action: {
        schemaVersion: "agent-routing/v1",
        actionId,
        actionType: "implementation",
        actionTypeLabel: "Implementation",
        actionTypeDisplayOrder: 2,
        label: "Continue Implementing",
        displayOrder: 2,
        roleId: "implementation-agent",
        promptVersion: "implementation/v1",
        capabilityRequirements: {
          minimumContextWindowTokens: 32_000,
          requiresApi: true,
          requiresReasoning: false,
          requiresTools: true,
        },
      },
      route: { connectionId: "connection-a", modelId },
      policySource: "global",
      revisionId: "revision-a",
    },
    steps: [{ kind: "primary", route: { connectionId: "connection-a", modelId } }],
  };
}
