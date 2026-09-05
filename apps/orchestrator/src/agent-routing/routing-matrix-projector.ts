import {
  ROUTING_MATRIX_SCHEMA_VERSION,
  isAgentRegistryCollectionV1,
  isRoutingAttentionV1,
  isRoutingMatrixPolicyIdentityV1,
  isRoutingMatrixSnapshotV1,
  isRoutingPolicyRevisionV1,
  routeIdentityKey,
  routingMatrixReason,
  selectorScopeKey,
  type AgentActionType,
  type AgentCapabilityRequirementsV1,
  type AgentRegistryEntryV1,
  type FailurePolicyV1,
  type RouteIdentityV1,
  type RoutingAttentionV1,
  type RoutingCatalogRouteFactV1,
  type RoutingMatrixActionRowV1,
  type RoutingMatrixActionTypeGroupV1,
  type RoutingMatrixActionTypeRowV1,
  type RoutingMatrixConfiguredV1,
  type RoutingMatrixGlobalRowV1,
  type RoutingMatrixPolicyIdentityV1,
  type RoutingMatrixReasonCodeV1,
  type RoutingMatrixRouteV1,
  type RoutingMatrixRowV1,
  type RoutingMatrixSnapshotV1,
  type RoutingPolicyRevisionV1,
  type RoutingPolicySelectorV1,
  type RoutingPolicySourceV1,
} from "@hepha/shared";
import {
  isRoutingMatrixCatalogFacts,
  type RoutingMatrixCatalogFacts,
} from "./routing-matrix-catalog-facts.js";

export interface RoutingMatrixProjectionInput {
  readonly registryVersion: string;
  readonly registry: readonly AgentRegistryEntryV1[];
  readonly policy: RoutingPolicyRevisionV1;
  readonly policyIdentity: RoutingMatrixPolicyIdentityV1;
  readonly catalog: RoutingMatrixCatalogFacts;
  readonly attention: readonly RoutingAttentionV1[];
}

