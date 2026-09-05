import type { ActiveCatalogConnectionState, CatalogGuidanceCode, CatalogScanState } from "./catalog-reconciliation.js";
import type { ProviderConnectionId, ProviderConnectionKind } from "./provider-connections.js";
import {
  isAgentCapabilityRequirementsV1,
  isAgentRegistryCollectionV1,
  isFailurePolicyV1,
  isRouteIdentityV1,
  isRoutingCatalogRouteFactV1,
  isRoutingSelectorScopeV1,
  routeIdentityKey,
  selectorScopeKey,
  type AgentActionId,
  type AgentActionType,
  type AgentCapabilityRequirementsV1,
  type AgentRoleId,
  type FailurePolicyV1,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
  type RoutingPolicySourceV1,
  type RoutingSelectorScopeV1,
} from "./agent-routing.js";

/** Closed transport contract for the registry-projected routing editor. */
export const ROUTING_MATRIX_SCHEMA_VERSION = "agent-routing-matrix/v1" as const;
export const ROUTING_MATRIX_POLICY_ID = "installation-global" as const;
export type RoutingMatrixSchemaVersion = typeof ROUTING_MATRIX_SCHEMA_VERSION;
export type RoutingMatrixStateV1 = "ready" | "empty_choices" | "global_unavailable";
export type RoutingMatrixReasonCodeV1 =
  | "connection_inactive" | "route_unavailable"
  | "context_window_unknown" | "context_window_too_small"
  | "tools_unknown" | "tools_required" | "api_unknown" | "api_required"
  | "reasoning_unknown" | "reasoning_required" | "same_as_primary" | "fallback_cycle";

export interface RoutingMatrixReasonV1 {
  readonly code: RoutingMatrixReasonCodeV1;
  readonly message: string;
}
export interface RoutingMatrixRouteV1 {
  readonly route: RouteIdentityV1;
  readonly connectionLabel: string;
  readonly modelDisplayLabel: string | null;
  readonly availability: "available" | "unavailable";
  readonly eligible: boolean;
  readonly reasons: readonly RoutingMatrixReasonV1[];
}
export type RoutingMatrixConfiguredV1 = { readonly kind: "inherit" } | { readonly kind: "route"; readonly route: RouteIdentityV1 };
export interface RoutingMatrixEligibilityV1 { readonly eligible: boolean; readonly reasons: readonly RoutingMatrixReasonV1[]; }

