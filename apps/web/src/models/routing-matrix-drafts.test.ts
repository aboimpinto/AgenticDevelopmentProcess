import { describe, expect, it } from "vitest";
import {
  createRoutingMatrixDraft,
  reconcileRoutingMatrixDrafts,
  routingMatrixDraftMatchesRow,
  routingMatrixDraftPreviewRequest,
  routingMatrixDraftRequest,
  routingMatrixDraftValuesEqual,
  routingMatrixRows,
} from "./routing-matrix-drafts.js";
import { fallbackRoute, globalRoute, implementationRoute, routingMatrixFixture } from "./test-support/routing-matrix-fixture.js";

const snapshot = routingMatrixFixture();
const implementation = snapshot.groups.find((group) => group.actionType === "implementation")!;
const start = implementation.actions[0]!;
const continuation = implementation.actions[1]!;

describe("routing matrix row drafts", () => {
  it("indexes every authoritative row without synthesizing hierarchy", () => {
    const rows = routingMatrixRows(snapshot);
    expect(rows.size).toBe(23);
    expect([...rows.keys()].filter((key) => key.startsWith("action:"))).toHaveLength(17);
  });

  it("builds exact Inherit and complete explicit requests from one stable scope", () => {
    const inherited = createRoutingMatrixDraft(start, snapshot);
    expect(routingMatrixDraftRequest(start, inherited)).toMatchObject({
      policyId: snapshot.policy.policyId, scope: start.scope, selection: { kind: "inherit" },
      expectedRevision: { revisionId: snapshot.policy.revisionId, revisionNumber: 1 }, revisionGuard: snapshot.policy.revisionGuard,
    });

    const explicit = { ...inherited, selectedRoute: implementationRoute.route, failureMode: "reroute_route_once" as const, fallbackRoute: fallbackRoute.route };
    expect(routingMatrixDraftRequest(start, explicit)?.selection).toEqual({ kind: "route", route: implementationRoute.route, failurePolicy: { kind: "reroute_route_once", fallbackRoute: fallbackRoute.route } });
  });

  it("uses a complete temporary policy for authoritative fallback preview but blocks incomplete Save", () => {
    const draft = { ...createRoutingMatrixDraft(start, snapshot), selectedRoute: implementationRoute.route, failureMode: "reroute_route_once" as const, fallbackRoute: null };
    expect(routingMatrixDraftRequest(start, draft)).toBeNull();
    expect(routingMatrixDraftPreviewRequest(start, draft)?.selection).toEqual({ kind: "route", route: implementationRoute.route, failurePolicy: { kind: "fail_immediately" } });
  });

  it("reconciles a new revision by clearing only the saved scope and preserving another draft", () => {
    const submitted = { ...createRoutingMatrixDraft(start, snapshot), selectedRoute: implementationRoute.route };
    const other = { ...createRoutingMatrixDraft(continuation, snapshot), selectedRoute: fallbackRoute.route };
    const drafts = new Map([[start.scopeKey, submitted], [continuation.scopeKey, other]]);
    const reconciled = reconcileRoutingMatrixDrafts(drafts, routingMatrixFixture(2), { scopeKey: start.scopeKey, submitted });
    expect(reconciled.has(start.scopeKey)).toBe(false);
    expect(reconciled.get(continuation.scopeKey)).toMatchObject({ selectedRoute: fallbackRoute.route, baseline: { revisionNumber: 2 }, issue: null });

    const newerSameScope = { ...submitted, selectedRoute: fallbackRoute.route };
    const retained = reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, newerSameScope]]), routingMatrixFixture(2), { scopeKey: start.scopeKey, submitted });
    expect(retained.get(start.scopeKey)).toMatchObject({ selectedRoute: fallbackRoute.route, baseline: { revisionNumber: 2 } });
  });

  it("retains disappeared and newly unavailable draft values with explicit refusal state", () => {
    const primaryDraft = { ...createRoutingMatrixDraft(start, snapshot), selectedRoute: implementationRoute.route };
    const withoutScope = { ...routingMatrixFixture(2), groups: snapshot.groups.filter((group) => group.actionType !== "implementation") };
    expect(reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, primaryDraft]]), withoutScope).get(start.scopeKey)).toMatchObject({ issue: "scope_removed", preview: null });

    const missingPrimary = withChoices(routingMatrixFixture(2), start.scopeKey, [globalRoute, fallbackRoute]);
    expect(reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, primaryDraft]]), missingPrimary).get(start.scopeKey)?.issue).toBe("route_unavailable");

    const unavailablePrimary = { ...implementationRoute, availability: "unavailable" as const, eligible: false, reasons: [{ code: "route_unavailable" as const, message: "The connection/model route is unavailable." }] };
    const ineligiblePrimary = withChoices(routingMatrixFixture(2), start.scopeKey, [globalRoute, unavailablePrimary, fallbackRoute]);
    expect(reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, primaryDraft]]), ineligiblePrimary).get(start.scopeKey)?.issue).toBe("route_unavailable");

    const fallbackDraft = { ...primaryDraft, failureMode: "reroute_route_once" as const, fallbackRoute: fallbackRoute.route };
    const missingFallback = withChoices(routingMatrixFixture(2), start.scopeKey, [globalRoute, implementationRoute]);
    expect(reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, fallbackDraft]]), missingFallback).get(start.scopeKey)?.issue).toBe("fallback_unavailable");

    const unavailableFallback = { ...fallbackRoute, availability: "unavailable" as const, eligible: false, reasons: [{ code: "route_unavailable" as const, message: "The connection/model route is unavailable." }] };
    const ineligibleFallback = withChoices(routingMatrixFixture(2), start.scopeKey, [globalRoute, implementationRoute, unavailableFallback]);
    expect(reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, fallbackDraft]]), ineligibleFallback).get(start.scopeKey)?.issue).toBe("fallback_unavailable");

    expect(reconcileRoutingMatrixDrafts(new Map([[start.scopeKey, fallbackDraft]]), routingMatrixFixture(2)).get(start.scopeKey)).toMatchObject({ issue: null, baseline: { revisionNumber: 2 }, preview: null });
  });

  it("classifies route and complete failure-policy equality as semantic cleanliness", () => {
    const inherited = createRoutingMatrixDraft(start, snapshot);
    expect(routingMatrixDraftMatchesRow(start, inherited)).toBe(true);
    expect(routingMatrixDraftMatchesRow(start, { ...inherited, selectedRoute: implementationRoute.route })).toBe(false);

    const explicitRow = {
      ...start,
      configured: { kind: "route" as const, route: implementationRoute.route },
      configuredFailurePolicy: { kind: "reroute_route_once" as const, fallbackRoute: fallbackRoute.route },
    };
    const explicit = createRoutingMatrixDraft(explicitRow, snapshot);
    expect(routingMatrixDraftMatchesRow(explicitRow, explicit)).toBe(true);
    expect(routingMatrixDraftMatchesRow(explicitRow, { ...explicit, failureMode: "reroute_global_once", fallbackRoute: null })).toBe(false);
    expect(routingMatrixDraftMatchesRow(explicitRow, { ...explicit, fallbackRoute: globalRoute.route })).toBe(false);
    expect(routingMatrixDraftValuesEqual(explicit, { ...explicit })).toBe(true);
    expect(routingMatrixDraftValuesEqual(explicit, { ...explicit, fallbackRoute: globalRoute.route })).toBe(false);
  });
});

function withChoices(snapshotValue: ReturnType<typeof routingMatrixFixture>, scopeKey: string, choices: typeof snapshot.global.routeChoices) {
  return {
    ...snapshotValue,
    groups: snapshotValue.groups.map((group) => ({
      ...group,
      actions: group.actions.map((row) => row.scopeKey === scopeKey ? { ...row, routeChoices: choices } : row),
    })),
  };
}
