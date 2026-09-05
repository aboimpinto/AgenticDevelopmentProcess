import {
  AGENT_ROUTING_SCHEMA_VERSION,
  isRouteIdentityV1,
  routeIdentityKey,
  type AgentRegistryEntryV1,
  type HandoffPlanV1,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
  type RoutingPolicyErrorCode,
  type RoutingPolicyRevisionV1,
} from "@hepha/shared";
import type { AgentRoutingStore } from "@hepha/db";
import { AgentRegistry } from "./agent-registry.js";

export type RoutingResolutionErrorCode = RoutingPolicyErrorCode
  | "ROUTING_UNKNOWN_ACTION"
  | "ROUTING_BOOTSTRAP_REQUIRED"
  | "ROUTING_GLOBAL_UNAVAILABLE";

export type RoutingResolutionResult =
  | { readonly ok: true; readonly plan: HandoffPlanV1 }
  | { readonly ok: false; readonly code: RoutingResolutionErrorCode; readonly message: string };

export interface RoutingResolutionInput {
  readonly actionId: string;
  readonly bootstrap: { readonly route: RouteIdentityV1; readonly occurredAt: string; readonly actor: string | null; readonly correlationId: string | null } | null;
}

/** Resolves one registered action into a validated, non-executing V1 dispatch plan. */
export class RoutingResolver {
  constructor(private readonly dependencies: {
    catalogFacts(): readonly RoutingCatalogRouteFactV1[];
    readonly registry: AgentRegistry;
    readonly store: AgentRoutingStore;
  }) {}

  resolve(input: unknown): RoutingResolutionResult {
    if (!isResolutionInput(input)) return rejection("ROUTING_INVALID_REQUEST");
    const action = this.dependencies.registry.get(input.actionId);
    if (!action) return rejection("ROUTING_UNKNOWN_ACTION");
    const facts = this.dependencies.catalogFacts();
    if (!Array.isArray(facts) || !facts.every(isCatalogFact) || new Set(facts.map((fact) => routeIdentityKey(fact.route))).size !== facts.length) {
      return rejection("ROUTING_INVALID_REQUEST");
    }

    let policy: RoutingPolicyRevisionV1 | null;
    try { policy = this.dependencies.store.getCurrentPolicy(); } catch { return rejection("ROUTING_INVALID_POLICY"); }
    if (!policy) {
      if (!input.bootstrap) return rejection("ROUTING_BOOTSTRAP_REQUIRED");
      const bootstrapValidation = validateRoute(input.bootstrap.route, action, facts, false);
      if (bootstrapValidation) return bootstrapValidation;
      const result = this.dependencies.store.applyMutation({
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registryVersion: this.dependencies.registry.version,
        expectedRevisionId: null,
        reason: "bootstrap",
        occurredAt: input.bootstrap.occurredAt,
        actor: input.bootstrap.actor,
        correlationId: input.bootstrap.correlationId,
        selectors: [{
          schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
          scope: { kind: "global" },
          selector: { kind: "route", route: input.bootstrap.route },
          failurePolicy: { kind: "fail_immediately" },
        }],
      }, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registry: this.dependencies.registry.list(), routes: facts });
      if (!result.ok) {
        if (result.code !== "ROUTING_POLICY_CONFLICT") return rejection(result.code);
        try { policy = this.dependencies.store.getCurrentPolicy(); } catch { return rejection("ROUTING_INVALID_POLICY"); }
        if (!policy) return rejection("ROUTING_POLICY_CONFLICT");
      } else {
        policy = result.revision;
      }
    }
    if (policy.registryVersion !== this.dependencies.registry.version) return rejection("ROUTING_INVALID_POLICY");
    return resolvePolicy(policy, action, facts);
  }
}

function resolvePolicy(policy: RoutingPolicyRevisionV1, action: AgentRegistryEntryV1, facts: readonly RoutingCatalogRouteFactV1[]): RoutingResolutionResult {
  const global = policy.selectors.find((selector) => selector.scope.kind === "global");
  if (!global || global.selector.kind !== "route") return rejection("ROUTING_INVALID_POLICY");
  const actionSelector = policy.selectors.find((selector) => selector.scope.kind === "action" && selector.scope.actionId === action.actionId);
  const typeSelector = policy.selectors.find((selector) => selector.scope.kind === "action_type" && selector.scope.actionType === action.actionType);
  const selected = actionSelector?.selector.kind === "route" ? { selector: actionSelector, source: "action" as const }
    : typeSelector?.selector.kind === "route" ? { selector: typeSelector, source: "action_type" as const }
      : { selector: global, source: "global" as const };
  const primary = selected.selector.selector.kind === "route" ? selected.selector.selector.route : null;
  if (!primary) return rejection("ROUTING_INVALID_POLICY");
  const primaryValidation = validateRoute(primary, action, facts, selected.source === "global");
  if (primaryValidation) return primaryValidation;

  const steps: Array<{ readonly kind: "primary" | "recovery"; readonly route: RouteIdentityV1 }> = [{ kind: "primary", route: primary }];
  if (selected.source !== "global") {
    if (selected.selector.failurePolicy.kind === "reroute_global_once") {
      const validation = validateRoute(global.selector.route, action, facts, true);
      if (validation) return validation;
      if (routeIdentityKey(primary) === routeIdentityKey(global.selector.route)) return rejection("ROUTING_INVALID_HANDOFF_CHAIN");
      steps.push({ kind: "recovery", route: global.selector.route });
    } else if (selected.selector.failurePolicy.kind === "reroute_route_once") {
      const fallback = selected.selector.failurePolicy.fallbackRoute;
      if (routeIdentityKey(primary) === routeIdentityKey(fallback)) return rejection("ROUTING_INVALID_HANDOFF_CHAIN");
      const validation = validateRoute(fallback, action, facts, false);
      if (validation) return validation;
      steps.push({ kind: "recovery", route: fallback });
    }
  }
  return {
    ok: true,
    plan: {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      resolvedRoute: { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, action, route: primary, policySource: selected.source, revisionId: policy.revisionId },
      steps,
    },
  };
}

