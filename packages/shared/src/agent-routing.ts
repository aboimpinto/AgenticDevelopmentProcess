import type { ProviderConnectionId } from "./provider-connections.js";

/** Closed V1 contract for registry, routing policy, and resolver handoff data. */
export const AGENT_ROUTING_SCHEMA_VERSION = "agent-routing/v1" as const;
export type AgentRoutingSchemaVersion = typeof AGENT_ROUTING_SCHEMA_VERSION;

export type AgentActionType = "discovery_planning" | "implementation" | "review" | "completion" | "knowledge_documentation";
export type AgentRoleId =
  | "product-architect" | "requirements-agent" | "ux-design-agent" | "planning-agent"
  | "implementation-agent" | "code-review-agent" | "completion-agent"
  | "phase-lessons-capture-agent" | "feature-lessons-writer-agent" | "post-complete-lessons-curator-agent";
export type AgentActionId = string;

export interface AgentCapabilityRequirementsV1 {
  readonly minimumContextWindowTokens: number;
  readonly requiresTools: boolean;
  readonly requiresApi: boolean;
  readonly requiresReasoning: boolean;
}

export interface AgentRegistryEntryV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly actionId: AgentActionId;
  readonly actionType: AgentActionType;
  readonly actionTypeLabel: string;
  readonly actionTypeDisplayOrder: number;
  readonly label: string;
  readonly displayOrder: number;
  readonly roleId: AgentRoleId;
  readonly promptVersion: string;
  readonly capabilityRequirements: AgentCapabilityRequirementsV1;
}

export interface RouteIdentityV1 {
  readonly connectionId: ProviderConnectionId;
  readonly modelId: string;
}

export type RouteSelectorV1 =
  | { readonly kind: "inherit" }
  | { readonly kind: "route"; readonly route: RouteIdentityV1 };

export type FailurePolicyV1 =
  | { readonly kind: "fail_immediately" }
  | { readonly kind: "reroute_global_once" }
  | { readonly kind: "reroute_route_once"; readonly fallbackRoute: RouteIdentityV1 };

export type RoutingSelectorScopeV1 =
  | { readonly kind: "global" }
  | { readonly kind: "action_type"; readonly actionType: AgentActionType }
  | { readonly kind: "action"; readonly actionId: AgentActionId };

export interface RoutingPolicySelectorV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly scope: RoutingSelectorScopeV1;
  readonly selector: RouteSelectorV1;
  readonly failurePolicy: FailurePolicyV1;
}

export type RoutingPolicyRevisionReasonV1 = "bootstrap" | "operator_mutation" | "catalog_reset";

export interface RoutingPolicyMutationV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly registryVersion: string;
  readonly expectedRevisionId: string | null;
  readonly reason: Exclude<RoutingPolicyRevisionReasonV1, "catalog_reset">;
  readonly occurredAt: string;
  readonly actor: string | null;
  readonly correlationId: string | null;
  readonly selectors: readonly RoutingPolicySelectorV1[];
}

export interface RoutingPolicyRevisionV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly revisionId: string;
  readonly registryVersion: string;
  readonly reason: RoutingPolicyRevisionReasonV1;
  readonly createdAt: string;
  readonly actor: string | null;
  readonly correlationId: string | null;
  readonly selectors: readonly RoutingPolicySelectorV1[];
}

export interface RoutingDependencyV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly revisionId: string;
  readonly connectionId: ProviderConnectionId;
  readonly modelId: string;
  readonly selectorScope: RoutingSelectorScopeV1;
}

export interface RoutingAttentionV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly attentionId: string;
  readonly connectionId: ProviderConnectionId;
  readonly modelId: string;
  readonly reasonCode: string;
  readonly revisionId: string;
  readonly occurredAt: string;
  readonly acknowledgedAt: string | null;
}

export interface RoutingCatalogRouteFactV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly route: RouteIdentityV1;
  readonly connectionActive: boolean;
  readonly available: boolean;
  readonly contextWindowTokens: number | null;
  readonly tools: boolean | null;
  readonly api: boolean | null;
  readonly reasoning: boolean | null;
}

export interface RoutingPolicyValidationContextV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly registry: readonly AgentRegistryEntryV1[];
  readonly routes: readonly RoutingCatalogRouteFactV1[];
}

export type RoutingPolicyErrorCode =
  | "ROUTING_INVALID_REQUEST" | "ROUTING_INVALID_POLICY" | "ROUTING_ROUTE_UNAVAILABLE"
  | "ROUTING_CAPABILITY_MISMATCH" | "ROUTING_INVALID_HANDOFF_CHAIN" | "ROUTING_POLICY_CONFLICT"
  | "ROUTING_UNKNOWN_SCOPE" | "ROUTING_GLOBAL_DELETE_BLOCKED";

