import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  ROUTING_MATRIX_POLICY_ID,
  ROUTING_MATRIX_SCHEMA_VERSION,
  selectorScopeKey,
  type AgentRegistryEntryV1,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
  type RoutingPolicyMutationV1,
  type RoutingPolicySelectorV1,
  type RoutingMatrixMutationContextV1,
  type RoutingMatrixRowDraftV1,
} from "@hepha/shared";
import { AgentRoutingStore } from "../src/agent-routing-store.js";

const now = "2026-07-23T03:00:00.000Z";
const globalRoute: RouteIdentityV1 = { connectionId: "connection-global" as RouteIdentityV1["connectionId"], modelId: "global-model" };
const reviewRoute: RouteIdentityV1 = { connectionId: "connection-review" as RouteIdentityV1["connectionId"], modelId: "review-model" };
const weakRoute: RouteIdentityV1 = { connectionId: "connection-weak" as RouteIdentityV1["connectionId"], modelId: "weak-model" };

const registry: readonly AgentRegistryEntryV1[] = [
  { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, actionId: "code-review", actionType: "review", actionTypeLabel: "Review", actionTypeDisplayOrder: 3, label: "Code Review", displayOrder: 1, roleId: "code-review-agent", promptVersion: "code-review/v1", capabilityRequirements: { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: false } },
  { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, actionId: "deep-dive", actionType: "discovery_planning", actionTypeLabel: "Discovery & Planning", actionTypeDisplayOrder: 1, label: "Deep-Dive", displayOrder: 4, roleId: "requirements-agent", promptVersion: "deep-dive/v1", capabilityRequirements: { minimumContextWindowTokens: 32_000, requiresTools: false, requiresApi: true, requiresReasoning: false } },
];

function fact(route: RouteIdentityV1, overrides: Partial<RoutingCatalogRouteFactV1> = {}): RoutingCatalogRouteFactV1 {
  return { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, route, connectionActive: true, available: true, contextWindowTokens: 128_000, tools: true, api: true, reasoning: true, ...overrides };
}
function selector(scope: RoutingPolicySelectorV1["scope"], route: RouteIdentityV1, failurePolicy: RoutingPolicySelectorV1["failurePolicy"] = { kind: "fail_immediately" }): RoutingPolicySelectorV1 {
  return { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope, selector: { kind: "route", route }, failurePolicy };
}
function mutation(selectors: readonly RoutingPolicySelectorV1[], expectedRevisionId: string | null = null, reason: "bootstrap" | "operator_mutation" = "bootstrap"): RoutingPolicyMutationV1 {
  return { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registryVersion: "agent-registry/v1", expectedRevisionId, reason, occurredAt: now, actor: "operator", correlationId: "test-correlation", selectors };
}
function context(routes: readonly RoutingCatalogRouteFactV1[] = [fact(globalRoute), fact(reviewRoute), fact(weakRoute)]) {
  return { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registry, routes } as const;
}
function initialSelectors(): readonly RoutingPolicySelectorV1[] {
  return [selector({ kind: "global" }, globalRoute), selector({ kind: "action" , actionId: "code-review" }, reviewRoute, { kind: "reroute_global_once" })];
}
function rowContext(routes: readonly RoutingCatalogRouteFactV1[] = context().routes, registryVersion = "agent-registry/v1"): RoutingMatrixMutationContextV1 {
  return { schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, registryVersion, registry, routes, occurredAt: "2026-07-23T03:10:00.000Z", actor: "operator", correlationId: "row-save" };
}
function settleCandidate(): true { return true; }
function rowDraft(store: AgentRoutingStore, scope: RoutingMatrixRowDraftV1["scope"], selection: RoutingMatrixRowDraftV1["selection"]): RoutingMatrixRowDraftV1 {
  const guard = store.getCurrentRevisionGuard();
  if (!guard) throw new Error("Missing row guard fixture.");
  return { schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION, policyId: ROUTING_MATRIX_POLICY_ID, scope, selection,
    expectedRevision: { revisionId: guard.revisionId, revisionNumber: guard.revisionNumber }, revisionGuard: guard.revisionGuard };
}