/** Joins validated routing authorities into the complete closed matrix read model. */
export class RoutingMatrixProjector {
  project(input: unknown): RoutingMatrixSnapshotV1 {
    if (!isProjectionInput(input)) throwProjectionError();
    validateAuthorityBindings(input);

    const selectors = new Map(input.policy.selectors.map((selector) => [selectorScopeKey(selector.scope), selector]));
    const globalSelector = selectors.get("global");
    if (!globalSelector || globalSelector.scope.kind !== "global" || globalSelector.selector.kind !== "route"
      || globalSelector.failurePolicy.kind !== "fail_immediately") throwProjectionError();

    const registryByType = new Map<AgentActionType, AgentRegistryEntryV1[]>();
    for (const entry of input.registry) {
      const entries = registryByType.get(entry.actionType) ?? [];
      entries.push(entry);
      registryByType.set(entry.actionType, entries);
    }

    const globalRequirements = aggregateRequirements(input.registry);
    const global = this.globalRow(globalSelector, globalRequirements, input.catalog);
    const groups = [...registryByType.values()].map((entries) => {
      const first = entries[0];
      if (!first) throwProjectionError();
      const orderedEntries = [...entries].sort((left, right) => left.displayOrder - right.displayOrder);
      const typeSelector = selectors.get(selectorScopeKey({ kind: "action_type", actionType: first.actionType }));
      const typeDefault = this.actionTypeRow(first, orderedEntries, typeSelector, globalSelector, input.catalog);
      const actions = orderedEntries.map((entry) => this.actionRow(entry, selectors.get(selectorScopeKey({ kind: "action", actionId: entry.actionId })), typeSelector, globalSelector, input.catalog));
      return {
        actionType: first.actionType,
        label: first.actionTypeLabel,
        displayOrder: first.actionTypeDisplayOrder,
        typeDefault,
        actions,
      } satisfies RoutingMatrixActionTypeGroupV1;
    }).sort((left, right) => left.displayOrder - right.displayOrder);

    const allRows: RoutingMatrixRowV1[] = [global, ...groups.flatMap((group) => [group.typeDefault, ...group.actions])];
    const snapshot: RoutingMatrixSnapshotV1 = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
      policy: input.policyIdentity,
      state: global.effectiveRoute.availability === "unavailable" ? "global_unavailable"
        : allRows.every((row) => row.routeChoices.every((route) => !route.eligible)) ? "empty_choices" : "ready",
      global,
      groups,
      connectionStates: input.catalog.connectionStates,
      attention: [...input.attention].sort(compareAttention).map((item) => ({
        attentionId: item.attentionId,
        attentionRevisionId: item.revisionId,
        affectedRoute: { connectionId: item.connectionId, modelId: item.modelId },
        reasonCode: item.reasonCode,
        occurredAt: item.occurredAt,
        acknowledgedAt: item.acknowledgedAt,
      })),
    };
    if (!isRoutingMatrixSnapshotV1(snapshot)) throwProjectionError();
    return snapshot;
  }

  private globalRow(
    selector: RoutingPolicySelectorV1,
    requirements: AgentCapabilityRequirementsV1,
    catalog: RoutingMatrixCatalogFacts,
  ): RoutingMatrixGlobalRowV1 {
    if (selector.selector.kind !== "route") throwProjectionError();
    const effectiveRoute = matrixRoute(selector.selector.route, requirements, catalog);
    return {
      kind: "global", scope: { kind: "global" }, scopeKey: "global", label: "Global Default", displayOrder: 0,
      configured: { kind: "route", route: selector.selector.route },
      configuredFailurePolicy: { kind: "fail_immediately" }, effectiveRoute,
      effectiveFailurePolicy: { kind: "fail_immediately" }, policySource: "global", requirements,
      eligibility: eligibility(effectiveRoute), routeChoices: routeChoices(requirements, catalog),
    };
  }

  private actionTypeRow(
    metadata: AgentRegistryEntryV1,
    entries: readonly AgentRegistryEntryV1[],
    selector: RoutingPolicySelectorV1 | undefined,
    global: RoutingPolicySelectorV1,
    catalog: RoutingMatrixCatalogFacts,
  ): RoutingMatrixActionTypeRowV1 {
    const scope = { kind: "action_type", actionType: metadata.actionType } as const;
    const requirements = aggregateRequirements(entries);
    const effective = explicitSelector(selector) ?? requiredExplicit(global);
    const source: RoutingPolicySourceV1 = explicitSelector(selector) ? "action_type" : "global";
    const effectiveRoute = matrixRoute(effective.selector.route, requirements, catalog);
    return {
      kind: "action_type", scope, scopeKey: selectorScopeKey(scope), label: metadata.actionTypeLabel,
      displayOrder: metadata.actionTypeDisplayOrder, configured: configured(selector),
      configuredFailurePolicy: configuredFailure(selector), effectiveRoute,
      effectiveFailurePolicy: effective.failurePolicy, policySource: source, requirements,
      eligibility: eligibility(effectiveRoute), routeChoices: routeChoices(requirements, catalog),
    };
  }

  private actionRow(
    entry: AgentRegistryEntryV1,
    selector: RoutingPolicySelectorV1 | undefined,
    typeSelector: RoutingPolicySelectorV1 | undefined,
    global: RoutingPolicySelectorV1,
    catalog: RoutingMatrixCatalogFacts,
  ): RoutingMatrixActionRowV1 {
    const scope = { kind: "action", actionId: entry.actionId } as const;
    const selected = explicitSelector(selector) ?? explicitSelector(typeSelector) ?? requiredExplicit(global);
    const source: RoutingPolicySourceV1 = explicitSelector(selector) ? "action"
      : explicitSelector(typeSelector) ? "action_type" : "global";
    const effectiveRoute = matrixRoute(selected.selector.route, entry.capabilityRequirements, catalog);
    return {
      kind: "action", scope, scopeKey: selectorScopeKey(scope), label: entry.label, displayOrder: entry.displayOrder,
      configured: configured(selector), configuredFailurePolicy: configuredFailure(selector), effectiveRoute,
      effectiveFailurePolicy: selected.failurePolicy, policySource: source, requirements: entry.capabilityRequirements,
      eligibility: eligibility(effectiveRoute), routeChoices: routeChoices(entry.capabilityRequirements, catalog),
      roleId: entry.roleId, promptVersion: entry.promptVersion,
    };
  }
}

function isProjectionInput(value: unknown): value is RoutingMatrixProjectionInput {
  return exact(value, ["registryVersion", "registry", "policy", "policyIdentity", "catalog", "attention"])
    && text(value.registryVersion, 256) && isAgentRegistryCollectionV1(value.registry)
    && isRoutingPolicyRevisionV1(value.policy) && isRoutingMatrixPolicyIdentityV1(value.policyIdentity)
    && isRoutingMatrixCatalogFacts(value.catalog) && Array.isArray(value.attention)
    && value.attention.every(isRoutingAttentionV1)
    && unique(value.attention.map((item: RoutingAttentionV1) => item.attentionId));
}

function validateAuthorityBindings(input: RoutingMatrixProjectionInput): void {
  if (input.policy.registryVersion !== input.registryVersion || input.policyIdentity.registryVersion !== input.registryVersion
    || input.policy.revisionId !== input.policyIdentity.revisionId) throwProjectionError();
  const registeredActions = new Set(input.registry.map((entry) => entry.actionId));
  const registeredTypes = new Set(input.registry.map((entry) => entry.actionType));
  const scopes = new Set<string>();
  for (const selector of input.policy.selectors) {
    const key = selectorScopeKey(selector.scope);
    if (scopes.has(key) || selector.selector.kind === "inherit" && selector.failurePolicy.kind !== "fail_immediately") throwProjectionError();
    scopes.add(key);
    if (selector.scope.kind === "action" && !registeredActions.has(selector.scope.actionId)) throwProjectionError();
    if (selector.scope.kind === "action_type" && !registeredTypes.has(selector.scope.actionType)) throwProjectionError();
  }
  if (input.attention.some((item) => item.revisionId !== input.policy.revisionId)) throwProjectionError();
}

