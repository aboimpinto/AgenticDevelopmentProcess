import {
  ROUTING_MATRIX_SCHEMA_VERSION,
  selectorScopeKey,
  type RoutingMatrixAttentionAcknowledgeV1,
  type RoutingMatrixPreviewV1,
  type RoutingMatrixRowDraftV1,
  type RoutingMatrixRowV1,
  type RoutingMatrixSnapshotV1,
} from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutingPolicyPresentationError, routingPolicyApi } from "./routing-policy-api.js";
import { fallbackRoute, globalRoute, implementationRoute, routingMatrixFixture } from "./test-support/routing-matrix-fixture.js";

const snapshot = routingMatrixFixture();
const action = snapshot.groups.find((group) => group.actionType === "review")!.actions[0]!;
const draft: RoutingMatrixRowDraftV1 = {
  schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
  policyId: snapshot.policy.policyId,
  scope: action.scope,
  selection: { kind: "route", route: implementationRoute.route, failurePolicy: { kind: "fail_immediately" } },
  expectedRevision: { revisionId: snapshot.policy.revisionId, revisionNumber: snapshot.policy.revisionNumber },
  revisionGuard: snapshot.policy.revisionGuard,
};
const inheritDraft: RoutingMatrixRowDraftV1 = { ...draft, selection: { kind: "inherit" } };
const fallbackDraft: RoutingMatrixRowDraftV1 = {
  ...draft,
  selection: { kind: "route", route: implementationRoute.route, failurePolicy: { kind: "reroute_route_once", fallbackRoute: fallbackRoute.route } },
};
const preview: RoutingMatrixPreviewV1 = {
  schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
  policyId: snapshot.policy.policyId,
  expectedRevision: draft.expectedRevision,
  revisionGuard: draft.revisionGuard,
  scope: draft.scope,
  scopeKey: selectorScopeKey(draft.scope),
  projectedRow: {
    ...action, configured: { kind: "route", route: implementationRoute.route }, configuredFailurePolicy: { kind: "fail_immediately" },
    policySource: "action", effectiveRoute: implementationRoute, effectiveFailurePolicy: { kind: "fail_immediately" },
  },
  allowedFallbackRoutes: [],
};
const acknowledgement: RoutingMatrixAttentionAcknowledgeV1 = {
  schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
  policyId: snapshot.policy.policyId,
  attentionIdentity: { attentionId: "attention-1", attentionRevisionId: snapshot.policy.revisionId, affectedRoute: globalRoute.route },
  expectedRevision: draft.expectedRevision,
  revisionGuard: draft.revisionGuard,
  acknowledgedAt: "2026-07-25T00:00:02.000Z",
};

const explicitSave = settledSaveSnapshot(draft);
const acknowledgedSnapshot = settledAcknowledgementSnapshot(acknowledgement);

afterEach(() => vi.unstubAllGlobals());

