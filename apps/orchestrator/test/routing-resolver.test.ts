import { describe, expect, it, vi } from "vitest";
import { AgentRoutingStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
  type RoutingPolicySelectorV1,
} from "@hepha/shared";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import { RoutingResolver } from "../src/agent-routing/routing-resolver.js";
import { RoutingPolicyService } from "../src/agent-routing/routing-policy-service.js";
import { RoutingActionResolver } from "../src/agent-routing/routing-action-resolver.js";

const now = "2026-07-23T04:00:00.000Z";
const globalRoute = { connectionId: "connection-global", modelId: "global-model" } as RouteIdentityV1;
const reviewRoute = { connectionId: "connection-review", modelId: "review-model" } as RouteIdentityV1;
const fallbackRoute = { connectionId: "connection-fallback", modelId: "fallback-model" } as RouteIdentityV1;

function fact(route: RouteIdentityV1, overrides: Partial<RoutingCatalogRouteFactV1> = {}): RoutingCatalogRouteFactV1 {
  return { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, route, connectionActive: true, available: true, contextWindowTokens: 128_000, tools: true, api: true, reasoning: true, ...overrides };
}
function selector(scope: RoutingPolicySelectorV1["scope"], route: RouteIdentityV1, failurePolicy: RoutingPolicySelectorV1["failurePolicy"] = { kind: "fail_immediately" }): RoutingPolicySelectorV1 {
  return { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope, selector: { kind: "route", route }, failurePolicy };
}
function createResolver(facts: readonly RoutingCatalogRouteFactV1[]) {
  const store = AgentRoutingStore.createInMemory();
  return { store, resolver: new RoutingResolver({ catalogFacts: () => facts, registry: new AgentRegistry(), store }) };
}
function bootstrap(route = globalRoute) {
  return { actionId: "code-review", bootstrap: { route, occurredAt: now, actor: "test", correlationId: "routing-resolver" } };
}