interface RoutingMatrixRowBaseV1 {
  readonly scope: RoutingSelectorScopeV1;
  readonly scopeKey: string;
  readonly label: string;
  readonly displayOrder: number;
  readonly configured: RoutingMatrixConfiguredV1;
  readonly configuredFailurePolicy: FailurePolicyV1 | null;
  readonly effectiveRoute: RoutingMatrixRouteV1;
  readonly effectiveFailurePolicy: FailurePolicyV1;
  readonly policySource: RoutingPolicySourceV1;
  readonly requirements: AgentCapabilityRequirementsV1;
  readonly eligibility: RoutingMatrixEligibilityV1;
  readonly routeChoices: readonly RoutingMatrixRouteV1[];
}
export interface RoutingMatrixGlobalRowV1 extends RoutingMatrixRowBaseV1 { readonly kind: "global"; }
export interface RoutingMatrixActionTypeRowV1 extends RoutingMatrixRowBaseV1 { readonly kind: "action_type"; }
export interface RoutingMatrixActionRowV1 extends RoutingMatrixRowBaseV1 {
  readonly kind: "action";
  readonly roleId: AgentRoleId;
  readonly promptVersion: string;
}
export type RoutingMatrixRowV1 = RoutingMatrixGlobalRowV1 | RoutingMatrixActionTypeRowV1 | RoutingMatrixActionRowV1;
export interface RoutingMatrixActionTypeGroupV1 {
  readonly actionType: AgentActionType;
  readonly label: string;
  readonly displayOrder: number;
  readonly typeDefault: RoutingMatrixActionTypeRowV1;
  readonly actions: readonly RoutingMatrixActionRowV1[];
}
export interface RoutingMatrixPolicyIdentityV1 {
  readonly policyId: typeof ROUTING_MATRIX_POLICY_ID;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly registryVersion: string;
  readonly revisionGuard: string;
}
export interface RoutingMatrixConnectionStateV1 {
  readonly connectionId: ProviderConnectionId;
  readonly label: string;
  readonly providerKind: ProviderConnectionKind;
  readonly scanState: CatalogScanState;
  readonly guidanceCode: CatalogGuidanceCode;
  readonly claimedAt: string | null;
  readonly settledAt: string | null;
  readonly diagnosticOccurredAt: string | null;
  readonly safeMessage: string | null;
}
export interface RoutingMatrixAttentionV1 {
  readonly attentionId: string;
  readonly attentionRevisionId: string;
  readonly affectedRoute: RouteIdentityV1;
  readonly reasonCode: string;
  readonly occurredAt: string;
  readonly acknowledgedAt: string | null;
}
export interface RoutingMatrixSnapshotV1 {
  readonly schemaVersion: RoutingMatrixSchemaVersion;
  readonly policy: RoutingMatrixPolicyIdentityV1;
  readonly state: RoutingMatrixStateV1;
  readonly global: RoutingMatrixGlobalRowV1;
  readonly groups: readonly RoutingMatrixActionTypeGroupV1[];
  readonly connectionStates: readonly RoutingMatrixConnectionStateV1[];
  readonly attention: readonly RoutingMatrixAttentionV1[];
}

export type RoutingMatrixRowSelectionV1 =
  | { readonly kind: "inherit" }
  | { readonly kind: "route"; readonly route: RouteIdentityV1; readonly failurePolicy: FailurePolicyV1 };
export interface RoutingMatrixExpectedRevisionV1 { readonly revisionId: string; readonly revisionNumber: number; }
export interface RoutingMatrixRowDraftV1 {
  readonly schemaVersion: RoutingMatrixSchemaVersion;
  readonly policyId: typeof ROUTING_MATRIX_POLICY_ID;
  readonly scope: RoutingSelectorScopeV1;
  readonly selection: RoutingMatrixRowSelectionV1;
  readonly expectedRevision: RoutingMatrixExpectedRevisionV1;
  readonly revisionGuard: string;
}
export interface RoutingMatrixMutationContextV1 {
  readonly schemaVersion: RoutingMatrixSchemaVersion;
  readonly registryVersion: string;
  readonly registry: readonly import("./agent-routing.js").AgentRegistryEntryV1[];
  readonly routes: readonly RoutingCatalogRouteFactV1[];
  readonly occurredAt: string;
  readonly actor: string | null;
  readonly correlationId: string | null;
}
export interface RoutingMatrixPreviewV1 {
  readonly schemaVersion: RoutingMatrixSchemaVersion;
  readonly policyId: typeof ROUTING_MATRIX_POLICY_ID;
  readonly expectedRevision: RoutingMatrixExpectedRevisionV1;
  readonly revisionGuard: string;
  readonly scope: RoutingSelectorScopeV1;
  readonly scopeKey: string;
  readonly projectedRow: RoutingMatrixRowV1;
  readonly allowedFallbackRoutes: readonly RoutingMatrixRouteV1[];
}
export interface RoutingMatrixAttentionAcknowledgeV1 {
  readonly schemaVersion: RoutingMatrixSchemaVersion;
  readonly policyId: typeof ROUTING_MATRIX_POLICY_ID;
  readonly attentionIdentity: {
    readonly attentionId: string;
    readonly attentionRevisionId: string;
    readonly affectedRoute: RouteIdentityV1;
  };
  readonly expectedRevision: RoutingMatrixExpectedRevisionV1;
  readonly revisionGuard: string;
  readonly acknowledgedAt: string;
}

