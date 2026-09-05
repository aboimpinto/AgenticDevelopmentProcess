import {
  AGENT_ROUTING_SCHEMA_VERSION,
  ROUTING_MATRIX_SCHEMA_VERSION,
  isRoutingMatrixAttentionAcknowledgeV1,
  isRoutingMatrixPreviewV1,
  isRoutingMatrixRowDraftV1,
  isRoutingMatrixSnapshotV1,
  routeIdentityKey,
  routingMatrixReason,
  selectorScopeKey,
  type AgentRegistryEntryV1,
  type RouteIdentityV1,
  type RoutingAttentionV1,
  type RoutingCatalogRouteFactV1,
  type RoutingMatrixMutationContextV1,
  type RoutingMatrixPolicyIdentityV1,
  type RoutingMatrixPreviewV1,
  type RoutingMatrixReasonV1,
  type RoutingMatrixRouteV1,
  type RoutingMatrixRowDraftV1,
  type RoutingMatrixRowV1,
  type RoutingMatrixSnapshotV1,
  type RoutingPolicyErrorCode,
  type RoutingPolicyMutationV1,
  type RoutingPolicyMutationResultV1,
  type RoutingPolicyRevisionV1,
} from "@hepha/shared";
import type { AgentRoutingStore } from "@hepha/db";
import { AgentRegistry } from "./agent-registry.js";
import type { RoutingMatrixCatalogFacts } from "./routing-matrix-catalog-facts.js";
import { RoutingMatrixProjector } from "./routing-matrix-projector.js";
import { RoutingResolver, type RoutingResolutionResult } from "./routing-resolver.js";

export type RoutingMatrixServiceErrorCode = RoutingPolicyErrorCode
  | "ROUTING_BOOTSTRAP_REQUIRED" | "ROUTING_GLOBAL_UNAVAILABLE"
  | "ROUTING_ATTENTION_CONFLICT" | "ROUTING_MATRIX_READ_FAILED";
export type RoutingMatrixServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: RoutingMatrixServiceErrorCode; readonly message: string };

/** Public non-executing facade for runtime resolution and the authoritative matrix editor boundary. */
export class RoutingPolicyService {
  private readonly resolver: RoutingResolver;

  constructor(private readonly dependencies: {
    catalogFacts(): readonly RoutingCatalogRouteFactV1[];
    readonly registry: AgentRegistry;
    readonly store: AgentRoutingStore;
    matrixCatalogFacts?(): RoutingMatrixCatalogFacts;
    readonly matrixProjector?: RoutingMatrixProjector;
    now?(): string;
  }) {
    this.resolver = new RoutingResolver(dependencies);
  }

  resolve(input: unknown): RoutingResolutionResult { return this.resolver.resolve(input); }

  /** Reads only code-owned registry facts that are safe for policy presentation. */
  listRegistry() { return this.dependencies.registry.list(); }

  /** Reads the immutable current policy revision without deriving a client-side fallback. */
  getCurrentPolicy() { return this.dependencies.store.getCurrentPolicy(); }

  /** Projects current catalog availability into closed route facts for server-provided selectors. */
  listCatalogRoutes() { return this.dependencies.catalogFacts(); }

  /** Validates and persists a complete operator policy revision against current server facts. */
  mutate(input: RoutingPolicyMutationV1): RoutingPolicyMutationResultV1 {
    return this.dependencies.store.applyMutation(input, {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      registry: this.dependencies.registry.list(),
      routes: this.dependencies.catalogFacts(),
    });
  }

  listAttention() { return this.dependencies.store.listCurrentAttention(); }
  acknowledgeAttention(attentionId: string, acknowledgedAt: string): boolean { return this.dependencies.store.acknowledgeAttention(attentionId, acknowledgedAt); }
  deletionPreflight(connectionId: string) { return this.dependencies.store.deletionPreflight(connectionId); }

  getRoutingMatrix(): RoutingMatrixServiceResult<RoutingMatrixSnapshotV1> {
    return this.readMatrix();
  }