describe("RoutingResolver", () => {
  it("atomically bootstraps a Global route and returns a typed primary plan without execution effects", () => {
    const store = AgentRoutingStore.createInMemory();
    const service = new RoutingPolicyService({ catalogFacts: () => [fact(globalRoute)], registry: new AgentRegistry(), store });
    try {
      const result = service.resolve(bootstrap());
      expect(result).toMatchObject({ ok: true, plan: { resolvedRoute: { route: globalRoute, policySource: "global", action: { actionId: "code-review" } }, steps: [{ kind: "primary", route: globalRoute }] } });
      expect(result.ok && result.plan.steps).toHaveLength(1);
      expect(store.getCurrentPolicy()).toMatchObject({ reason: "bootstrap", revisionId: "routing-revision-1" });
    } finally { store.close(); }
  });

  it("resolves a bootstrap conflict through the single persisted winning Global revision", () => {
    const facts = [fact(globalRoute), fact(reviewRoute)];
    const { store, resolver } = createResolver(facts);
    const originalApplyMutation = store.applyMutation.bind(store);
    const applyMutation = vi.spyOn(store, "applyMutation").mockImplementation((input, context) => {
      const winning = originalApplyMutation({
        ...input,
        selectors: input.selectors.map((entry) => entry.scope.kind === "global"
          ? { ...entry, selector: { kind: "route", route: reviewRoute } }
          : entry),
      }, context);
      expect(winning).toMatchObject({ ok: true, revision: { revisionId: "routing-revision-1" } });
      return { ok: false, code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." };
    });
    try {
      expect(resolver.resolve(bootstrap())).toMatchObject({
        ok: true,
        plan: { resolvedRoute: { revisionId: "routing-revision-1", route: reviewRoute }, steps: [{ kind: "primary", route: reviewRoute }] },
      });
      expect(applyMutation).toHaveBeenCalledTimes(1);
      expect(store.getCurrentPolicy()).toMatchObject({
        revisionId: "routing-revision-1",
        selectors: [expect.objectContaining({ scope: { kind: "global" }, selector: { kind: "route", route: reviewRoute } })],
      });
    } finally { store.close(); }
  });

  it("rejects a bootstrap conflict with no readable winning policy without a second mutation or plan", () => {
    const { store, resolver } = createResolver([fact(globalRoute)]);
    const applyMutation = vi.spyOn(store, "applyMutation").mockReturnValue({ ok: false, code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." });
    try {
      expect(resolver.resolve(bootstrap())).toMatchObject({ ok: false, code: "ROUTING_POLICY_CONFLICT" });
      expect(applyMutation).toHaveBeenCalledTimes(1);
      expect(store.getCurrentPolicy()).toBeNull();
    } finally { store.close(); }
  });

  it("rejects an unreadable or registry-mismatched bootstrap conflict reread without mutation or plan", () => {
    const throwing = createResolver([fact(globalRoute)]);
    const throwingApplyMutation = vi.spyOn(throwing.store, "applyMutation").mockReturnValue({ ok: false, code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." });
    const throwingRead = vi.spyOn(throwing.store, "getCurrentPolicy").mockReturnValueOnce(null).mockImplementationOnce(() => { throw new Error("unreadable"); });
    try {
      expect(throwing.resolver.resolve(bootstrap())).toMatchObject({ ok: false, code: "ROUTING_INVALID_POLICY" });
      expect(throwingApplyMutation).toHaveBeenCalledTimes(1);
      expect(throwingRead).toHaveBeenCalledTimes(2);
    } finally { throwing.store.close(); }

    const mismatch = createResolver([fact(globalRoute)]);
    const mismatchSeed = mismatch.store.applyMutation({
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registryVersion: "agent-registry/v2", expectedRevisionId: null, reason: "bootstrap", occurredAt: now, actor: "test", correlationId: "winner",
      selectors: [selector({ kind: "global" }, globalRoute)],
    }, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registry: new AgentRegistry().list(), routes: [fact(globalRoute)] });
    expect(mismatchSeed).toMatchObject({ ok: true });
    const mismatchPolicy = mismatch.store.getCurrentPolicy();
    const mismatchApplyMutation = vi.spyOn(mismatch.store, "applyMutation").mockReturnValue({ ok: false, code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." });
    const mismatchRead = vi.spyOn(mismatch.store, "getCurrentPolicy").mockReturnValueOnce(null).mockReturnValueOnce(mismatchPolicy);
    try {
      expect(mismatch.resolver.resolve(bootstrap())).toMatchObject({ ok: false, code: "ROUTING_INVALID_POLICY" });
      expect(mismatchApplyMutation).toHaveBeenCalledTimes(1);
      expect(mismatchRead).toHaveBeenCalledTimes(2);
    } finally { mismatch.store.close(); }
  });

  it("resolves Action then Action Type then Global deterministically and returns one validated recovery hop", () => {
    const facts = [fact(globalRoute), fact(reviewRoute), fact(fallbackRoute)];
    const { store, resolver } = createResolver(facts);
    try {
      const seeded = store.applyMutation({
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registryVersion: "agent-registry/v1", expectedRevisionId: null, reason: "bootstrap", occurredAt: now, actor: "test", correlationId: "seed",
        selectors: [
          selector({ kind: "global" }, globalRoute),
          { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action_type", actionType: "review" }, selector: { kind: "route", route: reviewRoute }, failurePolicy: { kind: "reroute_global_once" } },
          selector({ kind: "action", actionId: "code-review" }, fallbackRoute, { kind: "reroute_route_once", fallbackRoute: reviewRoute }),
        ],
      }, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registry: new AgentRegistry().list(), routes: facts });
      expect(seeded).toMatchObject({ ok: true });
      const first = resolver.resolve({ actionId: "code-review", bootstrap: null });
      const second = resolver.resolve({ actionId: "code-review", bootstrap: null });
      expect(first).toEqual(second);
      expect(first).toMatchObject({ ok: true, plan: { resolvedRoute: { policySource: "action", route: fallbackRoute }, steps: [{ kind: "primary", route: fallbackRoute }, { kind: "recovery", route: reviewRoute }] } });
    } finally { store.close(); }
  });

  it("rejects unknown actions, missing bootstrap context, unavailable Global routes, and insufficient capabilities before producing a plan", () => {
    const missing = createResolver([fact(globalRoute)]);
    try {
      expect(missing.resolver.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: false, code: "ROUTING_BOOTSTRAP_REQUIRED" });
      expect(missing.resolver.resolve({ actionId: "not-registered", bootstrap: null })).toMatchObject({ ok: false, code: "ROUTING_UNKNOWN_ACTION" });
    } finally { missing.store.close(); }
    let currentFacts = [fact(globalRoute)];
    const unavailableStore = AgentRoutingStore.createInMemory();
    const unavailable = new RoutingResolver({ catalogFacts: () => currentFacts, registry: new AgentRegistry(), store: unavailableStore });
    try {
      expect(unavailable.resolve(bootstrap())).toMatchObject({ ok: true });
      currentFacts = [fact(globalRoute, { available: false })];
      expect(unavailable.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: false, code: "ROUTING_GLOBAL_UNAVAILABLE" });
    } finally { unavailableStore.close(); }
    const weak = createResolver([fact(globalRoute, { contextWindowTokens: 32_000, tools: false })]);
    try { expect(weak.resolver.resolve(bootstrap())).toMatchObject({ ok: false, code: "ROUTING_CAPABILITY_MISMATCH" }); } finally { weak.store.close(); }
  });

  it("maps named caller actions through the typed policy plan without static defaults", () => {
    const store = AgentRoutingStore.createInMemory();
    const service = new RoutingPolicyService({ catalogFacts: () => [fact(globalRoute)], registry: new AgentRegistry(), store });
    const actions = new RoutingActionResolver(service);
    try {
      expect(actions.getStartImplementationDefaultForDisplay()).toBeNull();
      expect(service.resolve(bootstrap())).toMatchObject({ ok: true });
      expect(actions.resolvePlan("code-review")).toMatchObject({ resolvedRoute: { action: { actionId: "code-review" }, route: globalRoute } });
      expect(actions.getStartImplementationDefaultForDisplay()).toBe(globalRoute.modelId);
      expect(actions.resolvePlan("code-review").resolvedRoute.route).toEqual(globalRoute);
      expect(actions.resolvePlan("phase-worker").resolvedRoute.route).toEqual(globalRoute);
      expect(actions.resolvePlan("resolve-review-findings").resolvedRoute.route).toEqual(globalRoute);
    } finally { store.close(); }
  });

  it("rejects malformed resolution input without bootstrapping or returning a plan", () => {
    const { store, resolver } = createResolver([fact(globalRoute)]);
    try {
      expect(resolver.resolve({ actionId: "code-review", bootstrap: { route: globalRoute } })).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      expect(store.getCurrentPolicy()).toBeNull();
    } finally { store.close(); }
  });

  it("rejects duplicate or malformed catalog facts before reading or mutating policy", () => {
    const store = AgentRoutingStore.createInMemory();
    const getCurrentPolicy = vi.spyOn(store, "getCurrentPolicy");
    const catalogFacts = vi.fn()
      .mockReturnValueOnce([fact(globalRoute), fact(globalRoute)])
      .mockReturnValueOnce([{ ...fact(globalRoute), tools: "yes" }]);
    const resolver = new RoutingResolver({ catalogFacts, registry: new AgentRegistry(), store });
    try {
      expect(resolver.resolve(bootstrap())).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      expect(resolver.resolve(bootstrap())).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
      expect(getCurrentPolicy).not.toHaveBeenCalled();
      expect(store.getCurrentPolicy()).toBeNull();
    } finally { store.close(); }
  });
});