const reasonMessages: Readonly<Record<RoutingMatrixReasonCodeV1, string>> = {
  connection_inactive: "The provider connection is inactive.",
  route_unavailable: "The connection/model route is unavailable.",
  context_window_unknown: "The model context window is unknown.",
  context_window_too_small: "The model context window is too small.",
  tools_unknown: "Tool support is unknown.", tools_required: "Tool support is required.",
  api_unknown: "API support is unknown.", api_required: "API support is required.",
  reasoning_unknown: "Reasoning support is unknown.", reasoning_required: "Reasoning support is required.",
  same_as_primary: "The fallback route must differ from the primary route.",
  fallback_cycle: "The fallback route would create a cycle.",
};
const reasonOrder = Object.keys(reasonMessages) as RoutingMatrixReasonCodeV1[];
const scanGuidance: Readonly<Record<CatalogScanState, CatalogGuidanceCode>> = {
  never_scanned: "scan_not_started", scanning: "scan_in_progress", available: "models_available",
  empty: "no_models_returned", failed: "scan_failed",
};
const providerKinds: readonly ProviderConnectionKind[] = ["custom", "known", "pi_session"];

export function routingMatrixReason(code: RoutingMatrixReasonCodeV1): RoutingMatrixReasonV1 {
  return { code, message: reasonMessages[code] };
}
export function isRoutingMatrixReasonV1(value: unknown): value is RoutingMatrixReasonV1 {
  return exact(value, ["code", "message"]) && isReasonCode(value.code) && value.message === reasonMessages[value.code];
}
export function isRoutingMatrixRouteV1(value: unknown): value is RoutingMatrixRouteV1 {
  if (!exact(value, ["route", "connectionLabel", "modelDisplayLabel", "availability", "eligible", "reasons"])
    || !isRouteIdentityV1(value.route) || !text(value.connectionLabel, 10_000) || !nullableText(value.modelDisplayLabel, 10_000)
    || (value.availability !== "available" && value.availability !== "unavailable") || typeof value.eligible !== "boolean"
    || !reasonList(value.reasons)) return false;
  const hasAvailabilityRefusal = value.reasons.some((reason) => isAvailabilityRefusal(reason.code));
  if (value.availability === "unavailable") {
    return !value.eligible && value.reasons.length > 0 && hasAvailabilityRefusal;
  }
  return value.eligible
    ? value.reasons.length === 0
    : value.reasons.length > 0 && !hasAvailabilityRefusal;
}
export function isRoutingMatrixEligibilityV1(value: unknown): value is RoutingMatrixEligibilityV1 {
  return exact(value, ["eligible", "reasons"]) && typeof value.eligible === "boolean" && reasonList(value.reasons)
    && value.eligible === (value.reasons.length === 0);
}
export function isRoutingMatrixGlobalRowV1(value: unknown): value is RoutingMatrixGlobalRowV1 {
  return isRowBase(value, "global", ["kind", ...rowBaseKeys]) && value.scope.kind === "global" && value.scopeKey === "global"
    && value.label === "Global Default" && value.displayOrder === 0 && value.configured.kind === "route"
    && value.configuredFailurePolicy?.kind === "fail_immediately" && value.effectiveFailurePolicy.kind === "fail_immediately"
    && value.policySource === "global" && explicitRowMatchesConfigured(value);
}
export function isRoutingMatrixActionTypeRowV1(value: unknown): value is RoutingMatrixActionTypeRowV1 {
  if (!isRowBase(value, "action_type", ["kind", ...rowBaseKeys]) || value.scope.kind !== "action_type"
    || !positive(value.displayOrder)) return false;
  if (value.configured.kind === "route") {
    return value.policySource === "action_type" && explicitRowMatchesConfigured(value);
  }
  return value.policySource === "global" && value.effectiveFailurePolicy.kind === "fail_immediately";
}
export function isRoutingMatrixActionRowV1(value: unknown): value is RoutingMatrixActionRowV1 {
  if (!isRowBase(value, "action", ["kind", ...rowBaseKeys, "roleId", "promptVersion"])
    || value.scope.kind !== "action" || !positive(value.displayOrder) || !isRoleId(value.roleId) || !text(value.promptVersion, 256)) return false;
  if (value.configured.kind === "route") {
    return value.policySource === "action" && explicitRowMatchesConfigured(value);
  }
  return value.policySource === "action_type"
    || value.policySource === "global" && value.effectiveFailurePolicy.kind === "fail_immediately";
}
export function isRoutingMatrixRowV1(value: unknown): value is RoutingMatrixRowV1 {
  return isRoutingMatrixGlobalRowV1(value) || isRoutingMatrixActionTypeRowV1(value) || isRoutingMatrixActionRowV1(value);
}
export function isRoutingMatrixActionTypeGroupV1(value: unknown): value is RoutingMatrixActionTypeGroupV1 {
  if (!exact(value, ["actionType", "label", "displayOrder", "typeDefault", "actions"])
    || !isActionType(value.actionType) || !text(value.label, 256) || !positive(value.displayOrder)
    || !isRoutingMatrixActionTypeRowV1(value.typeDefault) || value.typeDefault.scope.kind !== "action_type"
    || value.typeDefault.scope.actionType !== value.actionType || value.typeDefault.label !== value.label
    || value.typeDefault.displayOrder !== value.displayOrder
    || !Array.isArray(value.actions) || value.actions.length === 0 || !value.actions.every(isRoutingMatrixActionRowV1)) return false;
  return value.actions.every((action) => action.scope.kind === "action" && action.displayOrder > 0)
    && strictlyIncreasing(value.actions.map((action) => action.displayOrder))
    && unique(value.actions.map((action) => action.scopeKey));
}
export function isRoutingMatrixPolicyIdentityV1(value: unknown): value is RoutingMatrixPolicyIdentityV1 {
  return exact(value, ["policyId", "revisionId", "revisionNumber", "registryVersion", "revisionGuard"])
    && value.policyId === ROUTING_MATRIX_POLICY_ID && text(value.revisionId, 256) && positive(value.revisionNumber)
    && text(value.registryVersion, 256) && text(value.revisionGuard, 512);
}
export function isRoutingMatrixConnectionStateV1(value: unknown): value is RoutingMatrixConnectionStateV1 {
  if (!exact(value, ["connectionId", "label", "providerKind", "scanState", "guidanceCode", "claimedAt", "settledAt", "diagnosticOccurredAt", "safeMessage"])
    || !text(value.connectionId, 10_000) || !text(value.label, 10_000) || !providerKinds.includes(value.providerKind as ProviderConnectionKind)
    || !isScanState(value.scanState) || value.guidanceCode !== scanGuidance[value.scanState]
    || !nullableIso(value.claimedAt) || !nullableIso(value.settledAt) || !nullableIso(value.diagnosticOccurredAt)
    || !nullableText(value.safeMessage, 10_000)) return false;
  if (value.scanState === "never_scanned") return value.claimedAt === null && value.settledAt === null && value.diagnosticOccurredAt === null && value.safeMessage === null;
  if (value.claimedAt === null) return false;
  if (value.scanState === "scanning") return value.settledAt === null && value.safeMessage === null;
  return value.settledAt !== null && value.safeMessage !== null && Date.parse(value.settledAt) >= Date.parse(value.claimedAt);
}
export function isRoutingMatrixAttentionV1(value: unknown): value is RoutingMatrixAttentionV1 {
  return exact(value, ["attentionId", "attentionRevisionId", "affectedRoute", "reasonCode", "occurredAt", "acknowledgedAt"])
    && text(value.attentionId, 512) && text(value.attentionRevisionId, 256) && isRouteIdentityV1(value.affectedRoute)
    && text(value.reasonCode, 256) && iso(value.occurredAt) && nullableIso(value.acknowledgedAt)
    && (value.acknowledgedAt === null || Date.parse(value.acknowledgedAt) >= Date.parse(value.occurredAt));
}
export function isRoutingMatrixSnapshotV1(value: unknown): value is RoutingMatrixSnapshotV1 {
  if (!exact(value, ["schemaVersion", "policy", "state", "global", "groups", "connectionStates", "attention"])
    || value.schemaVersion !== ROUTING_MATRIX_SCHEMA_VERSION || !isRoutingMatrixPolicyIdentityV1(value.policy)
    || !isState(value.state) || !isRoutingMatrixGlobalRowV1(value.global)
    || !Array.isArray(value.groups) || value.groups.length === 0 || !value.groups.every(isRoutingMatrixActionTypeGroupV1)
    || !Array.isArray(value.connectionStates) || !value.connectionStates.every(isRoutingMatrixConnectionStateV1)
    || !Array.isArray(value.attention) || !value.attention.every(isRoutingMatrixAttentionV1)) return false;
  const groupOrders = value.groups.map((group) => group.displayOrder);
  const actionKeys = value.groups.flatMap((group) => group.actions.map((action) => action.scopeKey));
  const routeRows = [value.global, ...value.groups.flatMap((group) => [group.typeDefault, ...group.actions])];
  if (!strictlyIncreasing(groupOrders) || !unique(value.groups.map((group) => group.actionType)) || !unique(actionKeys)
    || !unique(value.connectionStates.map((connection) => connection.connectionId)) || !unique(value.attention.map((item) => item.attentionId))) return false;
  const expectedState: RoutingMatrixStateV1 = value.global.effectiveRoute.availability === "unavailable" ? "global_unavailable"
    : routeRows.every((row) => row.routeChoices.every((route) => !route.eligible)) ? "empty_choices" : "ready";
  return value.state === expectedState;
}
export function isRoutingMatrixMutationContextV1(value: unknown): value is RoutingMatrixMutationContextV1 {
  return exact(value, ["schemaVersion", "registryVersion", "registry", "routes", "occurredAt", "actor", "correlationId"])
    && value.schemaVersion === ROUTING_MATRIX_SCHEMA_VERSION && text(value.registryVersion, 256)
    && isAgentRegistryCollectionV1(value.registry)
    && Array.isArray(value.routes) && value.routes.every(isRoutingCatalogRouteFactV1)
    && unique(value.routes.map((route) => routeIdentityKey(route.route))) && iso(value.occurredAt)
    && nullableText(value.actor, 512) && nullableText(value.correlationId, 512);
}
export function isRoutingMatrixRowDraftV1(value: unknown): value is RoutingMatrixRowDraftV1 {
  if (!exact(value, ["schemaVersion", "policyId", "scope", "selection", "expectedRevision", "revisionGuard"])
    || value.schemaVersion !== ROUTING_MATRIX_SCHEMA_VERSION || value.policyId !== ROUTING_MATRIX_POLICY_ID
    || !isRoutingSelectorScopeV1(value.scope) || !isRowSelection(value.selection)
    || !isExpectedRevision(value.expectedRevision) || !text(value.revisionGuard, 512)) return false;
  if (value.scope.kind === "global") return value.selection.kind === "route" && value.selection.failurePolicy.kind === "fail_immediately";
  return true;
}
export function isRoutingMatrixPreviewV1(value: unknown): value is RoutingMatrixPreviewV1 {
  if (!exact(value, ["schemaVersion", "policyId", "expectedRevision", "revisionGuard", "scope", "scopeKey", "projectedRow", "allowedFallbackRoutes"])
    || value.schemaVersion !== ROUTING_MATRIX_SCHEMA_VERSION || value.policyId !== ROUTING_MATRIX_POLICY_ID
    || !isExpectedRevision(value.expectedRevision) || !text(value.revisionGuard, 512) || !isRoutingSelectorScopeV1(value.scope)
    || value.scopeKey !== selectorScopeKey(value.scope) || !isRoutingMatrixRowV1(value.projectedRow)
    || value.projectedRow.scopeKey !== value.scopeKey || !Array.isArray(value.allowedFallbackRoutes)
    || !value.allowedFallbackRoutes.every(isRoutingMatrixRouteV1)
    || !unique(value.allowedFallbackRoutes.map((route) => routeIdentityKey(route.route)))) return false;
  const primary = value.projectedRow.configured.kind === "route" ? value.projectedRow.configured.route : null;
  return value.allowedFallbackRoutes.every((fallback) => {
    const sameAsPrimary = fallback.reasons.some((reason) => reason.code === "same_as_primary");
    if (primary === null) return !sameAsPrimary;
    const identitiesMatch = routeIdentityEquals(primary, fallback.route);
    return identitiesMatch ? !fallback.eligible && sameAsPrimary : !sameAsPrimary;
  });
}
export function isRoutingMatrixAttentionAcknowledgeV1(value: unknown): value is RoutingMatrixAttentionAcknowledgeV1 {
  return exact(value, ["schemaVersion", "policyId", "attentionIdentity", "expectedRevision", "revisionGuard", "acknowledgedAt"])
    && value.schemaVersion === ROUTING_MATRIX_SCHEMA_VERSION && value.policyId === ROUTING_MATRIX_POLICY_ID
    && exact(value.attentionIdentity, ["attentionId", "attentionRevisionId", "affectedRoute"])
    && text(value.attentionIdentity.attentionId, 512) && text(value.attentionIdentity.attentionRevisionId, 256)
    && isRouteIdentityV1(value.attentionIdentity.affectedRoute) && isExpectedRevision(value.expectedRevision)
    && text(value.revisionGuard, 512) && iso(value.acknowledgedAt);
}