  previewRoutingMatrixRow(input: unknown): RoutingMatrixServiceResult<RoutingMatrixPreviewV1> {
    if (!isRoutingMatrixRowDraftV1(input)) return matrixRejection("ROUTING_INVALID_REQUEST");
    const authorities = this.readMatrixAuthorities("ROUTING_POLICY_CONFLICT");
    if (!authorities.ok) return authorities;
    if (authorities.value.snapshot.state === "global_unavailable" && input.scope.kind !== "global") {
      return matrixRejection("ROUTING_GLOBAL_UNAVAILABLE");
    }
    const context = this.mutationContext(authorities.value.registry, authorities.value.catalog.routes);
    const rejection = this.dependencies.store.validateRowMutation(input, context);
    if (rejection) return matrixRejection(rejection.code);

    const projectedPolicy = applyDraftToPolicy(authorities.value.policy, input);
    const projected = this.project(
      authorities.value,
      projectedPolicy,
      authorities.value.snapshot.policy,
      authorities.value.attention,
    );
    if (!projected.ok) return projected;
    const projectedRow = findRow(projected.value, input.scope);
    if (!projectedRow) return matrixRejection("ROUTING_UNKNOWN_SCOPE");
    const allowedFallbackRoutes = input.scope.kind === "global" || input.selection.kind === "inherit" ? []
      : this.classifyFallbackRoutes(projectedRow.routeChoices, { ...input, selection: input.selection }, context);
    const preview: RoutingMatrixPreviewV1 = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
      policyId: input.policyId,
      expectedRevision: input.expectedRevision,
      revisionGuard: input.revisionGuard,
      scope: input.scope,
      scopeKey: selectorScopeKey(input.scope),
      projectedRow,
      allowedFallbackRoutes,
    };
    return isRoutingMatrixPreviewV1(preview)
      ? { ok: true, value: preview }
      : matrixRejection("ROUTING_MATRIX_READ_FAILED");
  }

  saveRoutingMatrixRow(input: unknown): RoutingMatrixServiceResult<RoutingMatrixSnapshotV1> {
    if (!isRoutingMatrixRowDraftV1(input)) return matrixRejection("ROUTING_INVALID_REQUEST");
    const authorities = this.readMatrixAuthorities("ROUTING_POLICY_CONFLICT");
    if (!authorities.ok) return authorities;
    if (authorities.value.snapshot.state === "global_unavailable" && input.scope.kind !== "global") {
      return matrixRejection("ROUTING_GLOBAL_UNAVAILABLE");
    }
    const context = this.mutationContext(authorities.value.registry, authorities.value.catalog.routes);
    const result = this.dependencies.store.applyRowMutation(input, context, (candidate) => {
      const projected = this.project(
        authorities.value,
        candidate.revision,
        candidate.policyIdentity,
        [],
      );
      return projected.ok ? projected.value : null;
    });
    if (!result.ok) return matrixRejection(result.code);
    return { ok: true, value: result.settlement };
  }

  acknowledgeRoutingMatrixAttention(input: unknown): RoutingMatrixServiceResult<RoutingMatrixSnapshotV1> {
    if (!isRoutingMatrixAttentionAcknowledgeV1(input)) return matrixRejection("ROUTING_INVALID_REQUEST");
    const result = this.dependencies.store.acknowledgeMatrixAttention(input);
    if (!result.ok) return matrixRejection(result.code);
    return this.readMatrix();
  }

  /** Applies one failed-catalog reset without reading stale catalog values or launching work. */
  resetUnavailableRoutes(routes: readonly RouteIdentityV1[], reasonCode: string, occurredAt: string, correlationId: string | null) {
    return this.dependencies.store.resetUnavailableRoutes(this.dependencies.registry.version, routes, reasonCode, occurredAt, "catalog-scan", correlationId);
  }

  private readMatrix(): RoutingMatrixServiceResult<RoutingMatrixSnapshotV1> {
    const authorities = this.readMatrixAuthorities();
    return authorities.ok ? { ok: true, value: authorities.value.snapshot } : authorities;
  }

  private readMatrixAuthorities(
    registryMismatchCode: "ROUTING_POLICY_CONFLICT" | "ROUTING_MATRIX_READ_FAILED" = "ROUTING_MATRIX_READ_FAILED",
  ): RoutingMatrixServiceResult<{
    readonly policy: RoutingPolicyRevisionV1;
    readonly registry: readonly AgentRegistryEntryV1[];
    readonly catalog: RoutingMatrixCatalogFacts;
    readonly attention: readonly RoutingAttentionV1[];
    readonly snapshot: RoutingMatrixSnapshotV1;
  }> {
    try {
      const policy = this.dependencies.store.getCurrentPolicy();
      const policyIdentity = this.dependencies.store.getCurrentRevisionGuard();
      if (!policy || !policyIdentity) return matrixRejection("ROUTING_BOOTSTRAP_REQUIRED");
      const registryVersion = this.dependencies.registry.version;
      const registry = this.dependencies.registry.list();
      if (policy.registryVersion !== registryVersion || policyIdentity.registryVersion !== registryVersion) {
        return matrixRejection(registryMismatchCode);
      }
      const catalog = this.requireMatrixCatalogFacts();
      const attention = this.dependencies.store.listCurrentAttention();
      const projected = this.dependencies.matrixProjector?.project({
        registryVersion,
        registry,
        policy,
        policyIdentity,
        catalog,
        attention,
      });
      if (!projected || !isRoutingMatrixSnapshotV1(projected)) return matrixRejection("ROUTING_MATRIX_READ_FAILED");
      return { ok: true, value: { policy, registry, catalog, attention, snapshot: projected } };
    } catch {
      return matrixRejection("ROUTING_MATRIX_READ_FAILED");
    }
  }

  private project(
    authorities: {
      readonly registry: readonly AgentRegistryEntryV1[];
      readonly catalog: RoutingMatrixCatalogFacts;
    },
    policy: RoutingPolicyRevisionV1,
    policyIdentity: RoutingMatrixPolicyIdentityV1,
    attention: readonly RoutingAttentionV1[],
  ): RoutingMatrixServiceResult<RoutingMatrixSnapshotV1> {
    try {
      const value = this.dependencies.matrixProjector?.project({
        registryVersion: policyIdentity.registryVersion,
        registry: authorities.registry,
        policy,
        policyIdentity,
        catalog: authorities.catalog,
        attention,
      });
      return value && isRoutingMatrixSnapshotV1(value)
        ? { ok: true, value }
        : matrixRejection("ROUTING_MATRIX_READ_FAILED");
    } catch { return matrixRejection("ROUTING_MATRIX_READ_FAILED"); }
  }

  private requireMatrixCatalogFacts(): RoutingMatrixCatalogFacts {
    const facts = this.dependencies.matrixCatalogFacts?.();
    if (!facts) throw new Error("Routing matrix catalog facts are unavailable.");
    return facts;
  }

  private mutationContext(
    registry: readonly AgentRegistryEntryV1[],
    routes: readonly RoutingCatalogRouteFactV1[],
  ): RoutingMatrixMutationContextV1 {
    return {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
      registryVersion: this.dependencies.registry.version,
      registry,
      routes,
      occurredAt: this.dependencies.now?.() ?? new Date().toISOString(),
      actor: "routing-matrix-operator",
      correlationId: null,
    };
  }

  private classifyFallbackRoutes(
    choices: readonly RoutingMatrixRouteV1[],
    draft: RoutingMatrixRowDraftV1 & { readonly selection: { readonly kind: "route"; readonly route: RouteIdentityV1 } },
    context: RoutingMatrixMutationContextV1,
  ): RoutingMatrixRouteV1[] {
    return choices.map((choice) => {
      if (routeIdentityKey(choice.route) === routeIdentityKey(draft.selection.route)) {
        return appendReason(choice, routingMatrixReason("same_as_primary"));
      }
      if (!choice.eligible) return choice;
      const candidate: RoutingMatrixRowDraftV1 = {
        ...draft,
        selection: { kind: "route", route: draft.selection.route, failurePolicy: { kind: "reroute_route_once", fallbackRoute: choice.route } },
      };
      const rejection = this.dependencies.store.validateRowMutation(candidate, context);
      return rejection?.code === "ROUTING_INVALID_HANDOFF_CHAIN"
        ? appendReason(choice, routingMatrixReason("fallback_cycle"))
        : choice;
    });
  }
}