describe("routingPolicyApi", () => {
  it("validates each routing response and sends the documented mutation and acknowledgement requests", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(snapshot, true))
      .mockResolvedValueOnce(response(preview, true))
      .mockResolvedValueOnce(response(explicitSave, true))
      .mockResolvedValueOnce(response(acknowledgedSnapshot, true));
    vi.stubGlobal("fetch", fetch);

    await expect(routingPolicyApi.matrix()).resolves.toEqual(snapshot);
    await expect(routingPolicyApi.preview(draft)).resolves.toEqual(preview);
    await expect(routingPolicyApi.save(draft)).resolves.toEqual(explicitSave);
    await expect(routingPolicyApi.acknowledge(acknowledgement)).resolves.toEqual(acknowledgedSnapshot);

    expect(fetch.mock.calls).toEqual([
      ["/api/agent-routing/matrix", { method: "GET", headers: undefined, body: undefined }],
      ["/api/agent-routing/matrix/preview", request("POST", draft)],
      ["/api/agent-routing/matrix/row", request("PUT", draft)],
      ["/api/agent-routing/matrix/attention/acknowledge", request("POST", acknowledgement)],
    ]);
  });

  it.each([
    ["matrix", () => routingPolicyApi.matrix()],
    ["preview", () => routingPolicyApi.preview(draft)],
    ["save", () => routingPolicyApi.save(draft)],
    ["acknowledge", () => routingPolicyApi.acknowledge(acknowledgement)],
  ])("rejects a malformed successful %s response before a consumer can dereference it", async (_name, invoke) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...snapshot, groups: null }, true)));
    await expect(invoke()).rejects.toEqual(expect.objectContaining({ code: null }));
  });

  it("rejects a preview bound to a different revision even when its standalone shape is valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...preview, revisionGuard: "different-opaque-guard" }, true)));
    await expect(routingPolicyApi.preview(draft)).rejects.toBeInstanceOf(RoutingPolicyPresentationError);
  });

  it("refuses malformed outbound mutation inputs before fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(routingPolicyApi.preview({ ...draft, revisionGuard: "" })).rejects.toEqual(expect.objectContaining({ code: "ROUTING_INVALID_REQUEST" }));
    await expect(routingPolicyApi.save({ ...draft, selection: { kind: "inherit" }, scope: { kind: "global" } })).rejects.toEqual(expect.objectContaining({ code: "ROUTING_INVALID_REQUEST" }));
    await expect(routingPolicyApi.acknowledge({ ...acknowledgement, acknowledgedAt: "not-a-date" })).rejects.toEqual(expect.objectContaining({ code: "ROUTING_INVALID_REQUEST" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains only allowlisted rejection codes and never exposes raw server or transport text", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ error: { code: "ROUTING_POLICY_CONFLICT", message: "private conflict details" } }, false))
      .mockResolvedValueOnce(response({ error: { code: "NOT_REAL", message: "test-secret-never-render" } }, false))
      .mockResolvedValueOnce(response({ error: { code: "ROUTING_POLICY_CONFLICT", message: "private", extra: true } }, false))
      .mockRejectedValueOnce(new Error("private transport detail"));
    vi.stubGlobal("fetch", fetch);

    await expect(routingPolicyApi.save(draft)).rejects.toEqual(expect.objectContaining({ code: "ROUTING_POLICY_CONFLICT", message: "Routing policy data is unavailable. Refresh and try again." }));
    await expect(routingPolicyApi.matrix()).rejects.toEqual(expect.objectContaining({ code: null }));
    await expect(routingPolicyApi.matrix()).rejects.toEqual(expect.objectContaining({ code: null }));
    await expect(routingPolicyApi.matrix()).rejects.toEqual(expect.objectContaining({ code: null }));
  });

  it("rejects malformed successful routing contracts instead of presenting partial policy data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ...snapshot, groups: null }, true)));

    await expect(routingPolicyApi.matrix()).rejects.toBeInstanceOf(RoutingPolicyPresentationError);
  });

  it("normalizes transport and non-JSON response failures to the fixed presentation error", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce(responseJsonFailure(false))
      .mockResolvedValueOnce(responseJsonFailure(true));
    vi.stubGlobal("fetch", fetch);

    await expect(routingPolicyApi.matrix()).rejects.toEqual(expect.objectContaining({ code: null }));
    await expect(routingPolicyApi.matrix()).rejects.toEqual(expect.objectContaining({ code: null }));
    await expect(routingPolicyApi.matrix()).rejects.toEqual(expect.objectContaining({ code: null }));
  });

  it("preserves only a recognized capability rejection code for safe policy presentation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "ROUTING_CAPABILITY_MISMATCH", message: "untrusted server text" } }, false)));

    await expect(routingPolicyApi.save(draft)).rejects.toEqual(expect.objectContaining({
      code: "ROUTING_CAPABILITY_MISMATCH",
      message: "Routing policy data is unavailable. Refresh and try again.",
    }));
  });

  it("does not expose an unrecognized rejection payload to the policy panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "ROUTING_NOT_A_REAL_CODE", message: "feat-061-routing-secret-never-expose" } }, false)));

    await expect(routingPolicyApi.save(draft)).rejects.toEqual(expect.objectContaining({
      code: null,
      message: "Routing policy data is unavailable. Refresh and try again.",
    }));
  });

  it("accepts explicit and Inherit Save responses only when the exact requested row settles in one new revision", async () => {
    const inheritSuccess = settledSaveSnapshot(inheritDraft);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response(explicitSave, true))
      .mockResolvedValueOnce(response(inheritSuccess, true)));

    await expect(routingPolicyApi.save(draft)).resolves.toEqual(explicitSave);
    await expect(routingPolicyApi.save(inheritDraft)).resolves.toEqual(inheritSuccess);
  });

  it.each([
    ["same revision", snapshot],
    ["older revision", { ...settledSaveSnapshot(draft), policy: { ...settledSaveSnapshot(draft).policy, revisionNumber: 0 } }],
    ["revision jump", settledSaveSnapshot(draft, 3)],
    ["unchanged revision ID", { ...explicitSave, policy: { ...explicitSave.policy, revisionId: snapshot.policy.revisionId } }],
    ["unchanged guard", { ...explicitSave, policy: { ...explicitSave.policy, revisionGuard: snapshot.policy.revisionGuard } }],
    ["absent target", { ...explicitSave, groups: explicitSave.groups.filter((group) => group.actionType !== "review") }],
    ["wrong discriminator", settledSaveSnapshot(inheritDraft)],
    ["wrong route", settledSaveSnapshot({ ...draft, selection: { kind: "route", route: globalRoute.route, failurePolicy: { kind: "fail_immediately" } } })],
    ["wrong failure mode", settledSaveSnapshot({ ...draft, selection: { kind: "route", route: implementationRoute.route, failurePolicy: { kind: "reroute_global_once" } } })],
  ])("rejects a standalone-valid Save response with %s", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body, true)));
    await expect(routingPolicyApi.save(draft)).rejects.toEqual(expect.objectContaining({
      code: null,
      message: "Routing policy data is unavailable. Refresh and try again.",
    }));
  });

  it("rejects a Save response whose selected fallback identity differs from the request", async () => {
    const wrongFallback = settledSaveSnapshot({
      ...fallbackDraft,
      selection: { kind: "route", route: implementationRoute.route, failurePolicy: { kind: "reroute_route_once", fallbackRoute: globalRoute.route } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(wrongFallback, true)));
    await expect(routingPolicyApi.save(fallbackDraft)).rejects.toBeInstanceOf(RoutingPolicyPresentationError);
  });

  it("accepts exact acknowledgement settlement and rejects every standalone-valid foreign settlement", async () => {
    const exact = settledAcknowledgementSnapshot(acknowledgement);
    const cases: RoutingMatrixSnapshotV1[] = [
      { ...exact, policy: { ...exact.policy, revisionNumber: 2, revisionId: "routing-revision-2", revisionGuard: "opaque-guard-2" } },
      { ...exact, policy: { ...exact.policy, revisionGuard: "different-guard" } },
      { ...exact, attention: [] },
      settledAcknowledgementSnapshot({ ...acknowledgement, acknowledgedAt: null as unknown as string }),
      settledAcknowledgementSnapshot({ ...acknowledgement, attentionIdentity: { ...acknowledgement.attentionIdentity, attentionRevisionId: "foreign-revision" } }),
      settledAcknowledgementSnapshot({ ...acknowledgement, attentionIdentity: { ...acknowledgement.attentionIdentity, affectedRoute: fallbackRoute.route } }),
      settledAcknowledgementSnapshot({ ...acknowledgement, acknowledgedAt: "2026-07-25T00:00:03.000Z" }),
    ];
    const fetch = vi.fn().mockResolvedValueOnce(response(exact, true));
    cases.forEach((body) => fetch.mockResolvedValueOnce(response(body, true)));
    vi.stubGlobal("fetch", fetch);

    await expect(routingPolicyApi.acknowledge(acknowledgement)).resolves.toEqual(exact);
    for (const _case of cases) await expect(routingPolicyApi.acknowledge(acknowledgement)).rejects.toBeInstanceOf(RoutingPolicyPresentationError);
  });
});

