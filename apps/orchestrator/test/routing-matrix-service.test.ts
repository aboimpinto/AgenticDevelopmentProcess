import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROUTING_MATRIX_POLICY_ID,
  ROUTING_MATRIX_SCHEMA_VERSION,
  isRoutingMatrixPreviewV1,
  isRoutingMatrixSnapshotV1,
} from "@hepha/shared";
import { RoutingMatrixProjector } from "../src/agent-routing/routing-matrix-projector.js";
import {
  createRoutingMatrixSubject,
  fallbackRoute,
  globalRoute,
  matrixCatalogFacts,
  matrixNow,
  reviewRoute,
  rowDraft,
  weakRoute,
} from "./support/routing-matrix-fixture.js";

const stores: Array<{ close(): void }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
});

describe("RoutingPolicyService matrix boundary", () => {
  it("projects a Global-only policy into one Global, five type rows, and all 17 action rows without writing", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const before = JSON.stringify(subject.store.getCurrentRevisionGuard());
    const result = subject.service.getRoutingMatrix();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isRoutingMatrixSnapshotV1(result.value)).toBe(true);
    expect(result.value.global).toMatchObject({ configured: { kind: "route", route: globalRoute }, policySource: "global" });
    expect(result.value.groups).toHaveLength(5);
    expect(result.value.groups.flatMap((group) => group.actions)).toHaveLength(17);
    expect(result.value.groups.flatMap((group) => [group.typeDefault, ...group.actions]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ configured: { kind: "inherit" }, policySource: "global" })]));
    expect(JSON.stringify(subject.store.getCurrentRevisionGuard())).toBe(before);
  });

  it("returns the closed bootstrap error instead of guessing a matrix without policy", () => {
    const subject = createRoutingMatrixSubject({ bootstrap: false }); stores.push(subject.store);
    expect(subject.service.getRoutingMatrix()).toEqual({
      ok: false,
      code: "ROUTING_BOOTSTRAP_REQUIRED",
      message: "Global Default is unset and no valid bootstrap route is available.",
    });
  });

  it("previews the exact projected row and fallback refusals without changing revision, dependencies, or attention", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const before = JSON.stringify({
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    const result = subject.service.previewRoutingMatrixRow(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isRoutingMatrixPreviewV1(result.value)).toBe(true);
    expect(result.value.projectedRow).toMatchObject({
      scopeKey: "action:code-review",
      configured: { kind: "route", route: reviewRoute },
      policySource: "action",
    });
    expect(result.value.allowedFallbackRoutes.find((route) => route.route.connectionId === reviewRoute.connectionId))
      .toMatchObject({ eligible: false, reasons: expect.arrayContaining([expect.objectContaining({ code: "same_as_primary" })]) });
    expect(JSON.stringify({
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    })).toBe(before);
  });

  it("previews a Global replacement with no legal fallback classifications and no write", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const before = JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    const result = subject.service.previewRoutingMatrixRow(rowDraft(subject.store, { kind: "global" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isRoutingMatrixPreviewV1(result.value)).toBe(true);
    expect(result.value).toMatchObject({
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

  it("previews non-Global Inherit without fallbacks and rejects malformed Global Inherit or reroute drafts", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const before = JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    const inherited = subject.service.previewRoutingMatrixRow(rowDraft(
      subject.store,
      { kind: "action", actionId: "code-review" },
      { kind: "inherit" },
    ));
    expect(inherited).toMatchObject({
      ok: true,
      value: {
        scopeKey: "action:code-review",
        projectedRow: { configured: { kind: "inherit" } },
        allowedFallbackRoutes: [],
      },
    });
    expect(subject.service.previewRoutingMatrixRow(rowDraft(subject.store, { kind: "global" }, { kind: "inherit" })))
      .toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
    expect(subject.service.previewRoutingMatrixRow(rowDraft(subject.store, { kind: "global" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }))).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
    expect(JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    })).toBe(before);
  });

  it("retains non-Global primary, cycle, and distinct eligible fallback classifications without writing", () => {
    const subject = createRoutingMatrixSubject({ catalog: matrixCatalogFacts({ includeFallback: true }) }); stores.push(subject.store);
    expect(subject.service.saveRoutingMatrixRow(rowDraft(subject.store, { kind: "action", actionId: "deep-dive" }, {
      kind: "route", route: globalRoute,
      failurePolicy: { kind: "reroute_route_once", fallbackRoute: reviewRoute },
    }))).toMatchObject({ ok: true });
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const before = JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    const result = subject.service.previewRoutingMatrixRow(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const classification = (route: typeof globalRoute) => result.value.allowedFallbackRoutes
      .find((choice) => choice.route.connectionId === route.connectionId && choice.route.modelId === route.modelId);
    expect(classification(reviewRoute)).toMatchObject({ eligible: false, reasons: expect.arrayContaining([expect.objectContaining({ code: "same_as_primary" })]) });
    expect(classification(globalRoute)).toMatchObject({ eligible: false, reasons: expect.arrayContaining([expect.objectContaining({ code: "fallback_cycle" })]) });
    expect(classification(fallbackRoute)).toMatchObject({ eligible: true, reasons: [] });
    expect(JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    })).toBe(before);
  });

  it("uses Save-equivalent preview validation for capability refusal with no revision", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const before = subject.store.getCurrentRevisionGuard();
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: weakRoute, failurePolicy: { kind: "fail_immediately" },
    });
    expect(subject.service.previewRoutingMatrixRow(draft)).toMatchObject({ ok: false, code: "ROUTING_CAPABILITY_MISMATCH" });
    expect(subject.service.saveRoutingMatrixRow(draft)).toMatchObject({ ok: false, code: "ROUTING_CAPABILITY_MISMATCH" });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(before);
  });

  it("saves one row atomically and returns the direct complete new snapshot while stale replay conflicts", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const draft = rowDraft(subject.store, { kind: "action_type", actionType: "review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    });
    const saved = subject.service.saveRoutingMatrixRow(draft);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(isRoutingMatrixSnapshotV1(saved.value)).toBe(true);
    expect(saved.value.policy).toMatchObject({ revisionId: "routing-revision-2", revisionNumber: 2 });
    expect(saved.value.groups.find((group) => group.actionType === "review")?.typeDefault)
      .toMatchObject({ configured: { kind: "route", route: reviewRoute }, policySource: "action_type" });
    expect(saved.value.groups.find((group) => group.actionType === "review")?.actions[0])
      .toMatchObject({ configured: { kind: "inherit" }, effectiveRoute: { route: reviewRoute }, policySource: "action_type" });
    expect(subject.service.saveRoutingMatrixRow(draft)).toMatchObject({ ok: false, code: "ROUTING_POLICY_CONFLICT" });
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(2);
  });

  it("rejects a candidate projection failure before commit and preserves the next revision identity", () => {
    const projector = new RoutingMatrixProjector();
    const originalProject = projector.project.bind(projector);
    const project = vi.spyOn(projector, "project");
    project.mockImplementationOnce(originalProject).mockImplementationOnce(() => { throw new Error("candidate projection failed"); });
    const subject = createRoutingMatrixSubject({ matrixProjector: projector }); stores.push(subject.store);
    const draft = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    });
    const before = JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    });
    expect(subject.service.saveRoutingMatrixRow(draft)).toEqual({
      ok: false,
      code: "ROUTING_MATRIX_READ_FAILED",
      message: "Routing matrix could not be read safely.",
    });
    expect(JSON.stringify({
      policy: subject.store.getCurrentPolicy(),
      guard: subject.store.getCurrentRevisionGuard(),
      dependencies: subject.store.listCurrentDependencies(),
      attention: subject.store.listCurrentAttention(),
    })).toBe(before);
    expect(subject.service.saveRoutingMatrixRow(draft)).toMatchObject({
      ok: true,
      value: { policy: { revisionId: "routing-revision-2", revisionNumber: 2 } },
    });
  });

  it("settles a valid Save from one admitted authority snapshot without a post-commit refresh", () => {
    const catalog = matrixCatalogFacts();
    let catalogReads = 0;
    const subject = createRoutingMatrixSubject({
      catalog,
      matrixCatalogFacts: () => {
        catalogReads += 1;
        if (catalogReads > 1) throw new Error("forbidden post-commit refresh");
        return catalog;
      },
    });
    stores.push(subject.store);
    const saved = subject.service.saveRoutingMatrixRow(rowDraft(subject.store, { kind: "action_type", actionType: "review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    }));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(catalogReads).toBe(1);
    expect(isRoutingMatrixSnapshotV1(saved.value)).toBe(true);
    expect(saved.value.policy).toMatchObject({ revisionId: "routing-revision-2", revisionNumber: 2 });
    expect(saved.value.global).toMatchObject({ configured: { kind: "route", route: globalRoute } });
    expect(saved.value.groups.find((group) => group.actionType === "review")?.typeDefault)
      .toMatchObject({ configured: { kind: "route", route: reviewRoute } });
  });

  it("acknowledges attention by exact identity, accepts an exact replay, and rejects a changed replay without a policy revision", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const explicit = rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "reroute_global_once" },
    });
    expect(subject.service.saveRoutingMatrixRow(explicit).ok).toBe(true);
    expect(subject.service.resetUnavailableRoutes([reviewRoute], "payment_required", "2026-07-25T02:01:00.000Z", "scan-1"))
      .toMatchObject({ ok: true });
    const matrix = subject.service.getRoutingMatrix();
    if (!matrix.ok) throw new Error("Missing attention matrix fixture.");
    const attention = matrix.value.attention[0]!;
    const request = {
      schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
      policyId: ROUTING_MATRIX_POLICY_ID,
      attentionIdentity: {
        attentionId: attention.attentionId,
        attentionRevisionId: attention.attentionRevisionId,
        affectedRoute: attention.affectedRoute,
      },
      expectedRevision: { revisionId: matrix.value.policy.revisionId, revisionNumber: matrix.value.policy.revisionNumber },
      revisionGuard: matrix.value.policy.revisionGuard,
      acknowledgedAt: "2026-07-25T02:02:00.000Z",
    } as const;
    const revision = subject.store.getCurrentRevisionGuard();
    expect(subject.service.acknowledgeRoutingMatrixAttention(request)).toMatchObject({ ok: true, value: { attention: [{ acknowledgedAt: request.acknowledgedAt }] } });
    expect(subject.service.acknowledgeRoutingMatrixAttention(request)).toMatchObject({ ok: true });
    expect(subject.service.acknowledgeRoutingMatrixAttention({ ...request, acknowledgedAt: "2026-07-25T02:03:00.000Z" }))
      .toMatchObject({ ok: false, code: "ROUTING_ATTENTION_CONFLICT" });
    expect(subject.store.getCurrentRevisionGuard()).toEqual(revision);
  });

  it.each([
    ["preview", (subject: ReturnType<typeof createRoutingMatrixSubject>) => subject.service.previewRoutingMatrixRow({ schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION })],
    ["save", (subject: ReturnType<typeof createRoutingMatrixSubject>) => subject.service.saveRoutingMatrixRow(null)],
    ["acknowledge", (subject: ReturnType<typeof createRoutingMatrixSubject>) => subject.service.acknowledgeRoutingMatrixAttention({ policyId: ROUTING_MATRIX_POLICY_ID })],
  ])("rejects malformed %s input before a write", (_name, invoke) => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const before = JSON.stringify(subject.store.getCurrentRevisionGuard());
    expect(invoke(subject)).toMatchObject({ ok: false, code: "ROUTING_INVALID_REQUEST" });
    expect(JSON.stringify(subject.store.getCurrentRevisionGuard())).toBe(before);
  });

  it("blocks non-Global edits while Global is unavailable but permits one eligible Global replacement", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const globalFact = subject.catalog.routes.find((fact) => fact.route.connectionId === globalRoute.connectionId);
    if (!globalFact) throw new Error("Missing Global fact fixture.");
    (globalFact as { available: boolean }).available = false;
    expect(subject.service.getRoutingMatrix()).toMatchObject({ ok: true, value: { state: "global_unavailable" } });
    expect(subject.service.previewRoutingMatrixRow(rowDraft(subject.store, { kind: "action", actionId: "code-review" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    }))).toMatchObject({ ok: false, code: "ROUTING_GLOBAL_UNAVAILABLE" });
    const replacement = subject.service.saveRoutingMatrixRow(rowDraft(subject.store, { kind: "global" }, {
      kind: "route", route: reviewRoute, failurePolicy: { kind: "fail_immediately" },
    }));
    expect(replacement).toMatchObject({ ok: true, value: { state: "ready", global: { effectiveRoute: { route: reviewRoute } } } });
    expect(subject.store.getCurrentRevisionGuard()?.revisionNumber).toBe(2);
  });

  it("retains friendly labels beside immutable connection/model identities", () => {
    const subject = createRoutingMatrixSubject(); stores.push(subject.store);
    const matrix = subject.service.getRoutingMatrix();
    if (!matrix.ok) throw new Error("Missing routing matrix fixture.");
    expect(matrix.value.global.effectiveRoute).toMatchObject({
      route: globalRoute,
      connectionLabel: "OpenAI Personal",
      modelDisplayLabel: "Global Model",
    });
    expect(JSON.stringify(matrix.value)).not.toMatch(/"(?:secretRef|secretValue|secretVersion|vaultRef|token|authorization)"\s*:/i);
    expect(matrix.value.policy.policyId).toBe(ROUTING_MATRIX_POLICY_ID);
    expect(matrix.value.schemaVersion).toBe(ROUTING_MATRIX_SCHEMA_VERSION);
    expect(matrixNow).toMatch(/Z$/);
  });
});