function aggregateRequirements(entries: readonly AgentRegistryEntryV1[]): AgentCapabilityRequirementsV1 {
  if (entries.length === 0) throwProjectionError();
  return {
    minimumContextWindowTokens: Math.max(...entries.map((entry) => entry.capabilityRequirements.minimumContextWindowTokens)),
    requiresTools: entries.some((entry) => entry.capabilityRequirements.requiresTools),
    requiresApi: entries.some((entry) => entry.capabilityRequirements.requiresApi),
    requiresReasoning: entries.some((entry) => entry.capabilityRequirements.requiresReasoning),
  };
}

function configured(selector: RoutingPolicySelectorV1 | undefined): RoutingMatrixConfiguredV1 {
  const explicit = explicitSelector(selector);
  return explicit ? { kind: "route", route: explicit.selector.route } : { kind: "inherit" };
}
function configuredFailure(selector: RoutingPolicySelectorV1 | undefined): FailurePolicyV1 | null {
  return explicitSelector(selector)?.failurePolicy ?? null;
}
function explicitSelector(selector: RoutingPolicySelectorV1 | undefined): RoutingPolicySelectorV1 & { readonly selector: { readonly kind: "route"; readonly route: RouteIdentityV1 } } | null {
  return selector?.selector.kind === "route" ? selector as RoutingPolicySelectorV1 & { readonly selector: { readonly kind: "route"; readonly route: RouteIdentityV1 } } : null;
}
function requiredExplicit(selector: RoutingPolicySelectorV1): RoutingPolicySelectorV1 & { readonly selector: { readonly kind: "route"; readonly route: RouteIdentityV1 } } {
  return explicitSelector(selector) ?? throwProjectionError();
}

function routeChoices(requirements: AgentCapabilityRequirementsV1, catalog: RoutingMatrixCatalogFacts): RoutingMatrixRouteV1[] {
  return catalog.identities.map((identity) => matrixRoute(identity.route, requirements, catalog));
}
function matrixRoute(route: RouteIdentityV1, requirements: AgentCapabilityRequirementsV1, catalog: RoutingMatrixCatalogFacts): RoutingMatrixRouteV1 {
  const key = routeIdentityKey(route);
  const identity = catalog.identities.find((candidate) => routeIdentityKey(candidate.route) === key);
  const fact = catalog.routes.find((candidate) => routeIdentityKey(candidate.route) === key);
  const state = catalog.connectionStates.find((candidate) => candidate.connectionId === route.connectionId);
  const reasons = routeReasons(fact, requirements);
  const available = Boolean(fact?.connectionActive && fact.available);
  return {
    route,
    connectionLabel: identity?.connectionLabel ?? state?.label ?? "Unavailable connection",
    modelDisplayLabel: identity?.modelDisplayLabel ?? null,
    availability: available ? "available" : "unavailable",
    eligible: reasons.length === 0,
    reasons: reasons.map(routingMatrixReason),
  };
}
function routeReasons(fact: RoutingCatalogRouteFactV1 | undefined, requirements: AgentCapabilityRequirementsV1): RoutingMatrixReasonCodeV1[] {
  const reasons: RoutingMatrixReasonCodeV1[] = [];
  if (!fact?.connectionActive) reasons.push("connection_inactive");
  if (!fact?.available) reasons.push("route_unavailable");
  if (fact?.contextWindowTokens === null || fact === undefined) reasons.push("context_window_unknown");
  else if (fact.contextWindowTokens < requirements.minimumContextWindowTokens) reasons.push("context_window_too_small");
  if (requirements.requiresTools && fact?.tools === null) reasons.push("tools_unknown");
  else if (requirements.requiresTools && fact?.tools !== true) reasons.push("tools_required");
  if (requirements.requiresApi && fact?.api === null) reasons.push("api_unknown");
  else if (requirements.requiresApi && fact?.api !== true) reasons.push("api_required");
  if (requirements.requiresReasoning && fact?.reasoning === null) reasons.push("reasoning_unknown");
  else if (requirements.requiresReasoning && fact?.reasoning !== true) reasons.push("reasoning_required");
  return reasons;
}
function eligibility(route: RoutingMatrixRouteV1) { return { eligible: route.eligible, reasons: route.reasons }; }
function compareAttention(left: RoutingAttentionV1, right: RoutingAttentionV1): number {
  return left.occurredAt.localeCompare(right.occurredAt) || left.attentionId.localeCompare(right.attentionId);
}
function exact<const T extends readonly string[]>(value: unknown, keys: T): value is Record<T[number], any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function unique(values: readonly unknown[]): boolean { return new Set(values).size === values.length; }
function throwProjectionError(): never { throw new Error("Routing matrix projection failed."); }
