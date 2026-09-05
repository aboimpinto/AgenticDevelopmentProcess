import { afterEach, describe, expect, it } from "vitest";
import { AGENT_ROUTING_SCHEMA_VERSION, isRoutingMatrixSnapshotV1 } from "@hepha/shared";
import { RoutingMatrixProjector } from "../src/agent-routing/routing-matrix-projector.js";
import { createRoutingMatrixSubject, globalRoute, matrixCatalogFacts, routeFact } from "./support/routing-matrix-fixture.js";

const stores: Array<{ close(): void }> = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

function projectionInput() {
  const subject = createRoutingMatrixSubject(); stores.push(subject.store);
  const policy = subject.store.getCurrentPolicy();
  const policyIdentity = subject.store.getCurrentRevisionGuard();
  if (!policy || !policyIdentity) throw new Error("Missing projector fixture.");
  return {
    registryVersion: subject.registry.version,
    registry: subject.registry.list(),
    policy,
    policyIdentity,
    catalog: subject.catalog,
    attention: subject.store.listCurrentAttention(),
  };
}

describe("RoutingMatrixProjector", () => {
  it("projects a complete guarded snapshot from independently valid authorities", () => {
    const snapshot = new RoutingMatrixProjector().project(projectionInput());
    expect(isRoutingMatrixSnapshotV1(snapshot)).toBe(true);
    expect(snapshot.groups).toHaveLength(5);
    expect(snapshot.groups.flatMap((group) => group.actions)).toHaveLength(17);
  });

  it.each([
    ["extra outer key", (input: ReturnType<typeof projectionInput>) => ({ ...input, unexpected: true })],
    ["empty registry", (input: ReturnType<typeof projectionInput>) => ({ ...input, registry: [] })],
    ["registry version mismatch", (input: ReturnType<typeof projectionInput>) => ({ ...input, registryVersion: "agent-registry/v2" })],
    ["malformed catalog", (input: ReturnType<typeof projectionInput>) => ({ ...input, catalog: { ...input.catalog, identities: null } })],
    ["foreign attention revision", (input: ReturnType<typeof projectionInput>) => ({ ...input, attention: [{ schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, attentionId: "attention-1", connectionId: globalRoute.connectionId, modelId: globalRoute.modelId, reasonCode: "test", revisionId: "foreign-revision", occurredAt: "2026-07-25T02:00:00.000Z", acknowledgedAt: null }] })],
    ["contradictory inherited failure policy", (input: ReturnType<typeof projectionInput>) => ({ ...input, policy: { ...input.policy, selectors: [...input.policy.selectors, { schemaVersion: AGENT_ROUTING_SCHEMA_VERSION, scope: { kind: "action" as const, actionId: "code-review" }, selector: { kind: "inherit" as const }, failurePolicy: { kind: "reroute_global_once" as const } }] } })],
  ])("fails closed for %s before returning an editable snapshot", (_name, mutate) => {
    expect(() => new RoutingMatrixProjector().project(mutate(projectionInput()))).toThrow("Routing matrix projection failed.");
  });

  it("returns a guarded global_unavailable snapshot so Global replacement remains representable", () => {
    const input = projectionInput();
    const catalog = matrixCatalogFacts({
      routes: input.catalog.routes.map((fact) => fact.route.connectionId === globalRoute.connectionId
        ? routeFact(globalRoute, { available: false })
        : fact),
    });
    const snapshot = new RoutingMatrixProjector().project({ ...input, catalog });
    expect(snapshot.state).toBe("global_unavailable");
    expect(snapshot.global.effectiveRoute).toMatchObject({ availability: "unavailable", eligible: false });
    expect(isRoutingMatrixSnapshotV1(snapshot)).toBe(true);
  });
});
