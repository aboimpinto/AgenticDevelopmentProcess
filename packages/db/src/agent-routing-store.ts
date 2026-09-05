import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  ROUTING_MATRIX_POLICY_ID,
  isRouteIdentityV1,
  isRoutingAttentionV1,
  isRoutingDependencyV1,
  isRoutingPolicyMutationV1,
  isRoutingPolicyRevisionV1,
  isRoutingPolicySelectorV1,
  isRoutingPolicyValidationContextV1,
  isRoutingMatrixAttentionAcknowledgeV1,
  isRoutingMatrixMutationContextV1,
  isRoutingMatrixRowDraftV1,
  routeIdentityKey,
  routingPolicyRejection,
  selectorScopeKey,
  type AgentCapabilityRequirementsV1,
  type AgentRegistryEntryV1,
  type RouteIdentityV1,
  type RoutingAttentionV1,
  type RoutingCatalogRouteFactV1,
  type RoutingDependencyV1,
  type RoutingPolicyMutationResultV1,
  type RoutingPolicyMutationV1,
  type RoutingPolicyRejectionV1,
  type RoutingPolicyRevisionV1,
  type RoutingPolicySelectorV1,
  type RoutingPolicyValidationContextV1,
  type RoutingSelectorScopeV1,
  type RoutingMatrixAttentionAcknowledgeV1,
  type RoutingMatrixMutationContextV1,
  type RoutingMatrixPolicyIdentityV1,
  type RoutingMatrixRowDraftV1,
} from "@hepha/shared";

const SCHEMA_SQL = `
create table if not exists agent_routing_policy_state (
  state_id integer primary key check (state_id = 1),
  current_revision_id text not null,
  registry_version text not null
);
create table if not exists agent_routing_policy_revisions (
  sequence integer primary key,
  revision_id text not null unique,
  registry_version text not null,
  reason text not null check (reason in ('bootstrap', 'operator_mutation', 'catalog_reset')),
  created_at text not null,
  actor text,
  correlation_id text,
  revision_guard text not null
);
create table if not exists agent_routing_policy_selectors (
  revision_id text not null references agent_routing_policy_revisions(revision_id),
  scope_key text not null,
  selector_json text not null,
  primary key (revision_id, scope_key)
);
create table if not exists agent_routing_connection_dependencies (
  revision_id text not null references agent_routing_policy_revisions(revision_id),
  connection_id text not null,
  model_id text not null,
  selector_scope_json text not null,
  primary key (revision_id, connection_id, model_id, selector_scope_json)
);
create table if not exists agent_routing_attention (
  attention_id text primary key,
  connection_id text not null,
  model_id text not null,
  reason_code text not null,
  revision_id text not null references agent_routing_policy_revisions(revision_id),
  occurred_at text not null,
  acknowledged_at text
);
create index if not exists idx_agent_routing_dependencies_current on agent_routing_connection_dependencies (revision_id, connection_id);
create index if not exists idx_agent_routing_attention_current on agent_routing_attention (revision_id, acknowledged_at);
`;

const SQL = {
  state: "select current_revision_id, registry_version from agent_routing_policy_state where state_id = 1",
  nextSequence: "select coalesce(max(sequence), 0) + 1 as sequence from agent_routing_policy_revisions",
  insertRevision: "insert into agent_routing_policy_revisions (sequence, revision_id, registry_version, reason, created_at, actor, correlation_id, revision_guard) values (?, ?, ?, ?, ?, ?, ?, ?)",
  insertSelector: "insert into agent_routing_policy_selectors (revision_id, scope_key, selector_json) values (?, ?, ?)",
  insertDependency: "insert into agent_routing_connection_dependencies (revision_id, connection_id, model_id, selector_scope_json) values (?, ?, ?, ?)",
  updateState: "insert into agent_routing_policy_state (state_id, current_revision_id, registry_version) values (1, ?, ?) on conflict(state_id) do update set current_revision_id = excluded.current_revision_id, registry_version = excluded.registry_version",
  selectorsForRevision: "select selector_json from agent_routing_policy_selectors where revision_id = ? order by scope_key asc",
  revision: "select * from agent_routing_policy_revisions where revision_id = ?",
  dependencies: "select * from agent_routing_connection_dependencies where revision_id = ? order by connection_id asc, model_id asc, selector_scope_json asc",
  attention: "select * from agent_routing_attention where revision_id = ? order by occurred_at asc, attention_id asc",
  insertAttention: "insert into agent_routing_attention (attention_id, connection_id, model_id, reason_code, revision_id, occurred_at, acknowledged_at) values (?, ?, ?, ?, ?, ?, null)",
  acknowledgeAttention: "update agent_routing_attention set acknowledged_at = ? where attention_id = ? and acknowledged_at is null",
  attentionById: "select * from agent_routing_attention where attention_id = ?",
} as const;

