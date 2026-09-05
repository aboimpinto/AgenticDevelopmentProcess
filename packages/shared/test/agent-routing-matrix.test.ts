import { describe, expect, it } from "vitest";
import {
  ROUTING_MATRIX_POLICY_ID,
  ROUTING_MATRIX_SCHEMA_VERSION,
  isRoutingMatrixActionRowV1,
  isRoutingMatrixActionTypeGroupV1,
  isRoutingMatrixActionTypeRowV1,
  isRoutingMatrixAttentionAcknowledgeV1,
  isRoutingMatrixAttentionV1,
  isRoutingMatrixConnectionStateV1,
  isRoutingMatrixEligibilityV1,
  isRoutingMatrixGlobalRowV1,
  isRoutingMatrixMutationContextV1,
  isRoutingMatrixPolicyIdentityV1,
  isRoutingMatrixPreviewV1,
  isRoutingMatrixReasonV1,
  isRoutingMatrixRouteV1,
  isRoutingMatrixRowDraftV1,
  isRoutingMatrixRowV1,
  isRoutingMatrixSnapshotV1,
  routingMatrixReason,
  type RouteIdentityV1,
  type RoutingMatrixActionRowV1,
  type RoutingMatrixActionTypeGroupV1,
  type RoutingMatrixActionTypeRowV1,
  type RoutingMatrixGlobalRowV1,
  type RoutingMatrixRouteV1,
  type RoutingMatrixSnapshotV1,
} from "../src/index.js";

const route: RouteIdentityV1 = { connectionId: "connection-global" as RouteIdentityV1["connectionId"], modelId: "global-model" };
const requirements = { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: false } as const;
const routeView: RoutingMatrixRouteV1 = { route, connectionLabel: "OpenAI Personal", modelDisplayLabel: "Global Model", availability: "available", eligible: true, reasons: [] };
const secondaryRoute: RouteIdentityV1 = { connectionId: "connection-secondary" as RouteIdentityV1["connectionId"], modelId: "secondary-model" };
const tertiaryRoute: RouteIdentityV1 = { connectionId: "connection-tertiary" as RouteIdentityV1["connectionId"], modelId: "tertiary-model" };
const secondaryRouteView: RoutingMatrixRouteV1 = { ...routeView, route: secondaryRoute, connectionLabel: "OpenAI Work", modelDisplayLabel: "Secondary Model" };
const base = {
  configured: { kind: "inherit" as const }, configuredFailurePolicy: null,
  effectiveRoute: routeView, effectiveFailurePolicy: { kind: "fail_immediately" as const }, policySource: "global" as const,
  requirements, eligibility: { eligible: true, reasons: [] }, routeChoices: [routeView],
};
const globalRow: RoutingMatrixGlobalRowV1 = {
  ...base, kind: "global", scope: { kind: "global" }, scopeKey: "global", label: "Global Default", displayOrder: 0,
  configured: { kind: "route", route }, configuredFailurePolicy: { kind: "fail_immediately" },
};
const typeRow: RoutingMatrixActionTypeRowV1 = {
  ...base, kind: "action_type", scope: { kind: "action_type", actionType: "review" }, scopeKey: "action_type:review", label: "Review", displayOrder: 3,
};
const actionRow: RoutingMatrixActionRowV1 = {
  ...base, kind: "action", scope: { kind: "action", actionId: "code-review" }, scopeKey: "action:code-review", label: "Code Review", displayOrder: 1,
  roleId: "code-review-agent", promptVersion: "code-review/v1",
};
const group: RoutingMatrixActionTypeGroupV1 = { actionType: "review", label: "Review", displayOrder: 3, typeDefault: typeRow, actions: [actionRow] };
const snapshot: RoutingMatrixSnapshotV1 = {
  schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
  policy: { policyId: ROUTING_MATRIX_POLICY_ID, revisionId: "routing-revision-1", revisionNumber: 1, registryVersion: "agent-registry/v1", revisionGuard: "opaque-guard" },
  state: "ready", global: globalRow, groups: [group],
  connectionStates: [{ connectionId: route.connectionId, label: "OpenAI Personal", providerKind: "pi_session", scanState: "available", guidanceCode: "models_available", claimedAt: "2026-07-25T00:00:00.000Z", settledAt: "2026-07-25T00:00:01.000Z", diagnosticOccurredAt: "2026-07-25T00:00:01.000Z", safeMessage: "Models are available." }],
  attention: [{ attentionId: "attention-1", attentionRevisionId: "routing-revision-1", affectedRoute: route, reasonCode: "catalog_unavailable", occurredAt: "2026-07-25T00:00:02.000Z", acknowledgedAt: null }],
};
const draft = {
  schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, policyId: ROUTING_MATRIX_POLICY_ID,
  scope: { kind: "action", actionId: "code-review" } as const,
  selection: { kind: "route", route, failurePolicy: { kind: "fail_immediately" } } as const,
  expectedRevision: { revisionId: "routing-revision-1", revisionNumber: 1 }, revisionGuard: "opaque-guard",
};