describe("AgentRoutingStore", () => {
  it("atomically persists a revision, selectors, and route-owned dependencies", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const result = store.applyMutation(mutation(initialSelectors()), context());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.revision.revisionId).toBe("routing-revision-1");
      expect(store.getCurrentPolicy()).toEqual(result.revision);
      expect(store.listCurrentDependencies().map((entry) => `${entry.connectionId}/${entry.modelId}`)).toEqual([
        "connection-global/global-model", "connection-review/review-model",
      ]);
    } finally { store.close(); }
  });

  it.each([
    ["missing Global", [selector({ kind: "action", actionId: "code-review" }, reviewRoute)], "ROUTING_INVALID_POLICY"],
    ["unknown action", [selector({ kind: "global" }, globalRoute), selector({ kind: "action", actionId: "unknown-action" }, reviewRoute)], "ROUTING_INVALID_POLICY"],
    ["unavailable route", [selector({ kind: "global" }, globalRoute), selector({ kind: "action", actionId: "code-review" }, reviewRoute)], "ROUTING_ROUTE_UNAVAILABLE"],
    ["capability mismatch", [selector({ kind: "global" }, globalRoute), selector({ kind: "action", actionId: "code-review" }, weakRoute)], "ROUTING_CAPABILITY_MISMATCH"],
    ["primary equals fallback", [selector({ kind: "global" }, globalRoute), selector({ kind: "action", actionId: "code-review" }, reviewRoute, { kind: "reroute_route_once", fallbackRoute: reviewRoute })], "ROUTING_INVALID_HANDOFF_CHAIN"],
  ] as const)("rejects %s without writing a revision", (name, selectors, expectedCode) => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const routes = name === "unavailable route" ? [fact(globalRoute), fact(reviewRoute, { available: false }), fact(weakRoute)]
        : name === "capability mismatch" ? [fact(globalRoute), fact(reviewRoute), fact(weakRoute, { contextWindowTokens: 16_000, tools: false })]
        : undefined;
      const result = store.applyMutation(mutation(selectors), context(routes));
      expect(result).toMatchObject({ ok: false, code: expectedCode });
      expect(store.getCurrentPolicy()).toBeNull();
      expect(store.listCurrentDependencies()).toEqual([]);
    } finally { store.close(); }
  });

  it("rejects malformed registry/catalog validation snapshots before mutation", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const duplicateActionContext = { ...context(), registry: [registry[0]!, registry[0]!] };
      expect(store.applyMutation(mutation(initialSelectors()), duplicateActionContext)).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      const duplicateRouteContext = { ...context(), routes: [fact(globalRoute), fact(globalRoute)] };
      expect(store.applyMutation(mutation(initialSelectors()), duplicateRouteContext)).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      expect(store.getCurrentPolicy()).toBeNull();
    } finally { store.close(); }
  });

  it("preserves a valid revision byte-for-byte after malformed and stale mutations", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const first = store.applyMutation(mutation(initialSelectors()), context());
      if (!first.ok) throw new Error("Fixture setup failed.");
      const before = JSON.stringify(store.getCurrentPolicy());
      const malformed = store.applyMutation({ ...mutation(initialSelectors(), first.revision.revisionId, "operator_mutation"), selectors: [{ scope: { kind: "global" } }] } as unknown as RoutingPolicyMutationV1, context());
      expect(malformed).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      const stale = store.applyMutation(mutation(initialSelectors(), null, "operator_mutation"), context());
      expect(stale).toMatchObject({ ok: false, code: "ROUTING_POLICY_CONFLICT" });
      expect(JSON.stringify(store.getCurrentPolicy())).toBe(before);
      expect(store.listCurrentDependencies()).toHaveLength(2);
    } finally { store.close(); }
  });

  it("treats an absent state row as the only valid unset-policy case", () => {
    const store = AgentRoutingStore.createInMemory();
    try { expect(store.getCurrentPolicy()).toBeNull(); } finally { store.close(); }
  });

  it("reads a persisted immutable revision back after reopening", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-agent-routing-"));
    const path = join(directory, "routing.sqlite");
    const writer = new AgentRoutingStore(path);
    try {
      expect(writer.applyMutation(mutation(initialSelectors()), context())).toMatchObject({ ok: true });
    } finally { writer.close(); }
    const reader = new AgentRoutingStore(path);
    try {
      expect(reader.getCurrentPolicy()).toMatchObject({ revisionId: "routing-revision-1", registryVersion: "agent-registry/v1" });
      expect(reader.listCurrentDependencies()).toHaveLength(2);
    } finally {
      reader.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("applies atomic sparse row mutations with opaque revision read-back and exactly one revision each", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const seeded = store.applyMutation(mutation([selector({ kind: "global" }, globalRoute)]), context());
      expect(seeded).toMatchObject({ ok: true });
      expect(store.getCurrentRevisionGuard()).toMatchObject({ policyId: ROUTING_MATRIX_POLICY_ID, revisionId: "routing-revision-1", revisionNumber: 1, registryVersion: "agent-registry/v1" });

      const policies = [
        { kind: "fail_immediately" } as const,
        { kind: "reroute_global_once" } as const,
        { kind: "reroute_route_once", fallbackRoute: globalRoute } as const,
      ];
      for (const [index, failurePolicy] of policies.entries()) {
        const saved = store.applyRowMutation(rowDraft(store, { kind: "action", actionId: "code-review" }, { kind: "route", route: reviewRoute, failurePolicy }), rowContext(), settleCandidate);
        expect(saved).toMatchObject({ ok: true });
        expect(store.getCurrentRevisionGuard()?.revisionNumber).toBe(index + 2);
        expect(store.getCurrentPolicy()?.selectors.find((entry) => entry.scope.kind === "action")?.failurePolicy).toEqual(failurePolicy);
      }

      const inherited = store.applyRowMutation(rowDraft(store, { kind: "action", actionId: "code-review" }, { kind: "inherit" }), rowContext(), settleCandidate);
      expect(inherited).toMatchObject({ ok: true });
      expect(store.getCurrentRevisionGuard()?.revisionNumber).toBe(5);
      expect(store.getCurrentPolicy()?.selectors.some((entry) => entry.scope.kind === "action")).toBe(false);
      expect(store.listCurrentDependencies()).toHaveLength(1);

      const globalReplacement = store.applyRowMutation(rowDraft(store, { kind: "global" }, { kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" } }), rowContext(), settleCandidate);
      expect(globalReplacement).toMatchObject({ ok: true });
      expect(store.getCurrentRevisionGuard()?.revisionNumber).toBe(6);
      expect(store.getCurrentPolicy()?.selectors).toHaveLength(1);
      expect(store.listCurrentDependencies().map((item) => `${item.connectionId}/${item.modelId}`)).toEqual(["connection-review/review-model"]);
    } finally { store.close(); }
  });

  it("preserves sparse policy and revision for every guarded row rejection", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const seeded = store.applyMutation(mutation(initialSelectors()), context());
      if (!seeded.ok) throw new Error("Fixture setup failed.");
      const valid = rowDraft(store, { kind: "action", actionId: "code-review" }, { kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" } });
      const cases: Array<readonly [string, unknown, unknown, string]> = [
        ["malformed draft", { ...valid, unexpected: true }, rowContext(), "ROUTING_INVALID_REQUEST"],
        ["unknown scope", { ...valid, scope: { kind: "action", actionId: "security-review" } }, rowContext(), "ROUTING_UNKNOWN_SCOPE"],
        ["stale revision ID", { ...valid, expectedRevision: { ...valid.expectedRevision, revisionId: "routing-revision-old" } }, rowContext(), "ROUTING_POLICY_CONFLICT"],
        ["stale revision number", { ...valid, expectedRevision: { ...valid.expectedRevision, revisionNumber: 99 } }, rowContext(), "ROUTING_POLICY_CONFLICT"],
        ["stale guard", { ...valid, revisionGuard: "foreign-guard" }, rowContext(), "ROUTING_POLICY_CONFLICT"],
        ["changed registry", valid, rowContext(undefined, "agent-registry/v2"), "ROUTING_POLICY_CONFLICT"],
        ["unavailable primary", valid, rowContext([fact(globalRoute), fact(reviewRoute, { available: false }), fact(weakRoute)]), "ROUTING_ROUTE_UNAVAILABLE"],
        ["ineligible primary", { ...valid, selection: { kind: "route", route: weakRoute, failurePolicy: { kind: "fail_immediately" } } }, rowContext([fact(globalRoute), fact(reviewRoute), fact(weakRoute, { contextWindowTokens: 16_000, tools: false })]), "ROUTING_CAPABILITY_MISMATCH"],
        ["equal explicit fallback", { ...valid, selection: { kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute } } }, rowContext(), "ROUTING_INVALID_HANDOFF_CHAIN"],
        ["equal Global fallback", { ...valid, selection: { kind: "route", route: globalRoute, failurePolicy: { kind: "reroute_global_once" } } }, rowContext(), "ROUTING_INVALID_HANDOFF_CHAIN"],
        ["unavailable fallback", { ...valid, selection: { kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: weakRoute } } }, rowContext([fact(globalRoute), fact(reviewRoute), fact(weakRoute, { available: false })]), "ROUTING_ROUTE_UNAVAILABLE"],
        ["fallback cycle", { ...valid, scope: { kind: "action", actionId: "deep-dive" }, selection: { kind: "route", route: globalRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute } } }, rowContext(), "ROUTING_INVALID_HANDOFF_CHAIN"],
      ];
      const before = JSON.stringify({ policy: store.getCurrentPolicy(), guard: store.getCurrentRevisionGuard(), dependencies: store.listCurrentDependencies() });
      for (const [name, candidate, candidateContext, code] of cases) {
        const result = store.applyRowMutation(candidate as RoutingMatrixRowDraftV1, candidateContext as RoutingMatrixMutationContextV1, settleCandidate);
        expect(result, name).toMatchObject({ ok: false, code });
        expect(JSON.stringify({ policy: store.getCurrentPolicy(), guard: store.getCurrentRevisionGuard(), dependencies: store.listCurrentDependencies() }), name).toBe(before);
      }
    } finally { store.close(); }
  });

  it("rejects an unsettled candidate before revision, dependency, or sequence changes", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      expect(store.applyMutation(mutation([selector({ kind: "global" }, globalRoute)]), context())).toMatchObject({ ok: true });
      const draft = rowDraft(store, { kind: "action", actionId: "code-review" }, {
        kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
      });
      const before = JSON.stringify({
        policy: store.getCurrentPolicy(),
        guard: store.getCurrentRevisionGuard(),
        dependencies: store.listCurrentDependencies(),
        attention: store.listCurrentAttention(),
      });
      expect(store.applyRowMutation(draft, rowContext(), () => null)).toEqual({
        ok: false,
        code: "ROUTING_MATRIX_READ_FAILED",
        message: "Routing matrix could not be read safely.",
      });
      expect(JSON.stringify({
        policy: store.getCurrentPolicy(),
        guard: store.getCurrentRevisionGuard(),
        dependencies: store.listCurrentDependencies(),
        attention: store.listCurrentAttention(),
      })).toBe(before);
      expect(store.applyRowMutation(draft, rowContext(), settleCandidate)).toMatchObject({
        ok: true,
        revision: { revisionId: "routing-revision-2" },
        settlement: true,
      });
    } finally { store.close(); }
  });

  it("validates a row mutation through the exact Save pipeline without writing", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      expect(store.applyMutation(mutation([selector({ kind: "global" }, globalRoute)]), context())).toMatchObject({ ok: true });
      const valid = rowDraft(store, { kind: "action", actionId: "code-review" }, {
        kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
      });
      const before = JSON.stringify({ policy: store.getCurrentPolicy(), guard: store.getCurrentRevisionGuard(), dependencies: store.listCurrentDependencies() });
      expect(store.validateRowMutation(valid, rowContext())).toBeNull();
      expect(store.validateRowMutation({ ...valid, revisionGuard: "stale" }, rowContext())).toMatchObject({ code: "ROUTING_POLICY_CONFLICT" });
      expect(store.validateRowMutation({ ...valid, selection: { kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute } } }, rowContext()))
        .toMatchObject({ code: "ROUTING_INVALID_HANDOFF_CHAIN" });
      expect(JSON.stringify({ policy: store.getCurrentPolicy(), guard: store.getCurrentRevisionGuard(), dependencies: store.listCurrentDependencies() })).toBe(before);
    } finally { store.close(); }
  });

  it("migrates an existing V1 revision schema to a durable revision guard without changing selectors", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-routing-guard-migration-"));
    const path = join(directory, "routing.sqlite");
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(`
        pragma foreign_keys = on;
        create table agent_routing_policy_state (state_id integer primary key check (state_id = 1), current_revision_id text not null, registry_version text not null);
        create table agent_routing_policy_revisions (sequence integer primary key, revision_id text not null unique, registry_version text not null, reason text not null, created_at text not null, actor text, correlation_id text);
        create table agent_routing_policy_selectors (revision_id text not null references agent_routing_policy_revisions(revision_id), scope_key text not null, selector_json text not null, primary key (revision_id, scope_key));
        create table agent_routing_connection_dependencies (revision_id text not null references agent_routing_policy_revisions(revision_id), connection_id text not null, model_id text not null, selector_scope_json text not null, primary key (revision_id, connection_id, model_id, selector_scope_json));
        create table agent_routing_attention (attention_id text primary key, connection_id text not null, model_id text not null, reason_code text not null, revision_id text not null references agent_routing_policy_revisions(revision_id), occurred_at text not null, acknowledged_at text);
      `);
      legacy.prepare("insert into agent_routing_policy_revisions values (?, ?, ?, ?, ?, ?, ?)").run(1, "routing-revision-1", "agent-registry/v1", "bootstrap", now, "operator", null);
      const global = selector({ kind: "global" }, globalRoute);
      legacy.prepare("insert into agent_routing_policy_selectors values (?, ?, ?)").run("routing-revision-1", "global", JSON.stringify(global));
      legacy.prepare("insert into agent_routing_connection_dependencies values (?, ?, ?, ?)").run("routing-revision-1", globalRoute.connectionId, globalRoute.modelId, JSON.stringify(global.scope));
      legacy.prepare("insert into agent_routing_policy_state values (1, ?, ?)").run("routing-revision-1", "agent-registry/v1");
    } finally { legacy.close(); }
    const migrated = new AgentRoutingStore(path);
    try {
      const before = migrated.getCurrentPolicy();
      const guard = migrated.getCurrentRevisionGuard();
      expect(guard).toMatchObject({ revisionId: "routing-revision-1", revisionNumber: 1, registryVersion: "agent-registry/v1" });
      expect(guard?.revisionGuard).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(migrated.getCurrentPolicy()).toEqual(before);
      expect(migrated.applyRowMutation(rowDraft(migrated, { kind: "action_type", actionType: "review" }, { kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" } }), rowContext(), settleCandidate)).toMatchObject({ ok: true });
    } finally { migrated.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it("round-trips row guard and sparse mutation after reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-routing-row-"));
    const path = join(directory, "routing.sqlite");
    const writer = new AgentRoutingStore(path);
    try { expect(writer.applyMutation(mutation([selector({ kind: "global" }, globalRoute)]), context())).toMatchObject({ ok: true }); } finally { writer.close(); }
    const reader = new AgentRoutingStore(path);
    try {
      expect(reader.getCurrentRevisionGuard()).toMatchObject({ revisionNumber: 1, revisionId: "routing-revision-1" });
      expect(reader.applyRowMutation(rowDraft(reader, { kind: "action_type", actionType: "review" }, { kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" } }), rowContext(), settleCandidate)).toMatchObject({ ok: true });
      expect(reader.getCurrentRevisionGuard()).toMatchObject({ revisionNumber: 2, revisionId: "routing-revision-2" });
    } finally { reader.close(); }
    const reopened = new AgentRoutingStore(path);
    try {
      expect(reopened.getCurrentPolicy()?.selectors.map((entry) => selectorScopeKey(entry.scope))).toEqual(["action_type:review", "global"]);
      expect(reopened.getCurrentRevisionGuard()?.revisionNumber).toBe(2);
    } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["a mismatched state registry version", "update agent_routing_policy_state set registry_version = 'agent-registry/v2' where state_id = 1"],
    ["a blank state registry version", "update agent_routing_policy_state set registry_version = '' where state_id = 1"],
    ["an untrimmed state registry version", "update agent_routing_policy_state set registry_version = ' agent-registry/v1' where state_id = 1"],
    ["an over-bound state registry version", `update agent_routing_policy_state set registry_version = '${"x".repeat(257)}' where state_id = 1`],
    ["a missing state revision", "update agent_routing_policy_state set current_revision_id = 'routing-revision-missing' where state_id = 1"],
    ["a blank state revision", "update agent_routing_policy_state set current_revision_id = '' where state_id = 1"],
  ])("rejects %s before returning or writing a revision", (_name, corruptionSql) => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-agent-routing-corrupt-"));
    const path = join(directory, "routing.sqlite");
    const writer = new AgentRoutingStore(path);
    try { expect(writer.applyMutation(mutation(initialSelectors()), context())).toMatchObject({ ok: true }); } finally { writer.close(); }
    const corrupter = new DatabaseSync(path);
    try { corrupter.exec(corruptionSql); } finally { corrupter.close(); }
    const reader = new AgentRoutingStore(path);
    try {
      expect(() => reader.getCurrentPolicy()).toThrow("Stored routing policy contract is invalid.");
      expect(() => reader.applyMutation(mutation(initialSelectors(), "routing-revision-1", "operator_mutation"), context())).toThrow("Stored routing policy contract is invalid.");
    } finally { reader.close(); }
    const verifier = new DatabaseSync(path);
    try {
      expect(verifier.prepare("select count(*) as count from agent_routing_policy_revisions").get()).toEqual({ count: 1 });
      expect(verifier.prepare("select count(*) as count from agent_routing_connection_dependencies").get()).toEqual({ count: 2 });
      expect(verifier.prepare("select count(*) as count from agent_routing_attention").get()).toEqual({ count: 0 });
    } finally {
      verifier.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["an absent route list", undefined],
    ["a null route list", null],
    ["a non-array route list", { connectionId: "connection-review", modelId: "review-model" }],
    ["a route with an extra field", [{ ...reviewRoute, unexpected: true }]],
    ["a route missing modelId", [{ connectionId: "connection-review" }]],
    ["a blank route field", [{ connectionId: "connection-review", modelId: "" }]],
    ["an untrimmed route field", [{ connectionId: " connection-review", modelId: "review-model" }]],
    ["an over-bound route field", [{ connectionId: "connection-review", modelId: "x".repeat(513) }]],
  ])("rejects %s without changing policy, dependencies, or attention", (_name, unavailableRoutes) => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const seeded = store.applyMutation(mutation(initialSelectors()), context());
      if (!seeded.ok) throw new Error("Fixture setup failed.");
      const before = JSON.stringify({ policy: store.getCurrentPolicy(), dependencies: store.listCurrentDependencies(), attention: store.listCurrentAttention() });
      expect(store.resetUnavailableRoutes("agent-registry/v1", unavailableRoutes as unknown as readonly RouteIdentityV1[], "catalog_unavailable", "2026-07-23T03:01:00.000Z"))
        .toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      expect(JSON.stringify({ policy: store.getCurrentPolicy(), dependencies: store.listCurrentDependencies(), attention: store.listCurrentAttention() })).toBe(before);
    } finally { store.close(); }
  });

  it("accepts an empty exact route list without writing", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const seeded = store.applyMutation(mutation(initialSelectors()), context());
      if (!seeded.ok) throw new Error("Fixture setup failed.");
      const before = JSON.stringify(store.getCurrentPolicy());
      expect(store.resetUnavailableRoutes("agent-registry/v1", [], "catalog_unavailable", "2026-07-23T03:01:00.000Z")).toBeNull();
      expect(JSON.stringify(store.getCurrentPolicy())).toBe(before);
    } finally { store.close(); }
  });

  it("resets only affected non-global policies, records attention, and blocks Global deletion", () => {
    const store = AgentRoutingStore.createInMemory();
    try {
      const seeded = store.applyMutation(mutation(initialSelectors()), context());
      if (!seeded.ok) throw new Error("Fixture setup failed.");
      const reset = store.resetUnavailableRoutes("agent-registry/v1", [reviewRoute], "catalog_unavailable", "2026-07-23T03:01:00.000Z");
      expect(reset?.ok).toBe(true);
      expect(store.getCurrentPolicy()?.selectors.some((entry) => entry.scope.kind === "action")).toBe(false);
      expect(store.listCurrentDependencies()).toHaveLength(1);
      const attention = store.listCurrentAttention();
      expect(attention).toMatchObject([{ connectionId: "connection-review", modelId: "review-model", acknowledgedAt: null }]);
      expect(store.acknowledgeAttention("missing-attention", "2026-07-23T03:02:00.000Z")).toBe(false);
      expect(store.acknowledgeAttention(attention[0]!.attentionId, "2026-07-23T03:02:00.000Z")).toBe(true);
      expect(store.acknowledgeAttention(attention[0]!.attentionId, "2026-07-23T03:03:00.000Z")).toBe(false);
      expect(store.listCurrentAttention()[0]?.acknowledgedAt).toBe("2026-07-23T03:02:00.000Z");
      const guard = store.getCurrentRevisionGuard();
      if (!guard) throw new Error("Missing attention guard fixture.");
      const matrixAcknowledgement = {
        schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
        policyId: ROUTING_MATRIX_POLICY_ID,
        attentionIdentity: {
          attentionId: attention[0]!.attentionId,
          attentionRevisionId: attention[0]!.revisionId,
          affectedRoute: reviewRoute,
        },
        expectedRevision: { revisionId: guard.revisionId, revisionNumber: guard.revisionNumber },
        revisionGuard: guard.revisionGuard,
        acknowledgedAt: "2026-07-23T03:02:00.000Z",
      } as const;
      expect(store.acknowledgeMatrixAttention({} as never)).toEqual({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      expect(store.acknowledgeMatrixAttention(matrixAcknowledgement)).toEqual({ ok: true });
      expect(store.acknowledgeMatrixAttention({ ...matrixAcknowledgement, acknowledgedAt: "2026-07-23T03:03:00.000Z" }))
        .toEqual({ ok: false, code: "ROUTING_ATTENTION_CONFLICT" });
      expect(store.acknowledgeMatrixAttention({ ...matrixAcknowledgement, attentionIdentity: { ...matrixAcknowledgement.attentionIdentity, attentionRevisionId: "foreign-revision" } }))
        .toEqual({ ok: false, code: "ROUTING_ATTENTION_CONFLICT" });
      expect(store.deletionPreflight("connection-global")).toEqual({ canDelete: false, code: "ROUTING_GLOBAL_DELETE_BLOCKED" });
      expect(store.deletionPreflight("connection-review")).toEqual({ canDelete: true, code: null });
    } finally { store.close(); }
  });
});