function applyDraftToPolicy(policy: RoutingPolicyRevisionV1, draft: RoutingMatrixRowDraftV1): RoutingPolicyRevisionV1 {
  const key = selectorScopeKey(draft.scope);
  const selectors = policy.selectors.filter((selector) => selectorScopeKey(selector.scope) !== key);
  if (draft.selection.kind === "route") {
    selectors.push({
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      scope: draft.scope,
      selector: { kind: "route", route: draft.selection.route },
      failurePolicy: draft.selection.failurePolicy,
    });
  }
  return { ...policy, selectors: selectors.sort((left, right) => selectorScopeKey(left.scope).localeCompare(selectorScopeKey(right.scope))) };
}
function findRow(snapshot: RoutingMatrixSnapshotV1, scope: RoutingMatrixRowDraftV1["scope"]): RoutingMatrixRowV1 | null {
  const key = selectorScopeKey(scope);
  return [snapshot.global, ...snapshot.groups.flatMap((group) => [group.typeDefault, ...group.actions])]
    .find((row) => row.scopeKey === key) ?? null;
}
function appendReason(route: RoutingMatrixRouteV1, reason: RoutingMatrixReasonV1): RoutingMatrixRouteV1 {
  return { ...route, eligible: false, reasons: [...route.reasons, reason] };
}
function matrixRejection<T = never>(code: RoutingMatrixServiceErrorCode): RoutingMatrixServiceResult<T> {
  const messages: Readonly<Record<RoutingMatrixServiceErrorCode, string>> = {
    ROUTING_INVALID_REQUEST: "Routing request is invalid.",
    ROUTING_UNKNOWN_SCOPE: "The requested routing scope is not registered.",
    ROUTING_INVALID_POLICY: "Routing policy is invalid.",
    ROUTING_CAPABILITY_MISMATCH: "The selected route does not meet this action's capability requirements.",
    ROUTING_INVALID_HANDOFF_CHAIN: "Routing fallback policy must be one distinct available hop.",
    ROUTING_ROUTE_UNAVAILABLE: "The selected connection/model route is unavailable.",
    ROUTING_POLICY_CONFLICT: "Routing policy changed; refresh and retry the requested update.",
    ROUTING_BOOTSTRAP_REQUIRED: "Global Default is unset and no valid bootstrap route is available.",
    ROUTING_GLOBAL_UNAVAILABLE: "Global Default route is unavailable and must be replaced.",
    ROUTING_ATTENTION_CONFLICT: "Routing attention changed; refresh and retry the acknowledgement.",
    ROUTING_MATRIX_READ_FAILED: "Routing matrix could not be read safely.",
    ROUTING_GLOBAL_DELETE_BLOCKED: "A replacement Global Default is required before deleting this connection.",
  };
  return { ok: false, code, message: messages[code] };
}