export interface RoutingPolicyRejectionV1 {
  readonly ok: false;
  readonly code: RoutingPolicyErrorCode;
  readonly message: string;
}

export interface RoutingPolicySuccessV1 { readonly ok: true; readonly revision: RoutingPolicyRevisionV1; }
export type RoutingPolicyMutationResultV1 = RoutingPolicySuccessV1 | RoutingPolicyRejectionV1;

export type RoutingPolicySourceV1 = "global" | "action_type" | "action";
export interface ResolvedRouteV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly action: AgentRegistryEntryV1;
  readonly route: RouteIdentityV1;
  readonly policySource: RoutingPolicySourceV1;
  readonly revisionId: string;
}
export interface HandoffPlanStepV1 { readonly kind: "primary" | "recovery"; readonly route: RouteIdentityV1; }
export interface HandoffPlanV1 {
  readonly schemaVersion: AgentRoutingSchemaVersion;
  readonly resolvedRoute: ResolvedRouteV1;
  readonly steps: readonly HandoffPlanStepV1[];
}

const actionTypes: readonly AgentActionType[] = ["completion", "discovery_planning", "implementation", "knowledge_documentation", "review"];
const roleIds: readonly AgentRoleId[] = ["code-review-agent", "completion-agent", "feature-lessons-writer-agent", "implementation-agent", "phase-lessons-capture-agent", "planning-agent", "post-complete-lessons-curator-agent", "product-architect", "requirements-agent", "ux-design-agent"];
const reasons: readonly RoutingPolicyRevisionReasonV1[] = ["bootstrap", "catalog_reset", "operator_mutation"];
const errorMessages: Readonly<Record<RoutingPolicyErrorCode, string>> = {
  ROUTING_INVALID_REQUEST: "Routing request is invalid.",
  ROUTING_INVALID_POLICY: "Routing policy is invalid.",
  ROUTING_ROUTE_UNAVAILABLE: "The selected connection/model route is unavailable.",
  ROUTING_CAPABILITY_MISMATCH: "The selected route does not meet this action's capability requirements.",
  ROUTING_INVALID_HANDOFF_CHAIN: "Routing fallback policy must be one distinct available hop.",
  ROUTING_POLICY_CONFLICT: "Routing policy changed; refresh and retry the requested update.",
  ROUTING_UNKNOWN_SCOPE: "The requested routing scope is not registered.",
  ROUTING_GLOBAL_DELETE_BLOCKED: "A replacement Global Default is required before deleting this connection.",
};

export function routingPolicyRejection(code: RoutingPolicyErrorCode): RoutingPolicyRejectionV1 {
  return { ok: false, code, message: errorMessages[code] };
}

export function isAgentRegistryEntryV1(value: unknown): value is AgentRegistryEntryV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isActionId(value.actionId)
    && isActionType(value.actionType) && isBoundedString(value.actionTypeLabel, 256) && isPositiveInteger(value.actionTypeDisplayOrder)
    && isBoundedString(value.label, 256) && isPositiveInteger(value.displayOrder)
    && isRoleId(value.roleId) && isBoundedString(value.promptVersion, 256)
    && isAgentCapabilityRequirementsV1(value.capabilityRequirements)
    && hasOnlyKeys(value, ["schemaVersion", "actionId", "actionType", "actionTypeLabel", "actionTypeDisplayOrder", "label", "displayOrder", "roleId", "promptVersion", "capabilityRequirements"]);
}

export function isAgentRegistryCollectionV1(value: unknown): value is readonly AgentRegistryEntryV1[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isAgentRegistryEntryV1)
    || !hasUniqueKeys(value, (entry) => entry.actionId)
    || !hasUniqueKeys(value, (entry) => `${entry.roleId}\u0000${entry.promptVersion}`)
    || !hasUniqueKeys(value, (entry) => `${entry.actionType}\u0000${entry.displayOrder}`)) return false;
  const typeMetadata = new Map<AgentActionType, string>();
  const typeOrders = new Map<number, AgentActionType>();
  for (const entry of value) {
    const identity = `${entry.actionTypeLabel}\u0000${entry.actionTypeDisplayOrder}`;
    const existingIdentity = typeMetadata.get(entry.actionType);
    const existingTypeAtOrder = typeOrders.get(entry.actionTypeDisplayOrder);
    if ((existingIdentity !== undefined && existingIdentity !== identity)
      || (existingTypeAtOrder !== undefined && existingTypeAtOrder !== entry.actionType)) return false;
    typeMetadata.set(entry.actionType, identity);
    typeOrders.set(entry.actionTypeDisplayOrder, entry.actionType);
  }
  return true;
}

