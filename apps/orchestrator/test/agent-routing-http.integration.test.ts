import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutingMatrixProjector } from "../src/agent-routing/routing-matrix-projector.js";
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

async function request(baseUrl: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(`${baseUrl}${path}`, body === undefined ? { method } : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent routing HTTP public boundary", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it("reads closed registry/policy facts and resolves a server-authoritative effective route", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const matrixResponse = await request(subject.baseUrl, "/api/agent-routing/matrix");
    expect(matrixResponse.status).toBe(200);
    const matrix = await matrixResponse.json() as { policy: { revisionId: string }; groups: Array<{ actions: unknown[] }> };
    expect(matrix.policy.revisionId).toBe("routing-revision-1");
    expect(matrix.groups).toHaveLength(5);
    expect(matrix.groups.flatMap((group) => group.actions)).toHaveLength(17);
    expect(JSON.stringify(matrix)).not.toMatch(/"(?:secretRef|secretValue|secretVersion|vaultRef|token|authorization)"\s*:/i);

    const resolved = await request(subject.baseUrl, "/api/agent-routing/resolve", { actionId: "code-review", bootstrap: null });
    expect(resolved.status).toBe(200);
    await expect(resolved.json()).resolves.toMatchObject({ plan: { resolvedRoute: { route: globalRoute, policySource: "global" } } });
  });

  it("persists a valid revision-aware policy change and returns it through the public read boundary", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const response = await request(subject.baseUrl, "/api/agent-routing/matrix/row", draft, "PUT");
    expect(response.status).toBe(200);
    const saved = await response.json() as { policy: { revisionId: string; revisionNumber: number }; groups: Array<{ actionType: string; actions: Array<{ scope: { actionId: string }; configured: unknown }> }>; revision?: unknown; value?: unknown };
    expect(saved.policy).toMatchObject({ revisionId: "routing-revision-2", revisionNumber: 2 });
    expect(saved.revision).toBeUndefined();
    expect(saved.value).toBeUndefined();
    expect(saved.groups.find((group) => group.actionType === "review")?.actions[0]).toMatchObject({
      scope: { actionId: "code-review" }, configured: { kind: "route", route: reviewRoute },
    });

    const readBack = await request(subject.baseUrl, "/api/agent-routing/matrix");
    expect(readBack.status).toBe(200);
    await expect(readBack.json()).resolves.toMatchObject({ policy: { revisionId: "routing-revision-2", revisionNumber: 2 } });
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(2);
  });

  it("previews a valid Global replacement with an empty fallback list and no durable write", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const draft = rowDraft(subject.store, { kind: "global" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const before = JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    const response = await request(subject.baseUrl, "/api/agent-routing/matrix/preview", draft);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      scopeKey: "global",
      projectedRow: { kind: "global", configured: { kind: "route", route: reviewRoute } },
      allowedFallbackRoutes: [],
    });
    expect(JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    })).toBe(before);
  });

  it("rejects candidate projection before commit with one safe body and unchanged durable state", async () => {
    const projector = new RoutingMatrixProjector();
    const originalProject = projector.project.bind(projector);
    vi.spyOn(projector, "project")
      .mockImplementationOnce(originalProject)
      .mockImplementationOnce(() => { throw new Error("candidate projection failed"); });
    const subject = createRoutingMatrixSubject({ matrixProjector: projector });
    const server = await startRoutingMatrixServer(subject); servers.push(server.server);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const before = JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    const response = await request(server.baseUrl, "/api/agent-routing/matrix/row", draft, "PUT");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ROUTING_MATRIX_READ_FAILED", message: "Routing matrix could not be read safely." },
    });
    expect(JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    })).toBe(before);
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(1);
  });

  it("rejects each stale identity field and a changed registry with no durable write", async () => {
    const cases = [
      ["revision ID", (draft: ReturnType<typeof rowDraft>) => ({ ...draft, expectedRevision: { ...draft.expectedRevision, revisionId: "routing-revision-stale" } }), false],
      ["revision number", (draft: ReturnType<typeof rowDraft>) => ({ ...draft, expectedRevision: { ...draft.expectedRevision, revisionNumber: 99 } }), false],
      ["revision guard", (draft: ReturnType<typeof rowDraft>) => ({ ...draft, revisionGuard: "stale-guard" }), false],
      ["registry version", (draft: ReturnType<typeof rowDraft>) => draft, true],
    ] as const;
    for (const [name, mutateDraft, changeRegistry] of cases) {
      const subject = createRoutingMatrixSubject();
      const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
        kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
      });
      if (changeRegistry) (subject.registry as { version: string }).version = "agent-registry/v2";
      const server = await startRoutingMatrixServer(subject); servers.push(server.server);
      const before = JSON.stringify({
        policy: subject.store.getCurrentPolicy(),
        guard: subject.store.getCurrentRevisionGuard(),
        dependencies: subject.store.listCurrentDependencies(),
        attention: subject.store.listCurrentAttention(),
      });
      const response = await request(server.baseUrl, "/api/agent-routing/matrix/row", mutateDraft(draft), "PUT");
      expect(response.status, name).toBe(409);
      await expect(response.json(), name).resolves.toEqual({
        error: { code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." },
      });
      expect(JSON.stringify({
        policy: subject.store.getCurrentPolicy(),
        guard: subject.store.getCurrentRevisionGuard(),
        dependencies: subject.store.listCurrentDependencies(),
        attention: subject.store.listCurrentAttention(),
      }), name).toBe(before);
    }
  });

  it("rejects malformed/cyclic mutation without a revision and blocks a Global connection deletion", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const before = subject.store.getCurrentRevisionGuard();
    const invalid = await request(subject.baseUrl, "/api/agent-routing/matrix/row", { invalid: true }, "PUT");
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: { code: "ROUTING_INVALID_REQUEST", message: "Routing request is invalid." } });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);

    const cyclic = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute },
    }), "PUT");
    expect(cyclic.status).toBe(422);
    await expect(cyclic.json()).resolves.toMatchObject({ error: { code: "ROUTING_INVALID_HANDOFF_CHAIN" } });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);

    const deletion = await request(subject.baseUrl, `/api/agent-routing/connections/${globalRoute.connectionId}/deletion-preflight`);
    expect(deletion.status).toBe(409);
    await expect(deletion.json()).resolves.toMatchObject({ error: { code: "ROUTING_GLOBAL_DELETE_BLOCKED" } });
  });

  it("rejects an ineligible action route without creating a revision", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const before = subject.store.getCurrentRevisionGuard();
    const response = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: weakRoute, failurePolicy: { kind: "fail_immediately" },
    }), "PUT");
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ROUTING_CAPABILITY_MISMATCH" } });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(1);
  });

  it("resets only unavailable non-Global selectors and presents durable safe attention", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const save = await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }), "PUT");
    expect(save.status).toBe(200);
    expect(subject.service.resetUnavailableRoutes([reviewRoute], "payment_required", "2026-07-25T02:01:00.000Z", "scan-1")).toMatchObject({ ok: true });

    const response = await request(subject.baseUrl, "/api/agent-routing/matrix");
    expect(response.status).toBe(200);
    const matrix = await response.json() as { groups: Array<{ actionType: string; actions: unknown[] }>; attention: unknown[] };
    expect(matrix.groups.find((group) => group.actionType === "review")?.actions[0]).toMatchObject({
      configured: { kind: "inherit" }, effectiveRoute: { route: globalRoute }, policySource: "global",
    });
    expect(matrix.attention).toEqual([expect.objectContaining({ affectedRoute: reviewRoute, reasonCode: "payment_required" })]);
    expect(JSON.stringify(matrix)).not.toMatch(/"(?:secretRef|secretValue|secretVersion|vaultRef|token|authorization)"\s*:/i);
  });

  it("rejects malformed routing path escapes without invoking policy services", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const acknowledge = vi.spyOn(subject.service, "acknowledgeRoutingMatrixAttention");
    const preflight = vi.spyOn(subject.service, "deletionPreflight");
    const removedAcknowledgement = await request(subject.baseUrl, "/api/agent-routing/attention/%E0%A4%A/acknowledge", { acknowledgedAt: matrixNow });
    const deletion = await request(subject.baseUrl, "/api/agent-routing/connections/%E0%A4%A/deletion-preflight");
    expect(removedAcknowledgement.status).toBe(404);
    expect(await removedAcknowledgement.text()).toBe("");
    expect(deletion.status).toBe(400);
    await expect(deletion.json()).resolves.toMatchObject({ error: { code: "ROUTING_INVALID_REQUEST" } });
    expect(acknowledge).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
  });

  it("rejects encoded routing path separators without invoking policy services", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const acknowledge = vi.spyOn(subject.service, "acknowledgeRoutingMatrixAttention");
    const preflight = vi.spyOn(subject.service, "deletionPreflight");
    for (const separator of ["%2F", "%2f", "%5C", "%5c"]) {
      const removedAcknowledgement = await request(subject.baseUrl, `/api/agent-routing/attention/id${separator}other/acknowledge`, { acknowledgedAt: matrixNow });
      const deletion = await request(subject.baseUrl, `/api/agent-routing/connections/id${separator}other/deletion-preflight`);
      expect(removedAcknowledgement.status).toBe(404);
      expect(deletion.status).toBe(400);
      await expect(deletion.json()).resolves.toMatchObject({ error: { code: "ROUTING_INVALID_REQUEST" } });
    }
    expect(acknowledge).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
  });

  it("rejects empty, noncanonical, and partially decoded routing path segments", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const acknowledge = vi.spyOn(subject.service, "acknowledgeRoutingMatrixAttention");
    const preflight = vi.spyOn(subject.service, "deletionPreflight");
    for (const segment of ["", "%20", "id%20", "id%252Fother", "a".repeat(513)]) {
      const removedAcknowledgement = await request(subject.baseUrl, `/api/agent-routing/attention/${segment}/acknowledge`, { acknowledgedAt: matrixNow });
      const deletion = await request(subject.baseUrl, `/api/agent-routing/connections/${segment}/deletion-preflight`);
      expect(removedAcknowledgement.status).toBe(404);
      expect(deletion.status).toBe(400);
      await expect(deletion.json()).resolves.toMatchObject({ error: { code: "ROUTING_INVALID_REQUEST" } });
    }
    expect(acknowledge).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
  });

  it("preserves valid canonical routing path controls", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    expect((await request(subject.baseUrl, "/api/agent-routing/matrix/row", rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }), "PUT")).status).toBe(200);
    expect(subject.service.resetUnavailableRoutes([reviewRoute], "payment_required", "2026-07-25T02:01:00.000Z", "scan-1")).toMatchObject({ ok: true });
    const matrixResult = subject.service.getRoutingMatrix();
    if (!matrixResult.ok) throw new Error("missing matrix attention");
    const attention = matrixResult.value.attention[0];
    if (!attention) throw new Error("missing attention");
    const acknowledgement = await request(subject.baseUrl, "/api/agent-routing/matrix/attention/acknowledge", {
      schemaVersion: "agent-routing-matrix/v1",
      policyId: "installation-global",
      attentionIdentity: {
        attentionId: attention.attentionId,
        attentionRevisionId: attention.attentionRevisionId,
        affectedRoute: attention.affectedRoute,
      },
      expectedRevision: {
        revisionId: matrixResult.value.policy.revisionId,
        revisionNumber: matrixResult.value.policy.revisionNumber,
      },
      revisionGuard: matrixResult.value.policy.revisionGuard,
      acknowledgedAt: "2026-07-25T02:02:00.000Z",
    });
    expect(acknowledgement.status).toBe(200);
    await expect(acknowledgement.json()).resolves.toMatchObject({ attention: [{ acknowledgedAt: "2026-07-25T02:02:00.000Z" }] });
    const deletion = await request(subject.baseUrl, `/api/agent-routing/connections/${globalRoute.connectionId}/deletion-preflight`);
    expect(deletion.status).toBe(409);
    await expect(deletion.json()).resolves.toMatchObject({ error: { code: "ROUTING_GLOBAL_DELETE_BLOCKED" } });
  });

  it("allows safe non-Global deletion and rejects unknown attention acknowledgements", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const deletion = await request(subject.baseUrl, `/api/agent-routing/connections/${reviewRoute.connectionId}/deletion-preflight`);
    expect(deletion.status).toBe(200);
    await expect(deletion.json()).resolves.toMatchObject({ canDelete: true, code: null });

    const acknowledgement = await request(subject.baseUrl, "/api/agent-routing/matrix/attention/acknowledge", {
      schemaVersion: "agent-routing-matrix/v1",
      policyId: "installation-global",
    });
    expect(acknowledgement.status).toBe(400);
    await expect(acknowledgement.json()).resolves.toMatchObject({ error: { code: "ROUTING_INVALID_REQUEST" } });
    expect(subject.store.listCurrentAttention()).toEqual([]);
  });

  it("serializes two revision-bound row saves admitted concurrently so one commits and one conflicts", async () => {
    const subject = createRoutingMatrixSubject();
    let admitted = 0;
    let release!: () => void;
    const bothAdmitted = new Promise<void>((resolve) => { release = resolve; });
    const server = await startRoutingMatrixServer(subject, async (url, method) => {
      if (url.pathname !== "/api/agent-routing/matrix/row" || method !== "PUT") return;
      admitted += 1;
      if (admitted === 2) release();
      await bothAdmitted;
    });
    servers.push(server.server);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const contenders = await Promise.all([
      request(server.baseUrl, "/api/agent-routing/matrix/row", draft, "PUT"),
      request(server.baseUrl, "/api/agent-routing/matrix/row", draft, "PUT"),
    ]);
    expect(admitted).toBe(2);
    expect(contenders.map((response) => response.status).sort()).toEqual([200, 409]);
    const bodies = await Promise.all(contenders.map((response) => response.json())) as Array<{ error?: { code: string }; policy?: { revisionNumber: number } }>;
    expect(bodies).toEqual(expect.arrayContaining([
      expect.objectContaining({ policy: expect.objectContaining({ revisionNumber: 2 }) }),
      expect.objectContaining({ error: { code: "ROUTING_POLICY_CONFLICT", message: "Routing policy changed; refresh and retry the requested update." } }),
    ]));
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(2);
  });

  it("does not claim policy methods or paths outside the closed routing boundary", async () => {
    const subject = await startRoutingMatrixServer(); servers.push(subject.server);
    const unsupportedMethod = await request(subject.baseUrl, "/api/agent-routing/matrix", undefined, "POST");
    const unrelatedPath = await request(subject.baseUrl, "/api/agent-routing/not-a-route");
    const removedPolicy = await request(subject.baseUrl, "/api/agent-routing/policy");
    expect(unsupportedMethod.status).toBe(404);
    expect(unrelatedPath.status).toBe(404);
    expect(removedPolicy.status).toBe(404);
  });
});
