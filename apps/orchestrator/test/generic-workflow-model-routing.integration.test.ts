import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentRoutingStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
} from "@hepha/shared";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import { RoutingPolicyService } from "../src/agent-routing/routing-policy-service.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-workflow-model-routing.feature", import.meta.url)), "utf8");
const agentRuntimeSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/agent-runtime-applications.ts", import.meta.url)),
  "utf8",
);
const actionResolverSource = readFileSync(
  fileURLToPath(new URL("../src/agent-routing/routing-action-resolver.ts", import.meta.url)),
  "utf8",
);
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

describe("generic workflow model routing Gherkin integration", () => {
  it("specifies configuration, normalization, and authentication without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
    expect(feature).toContain("no label alias, workflow model field, or environment default selects a route");
  });

  it("binds Pi workers and implementation workflows to the extracted router", () => {
    const store = AgentRoutingStore.createInMemory();
    const service = new RoutingPolicyService({ catalogFacts: () => [fact], registry: new AgentRegistry(), store });
    try {
      const result = service.resolve({
        actionId: "phase-worker",
        bootstrap: { route, occurredAt: "2026-07-23T05:00:00.000Z", actor: "test", correlationId: "gherkin" },
      });
      expect(result).toMatchObject({ ok: true, plan: { resolvedRoute: { action: { actionId: "phase-worker" }, route } } });
      expect(agentRuntimeSource).toContain("new RoutingPolicyService");
      expect(agentRuntimeSource).toContain("new RoutingActionResolver");
      expect(actionResolverSource).not.toMatch(/DEFAULT_[A-Z_]+_MODEL|process\.env|WorkflowModelRouter/);
    } finally { store.close(); }
  });
});