export function isAgentCapabilityRequirementsV1(value: unknown): value is AgentCapabilityRequirementsV1 {
  return isRecord(value) && isPositiveInteger(value.minimumContextWindowTokens) && typeof value.requiresTools === "boolean"
    && typeof value.requiresApi === "boolean" && typeof value.requiresReasoning === "boolean"
    && hasOnlyKeys(value, ["minimumContextWindowTokens", "requiresTools", "requiresApi", "requiresReasoning"]);
}

export function isRouteIdentityV1(value: unknown): value is RouteIdentityV1 {
  return isRecord(value) && isBoundedString(value.connectionId, 512) && isBoundedString(value.modelId, 512)
    && hasOnlyKeys(value, ["connectionId", "modelId"]);
}

export function isRouteSelectorV1(value: unknown): value is RouteSelectorV1 {
  return isRecord(value) && ((value.kind === "inherit" && hasOnlyKeys(value, ["kind"]))
    || (value.kind === "route" && isRouteIdentityV1(value.route) && hasOnlyKeys(value, ["kind", "route"])));
}

export function isFailurePolicyV1(value: unknown): value is FailurePolicyV1 {
  return isRecord(value) && ((value.kind === "fail_immediately" && hasOnlyKeys(value, ["kind"]))
    || (value.kind === "reroute_global_once" && hasOnlyKeys(value, ["kind"]))
    || (value.kind === "reroute_route_once" && isRouteIdentityV1(value.fallbackRoute) && hasOnlyKeys(value, ["kind", "fallbackRoute"])));
}

export function isRoutingSelectorScopeV1(value: unknown): value is RoutingSelectorScopeV1 {
  return isRecord(value) && ((value.kind === "global" && hasOnlyKeys(value, ["kind"]))
    || (value.kind === "action_type" && isActionType(value.actionType) && hasOnlyKeys(value, ["kind", "actionType"]))
    || (value.kind === "action" && isActionId(value.actionId) && hasOnlyKeys(value, ["kind", "actionId"])));
}

export function isRoutingPolicySelectorV1(value: unknown): value is RoutingPolicySelectorV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isRoutingSelectorScopeV1(value.scope)
    && isRouteSelectorV1(value.selector) && isFailurePolicyV1(value.failurePolicy)
    && hasOnlyKeys(value, ["schemaVersion", "scope", "selector", "failurePolicy"]);
}

export function isRoutingPolicyMutationV1(value: unknown): value is RoutingPolicyMutationV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isBoundedString(value.registryVersion, 256)
    && (value.expectedRevisionId === null || isBoundedString(value.expectedRevisionId, 256))
    && (value.reason === "bootstrap" || value.reason === "operator_mutation") && isCanonicalIsoTimestamp(value.occurredAt)
    && isNullableBoundedString(value.actor, 512) && isNullableBoundedString(value.correlationId, 512)
    && Array.isArray(value.selectors) && value.selectors.every(isRoutingPolicySelectorV1)
    && hasOnlyKeys(value, ["schemaVersion", "registryVersion", "expectedRevisionId", "reason", "occurredAt", "actor", "correlationId", "selectors"]);
}

export function isRoutingDependencyV1(value: unknown): value is RoutingDependencyV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isBoundedString(value.revisionId, 256)
    && isRouteIdentityV1({ connectionId: value.connectionId, modelId: value.modelId }) && isRoutingSelectorScopeV1(value.selectorScope)
    && hasOnlyKeys(value, ["schemaVersion", "revisionId", "connectionId", "modelId", "selectorScope"]);
}

export function isRoutingAttentionV1(value: unknown): value is RoutingAttentionV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isBoundedString(value.attentionId, 512)
    && isBoundedString(value.connectionId, 512) && isBoundedString(value.modelId, 512) && isBoundedString(value.reasonCode, 256)
    && isBoundedString(value.revisionId, 256) && isCanonicalIsoTimestamp(value.occurredAt)
    && (value.acknowledgedAt === null || isCanonicalIsoTimestamp(value.acknowledgedAt))
    && hasOnlyKeys(value, ["schemaVersion", "attentionId", "connectionId", "modelId", "reasonCode", "revisionId", "occurredAt", "acknowledgedAt"]);
}

