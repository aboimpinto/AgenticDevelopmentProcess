import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import {
  closeServer,
  createRoutingMatrixSubject,
  globalRoute,
  matrixCatalogFacts,
  matrixNow,
  reviewRoute,
  routeFact,
  rowDraft,
  startRoutingMatrixServer,
  weakRoute,
} from "./support/routing-matrix-fixture.js";

const feature = readFileSync(fileURLToPath(new URL("./feat-070-routing-matrix.feature", import.meta.url)), "utf8");
async function request(baseUrl: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(`${baseUrl}${path}`, body === undefined ? { method } : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("FEAT-070 authoritative routing matrix Gherkin", () => {
  const servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(closeServer)); });

  it("binds the exact eight-scenario backend inventory", () => {
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(8);
    for (const id of ["E011-ROUTE-002", "E011-ROUTE-003", "E011-ROUTE-004", "E011-ROUTE-006", "E011-ROUTE-007", "E011-ROUTE-008", "E011-ROUTE-009", "E011-ROUTE-010", "E011-SAFE-001", "E011-SAFE-002", "E011-PROV-003"]) {
      expect(feature).toContain(`@${id}`);
    }
  });

  it("A Global-only policy projects the complete canonical routing hierarchy", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const before = subject.store.getCurrentRevisionGuard();
    const response = await request(subject.baseUrl, "/api/agent-routing/matrix");
    expect(response.status).toBe(200);
    const matrix = await response.json() as { global: unknown; groups: Array<{ typeDefault: { configured: unknown }; actions: Array<{ configured: unknown }> }> };
    expect(matrix.global).toBeDefined();
    expect(matrix.groups).toHaveLength(5);
    expect(matrix.groups.flatMap((group) => group.actions)).toHaveLength(17);
    expect(matrix.groups.flatMap((group) => [group.typeDefault, ...group.actions]).every((row) => JSON.stringify(row.configured) === JSON.stringify({ kind: "inherit" }))).toBe(true);
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);
  });

  it("Type and action saves project deterministic effective precedence", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const typeSave = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action_type", actionType: "implementation" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }), "PUT");
    expect(typeSave.status).toBe(200);
    const actionSave = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "continue-implementing" }, {
      kind: "route", route: globalRoute, failurePolicy: { kind: "fail_immediately" },
    }), "PUT");
    const matrix = await actionSave.json() as { groups: Array<{ actionType: string; actions: Array<{ scope: { actionId: string }; effectiveRoute: { route: unknown }; policySource: string }> }> };
    const actions = matrix.groups.find((group) => group.actionType === "implementation")!.actions;
    expect(actions).toHaveLength(5);
    expect(actions.find((row) => row.scope.actionId === "start-feature")).toMatchObject({ effectiveRoute: { route: reviewRoute }, policySource: "action_type" });
    expect(actions.find((row) => row.scope.actionId === "continue-implementing")).toMatchObject({ effectiveRoute: { route: globalRoute }, policySource: "action" });
  });

  it("Preview is no-write and Save returns one complete new snapshot", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    });
    const before = JSON.stringify({ guard: subject.store.getCurrentRevisionGuard(), deps: subject.store.listCurrentDependencies(), attention: subject.store.listCurrentAttention() });
    const preview = await request(subject.baseUrl, "/api/agent-routing/matrix/preview", draft);
    expect(preview.status).toBe(200);
    expect(JSON.stringify({ guard: subject.store.getCurrentRevisionGuard(), deps: subject.store.listCurrentDependencies(), attention: subject.store.listCurrentAttention() })).toBe(before);
    const save = await request(subject.baseUrl, "/api/agent-routing/matrix/row", draft, "PUT");
    expect(save.status).toBe(200);
    await expect(save.json()).resolves.toMatchObject({ policy: { revisionId: "routing-revision-2", revisionNumber: 2 }, groups: expect.any(Array) });
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(2);
  });

  it("Unsafe primary routes are explained and rejected without a revision", async () => {
    const catalog = matrixCatalogFacts({ routes: [routeFact(globalRoute), routeFact(reviewRoute), routeFact(weakRoute, { available: false, contextWindowTokens: 16_000, tools: false, api: false })] });
    const subject = await startRoutingMatrixServer(createRoutingMatrixSubject({ catalog })); servers.push(subject.server);
    const matrix = await (await request(subject.baseUrl, "/api/agent-routing/matrix")).json() as { groups: Array<{ actionType: string; actions: Array<{ scope: { actionId: string }; routeChoices: Array<{ route: unknown; reasons: Array<{ code: string }> }> }> }> };
    const weakChoice = matrix.groups.find((group) => group.actionType === "review")!.actions[0]!.routeChoices.find((route) => JSON.stringify(route.route) === JSON.stringify(weakRoute));
    expect(weakChoice?.reasons.map((reason) => reason.code)).toEqual(["route_unavailable", "context_window_too_small", "tools_required", "api_required"]);
    const before = subject.store.getCurrentRevisionGuard();
    const save = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: weakRoute, failurePolicy: { kind: "fail_immediately" },
    }), "PUT");
    expect(save.status).toBe(409);
    await expect(save.json()).resolves.toMatchObject({ error: { code: "ROUTING_ROUTE_UNAVAILABLE" } });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);
  });

  it("Equal and cyclic fallback routes are rejected without a revision", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const equal = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute },
    }), "PUT");
    expect(equal.status).toBe(422);
    const first = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }), "PUT");
    expect(first.status).toBe(200);
    const revision = subject.store.getCurrentRevisionGuard();
    const cyclic = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "deep-dive" }, {
      kind: "route", route: globalRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute },
    }), "PUT");
    expect(cyclic.status).toBe(422);
    await expect(cyclic.json()).resolves.toMatchObject({ error: { code: "ROUTING_INVALID_HANDOFF_CHAIN" } });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(revision);
  });

  it("A newly registered action projects as inherited without a policy migration", async () => {
    const fixtureAction = {
      ...new AgentRegistry().list().find((entry) => entry.actionId === "code-review")!,
      actionId: "security-review",
      label: "Security Review",
      displayOrder: 2,
      promptVersion: "security-review/v1",
    };
    const entries = [...new AgentRegistry().list(), fixtureAction];
    const subject = await startRoutingMatrixServer(createRoutingMatrixSubject({ entries })); servers.push(subject.server);
    const before = subject.store.getCurrentRevisionGuard();
    const matrix = await (await request(subject.baseUrl, "/api/agent-routing/matrix")).json() as { groups: Array<{ actionType: string; actions: Array<{ label: string; configured: unknown; effectiveRoute: { route: unknown } }> }> };
    expect(matrix.groups.find((group) => group.actionType === "review")?.actions.find((action) => action.label === "Security Review"))
      .toMatchObject({ label: "Security Review", configured: { kind: "inherit" }, effectiveRoute: { route: globalRoute } });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);
  });

  it("Friendly labels retain immutable connection and model identity", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "start-feature" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const preview = await (await request(subject.baseUrl, "/api/agent-routing/matrix/preview", draft)).json() as { projectedRow: { effectiveRoute: unknown } };
    expect(preview.projectedRow.effectiveRoute).toMatchObject({ route: reviewRoute, connectionLabel: "OpenAI Work", modelDisplayLabel: "Review Model" });
    const saved = await (await request(subject.baseUrl, "/api/agent-routing/matrix/row", draft, "PUT")).json();
    expect(saved).toMatchObject({ groups: expect.arrayContaining([expect.objectContaining({ actions: expect.arrayContaining([expect.objectContaining({ configured: { kind: "route", route: reviewRoute } })]) })]) });
  });

  it("Failed-catalog reset attention projects the inherited route and safe recovery facts", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }), "PUT");
    subject.service.resetUnavailableRoutes([reviewRoute], "payment_required", "2026-07-25T02:01:00.000Z", "scan-1");
    const matrix = subject.service.getRoutingMatrix();
    if (!matrix.ok) throw new Error("Missing reset matrix.");
    const action = matrix.value.groups.find((group) => group.actionType === "review")!.actions[0]!;
    expect(action).toMatchObject({ configured: { kind: "inherit" }, effectiveRoute: { route: globalRoute }, policySource: "global" });
    const attention = matrix.value.attention[0]!;
    const response = await request(subject.baseUrl, "/api/agent-routing/matrix/attention/acknowledge", {
      schemaVersion: "agent-routing-matrix/v1",
      policyId: "installation-global",
      attentionIdentity: { attentionId: attention.attentionId, attentionRevisionId: attention.attentionRevisionId, affectedRoute: attention.affectedRoute },
      expectedRevision: { revisionId: matrix.value.policy.revisionId, revisionNumber: matrix.value.policy.revisionNumber },
      revisionGuard: matrix.value.policy.revisionGuard,
      acknowledgedAt: "2026-07-25T02:02:00.000Z",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ attention: [{ reasonCode: "payment_required", acknowledgedAt: "2026-07-25T02:02:00.000Z" }] });
    expect(matrixNow).toMatch(/Z$/);
  });
});
