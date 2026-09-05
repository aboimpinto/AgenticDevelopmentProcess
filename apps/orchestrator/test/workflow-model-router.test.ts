import { describe, expect, it } from "vitest";
import { AgentRoutingStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
} from "@hepha/shared";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import { RoutingActionResolver } from "../src/agent-routing/routing-action-resolver.js";
import { RoutingPolicyService } from "../src/agent-routing/routing-policy-service.js";

const route = { connectionId: "pi-session", modelId: "catalog-model" } as RouteIdentityV1;
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

function createResolver(facts: readonly RoutingCatalogRouteFactV1[] = [fact]) {
  const store = AgentRoutingStore.createInMemory();
  const service = new RoutingPolicyService({ catalogFacts: () => facts, registry: new AgentRegistry(), store });
  service.resolve({
    actionId: "code-review",
    bootstrap: { route, occurredAt: "2026-07-23T05:30:00.000Z", actor: "test", correlationId: "router-suite" },
  });
  return { resolver: new RoutingActionResolver(service), service, store };
}

describe("workflow model router", () => {
  it("resolves exact, label, containing, and family aliases only when authenticated", () => {
    const { resolver, store } = createResolver();
    try {
      expect(resolver.resolvePlan("code-review").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(() => resolver.resolvePlan("not-a-model" as never)).toThrow("ROUTING_UNKNOWN_ACTION");
      expect(resolver.resolvePlan("code-review").resolvedRoute.route).toEqual(route);
      expect(resolver.resolvePlan("code-review").resolvedRoute.action.actionId).toBe("code-review");
    } finally { store.close(); }
  });

  it("selects configured routes before authenticated family fallbacks", () => {
    const { resolver, store } = createResolver();
    try {
      expect(resolver.resolvePlan("ui-requirement-evaluation").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("code-review").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("submit-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("code-review").steps).toHaveLength(1);
    } finally { store.close(); }
  });

  it("reports provider-specific authentication gaps", () => {
    const unavailable = { ...fact, available: false };
    const { service, store } = createResolver([unavailable]);
    try {
      expect(service.resolve({ actionId: "code-review", bootstrap: null })).toMatchObject({ ok: false, code: "ROUTING_BOOTSTRAP_REQUIRED" });
      expect(service.resolve({ actionId: "not-registered", bootstrap: null })).toMatchObject({ ok: false, code: "ROUTING_UNKNOWN_ACTION" });
      expect(service.resolve({ actionId: "code-review", bootstrap: null })).not.toHaveProperty("plan");
    } finally { store.close(); }
  });

  it("requires configured workflow models and formats their display label", () => {
    const { resolver, store } = createResolver();
    try {
      expect(resolver.resolvePlan("design-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("complete-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.formatLabel("catalog-model")).toBe("catalog-model");
      expect(resolver.resolvePlan("design-feature").resolvedRoute.action.roleId).toBe("ux-design-agent");
    } finally { store.close(); }
  });

  it("reads every implementation-loop route from the workflow definition", () => {
    const { resolver, store } = createResolver();
    try {
      expect([
        "start-feature", "phase-worker", "resolve-review-findings", "code-review", "workflow-recovery",
      ].map((actionId) => resolver.resolvePlan(actionId).resolvedRoute.route.modelId))
        .toEqual(Array(5).fill("catalog-model"));
    } finally { store.close(); }
  });

  it("selects a transition override before the node fallback", () => {
    const { resolver, store } = createResolver();
    try {
      expect(resolver.resolvePlan("start-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("continue-implementing").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("resolve-review-findings").resolvedRoute.action.actionType).toBe("implementation");
      expect(resolver.resolvePlan("code-review").resolvedRoute.policySource).toBe("global");
    } finally { store.close(); }
  });
});
