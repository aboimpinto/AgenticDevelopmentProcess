import {
  ROUTING_MATRIX_POLICY_ID,
  ROUTING_MATRIX_SCHEMA_VERSION,
  type AgentActionId,
  type AgentActionType,
  type AgentRoleId,
  type ProviderConnectionId,
  type RoutingMatrixActionRowV1,
  type RoutingMatrixActionTypeGroupV1,
  type RoutingMatrixActionTypeRowV1,
  type RoutingMatrixRouteV1,
  type RoutingMatrixSnapshotV1,
} from "@hepha/shared";

export const globalRoute: RoutingMatrixRouteV1 = {
  route: { connectionId: "connection-global" as ProviderConnectionId, modelId: "global-model" },
  connectionLabel: "OpenAI Personal", modelDisplayLabel: "Global Model",
  availability: "available", eligible: true, reasons: [],
};
export const implementationRoute: RoutingMatrixRouteV1 = {
  route: { connectionId: "connection-implementation" as ProviderConnectionId, modelId: "implementation-model" },
  connectionLabel: "DeepSeek Team", modelDisplayLabel: "Implementation Model",
  availability: "available", eligible: true, reasons: [],
};
export const fallbackRoute: RoutingMatrixRouteV1 = {
  route: { connectionId: "connection-fallback" as ProviderConnectionId, modelId: "fallback-model" },
  connectionLabel: "OpenAI Work", modelDisplayLabel: null,
  availability: "available", eligible: true, reasons: [],
};
const requirements = { minimumContextWindowTokens: 32_000, requiresTools: false, requiresApi: true, requiresReasoning: false } as const;
const routeChoices = [globalRoute, implementationRoute, fallbackRoute] as const;
const inherited = {
  configured: { kind: "inherit" as const }, configuredFailurePolicy: null,
  effectiveRoute: globalRoute, effectiveFailurePolicy: { kind: "fail_immediately" as const }, policySource: "global" as const,
  requirements, eligibility: { eligible: true, reasons: [] }, routeChoices,
};

const definitions: ReadonlyArray<readonly [AgentActionType, string, number, ReadonlyArray<readonly [AgentActionId, string, AgentRoleId]>]> = [
  ["discovery_planning", "Discovery & Planning", 1, [
    ["submit-epic", "Submit EPIC", "product-architect"], ["refine-epic", "Refine EPIC", "product-architect"],
    ["submit-feature", "Submit Feature", "product-architect"], ["deep-dive", "Deep-Dive", "requirements-agent"],
    ["design-feature", "Design Feature", "ux-design-agent"], ["refine-feature", "Refine Feature", "planning-agent"],
    ["ui-requirement-evaluation", "UI Requirement Evaluation", "requirements-agent"],
  ]],
  ["implementation", "Implementation", 2, [
    ["start-feature", "Start Feature", "implementation-agent"], ["continue-implementing", "Continue Implementing", "implementation-agent"],
    ["phase-worker", "Phase Worker", "implementation-agent"], ["resolve-review-findings", "Resolve Review Findings", "implementation-agent"],
    ["workflow-recovery", "Workflow Recovery", "implementation-agent"],
  ]],
  ["review", "Review", 3, [["code-review", "Code Review", "code-review-agent"]]],
  ["completion", "Completion", 4, [["complete-feature", "Complete Feature", "completion-agent"]]],
  ["knowledge_documentation", "Knowledge & Documentation", 5, [
    ["phase-lessons-capture", "Phase Lessons Capture", "phase-lessons-capture-agent"],
    ["feature-lessons-writer", "Feature Lessons Writer", "feature-lessons-writer-agent"],
    ["post-complete-lessons-curator", "Post-Complete LessonsLearned Curator", "post-complete-lessons-curator-agent"],
  ]],
];

export function routingMatrixFixture(revisionNumber = 1): RoutingMatrixSnapshotV1 {
  const groups = definitions.map(([actionType, label, displayOrder, actions]): RoutingMatrixActionTypeGroupV1 => {
    const typeDefault: RoutingMatrixActionTypeRowV1 = {
      ...inherited, kind: "action_type", scope: { kind: "action_type", actionType }, scopeKey: `action_type:${actionType}`,
      label, displayOrder,
    };
    return {
      actionType, label, displayOrder, typeDefault,
      actions: actions.map(([actionId, actionLabel, roleId], index): RoutingMatrixActionRowV1 => ({
        ...inherited, kind: "action", scope: { kind: "action", actionId }, scopeKey: `action:${actionId}`,
        label: actionLabel, displayOrder: index + 1, roleId, promptVersion: `${actionId}/v1`,
      })),
    };
  });
  return {
    schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
    policy: {
      policyId: ROUTING_MATRIX_POLICY_ID, revisionId: `routing-revision-${revisionNumber}`, revisionNumber,
      registryVersion: "agent-registry/v1", revisionGuard: `opaque-guard-${revisionNumber}`,
    },
    state: "ready",
    global: {
      ...inherited, kind: "global", scope: { kind: "global" }, scopeKey: "global", label: "Global Default", displayOrder: 0,
      configured: { kind: "route", route: globalRoute.route }, configuredFailurePolicy: { kind: "fail_immediately" },
    },
    groups,
    connectionStates: [globalRoute, implementationRoute, fallbackRoute].map((route) => ({
      connectionId: route.route.connectionId, label: route.connectionLabel, providerKind: "known" as const,
      scanState: "available" as const, guidanceCode: "models_available" as const,
      claimedAt: "2026-07-25T00:00:00.000Z", settledAt: "2026-07-25T00:00:01.000Z",
      diagnosticOccurredAt: "2026-07-25T00:00:01.000Z", safeMessage: "Models are available.",
    })),
    attention: [],
  };
}