type SqliteValue = string | number | null;

export interface RoutingRowMutationCandidateV1 {
  readonly revision: RoutingPolicyRevisionV1;
  readonly policyIdentity: RoutingMatrixPolicyIdentityV1;
}

export type RoutingRowMutationResultV1<T> =
  | { readonly ok: true; readonly revision: RoutingPolicyRevisionV1; readonly settlement: T }
  | RoutingPolicyRejectionV1
  | { readonly ok: false; readonly code: "ROUTING_MATRIX_READ_FAILED"; readonly message: string };

/** Owns immutable routing revisions, selector dependencies, and reset attention. */
export class AgentRoutingStore {
  private readonly database: DatabaseSync;
  private schemaReady = false;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
    if (databasePath !== ":memory:") this.database.exec("pragma journal_mode = WAL;");
  }

  static createInMemory(): AgentRoutingStore { return new AgentRoutingStore(":memory:"); }
  close(): void { this.database.close(); }

  getCurrentPolicy(): RoutingPolicyRevisionV1 | null { return this.readBoundCurrentPolicy(); }

  getCurrentRevisionGuard(): RoutingMatrixPolicyIdentityV1 | null {
    const state = this.get<Record<string, unknown>>(SQL.state, []);
    if (!state) return null;
    const revisionId = requiredBoundedText(state.current_revision_id, 256);
    const row = this.get<Record<string, unknown>>(SQL.revision, [revisionId]);
    if (!row) throw new Error("Stored routing policy contract is invalid.");
    const revisionNumber = requiredPositiveInteger(row.sequence);
    const registryVersion = requiredBoundedText(row.registry_version, 256);
    if (requiredBoundedText(state.registry_version, 256) !== registryVersion) throw new Error("Stored routing policy contract is invalid.");
    const revisionGuard = requiredBoundedText(row.revision_guard, 512);
    return { policyId: ROUTING_MATRIX_POLICY_ID, revisionId, revisionNumber, registryVersion, revisionGuard };
  }

  /** Atomically changes one sparse selector only after its complete response settlement is admitted. */
  applyRowMutation<T>(
    input: RoutingMatrixRowDraftV1,
    context: RoutingMatrixMutationContextV1,
    settleCandidate: (candidate: RoutingRowMutationCandidateV1) => T | null,
  ): RoutingRowMutationResultV1<T> {
    if (!isRoutingMatrixRowDraftV1(input) || !isRoutingMatrixMutationContextV1(context)
      || typeof settleCandidate !== "function") {
      return routingPolicyRejection("ROUTING_INVALID_REQUEST");
    }
    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const current = this.readCurrentInsideTransaction();
      const identity = this.readCurrentGuardInsideTransaction();
      const prepared = prepareRowMutation(input, context, current, identity);
      if (!prepared.ok) {
        this.database.exec("rollback;");
        return prepared.rejection;
      }
      if (!current) throw new Error("Routing policy guard invariant failed.");
      const mutation: RoutingPolicyMutationV1 = {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registryVersion: context.registryVersion,
        expectedRevisionId: current.revisionId,
        reason: "operator_mutation",
        occurredAt: context.occurredAt,
        actor: context.actor,
        correlationId: context.correlationId,
        selectors: prepared.selectors,
      };
      const candidate = this.prepareRevision(mutation, "operator_mutation", prepared.selectors);
      let settlement: T | null = null;
      try { settlement = settleCandidate(candidate); } catch { settlement = null; }
      if (settlement === null) {
        this.database.exec("rollback;");
        return matrixReadFailure();
      }
      this.insertPreparedRevision(candidate);
      this.database.exec("commit;");
      return { ok: true, revision: candidate.revision, settlement };
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  /** Runs the exact row-mutation validation pipeline without opening a write transaction. */
  validateRowMutation(input: RoutingMatrixRowDraftV1, context: RoutingMatrixMutationContextV1): RoutingPolicyRejectionV1 | null {
    if (!isRoutingMatrixRowDraftV1(input) || !isRoutingMatrixMutationContextV1(context)) {
      return routingPolicyRejection("ROUTING_INVALID_REQUEST");
    }
    const prepared = prepareRowMutation(input, context, this.getCurrentPolicy(), this.getCurrentRevisionGuard());
    return prepared.ok ? null : prepared.rejection;
  }

  applyMutation(input: RoutingPolicyMutationV1, context: RoutingPolicyValidationContextV1): RoutingPolicyMutationResultV1 {
    const rejection = validateMutation(input, context, this.getCurrentPolicy());
    if (rejection) return rejection;
    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const current = this.readCurrentInsideTransaction();
      if ((current?.revisionId ?? null) !== input.expectedRevisionId) {
        this.database.exec("rollback;");
        return routingPolicyRejection("ROUTING_POLICY_CONFLICT");
      }
      const revision = this.insertRevision(input, input.reason, input.selectors);
      this.database.exec("commit;");
      return { ok: true, revision };
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  /** Resets every affected non-global selector in one catalog-reset revision. */
  resetUnavailableRoutes(
    registryVersion: string,
    unavailableRoutes: readonly RouteIdentityV1[],
    reasonCode: string,
    occurredAt: string,
    actor: string | null = null,
    correlationId: string | null = null,
  ): RoutingPolicyMutationResultV1 | null {
    if (!isNonEmpty(registryVersion, 256) || !isCanonicalIso(occurredAt) || !isNullableSafe(actor) || !isNullableSafe(correlationId)
      || !isNonEmpty(reasonCode, 256) || !Array.isArray(unavailableRoutes) || !unavailableRoutes.every(isRouteIdentityV1)) {
      return routingPolicyRejection("ROUTING_INVALID_REQUEST");
    }
    const current = this.getCurrentPolicy();
    if (!current) return null;
    if (current.registryVersion !== registryVersion) return routingPolicyRejection("ROUTING_INVALID_POLICY");
    const unavailable = new Set(unavailableRoutes.map(routeIdentityKey));
    const affected = current.selectors.filter((entry) => entry.scope.kind !== "global" && selectorReferences(entry, unavailable));
    if (affected.length === 0) return null;
    const selectors = current.selectors.filter((entry) => !affected.includes(entry));
    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const insideCurrent = this.readCurrentInsideTransaction();
      if (!insideCurrent || insideCurrent.revisionId !== current.revisionId) {
        this.database.exec("rollback;");
        return routingPolicyRejection("ROUTING_POLICY_CONFLICT");
      }
      const revision = this.insertRevision({
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registryVersion,
        expectedRevisionId: current.revisionId,
        reason: "operator_mutation",
        occurredAt,
        actor,
        correlationId,
        selectors,
      }, "catalog_reset", selectors);
      for (const [index, selector] of affected.entries()) {
        const routes = referencedRoutes(selector).filter((route) => unavailable.has(routeIdentityKey(route)));
        for (const route of routes) this.run(SQL.insertAttention, [`routing-attention-${revision.revisionId}-${index}-${route.modelId}`, route.connectionId, route.modelId, reasonCode, revision.revisionId, occurredAt]);
      }
      this.database.exec("commit;");
      return { ok: true, revision };
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  listCurrentDependencies(): RoutingDependencyV1[] {
    const current = this.getCurrentPolicy();
    if (!current) return [];
    return this.all<Record<string, unknown>>(SQL.dependencies, [current.revisionId]).map(rowToDependency);
  }

  listCurrentAttention(): RoutingAttentionV1[] {
    const current = this.getCurrentPolicy();
    if (!current) return [];
    return this.all<Record<string, unknown>>(SQL.attention, [current.revisionId]).map(rowToAttention);
  }

  acknowledgeAttention(attentionId: string, acknowledgedAt: string): boolean {
    if (!isNonEmpty(attentionId, 512) || !isCanonicalIso(acknowledgedAt)) return false;
    return Number(this.run(SQL.acknowledgeAttention, [acknowledgedAt, attentionId]).changes) === 1;
  }

  /** Identity- and revision-binds one matrix attention acknowledgement and accepts only an exact replay. */
  acknowledgeMatrixAttention(input: RoutingMatrixAttentionAcknowledgeV1): { readonly ok: true } | { readonly ok: false; readonly code: "ROUTING_INVALID_REQUEST" | "ROUTING_POLICY_CONFLICT" | "ROUTING_ATTENTION_CONFLICT" } {
    if (!isRoutingMatrixAttentionAcknowledgeV1(input)) return { ok: false, code: "ROUTING_INVALID_REQUEST" };
    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const identity = this.readCurrentGuardInsideTransaction();
      if (!identity || input.policyId !== identity.policyId
        || input.expectedRevision.revisionId !== identity.revisionId
        || input.expectedRevision.revisionNumber !== identity.revisionNumber
        || input.revisionGuard !== identity.revisionGuard) {
        this.database.exec("rollback;");
        return { ok: false, code: "ROUTING_POLICY_CONFLICT" };
      }
      const row = this.get<Record<string, unknown>>(SQL.attentionById, [input.attentionIdentity.attentionId]);
      if (!row) {
        this.database.exec("rollback;");
        return { ok: false, code: "ROUTING_ATTENTION_CONFLICT" };
      }
      const attention = rowToAttention(row);
      if (attention.revisionId !== input.attentionIdentity.attentionRevisionId
        || attention.connectionId !== input.attentionIdentity.affectedRoute.connectionId
        || attention.modelId !== input.attentionIdentity.affectedRoute.modelId
        || Date.parse(input.acknowledgedAt) < Date.parse(attention.occurredAt)
        || attention.revisionId !== identity.revisionId) {
        this.database.exec("rollback;");
        return { ok: false, code: "ROUTING_ATTENTION_CONFLICT" };
      }
      if (attention.acknowledgedAt !== null) {
        this.database.exec("rollback;");
        return attention.acknowledgedAt === input.acknowledgedAt
          ? { ok: true }
          : { ok: false, code: "ROUTING_ATTENTION_CONFLICT" };
      }
      const changed = Number(this.run(SQL.acknowledgeAttention, [input.acknowledgedAt, attention.attentionId]).changes);
      if (changed !== 1) throw new Error("Routing attention acknowledgement was not atomic.");
      this.database.exec("commit;");
      return { ok: true };
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  /** Global dependencies are deletion blockers; non-global dependencies are reset candidates. */
  deletionPreflight(connectionId: string): { readonly canDelete: boolean; readonly code: "ROUTING_GLOBAL_DELETE_BLOCKED" | null } {
    if (!isNonEmpty(connectionId, 512)) return { canDelete: false, code: "ROUTING_GLOBAL_DELETE_BLOCKED" };
    const global = this.listCurrentDependencies().some((dependency) => dependency.connectionId === connectionId && dependency.selectorScope.kind === "global");
    return global ? { canDelete: false, code: "ROUTING_GLOBAL_DELETE_BLOCKED" } : { canDelete: true, code: null };
  }

  private insertRevision(input: RoutingPolicyMutationV1, reason: "bootstrap" | "operator_mutation" | "catalog_reset", selectors: readonly RoutingPolicySelectorV1[]): RoutingPolicyRevisionV1 {
    const prepared = this.prepareRevision(input, reason, selectors);
    this.insertPreparedRevision(prepared);
    return prepared.revision;
  }

  private prepareRevision(
    input: RoutingPolicyMutationV1,
    reason: "bootstrap" | "operator_mutation" | "catalog_reset",
    selectors: readonly RoutingPolicySelectorV1[],
  ): RoutingRowMutationCandidateV1 {
    const sequence = this.get<{ sequence: number }>(SQL.nextSequence, [])?.sequence;
    if (!Number.isInteger(sequence) || !sequence || sequence < 1) throw new Error("Routing policy sequence is invalid.");
    const revisionId = `routing-revision-${sequence}`;
    const revisionGuard = createRevisionGuard(revisionId, sequence, input.registryVersion);
    const orderedSelectors = [...selectors].sort((left, right) => selectorScopeKey(left.scope).localeCompare(selectorScopeKey(right.scope)));
    return {
      revision: {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, revisionId, registryVersion: input.registryVersion, reason,
        createdAt: input.occurredAt, actor: input.actor, correlationId: input.correlationId, selectors: orderedSelectors,
      },
      policyIdentity: {
        policyId: ROUTING_MATRIX_POLICY_ID, revisionId, revisionNumber: sequence,
        registryVersion: input.registryVersion, revisionGuard,
      },
    };
  }

  private insertPreparedRevision(candidate: RoutingRowMutationCandidateV1): void {
    const { policyIdentity, revision } = candidate;
    this.run(SQL.insertRevision, [
      policyIdentity.revisionNumber, revision.revisionId, revision.registryVersion, revision.reason,
      revision.createdAt, revision.actor, revision.correlationId, policyIdentity.revisionGuard,
    ]);
    for (const selector of revision.selectors) {
      this.run(SQL.insertSelector, [revision.revisionId, selectorScopeKey(selector.scope), JSON.stringify(selector)]);
      for (const route of referencedRoutes(selector)) {
        this.run(SQL.insertDependency, [revision.revisionId, route.connectionId, route.modelId, JSON.stringify(selector.scope)]);
      }
    }
    this.run(SQL.updateState, [revision.revisionId, revision.registryVersion]);
  }

  private readCurrentInsideTransaction(): RoutingPolicyRevisionV1 | null { return this.readBoundCurrentPolicy(); }
  private readCurrentGuardInsideTransaction(): RoutingMatrixPolicyIdentityV1 | null { return this.getCurrentRevisionGuard(); }

  /** Reads the singleton state and its immutable revision as one validated V1 binding. */
  private readBoundCurrentPolicy(): RoutingPolicyRevisionV1 | null {
    const state = this.get<Record<string, unknown>>(SQL.state, []);
    if (!state) return null;
    const revisionId = requiredBoundedText(state.current_revision_id, 256);
    const registryVersion = requiredBoundedText(state.registry_version, 256);
    const revision = this.readRevision(revisionId);
    if (revision.registryVersion !== registryVersion) throw new Error("Stored routing policy contract is invalid.");
    return revision;
  }

  private readRevision(revisionId: string): RoutingPolicyRevisionV1 {
    const row = this.get<Record<string, unknown>>(SQL.revision, [revisionId]);
    if (!row) throw new Error("Stored routing policy contract is invalid.");
    const selectors = this.all<{ selector_json: string }>(SQL.selectorsForRevision, [revisionId]).map((entry) => parseSelector(entry.selector_json));
    const revision: RoutingPolicyRevisionV1 = {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, revisionId: requiredText(row.revision_id), registryVersion: requiredText(row.registry_version),
      reason: requiredReason(row.reason), createdAt: requiredIso(row.created_at), actor: nullableText(row.actor), correlationId: nullableText(row.correlation_id), selectors,
    };
    if (!isRoutingPolicyRevisionV1(revision)) throw new Error("Stored routing policy contract is invalid.");
    return revision;
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.database.exec(SCHEMA_SQL);
    const columns = this.database.prepare("pragma table_info(agent_routing_policy_revisions)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "revision_guard")) {
      this.database.exec("alter table agent_routing_policy_revisions add column revision_guard text;");
      const revisions = this.database.prepare("select sequence, revision_id, registry_version from agent_routing_policy_revisions").all() as Array<{ sequence: number; revision_id: string; registry_version: string }>;
      const update = this.database.prepare("update agent_routing_policy_revisions set revision_guard = ? where revision_id = ?");
      for (const revision of revisions) update.run(createRevisionGuard(revision.revision_id, revision.sequence, revision.registry_version), revision.revision_id);
    }
    this.schemaReady = true;
  }
  private get<T extends Record<string, unknown>>(sql: string, values: SqliteValue[]): T | null { this.ensureSchema(); return (this.database.prepare(sql).get(...values) as T | undefined) ?? null; }
  private all<T extends Record<string, unknown>>(sql: string, values: SqliteValue[]): T[] { this.ensureSchema(); return this.database.prepare(sql).all(...values) as T[]; }
  private run(sql: string, values: SqliteValue[]) { this.ensureSchema(); return this.database.prepare(sql).run(...values); }
}

type PreparedRowMutation =
  | { readonly ok: true; readonly selectors: readonly RoutingPolicySelectorV1[] }
  | { readonly ok: false; readonly rejection: RoutingPolicyRejectionV1 };

function prepareRowMutation(
  input: RoutingMatrixRowDraftV1,
  context: RoutingMatrixMutationContextV1,
  current: RoutingPolicyRevisionV1 | null,
  identity: RoutingMatrixPolicyIdentityV1 | null,
): PreparedRowMutation {
  const initialRejection = validateRowMutationDraft(input, context, current, identity);
  if (initialRejection) return { ok: false, rejection: initialRejection };
  if (!current) return { ok: false, rejection: routingPolicyRejection("ROUTING_POLICY_CONFLICT") };
  const scopeKey = selectorScopeKey(input.scope);
  const selectors = current.selectors.filter((selector) => selectorScopeKey(selector.scope) !== scopeKey);
  if (input.selection.kind === "route") {
    selectors.push({
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      scope: input.scope,
      selector: { kind: "route", route: input.selection.route },
      failurePolicy: input.selection.failurePolicy,
    });
  }
  const completePolicyRejection = validateMutation({
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    registryVersion: context.registryVersion,
    expectedRevisionId: current.revisionId,
    reason: "operator_mutation",
    occurredAt: context.occurredAt,
    actor: context.actor,
    correlationId: context.correlationId,
    selectors,
  }, {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    registry: context.registry,
    routes: context.routes,
  }, current);
  if (completePolicyRejection) return { ok: false, rejection: completePolicyRejection };
  if (hasFallbackCycle(selectors)) return { ok: false, rejection: routingPolicyRejection("ROUTING_INVALID_HANDOFF_CHAIN") };
  return { ok: true, selectors };
}

function validateRowMutationDraft(
  input: RoutingMatrixRowDraftV1,
  context: RoutingMatrixMutationContextV1,
  current: RoutingPolicyRevisionV1 | null,
  identity: RoutingMatrixPolicyIdentityV1 | null,
): RoutingPolicyRejectionV1 | null {
  if (!current || !identity || input.policyId !== identity.policyId
    || input.expectedRevision.revisionId !== identity.revisionId
    || input.expectedRevision.revisionNumber !== identity.revisionNumber
    || input.revisionGuard !== identity.revisionGuard
    || current.registryVersion !== identity.registryVersion
    || context.registryVersion !== identity.registryVersion) return routingPolicyRejection("ROUTING_POLICY_CONFLICT");
  const entries = entriesForScope(input.scope, context.registry);
  if (entries.length === 0) return routingPolicyRejection("ROUTING_UNKNOWN_SCOPE");
  if (input.scope.kind === "global" && (input.selection.kind !== "route" || input.selection.failurePolicy.kind !== "fail_immediately")) {
    return routingPolicyRejection("ROUTING_INVALID_POLICY");
  }
  if (input.selection.kind === "inherit") return null;
  const primaryCheck = validateRoute(input.selection.route, entries, context.routes);
  if (primaryCheck) return primaryCheck;
  const failurePolicy = input.selection.failurePolicy;
  if (failurePolicy.kind === "reroute_global_once") {
    const global = current.selectors.find((selector) => selector.scope.kind === "global");
    if (!global || global.selector.kind !== "route") return routingPolicyRejection("ROUTING_INVALID_POLICY");
    if (routeIdentityKey(global.selector.route) === routeIdentityKey(input.selection.route)) return routingPolicyRejection("ROUTING_INVALID_HANDOFF_CHAIN");
    return validateRoute(global.selector.route, entries, context.routes);
  }
  if (failurePolicy.kind === "reroute_route_once") {
    if (routeIdentityKey(failurePolicy.fallbackRoute) === routeIdentityKey(input.selection.route)) {
      return routingPolicyRejection("ROUTING_INVALID_HANDOFF_CHAIN");
    }
    const fallbackCheck = validateRoute(failurePolicy.fallbackRoute, entries, context.routes);
    if (fallbackCheck) return fallbackCheck;
    if (createsFallbackCycle(input.selection.route, failurePolicy.fallbackRoute, current.selectors, input.scope)) {
      return routingPolicyRejection("ROUTING_INVALID_HANDOFF_CHAIN");
    }
  }
  return null;
}

function createsFallbackCycle(
  primary: RouteIdentityV1,
  fallback: RouteIdentityV1,
  selectors: readonly RoutingPolicySelectorV1[],
  changedScope: RoutingSelectorScopeV1,
): boolean {
  const global = selectors.find((selector) => selector.scope.kind === "global");
  const globalRoute = global?.selector.kind === "route" ? global.selector.route : null;
  return selectors.some((selector) => {
    if (selectorScopeKey(selector.scope) === selectorScopeKey(changedScope) || selector.selector.kind !== "route") return false;
    const target = selector.failurePolicy.kind === "reroute_route_once" ? selector.failurePolicy.fallbackRoute
      : selector.failurePolicy.kind === "reroute_global_once" ? globalRoute : null;
    return target !== null && routeIdentityKey(selector.selector.route) === routeIdentityKey(fallback)
      && routeIdentityKey(target) === routeIdentityKey(primary);
  });
}

function hasFallbackCycle(selectors: readonly RoutingPolicySelectorV1[]): boolean {
  const global = selectors.find((selector) => selector.scope.kind === "global");
  const globalRoute = global?.selector.kind === "route" ? global.selector.route : null;
  const edges = new Map<string, Set<string>>();
  for (const selector of selectors) {
    if (selector.scope.kind === "global" || selector.selector.kind !== "route") continue;
    const fallback = selector.failurePolicy.kind === "reroute_route_once" ? selector.failurePolicy.fallbackRoute
      : selector.failurePolicy.kind === "reroute_global_once" ? globalRoute : null;
    if (!fallback) continue;
    const source = routeIdentityKey(selector.selector.route);
    const targets = edges.get(source) ?? new Set<string>();
    targets.add(routeIdentityKey(fallback));
    edges.set(source, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (route: string): boolean => {
    if (visiting.has(route)) return true;
    if (visited.has(route)) return false;
    visiting.add(route);
    for (const target of edges.get(route) ?? []) if (visit(target)) return true;
    visiting.delete(route);
    visited.add(route);
    return false;
  };
  return [...edges.keys()].some(visit);
}

function createRevisionGuard(revisionId: string, revisionNumber: number, registryVersion: string): string {
  return createHash("sha256").update(`${ROUTING_MATRIX_POLICY_ID}\u0000${revisionId}\u0000${revisionNumber}\u0000${registryVersion}`).digest("base64url");
}

function matrixReadFailure(): { readonly ok: false; readonly code: "ROUTING_MATRIX_READ_FAILED"; readonly message: string } {
  return { ok: false, code: "ROUTING_MATRIX_READ_FAILED", message: "Routing matrix could not be read safely." };
}

function validateMutation(input: unknown, context: unknown, current: RoutingPolicyRevisionV1 | null) {
  if (!isRoutingPolicyMutationV1(input) || !isRoutingPolicyValidationContextV1(context)) return routingPolicyRejection("ROUTING_INVALID_REQUEST");
  if ((current?.revisionId ?? null) !== input.expectedRevisionId) return routingPolicyRejection("ROUTING_POLICY_CONFLICT");
  if (current && current.registryVersion !== input.registryVersion) return routingPolicyRejection("ROUTING_INVALID_POLICY");
  if (!current && input.reason !== "bootstrap") return routingPolicyRejection("ROUTING_INVALID_POLICY");
  const scopes = new Set<string>();
  const registryActions = new Set(context.registry.map((entry) => entry.actionId));
  for (const selector of input.selectors) {
    const scopeKey = selectorScopeKey(selector.scope);
    if (scopes.has(scopeKey)) return routingPolicyRejection("ROUTING_INVALID_POLICY");
    scopes.add(scopeKey);
    if (selector.scope.kind === "action" && !registryActions.has(selector.scope.actionId)) return routingPolicyRejection("ROUTING_INVALID_POLICY");
    if (selector.scope.kind === "global") {
      if (selector.selector.kind !== "route" || selector.failurePolicy.kind !== "fail_immediately") return routingPolicyRejection("ROUTING_INVALID_POLICY");
    } else if (selector.selector.kind === "inherit" && selector.failurePolicy.kind !== "fail_immediately") {
      return routingPolicyRejection("ROUTING_INVALID_POLICY");
    }
    if (selector.selector.kind === "route") {
      const primary = selector.selector.route;
      const primaryCheck = validateRoute(primary, entriesForScope(selector.scope, context.registry), context.routes);
      if (primaryCheck) return primaryCheck;
      if (selector.failurePolicy.kind === "reroute_route_once") {
        if (routeIdentityKey(primary) === routeIdentityKey(selector.failurePolicy.fallbackRoute)) return routingPolicyRejection("ROUTING_INVALID_HANDOFF_CHAIN");
        const fallbackCheck = validateRoute(selector.failurePolicy.fallbackRoute, entriesForScope(selector.scope, context.registry), context.routes);
        if (fallbackCheck) return fallbackCheck;
      }
    }
  }
  const global = input.selectors.filter((entry) => entry.scope.kind === "global");
  return global.length === 1 ? null : routingPolicyRejection("ROUTING_INVALID_POLICY");
}

function validateRoute(route: RouteIdentityV1, entries: readonly AgentRegistryEntryV1[], facts: readonly RoutingCatalogRouteFactV1[]) {
  const fact = facts.find((candidate) => routeIdentityKey(candidate.route) === routeIdentityKey(route));
  if (!fact || !fact.connectionActive || !fact.available) return routingPolicyRejection("ROUTING_ROUTE_UNAVAILABLE");
  return entries.some((entry) => !meetsRequirements(fact, entry.capabilityRequirements))
    ? routingPolicyRejection("ROUTING_CAPABILITY_MISMATCH") : null;
}
function entriesForScope(scope: RoutingSelectorScopeV1, entries: readonly AgentRegistryEntryV1[]): readonly AgentRegistryEntryV1[] {
  if (scope.kind === "action") return entries.filter((entry) => entry.actionId === scope.actionId);
  return scope.kind === "action_type" ? entries.filter((entry) => entry.actionType === scope.actionType) : entries;
}
function meetsRequirements(fact: RoutingCatalogRouteFactV1, requirements: AgentCapabilityRequirementsV1): boolean {
  return (fact.contextWindowTokens ?? -1) >= requirements.minimumContextWindowTokens
    && (!requirements.requiresTools || fact.tools === true) && (!requirements.requiresApi || fact.api === true)
    && (!requirements.requiresReasoning || fact.reasoning === true);
}
function referencedRoutes(selector: RoutingPolicySelectorV1): RouteIdentityV1[] {
  const result: RouteIdentityV1[] = [];
  if (selector.selector.kind === "route") result.push(selector.selector.route);
  if (selector.failurePolicy.kind === "reroute_route_once") result.push(selector.failurePolicy.fallbackRoute);
  return result;
}
function selectorReferences(selector: RoutingPolicySelectorV1, unavailable: ReadonlySet<string>): boolean { return referencedRoutes(selector).some((route) => unavailable.has(routeIdentityKey(route))); }
function parseSelector(text: string): RoutingPolicySelectorV1 { try { const value: unknown = JSON.parse(text); if (!isRoutingPolicySelectorV1(value)) throw new Error(); return value; } catch { throw new Error("Stored routing policy contract is invalid."); } }
function rowToDependency(row: Record<string, unknown>): RoutingDependencyV1 {
  const dependency: RoutingDependencyV1 = { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, revisionId: requiredText(row.revision_id), connectionId: requiredText(row.connection_id) as RoutingDependencyV1["connectionId"], modelId: requiredText(row.model_id), selectorScope: parseScope(requiredText(row.selector_scope_json)) };
  if (!isRoutingDependencyV1(dependency)) throw new Error("Stored routing policy contract is invalid.");
  return dependency;
}
function rowToAttention(row: Record<string, unknown>): RoutingAttentionV1 {
  const attention: RoutingAttentionV1 = { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, attentionId: requiredText(row.attention_id), connectionId: requiredText(row.connection_id) as RoutingAttentionV1["connectionId"], modelId: requiredText(row.model_id), reasonCode: requiredText(row.reason_code), revisionId: requiredText(row.revision_id), occurredAt: requiredIso(row.occurred_at), acknowledgedAt: row.acknowledged_at === null ? null : requiredIso(row.acknowledged_at) };
  if (!isRoutingAttentionV1(attention)) throw new Error("Stored routing policy contract is invalid.");
  return attention;
}
function parseScope(text: string): RoutingSelectorScopeV1 { try { const value = JSON.parse(text) as unknown; if (typeof value !== "object" || value === null || !["global", "action", "action_type"].includes((value as { kind?: string }).kind ?? "")) throw new Error(); return value as RoutingSelectorScopeV1; } catch { throw new Error("Stored routing policy contract is invalid."); } }
function requiredText(value: unknown): string { if (!isNonEmpty(value, 512)) throw new Error("Stored routing policy contract is invalid."); return value; }
function nullableText(value: unknown): string | null { return value === null ? null : requiredText(value); }
function requiredIso(value: unknown): string { if (!isCanonicalIso(value)) throw new Error("Stored routing policy contract is invalid."); return value; }
function requiredReason(value: unknown): "bootstrap" | "operator_mutation" | "catalog_reset" { if (value === "bootstrap" || value === "operator_mutation" || value === "catalog_reset") return value; throw new Error("Stored routing policy contract is invalid."); }
function requiredBoundedText(value: unknown, maximum: number): string { if (!isNonEmpty(value, maximum)) throw new Error("Stored routing policy contract is invalid."); return value; }
function requiredPositiveInteger(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Stored routing policy contract is invalid."); return value; }
function isNonEmpty(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function isNullableSafe(value: unknown): boolean { return value === null || isNonEmpty(value, 512); }
function isCanonicalIso(value: unknown): value is string { if (typeof value !== "string") return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
