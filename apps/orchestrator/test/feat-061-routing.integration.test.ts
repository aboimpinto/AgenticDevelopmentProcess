import { describe, expect, it, vi } from "vitest";
import { AgentRoutingStore } from "@hepha/db";
import { AGENT_ROUTING_SCHEMA_VERSION, type RouteIdentityV1, type RoutingCatalogRouteFactV1 } from "@hepha/shared";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import { RoutingPolicyService } from "../src/agent-routing/routing-policy-service.js";
import { RoutingActionResolver } from "../src/agent-routing/routing-action-resolver.js";

const route = { connectionId: "pi-session", modelId: "catalog-model" } as RouteIdentityV1;
const winningRoute = { connectionId: "pi-session", modelId: "winning-catalog-model" } as RouteIdentityV1;
const reviewRoute = { connectionId: "review-connection", modelId: "review-model" } as RouteIdentityV1;
const knowledgeRoute = { connectionId: "knowledge-connection", modelId: "knowledge-model" } as RouteIdentityV1;
const fact: RoutingCatalogRouteFactV1 = {
  schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
  route,
  connectionActive: true,
  available: true,
  contextWindowTokens: 128_000,
  tools: true,
  api: true,
  reasoning: true,
};

describe("FEAT-061 deterministic registered-action routing", () => {
  it("E011-ROUTE-005: the generic Web resolver bootstraps once from the validated Pi installation default", () => {
    const store = AgentRoutingStore.createInMemory();
    const service = new RoutingPolicyService({ catalogFacts: () => [fact], registry: new AgentRegistry(), store });
    let correlation = 0;
    const resolver = new RoutingActionResolver(service, {
      route,
      now: () => "2026-07-23T04:30:00.000Z",
      createCorrelationId: () => `web-bootstrap-${++correlation}`,
    });
    try {
      expect(resolver.resolvePlan("continue-implementing")).toMatchObject({
        resolvedRoute: { route, policySource: "global", revisionId: "routing-revision-1" },
      });
      expect(resolver.resolvePlan("phase-worker")).toMatchObject({
        resolvedRoute: { route, policySource: "global", revisionId: "routing-revision-1" },
      });
      expect(store.getCurrentPolicy()).toMatchObject({ revisionId: "routing-revision-1" });
      expect(correlation).toBe(1);
    } finally { store.close(); }
  });

  it("E011-ROUTE-001 and E011-ROUTE-005: resolves a valid direct or Pi Session bootstrap through the public non-executing facade", () => {
    const store = AgentRoutingStore.createInMemory();
    const service = new RoutingPolicyService({ catalogFacts: () => [fact], registry: new AgentRegistry(), store });
    try {
      const result = service.resolve({
        actionId: "deep-dive",
        bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "correlation-1" },
      });
      expect(result).toMatchObject({ ok: true, plan: { resolvedRoute: { route, policySource: "global", revisionId: "routing-revision-1" }, steps: [{ kind: "primary", route }] } });
      expect(store.getCurrentPolicy()).toMatchObject({ reason: "bootstrap", correlationId: "correlation-1" });
    } finally { store.close(); }
  });

  it("resolves a concurrent bootstrap conflict through the persisted winning Global plan", () => {
    const store = AgentRoutingStore.createInMemory();
    const winningFact = { ...fact, route: winningRoute };
    const service = new RoutingPolicyService({ catalogFacts: () => [fact, winningFact], registry: new AgentRegistry(), store });
    const originalApplyMutation = store.applyMutation.bind(store);
    const applyMutation = vi.spyOn(store, "applyMutation").mockImplementation((input, context) => {
      const winner = originalApplyMutation({
        ...input,
        selectors: input.selectors.map((entry) => entry.scope.kind === "global"
          ? { ...entry, selector: { kind: "route", route: winningRoute } }
          : entry),
      }, context);
      expect(winner).toMatchObject({ ok: true });
      return { ok: false, code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." };
    });
    try {
      expect(service.resolve({ actionId: "deep-dive", bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "conflict" } })).toMatchObject({
        ok: true,
        plan: { resolvedRoute: { revisionId: "routing-revision-1", route: winningRoute }, steps: [{ kind: "primary", route: winningRoute }] },
      });
      expect(applyMutation).toHaveBeenCalledTimes(1);
    } finally { store.close(); }
  });

  it("E011-ROUTE-002: resolves persisted Action then Action Type then Global selectors through the public service", () => {
    const store = AgentRoutingStore.createInMemory();
    const reviewFact = { ...fact, route: reviewRoute };
    const knowledgeFact = { ...fact, route: knowledgeRoute };
    const service = new RoutingPolicyService({ catalogFacts: () => [fact, reviewFact, knowledgeFact], registry: new AgentRegistry(), store });
    try {
      const bootstrapped = service.resolve({ actionId: "code-review", bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "precedence" } });
      if (!bootstrapped.ok) throw new Error("routing fixture bootstrap failed");
      const policy = store.getCurrentPolicy();
      if (!policy) throw new Error("missing routing policy");
      const typeMutation = service.mutate({
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registryVersion: policy.registryVersion,
        expectedRevisionId: policy.revisionId,
        reason: "operator_mutation",
        occurredAt: "2026-07-23T04:31:00.000Z",
        actor: "test",
        correlationId: "precedence",
        selectors: [...policy.selectors,
          { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action_type", actionType: "review" }, selector: { kind: "route", route: reviewRoute }, failurePolicy: { kind: "reroute_global_once" } },
        ],
      });
      expect(typeMutation).toMatchObject({ ok: true, revision: { revisionId: "routing-revision-2" } });
      expect(service.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: true, plan: { resolvedRoute: { route: reviewRoute, policySource: "action_type" } } });
      const typedPolicy = store.getCurrentPolicy();
      if (!typedPolicy) throw new Error("missing action-type routing policy");
      const actionMutation = service.mutate({
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        registryVersion: typedPolicy.registryVersion,
        expectedRevisionId: typedPolicy.revisionId,
        reason: "operator_mutation",
        occurredAt: "2026-07-23T04:32:00.000Z",
        actor: "test",
        correlationId: "precedence",
        selectors: [...typedPolicy.selectors,
          { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action", actionId: "code-review" }, selector: { kind: "route", route: knowledgeRoute }, failurePolicy: { kind: "fail_immediately" } },
        ],
      });
      expect(actionMutation).toMatchObject({ ok: true, revision: { revisionId: "routing-revision-3" } });
      expect(service.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: true, plan: { resolvedRoute: { route: knowledgeRoute, policySource: "action" } } });
      expect(service.resolve({ actionId: "deep-dive", bootstrap: null })).toMatchObject({ ok: true, plan: { resolvedRoute: { route, policySource: "global" } } });
    } finally { store.close(); }
  });

  it("E011-FAIL-001 through E011-FAIL-005: returns one validated recovery plan without executing it", () => {
    const store = AgentRoutingStore.createInMemory();
    const reviewFact = { ...fact, route: reviewRoute };
    const service = new RoutingPolicyService({ catalogFacts: () => [fact, reviewFact], registry: new AgentRegistry(), store });
    try {
      const bootstrapped = service.resolve({ actionId: "code-review", bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "recovery" } });
      if (!bootstrapped.ok) throw new Error("routing fixture bootstrap failed");
      const policy = store.getCurrentPolicy();
      if (!policy) throw new Error("missing routing policy");
      expect(service.mutate({ schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registryVersion: policy.registryVersion, expectedRevisionId: policy.revisionId, reason: "operator_mutation", occurredAt: "2026-07-23T04:31:00.000Z", actor: "test", correlationId: "recovery", selectors: [...policy.selectors, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action", actionId: "code-review" }, selector: { kind: "route", route: reviewRoute }, failurePolicy: { kind: "reroute_global_once" } }] })).toMatchObject({ ok: true });
      expect(service.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: true, plan: { resolvedRoute: { route: reviewRoute, policySource: "action" }, steps: [{ kind: "primary", route: reviewRoute }, { kind: "recovery", route }] } });
    } finally { store.close(); }
  });

  it("E011-NEST-001 through E011-NEST-004: independently resolves nested action plans without invocation evidence", () => {
    const store = AgentRoutingStore.createInMemory();
    const reviewFact = { ...fact, route: reviewRoute };
    const knowledgeFact = { ...fact, route: knowledgeRoute };
    const service = new RoutingPolicyService({ catalogFacts: () => [fact, reviewFact, knowledgeFact], registry: new AgentRegistry(), store });
    try {
      const bootstrapped = service.resolve({ actionId: "code-review", bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "nested" } });
      if (!bootstrapped.ok) throw new Error("routing fixture bootstrap failed");
      const policy = store.getCurrentPolicy();
      if (!policy) throw new Error("missing routing policy");
      expect(service.mutate({ schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registryVersion: policy.registryVersion, expectedRevisionId: policy.revisionId, reason: "operator_mutation", occurredAt: "2026-07-23T04:31:00.000Z", actor: "test", correlationId: "nested", selectors: [...policy.selectors, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action", actionId: "code-review" }, selector: { kind: "route", route: reviewRoute }, failurePolicy: { kind: "fail_immediately" } }, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action", actionId: "phase-lessons-capture" }, selector: { kind: "route", route: knowledgeRoute }, failurePolicy: { kind: "fail_immediately" } }] })).toMatchObject({ ok: true });
      expect(service.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: true, plan: { resolvedRoute: { action: { actionId: "code-review" }, route: reviewRoute } } });
      expect(service.resolve({ actionId: "phase-lessons-capture", bootstrap: null })).toMatchObject({ ok: true, plan: { resolvedRoute: { action: { actionId: "phase-lessons-capture" }, route: knowledgeRoute } } });
    } finally { store.close(); }
  });

  it("E011-SAFE-002: rejects a cyclic fallback mutation without changing the persisted revision", () => {
    const store = AgentRoutingStore.createInMemory();
    const reviewFact = { ...fact, route: reviewRoute };
    const service = new RoutingPolicyService({ catalogFacts: () => [fact, reviewFact], registry: new AgentRegistry(), store });
    try {
      const bootstrapped = service.resolve({ actionId: "code-review", bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "loop" } });
      if (!bootstrapped.ok) throw new Error("routing fixture bootstrap failed");
      const policy = store.getCurrentPolicy();
      if (!policy) throw new Error("missing routing policy");
      expect(service.mutate({ schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, registryVersion: policy.registryVersion, expectedRevisionId: policy.revisionId, reason: "operator_mutation", occurredAt: "2026-07-23T04:31:00.000Z", actor: "test", correlationId: "loop", selectors: [...policy.selectors, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action", actionId: "code-review" }, selector: { kind: "route", route: reviewRoute }, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute } }] })).toMatchObject({ ok: false, code: "ROUTING_INVALID_HANDOFF_CHAIN" });
      expect(store.getCurrentPolicy()?.revisionId).toBe(policy.revisionId);
    } finally { store.close(); }
  });

  it("E011-SAFE-001: rejects an unavailable stored Global route before returning a dispatch plan", () => {
    const store = AgentRoutingStore.createInMemory();
    let facts: readonly RoutingCatalogRouteFactV1[] = [fact];
    const service = new RoutingPolicyService({ catalogFacts: () => facts, registry: new AgentRegistry(), store });
    try {
      expect(service.resolve({ actionId: "deep-dive", bootstrap: { route, occurredAt: "2026-07-23T04:30:00.000Z", actor: "direct-pi-session", correlationId: "correlation-2" } })).toMatchObject({ ok: true });
      facts = [{ ...fact, available: false }];
      expect(service.resolve({ actionId: "deep-dive", bootstrap: null })).toEqual({
        ok: false,
        code: "ROUTING_GLOBAL_UNAVAILABLE",
        message: "Global Default route is unavailable and must be replaced.",
      });
    } finally { store.close(); }
  });
});