const rowBaseKeys = ["scope", "scopeKey", "label", "displayOrder", "configured", "configuredFailurePolicy", "effectiveRoute", "effectiveFailurePolicy", "policySource", "requirements", "eligibility", "routeChoices"] as const;
function isRowBase(value: unknown, kind: RoutingMatrixRowV1["kind"], keys: readonly string[]): value is Record<string, any> {
  if (!exact(value, keys) || value.kind !== kind || !isRoutingSelectorScopeV1(value.scope)
    || value.scope.kind !== kind || value.scopeKey !== selectorScopeKey(value.scope) || !text(value.label, 256)
    || !nonNegative(value.displayOrder) || !isConfigured(value.configured)
    || !(value.configuredFailurePolicy === null || isFailurePolicyV1(value.configuredFailurePolicy))
    || !isRoutingMatrixRouteV1(value.effectiveRoute) || !isFailurePolicyV1(value.effectiveFailurePolicy)
    || !isPolicySource(value.policySource) || !isAgentCapabilityRequirementsV1(value.requirements)
    || !isRoutingMatrixEligibilityV1(value.eligibility) || !Array.isArray(value.routeChoices)
    || !value.routeChoices.every(isRoutingMatrixRouteV1) || !unique(value.routeChoices.map((route: RoutingMatrixRouteV1) => routeIdentityKey(route.route)))) return false;
  if ((value.configured.kind === "inherit") !== (value.configuredFailurePolicy === null)) return false;
  if (value.configured.kind === "route" && value.configuredFailurePolicy === null) return false;
  return value.eligibility.eligible === value.effectiveRoute.eligible
    && reasonListsEqual(value.eligibility.reasons, value.effectiveRoute.reasons);
}
function explicitRowMatchesConfigured(value: Record<string, any>): boolean {
  return value.configured.kind === "route" && value.configuredFailurePolicy !== null
    && routeIdentityEquals(value.configured.route, value.effectiveRoute.route)
    && failurePoliciesEqual(value.configuredFailurePolicy, value.effectiveFailurePolicy);
}
function routeIdentityEquals(left: RouteIdentityV1, right: RouteIdentityV1): boolean {
  return left.connectionId === right.connectionId && left.modelId === right.modelId;
}
function failurePoliciesEqual(left: FailurePolicyV1, right: FailurePolicyV1): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind !== "reroute_route_once"
    || right.kind === "reroute_route_once" && routeIdentityEquals(left.fallbackRoute, right.fallbackRoute);
}
function reasonListsEqual(left: readonly RoutingMatrixReasonV1[], right: readonly RoutingMatrixReasonV1[]): boolean {
  return left.length === right.length
    && left.every((reason, index) => reason.code === right[index]?.code && reason.message === right[index]?.message);
}
function isAvailabilityRefusal(code: RoutingMatrixReasonCodeV1): boolean {
  return code === "connection_inactive" || code === "route_unavailable";
}
function isConfigured(value: unknown): value is RoutingMatrixConfiguredV1 {
  return exact(value, ["kind"]) && value.kind === "inherit"
    || exact(value, ["kind", "route"]) && value.kind === "route" && isRouteIdentityV1(value.route);
}
function isRowSelection(value: unknown): value is RoutingMatrixRowSelectionV1 {
  return exact(value, ["kind"]) && value.kind === "inherit"
    || exact(value, ["kind", "route", "failurePolicy"]) && value.kind === "route"
      && isRouteIdentityV1(value.route) && isFailurePolicyV1(value.failurePolicy);
}
function isExpectedRevision(value: unknown): value is RoutingMatrixExpectedRevisionV1 {
  return exact(value, ["revisionId", "revisionNumber"]) && text(value.revisionId, 256) && positive(value.revisionNumber);
}
function reasonList(value: unknown): value is readonly RoutingMatrixReasonV1[] {
  if (!Array.isArray(value) || !value.every(isRoutingMatrixReasonV1)) return false;
  const indexes = value.map((reason) => reasonOrder.indexOf(reason.code));
  return unique(value.map((reason) => reason.code)) && strictlyIncreasing(indexes);
}
function exact<const T extends readonly string[]>(value: unknown, keys: T): value is Record<T[number], any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function nullableText(value: unknown, maximum: number): value is string | null { return value === null || text(value, maximum); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function iso(value: unknown): value is string { if (typeof value !== "string") return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
function nullableIso(value: unknown): value is string | null { return value === null || iso(value); }
function unique(values: readonly unknown[]): boolean { return new Set(values).size === values.length; }
function strictlyIncreasing(values: readonly number[]): boolean { return values.every((value, index) => index === 0 || values[index - 1]! < value); }
function isReasonCode(value: unknown): value is RoutingMatrixReasonCodeV1 { return typeof value === "string" && Object.prototype.hasOwnProperty.call(reasonMessages, value); }
function isActionType(value: unknown): value is AgentActionType { return typeof value === "string" && ["discovery_planning", "implementation", "review", "completion", "knowledge_documentation"].includes(value); }
function isRoleId(value: unknown): value is AgentRoleId { return typeof value === "string" && ["product-architect", "requirements-agent", "ux-design-agent", "planning-agent", "implementation-agent", "code-review-agent", "completion-agent", "phase-lessons-capture-agent", "feature-lessons-writer-agent", "post-complete-lessons-curator-agent"].includes(value); }
function isPolicySource(value: unknown): value is RoutingPolicySourceV1 { return value === "global" || value === "action_type" || value === "action"; }
function isState(value: unknown): value is RoutingMatrixStateV1 { return value === "ready" || value === "empty_choices" || value === "global_unavailable"; }
function isScanState(value: unknown): value is CatalogScanState { return typeof value === "string" && Object.prototype.hasOwnProperty.call(scanGuidance, value); }

// Compile-time assertion that the matrix state remains a strict secret-safe subset.
type _ConnectionStateCompatibility = RoutingMatrixConnectionStateV1 extends Pick<ActiveCatalogConnectionState, "connectionId" | "label" | "providerKind" | "scanState" | "guidanceCode" | "claimedAt" | "settledAt" | "diagnosticOccurredAt" | "safeMessage"> ? true : never;
const _connectionStateCompatibility: _ConnectionStateCompatibility = true;
void _connectionStateCompatibility;