const malformedOuter: readonly unknown[] = [undefined, null, false, 1, "value", [], {}];
function extra<T extends object>(value: T): T & { unexpected: true } { return { ...value, unexpected: true }; }

describe("routing matrix exact guards", () => {
  it("accepts a complete closed snapshot and every nested exported contract", () => {
    expect(isRoutingMatrixReasonV1(routingMatrixReason("tools_required"))).toBe(true);
    expect(isRoutingMatrixRouteV1(routeView)).toBe(true);
    expect(isRoutingMatrixEligibilityV1(actionRow.eligibility)).toBe(true);
    expect(isRoutingMatrixGlobalRowV1(globalRow)).toBe(true);
    expect(isRoutingMatrixActionTypeRowV1(typeRow)).toBe(true);
    expect(isRoutingMatrixActionRowV1(actionRow)).toBe(true);
    expect(isRoutingMatrixActionTypeGroupV1(group)).toBe(true);
    expect(isRoutingMatrixPolicyIdentityV1(snapshot.policy)).toBe(true);
    expect(isRoutingMatrixConnectionStateV1(snapshot.connectionStates[0])).toBe(true);
    expect(isRoutingMatrixAttentionV1(snapshot.attention[0])).toBe(true);
    expect(isRoutingMatrixSnapshotV1(snapshot)).toBe(true);
  });

  it("rejects absent, null, primitive, array, and extra-key values through every exported nested guard", () => {
    const registryEntry = {
      schemaVersion: "agent-routing/v1", actionId: "code-review", actionType: "review", actionTypeLabel: "Review", actionTypeDisplayOrder: 3,
      label: "Code Review", displayOrder: 1, roleId: "code-review-agent", promptVersion: "code-review/v1", capabilityRequirements: requirements,
    };
    const mutationContext = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, registryVersion: "agent-registry/v1", registry: [registryEntry],
      routes: [{ schemaVersion: "agent-routing/v1", route, connectionActive: true, available: true, contextWindowTokens: 128_000, tools: true, api: true, reasoning: true }],
      occurredAt: "2026-07-25T00:00:03.000Z", actor: "operator", correlationId: null,
    };
    const preview = { schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, policyId: ROUTING_MATRIX_POLICY_ID, expectedRevision: draft.expectedRevision, revisionGuard: draft.revisionGuard, scope: draft.scope, scopeKey: "action:code-review", projectedRow: actionRow, allowedFallbackRoutes: [routeView] };
    const acknowledgement = { schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, policyId: ROUTING_MATRIX_POLICY_ID, attentionIdentity: { attentionId: "attention-1", attentionRevisionId: "routing-revision-1", affectedRoute: route }, expectedRevision: draft.expectedRevision, revisionGuard: draft.revisionGuard, acknowledgedAt: "2026-07-25T00:00:04.000Z" };
    const guards: ReadonlyArray<readonly [string, (value: unknown) => boolean, object]> = [
      ["reason", isRoutingMatrixReasonV1, routingMatrixReason("tools_required")], ["route", isRoutingMatrixRouteV1, routeView],
      ["eligibility", isRoutingMatrixEligibilityV1, actionRow.eligibility], ["global row", isRoutingMatrixGlobalRowV1, globalRow],
      ["type row", isRoutingMatrixActionTypeRowV1, typeRow], ["action row", isRoutingMatrixActionRowV1, actionRow],
      ["row union", isRoutingMatrixRowV1, actionRow], ["group", isRoutingMatrixActionTypeGroupV1, group],
      ["policy identity", isRoutingMatrixPolicyIdentityV1, snapshot.policy], ["connection state", isRoutingMatrixConnectionStateV1, snapshot.connectionStates[0]!],
      ["attention", isRoutingMatrixAttentionV1, snapshot.attention[0]!], ["snapshot", isRoutingMatrixSnapshotV1, snapshot],
      ["mutation context", isRoutingMatrixMutationContextV1, mutationContext], ["row draft", isRoutingMatrixRowDraftV1, draft],
      ["preview", isRoutingMatrixPreviewV1, preview], ["attention acknowledgement", isRoutingMatrixAttentionAcknowledgeV1, acknowledgement],
    ];
    for (const [name, guard, valid] of guards) {
      expect(guard(valid), `${name} positive control`).toBe(true);
      for (const malformed of malformedOuter) {
        expect(() => guard(malformed), `${name} malformed value`).not.toThrow();
        expect(guard(malformed), `${name} malformed value`).toBe(false);
      }
      expect(guard(extra(valid)), `${name} extra key`).toBe(false);
    }
  });

  it.each(malformedOuter)("rejects malformed snapshot outer value %# without throwing", (candidate) => {
    expect(() => isRoutingMatrixSnapshotV1(candidate)).not.toThrow();
    expect(isRoutingMatrixSnapshotV1(candidate)).toBe(false);
  });

  it.each([
    ["extra snapshot key", extra(snapshot)],
    ["extra nested policy key", { ...snapshot, policy: extra(snapshot.policy) }],
    ["extra nested row key", { ...snapshot, global: extra(globalRow) }],
    ["malformed group collection", { ...snapshot, groups: null }],
    ["empty groups", { ...snapshot, groups: [] }],
    ["duplicate group", { ...snapshot, groups: [group, group] }],
    ["misbound type scope", { ...snapshot, groups: [{ ...group, actionType: "completion" }] }],
    ["duplicate action", { ...snapshot, groups: [{ ...group, actions: [actionRow, actionRow] }] }],
    ["unordered action", { ...snapshot, groups: [{ ...group, actions: [{ ...actionRow, displayOrder: 2 }, actionRow] }] }],
    ["malformed route choices", { ...snapshot, global: { ...globalRow, routeChoices: [routeView, routeView] } }],
    ["inconsistent Inherit policy", { ...snapshot, groups: [{ ...group, typeDefault: { ...typeRow, configuredFailurePolicy: { kind: "fail_immediately" } } }] }],
    ["incorrect global failure policy", { ...snapshot, global: { ...globalRow, configuredFailurePolicy: { kind: "reroute_global_once" } } }],
    ["incorrect state precedence", { ...snapshot, state: "global_unavailable" }],
    ["duplicate connection", { ...snapshot, connectionStates: [snapshot.connectionStates[0]!, snapshot.connectionStates[0]!] }],
    ["duplicate attention", { ...snapshot, attention: [snapshot.attention[0]!, snapshot.attention[0]!] }],
  ])("rejects %s", (_name, candidate) => expect(isRoutingMatrixSnapshotV1(candidate)).toBe(false));

  it("enforces deterministic reason identity, order, uniqueness, and eligibility", () => {
    expect(isRoutingMatrixReasonV1({ code: "tools_required", message: "raw server text" })).toBe(false);
    const unavailable = { ...routeView, availability: "unavailable", eligible: false, reasons: [routingMatrixReason("route_unavailable")] };
    expect(isRoutingMatrixRouteV1(unavailable)).toBe(true);
    expect(isRoutingMatrixRouteV1({ ...unavailable, reasons: [routingMatrixReason("tools_required"), routingMatrixReason("route_unavailable")] })).toBe(false);
    expect(isRoutingMatrixRouteV1({ ...unavailable, reasons: [routingMatrixReason("route_unavailable"), routingMatrixReason("route_unavailable")] })).toBe(false);
    expect(isRoutingMatrixRouteV1({ ...routeView, eligible: false })).toBe(false);
  });

  it("accepts fully bound positive controls for every row source/configuration matrix case", () => {
    const typeExplicit: RoutingMatrixActionTypeRowV1 = {
      ...typeRow,
      configured: { kind: "route", route },
      configuredFailurePolicy: { kind: "reroute_global_once" },
      effectiveFailurePolicy: { kind: "reroute_global_once" },
      policySource: "action_type",
    };
    const actionExplicit: RoutingMatrixActionRowV1 = {
      ...actionRow,
      configured: { kind: "route", route },
      configuredFailurePolicy: { kind: "reroute_route_once", fallbackRoute: secondaryRoute },
      effectiveFailurePolicy: { kind: "reroute_route_once", fallbackRoute: secondaryRoute },
      policySource: "action",
    };
    const actionFromType: RoutingMatrixActionRowV1 = {
      ...actionRow,
      policySource: "action_type",
      effectiveFailurePolicy: { kind: "reroute_global_once" },
    };

    expect(isRoutingMatrixGlobalRowV1(globalRow), "Global explicit").toBe(true);
    expect(isRoutingMatrixActionTypeRowV1(typeExplicit), "action type explicit").toBe(true);
    expect(isRoutingMatrixActionTypeRowV1(typeRow), "action type Inherit from Global").toBe(true);
    expect(isRoutingMatrixActionRowV1(actionExplicit), "action explicit").toBe(true);
    expect(isRoutingMatrixActionRowV1(actionFromType), "action Inherit from action type").toBe(true);
    expect(isRoutingMatrixActionRowV1(actionRow), "action Inherit from Global").toBe(true);
  });

  it("rejects every forbidden row source, order, route, policy, and eligibility relationship", () => {
    const typeExplicit: RoutingMatrixActionTypeRowV1 = {
      ...typeRow,
      configured: { kind: "route", route },
      configuredFailurePolicy: { kind: "reroute_route_once", fallbackRoute: secondaryRoute },
      effectiveFailurePolicy: { kind: "reroute_route_once", fallbackRoute: secondaryRoute },
      policySource: "action_type",
    };
    const actionExplicit: RoutingMatrixActionRowV1 = {
      ...actionRow,
      configured: { kind: "route", route },
      configuredFailurePolicy: { kind: "reroute_route_once", fallbackRoute: secondaryRoute },
      effectiveFailurePolicy: { kind: "reroute_route_once", fallbackRoute: secondaryRoute },
      policySource: "action",
    };
    const eligibilityMismatch = {
      eligible: false,
      reasons: [routingMatrixReason("tools_required")],
    };
    const cases: ReadonlyArray<readonly [string, (candidate: unknown) => boolean, unknown]> = [
      ["Global route identity mismatch", isRoutingMatrixGlobalRowV1, { ...globalRow, effectiveRoute: secondaryRouteView }],
      ["Global source mismatch", isRoutingMatrixGlobalRowV1, { ...globalRow, policySource: "action_type" }],
      ["Global Inherit", isRoutingMatrixGlobalRowV1, { ...globalRow, configured: { kind: "inherit" }, configuredFailurePolicy: null }],
      ["action type zero order", isRoutingMatrixActionTypeRowV1, { ...typeRow, displayOrder: 0 }],
      ["action zero order", isRoutingMatrixActionRowV1, { ...actionRow, displayOrder: 0 }],
      ["action type explicit from Global", isRoutingMatrixActionTypeRowV1, { ...typeExplicit, policySource: "global" }],
      ["action type explicit from Action", isRoutingMatrixActionTypeRowV1, { ...typeExplicit, policySource: "action" }],
      ["action type Inherit from Action type", isRoutingMatrixActionTypeRowV1, { ...typeRow, policySource: "action_type" }],
      ["action type Inherit from Action", isRoutingMatrixActionTypeRowV1, { ...typeRow, policySource: "action" }],
      ["action explicit from Global", isRoutingMatrixActionRowV1, { ...actionExplicit, policySource: "global" }],
      ["action explicit from Action type", isRoutingMatrixActionRowV1, { ...actionExplicit, policySource: "action_type" }],
      ["action Inherit from Action", isRoutingMatrixActionRowV1, { ...actionRow, policySource: "action" }],
      ["action type explicit route mismatch", isRoutingMatrixActionTypeRowV1, { ...typeExplicit, effectiveRoute: secondaryRouteView }],
      ["action explicit route mismatch", isRoutingMatrixActionRowV1, { ...actionExplicit, effectiveRoute: secondaryRouteView }],
      ["action type explicit policy kind mismatch", isRoutingMatrixActionTypeRowV1, { ...typeExplicit, effectiveFailurePolicy: { kind: "fail_immediately" } }],
      ["action explicit fallback identity mismatch", isRoutingMatrixActionRowV1, { ...actionExplicit, effectiveFailurePolicy: { kind: "reroute_route_once", fallbackRoute: tertiaryRoute } }],
      ["action type inherited Global policy mismatch", isRoutingMatrixActionTypeRowV1, { ...typeRow, effectiveFailurePolicy: { kind: "reroute_global_once" } }],
      ["action inherited Global policy mismatch", isRoutingMatrixActionRowV1, { ...actionRow, effectiveFailurePolicy: { kind: "reroute_global_once" } }],
      ["Global eligibility reasons mismatch", isRoutingMatrixGlobalRowV1, { ...globalRow, eligibility: eligibilityMismatch }],
      ["action type eligibility reasons mismatch", isRoutingMatrixActionTypeRowV1, { ...typeRow, eligibility: eligibilityMismatch }],
      ["action eligibility reasons mismatch", isRoutingMatrixActionRowV1, { ...actionRow, eligibility: eligibilityMismatch }],
    ];
    for (const [name, guard, candidate] of cases) {
      expect(guard(candidate), name).toBe(false);
    }
  });

  it("accepts only fully explained route and preview reason combinations", () => {
    const availableIneligible: RoutingMatrixRouteV1 = {
      ...secondaryRouteView,
      eligible: false,
      reasons: [routingMatrixReason("tools_required")],
    };
    const unavailable: RoutingMatrixRouteV1 = {
      ...secondaryRouteView,
      availability: "unavailable",
      eligible: false,
      reasons: [routingMatrixReason("route_unavailable")],
    };
    const samePrimary: RoutingMatrixRouteV1 = {
      ...routeView,
      eligible: false,
      reasons: [routingMatrixReason("same_as_primary")],
    };
    const projectedRow: RoutingMatrixActionRowV1 = {
      ...actionRow,
      configured: { kind: "route", route },
      configuredFailurePolicy: { kind: "fail_immediately" },
      policySource: "action",
    };
    const preview = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
      policyId: ROUTING_MATRIX_POLICY_ID,
      expectedRevision: draft.expectedRevision,
      revisionGuard: draft.revisionGuard,
      scope: draft.scope,
      scopeKey: "action:code-review",
      projectedRow,
      allowedFallbackRoutes: [secondaryRouteView, samePrimary],
    };

    expect(isRoutingMatrixRouteV1(routeView), "available eligible route").toBe(true);
    expect(isRoutingMatrixRouteV1(availableIneligible), "available capability-ineligible route").toBe(true);
    expect(isRoutingMatrixRouteV1(unavailable), "unavailable explained route").toBe(true);
    expect(isRoutingMatrixPreviewV1(preview), "distinct eligible and same-primary disabled fallbacks").toBe(true);
  });

  it("rejects unsafe route reasons and every malformed or unbound fallback collection", () => {
    const unavailableReasonFree = { ...secondaryRouteView, availability: "unavailable", eligible: false, reasons: [] };
    expect(isRoutingMatrixRouteV1(unavailableReasonFree), "reviewer probe: unavailable reason-free").toBe(false);
    expect(isRoutingMatrixRouteV1({ ...unavailableReasonFree, reasons: [routingMatrixReason("tools_required")] }), "unavailable without availability refusal").toBe(false);
    expect(isRoutingMatrixRouteV1({ ...secondaryRouteView, eligible: false, reasons: [routingMatrixReason("connection_inactive")] }), "available with connection refusal").toBe(false);
    expect(isRoutingMatrixRouteV1({ ...secondaryRouteView, eligible: false, reasons: [routingMatrixReason("route_unavailable")] }), "available with route refusal").toBe(false);
    expect(isRoutingMatrixRouteV1({ ...secondaryRouteView, reasons: [routingMatrixReason("tools_required")] }), "eligible route with a reason").toBe(false);

    const projectedRow: RoutingMatrixActionRowV1 = {
      ...actionRow,
      configured: { kind: "route", route },
      configuredFailurePolicy: { kind: "fail_immediately" },
      policySource: "action",
    };
    const basePreview = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
      policyId: ROUTING_MATRIX_POLICY_ID,
      expectedRevision: draft.expectedRevision,
      revisionGuard: draft.revisionGuard,
      scope: draft.scope,
      scopeKey: "action:code-review",
      projectedRow,
      allowedFallbackRoutes: [secondaryRouteView],
    };
    const samePrimaryWithoutReason = { ...routeView, eligible: false, reasons: [routingMatrixReason("tools_required")] };
    const distinctWithSameReason = { ...secondaryRouteView, eligible: false, reasons: [routingMatrixReason("same_as_primary")] };
    const inheritPreview = { ...basePreview, projectedRow: actionRow, allowedFallbackRoutes: [distinctWithSameReason] };
    expect(isRoutingMatrixPreviewV1({ ...basePreview, allowedFallbackRoutes: [samePrimaryWithoutReason] }), "same primary without same_as_primary").toBe(false);
    expect(isRoutingMatrixPreviewV1({ ...basePreview, allowedFallbackRoutes: [distinctWithSameReason] }), "distinct fallback carrying same_as_primary").toBe(false);
    expect(isRoutingMatrixPreviewV1(inheritPreview), "Inherit preview carrying same_as_primary").toBe(false);

    const { allowedFallbackRoutes: _omitted, ...missingFallbacks } = basePreview;
    const malformedFallbacks: ReadonlyArray<readonly [string, unknown]> = [
      ["absent", missingFallbacks],
      ["null", { ...basePreview, allowedFallbackRoutes: null }],
      ["primitive", { ...basePreview, allowedFallbackRoutes: "route" }],
      ["object", { ...basePreview, allowedFallbackRoutes: { route: secondaryRouteView } }],
      ["non-array", { ...basePreview, allowedFallbackRoutes: new Set([secondaryRouteView]) }],
      ["malformed member", { ...basePreview, allowedFallbackRoutes: [{}] }],
      ["duplicate identity", { ...basePreview, allowedFallbackRoutes: [secondaryRouteView, secondaryRouteView] }],
    ];
    for (const [name, candidate] of malformedFallbacks) {
      expect(() => isRoutingMatrixPreviewV1(candidate), name).not.toThrow();
      expect(isRoutingMatrixPreviewV1(candidate), name).toBe(false);
    }
  });

  it("accepts exact legal row drafts and rejects illegal Global/cross-field variants", () => {
    expect(isRoutingMatrixRowDraftV1(draft)).toBe(true);
    expect(isRoutingMatrixRowDraftV1({ ...draft, selection: { kind: "inherit" } })).toBe(true);
    const globalDraft = { ...draft, scope: { kind: "global" }, selection: { kind: "route", route, failurePolicy: { kind: "fail_immediately" } } };
    expect(isRoutingMatrixRowDraftV1(globalDraft)).toBe(true);
    expect(isRoutingMatrixRowDraftV1({ ...globalDraft, selection: { kind: "inherit" } })).toBe(false);
    expect(isRoutingMatrixRowDraftV1({ ...globalDraft, selection: { kind: "route", route, failurePolicy: { kind: "reroute_global_once" } } })).toBe(false);
    expect(isRoutingMatrixRowDraftV1(extra(draft))).toBe(false);
    expect(isRoutingMatrixRowDraftV1({ ...draft, expectedRevision: { revisionId: "routing-revision-1" } })).toBe(false);
    expect(isRoutingMatrixRowDraftV1({ ...draft, revisionGuard: "" })).toBe(false);
  });

  it("guards mutation context, preview binding, and attention acknowledgement exactly", () => {
    const registryEntry = {
      schemaVersion: "agent-routing/v1", actionId: "code-review", actionType: "review", actionTypeLabel: "Review", actionTypeDisplayOrder: 3,
      label: "Code Review", displayOrder: 1, roleId: "code-review-agent", promptVersion: "code-review/v1", capabilityRequirements: requirements,
    };
    const context = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, registryVersion: "agent-registry/v1", registry: [registryEntry],
      routes: [{ schemaVersion: "agent-routing/v1", route, connectionActive: true, available: true, contextWindowTokens: 128_000, tools: true, api: true, reasoning: true }],
      occurredAt: "2026-07-25T00:00:03.000Z", actor: "operator", correlationId: null,
    };
    expect(isRoutingMatrixMutationContextV1(context)).toBe(true);
    expect(isRoutingMatrixMutationContextV1({ ...context, routes: [...context.routes, context.routes[0]] })).toBe(false);
    expect(isRoutingMatrixMutationContextV1({ ...context, registry: [extra(registryEntry)] })).toBe(false);

    const preview = { schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, policyId: ROUTING_MATRIX_POLICY_ID, expectedRevision: draft.expectedRevision, revisionGuard: draft.revisionGuard, scope: draft.scope, scopeKey: "action:code-review", projectedRow: actionRow, allowedFallbackRoutes: [routeView] };
    expect(isRoutingMatrixPreviewV1(preview)).toBe(true);
    expect(isRoutingMatrixPreviewV1({ ...preview, scopeKey: "action:other" })).toBe(false);
    expect(isRoutingMatrixPreviewV1({ ...preview, allowedFallbackRoutes: [routeView, routeView] })).toBe(false);

    const acknowledgement = { schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, policyId: ROUTING_MATRIX_POLICY_ID, attentionIdentity: { attentionId: "attention-1", attentionRevisionId: "routing-revision-1", affectedRoute: route }, expectedRevision: draft.expectedRevision, revisionGuard: draft.revisionGuard, acknowledgedAt: "2026-07-25T00:00:04.000Z" };
    expect(isRoutingMatrixAttentionAcknowledgeV1(acknowledgement)).toBe(true);
    expect(isRoutingMatrixAttentionAcknowledgeV1({ ...acknowledgement, attentionIdentity: extra(acknowledgement.attentionIdentity) })).toBe(false);
    expect(isRoutingMatrixAttentionAcknowledgeV1({ ...acknowledgement, acknowledgedAt: "not-a-date" })).toBe(false);
  });
});