export function isRoutingPolicyRevisionV1(value: unknown): value is RoutingPolicyRevisionV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isBoundedString(value.revisionId, 256)
    && isBoundedString(value.registryVersion, 256) && isRevisionReason(value.reason) && isCanonicalIsoTimestamp(value.createdAt)
    && isNullableBoundedString(value.actor, 512) && isNullableBoundedString(value.correlationId, 512)
    && Array.isArray(value.selectors) && value.selectors.every(isRoutingPolicySelectorV1)
    && hasOnlyKeys(value, ["schemaVersion", "revisionId", "registryVersion", "reason", "createdAt", "actor", "correlationId", "selectors"]);
}

export function isRoutingPolicyValidationContextV1(value: unknown): value is RoutingPolicyValidationContextV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isAgentRegistryCollectionV1(value.registry)
    && Array.isArray(value.routes) && value.routes.every(isRoutingCatalogRouteFactV1)
    && hasUniqueKeys(value.routes, (route) => routeIdentityKey(route.route))
    && hasOnlyKeys(value, ["schemaVersion", "registry", "routes"]);
}

export function isRoutingCatalogRouteFactV1(value: unknown): value is RoutingCatalogRouteFactV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isRouteIdentityV1(value.route)
    && typeof value.connectionActive === "boolean" && typeof value.available === "boolean"
    && isNullableNonNegativeInteger(value.contextWindowTokens) && isNullableBoolean(value.tools)
    && isNullableBoolean(value.api) && isNullableBoolean(value.reasoning)
    && hasOnlyKeys(value, ["schemaVersion", "route", "connectionActive", "available", "contextWindowTokens", "tools", "api", "reasoning"]);
}

export function isResolvedRouteV1(value: unknown): value is ResolvedRouteV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isAgentRegistryEntryV1(value.action)
    && isRouteIdentityV1(value.route) && (value.policySource === "global" || value.policySource === "action_type" || value.policySource === "action")
    && isBoundedString(value.revisionId, 256) && hasOnlyKeys(value, ["schemaVersion", "action", "route", "policySource", "revisionId"]);
}

export function isHandoffPlanV1(value: unknown): value is HandoffPlanV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isResolvedRouteV1(value.resolvedRoute)
    && Array.isArray(value.steps) && value.steps.length >= 1 && value.steps.length <= 2
    && value.steps.every(isHandoffPlanStepV1) && value.steps[0]?.kind === "primary"
    && sameRoute(value.steps[0]?.route, value.resolvedRoute.route)
    && (value.steps.length === 1 || (value.steps[1]?.kind === "recovery"
      && !sameRoute(value.steps[1]?.route, value.steps[0]?.route)
      && value.resolvedRoute.policySource !== "global"))
    && hasOnlyKeys(value, ["schemaVersion", "resolvedRoute", "steps"]);
}

export function routeIdentityKey(route: RouteIdentityV1): string { return `${route.connectionId}\u0000${route.modelId}`; }
export function selectorScopeKey(scope: RoutingSelectorScopeV1): string {
  return scope.kind === "global" ? "global" : scope.kind === "action" ? `action:${scope.actionId}` : `action_type:${scope.actionType}`;
}

function isHandoffPlanStepV1(value: unknown): value is HandoffPlanStepV1 {
  return isRecord(value) && (value.kind === "primary" || value.kind === "recovery") && isRouteIdentityV1(value.route)
    && hasOnlyKeys(value, ["kind", "route"]);
}
function sameRoute(left: unknown, right: unknown): boolean {
  return isRouteIdentityV1(left) && isRouteIdentityV1(right)
    && left.connectionId === right.connectionId && left.modelId === right.modelId;
}
function isActionType(value: unknown): value is AgentActionType { return typeof value === "string" && actionTypes.includes(value as AgentActionType); }
function isRoleId(value: unknown): value is AgentRoleId { return typeof value === "string" && roleIds.includes(value as AgentRoleId); }
function isRevisionReason(value: unknown): value is RoutingPolicyRevisionReasonV1 { return typeof value === "string" && reasons.includes(value as RoutingPolicyRevisionReasonV1); }
function isActionId(value: unknown): value is string { return isBoundedString(value, 128) && /^[a-z][a-z0-9-]*$/.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isBoundedString(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value; }
function isNullableBoundedString(value: unknown, max: number): boolean { return value === null || isBoundedString(value, max); }
function isPositiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000_000; }
function isNullableNonNegativeInteger(value: unknown): boolean { return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000_000); }
function isNullableBoolean(value: unknown): boolean { return value === null || typeof value === "boolean"; }
function isCanonicalIsoTimestamp(value: unknown): value is string { if (typeof value !== "string") return false; const parsed = new Date(value); return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value; }
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function hasUniqueKeys<T>(values: readonly T[], key: (value: T) => string): boolean { const keys = values.map(key); return new Set(keys).size === keys.length; }