function settledSaveSnapshot(input: RoutingMatrixRowDraftV1, revisionNumber = 2): RoutingMatrixSnapshotV1 {
  const base = routingMatrixFixture(revisionNumber);
  const scopeKey = selectorScopeKey(input.scope);
  const settle = (row: RoutingMatrixRowV1): RoutingMatrixRowV1 => {
    if (row.scopeKey !== scopeKey) return row;
    if (input.selection.kind === "inherit") return { ...row, configured: { kind: "inherit" }, configuredFailurePolicy: null };
    const selection = input.selection;
    const effectiveRoute = row.routeChoices.find((choice) => choice.route.connectionId === selection.route.connectionId && choice.route.modelId === selection.route.modelId)!;
    return {
      ...row,
      configured: { kind: "route", route: selection.route },
      configuredFailurePolicy: selection.failurePolicy,
      effectiveRoute,
      effectiveFailurePolicy: selection.failurePolicy,
      policySource: row.kind === "global" ? "global" : row.kind === "action_type" ? "action_type" : "action",
      eligibility: { eligible: effectiveRoute.eligible, reasons: effectiveRoute.reasons },
    };
  };
  return {
    ...base,
    global: settle(base.global) as typeof base.global,
    groups: base.groups.map((group) => ({
      ...group,
      typeDefault: settle(group.typeDefault) as typeof group.typeDefault,
      actions: group.actions.map((row) => settle(row) as typeof row),
    })),
  };
}

function settledAcknowledgementSnapshot(input: RoutingMatrixAttentionAcknowledgeV1): RoutingMatrixSnapshotV1 {
  return {
    ...snapshot,
    attention: [{
      attentionId: input.attentionIdentity.attentionId,
      attentionRevisionId: input.attentionIdentity.attentionRevisionId,
      affectedRoute: input.attentionIdentity.affectedRoute,
      reasonCode: "catalog_reset",
      occurredAt: "2026-07-25T00:00:01.000Z",
      acknowledgedAt: input.acknowledgedAt,
    }],
  };
}

function request(method: string, body: unknown) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function response(body: unknown, ok: boolean): Response {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}
function responseJsonFailure(ok: boolean): Response {
  return { ok, json: vi.fn().mockRejectedValue(new Error("private response detail")) } as unknown as Response;
}