function validateRoute(route: RouteIdentityV1, action: AgentRegistryEntryV1, facts: readonly RoutingCatalogRouteFactV1[], global: boolean): RoutingResolutionResult | null {
  const fact = facts.find((candidate) => routeIdentityKey(candidate.route) === routeIdentityKey(route));
  if (!fact || !fact.connectionActive || !fact.available) return rejection(global ? "ROUTING_GLOBAL_UNAVAILABLE" : "ROUTING_ROUTE_UNAVAILABLE");
  const requirements = action.capabilityRequirements;
  if ((fact.contextWindowTokens ?? -1) < requirements.minimumContextWindowTokens
    || (requirements.requiresTools && fact.tools !== true)
    || (requirements.requiresApi && fact.api !== true)
    || (requirements.requiresReasoning && fact.reasoning !== true)) return rejection("ROUTING_CAPABILITY_MISMATCH");
  return null;
}

function isResolutionInput(value: unknown): value is RoutingResolutionInput {
  if (!isRecord(value) || !isActionId(value.actionId) || !Object.keys(value).every((key) => key === "actionId" || key === "bootstrap")) return false;
  if (value.bootstrap === null) return true;
  return isRecord(value.bootstrap) && isRouteIdentityV1(value.bootstrap.route) && isIso(value.bootstrap.occurredAt)
    && isNullableText(value.bootstrap.actor) && isNullableText(value.bootstrap.correlationId)
    && Object.keys(value.bootstrap).length === 4;
}
function isCatalogFact(value: unknown): value is RoutingCatalogRouteFactV1 {
  return isRecord(value) && value.schemaVersion === AGENT_ROUTING_SCHEMA_VERSION && isRouteIdentityV1(value.route)
    && typeof value.connectionActive === "boolean" && typeof value.available === "boolean"
    && nullableNatural(value.contextWindowTokens) && nullableBoolean(value.tools) && nullableBoolean(value.api) && nullableBoolean(value.reasoning)
    && Object.keys(value).length === 8;
}
function rejection(code: RoutingResolutionErrorCode): Extract<RoutingResolutionResult, { ok: false }> {
  const messages: Record<RoutingResolutionErrorCode, string> = {
    ROUTING_INVALID_REQUEST: "Routing request is invalid.", ROUTING_UNKNOWN_ACTION: "The requested routing action is not registered.",
    ROUTING_BOOTSTRAP_REQUIRED: "Global Default is unset and no valid bootstrap route is available.", ROUTING_GLOBAL_UNAVAILABLE: "Global Default route is unavailable and must be replaced.",
    ROUTING_ROUTE_UNAVAILABLE: "The selected connection/model route is unavailable.", ROUTING_CAPABILITY_MISMATCH: "The selected route does not meet this action's capability requirements.",
    ROUTING_INVALID_POLICY: "Routing policy is invalid.", ROUTING_INVALID_HANDOFF_CHAIN: "Routing fallback policy must be one distinct available hop.",
    ROUTING_POLICY_CONFLICT: "Routing policy changed; refresh and retry the requested update.", ROUTING_UNKNOWN_SCOPE: "The requested routing scope is not registered.",
    ROUTING_GLOBAL_DELETE_BLOCKED: "A replacement Global Default is required before deleting this connection.",
  };
  return { ok: false, code, message: messages[code] };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isActionId(value: unknown): value is string { return typeof value === "string" && /^[a-z][a-z0-9-]*$/.test(value); }
function isIso(value: unknown): boolean { return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString() === value; }
function isNullableText(value: unknown): boolean { return value === null || (typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value); }
function nullableNatural(value: unknown): boolean { return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000_000); }
function nullableBoolean(value: unknown): boolean { return value === null || typeof value === "boolean"; }
