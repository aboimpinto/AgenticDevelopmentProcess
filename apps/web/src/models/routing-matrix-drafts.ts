import {
  ROUTING_MATRIX_SCHEMA_VERSION,
  type FailurePolicyV1,
  type RouteIdentityV1,
  type RoutingMatrixPreviewV1,
  type RoutingMatrixRowDraftV1,
  type RoutingMatrixRowV1,
  type RoutingMatrixSnapshotV1,
} from "@hepha/shared";
import { routeIdentityKey } from "./routing-matrix-presentation.js";

export type RoutingDraftFailureMode = FailurePolicyV1["kind"];
export type RoutingDraftIssue = "route_unavailable" | "fallback_unavailable" | "scope_removed" | "conflict" | "validation" | null;

export interface RoutingMatrixDraftState {
  readonly scopeKey: string;
  readonly selectedRoute: RouteIdentityV1 | null;
  readonly failureMode: RoutingDraftFailureMode;
  readonly fallbackRoute: RouteIdentityV1 | null;
  readonly baseline: RoutingMatrixSnapshotV1["policy"];
  readonly preview: RoutingMatrixPreviewV1 | null;
  readonly previewPending: boolean;
  readonly issue: RoutingDraftIssue;
  readonly errorMessage: string | null;
}

export type RoutingMatrixDraftMap = ReadonlyMap<string, RoutingMatrixDraftState>;

/** Creates one local row draft without changing authoritative effective facts. */
export function createRoutingMatrixDraft(row: RoutingMatrixRowV1, snapshot: RoutingMatrixSnapshotV1): RoutingMatrixDraftState {
  const configured = row.configuredFailurePolicy;
  return {
    scopeKey: row.scopeKey,
    selectedRoute: row.configured.kind === "route" ? row.configured.route : null,
    failureMode: configured?.kind ?? "fail_immediately",
    fallbackRoute: configured?.kind === "reroute_route_once" ? configured.fallbackRoute : null,
    baseline: snapshot.policy,
    preview: null,
    previewPending: false,
    issue: null,
    errorMessage: null,
  };
}

/** Builds an authoritative preview request, using a temporary complete policy while fallback choice is pending. */
export function routingMatrixDraftPreviewRequest(row: RoutingMatrixRowV1, draft: RoutingMatrixDraftState): RoutingMatrixRowDraftV1 | null {
  if (draft.selectedRoute !== null && draft.failureMode === "reroute_route_once" && draft.fallbackRoute === null) {
    return routingMatrixDraftRequest(row, { ...draft, failureMode: "fail_immediately" });
  }
  return routingMatrixDraftRequest(row, draft);
}

/** Builds the exact revision-bound request only when the draft is structurally complete. */
export function routingMatrixDraftRequest(row: RoutingMatrixRowV1, draft: RoutingMatrixDraftState): RoutingMatrixRowDraftV1 | null {
  const common = {
    schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
    policyId: draft.baseline.policyId,
    scope: row.scope,
    expectedRevision: { revisionId: draft.baseline.revisionId, revisionNumber: draft.baseline.revisionNumber },
    revisionGuard: draft.baseline.revisionGuard,
  } as const;
  if (draft.selectedRoute === null) return row.kind === "global" ? null : { ...common, selection: { kind: "inherit" } };
  const failurePolicy = failurePolicyFromDraft(draft);
  return failurePolicy === null ? null : { ...common, selection: { kind: "route", route: draft.selectedRoute, failurePolicy } };
}

/** Identifies whether two drafts carry the same operator-selected route and complete failure policy. */
export function routingMatrixDraftValuesEqual(left: RoutingMatrixDraftState, right: RoutingMatrixDraftState): boolean {
  return routeIdentitiesEqual(left.selectedRoute, right.selectedRoute)
    && left.failureMode === right.failureMode
    && routeIdentitiesEqual(left.fallbackRoute, right.fallbackRoute);
}

/** Returns true when a local draft is semantically identical to the authoritative configured row. */
export function routingMatrixDraftMatchesRow(row: RoutingMatrixRowV1, draft: RoutingMatrixDraftState): boolean {
  const configuredRoute = row.configured.kind === "route" ? row.configured.route : null;
  if (!routeIdentitiesEqual(configuredRoute, draft.selectedRoute)) return false;
  if (configuredRoute === null) return true;
  const configuredFailure = row.configuredFailurePolicy;
  if (configuredFailure === null || configuredFailure.kind !== draft.failureMode) return false;
  return configuredFailure.kind !== "reroute_route_once"
    || routeIdentitiesEqual(configuredFailure.fallbackRoute, draft.fallbackRoute);
}

export interface RoutingMatrixSettledDraft {
  readonly scopeKey: string;
  readonly submitted: RoutingMatrixDraftState;
}

/** Rebinds retained drafts to a new authoritative guard and marks disappeared or unsafe values. */
export function reconcileRoutingMatrixDrafts(
  drafts: RoutingMatrixDraftMap,
  snapshot: RoutingMatrixSnapshotV1,
  settled: RoutingMatrixSettledDraft | null = null,
): Map<string, RoutingMatrixDraftState> {
  const rows = routingMatrixRows(snapshot);
  const next = new Map<string, RoutingMatrixDraftState>();
  for (const [scopeKey, draft] of drafts) {
    if (settled?.scopeKey === scopeKey && routingMatrixDraftValuesEqual(draft, settled.submitted)) continue;
    const row = rows.get(scopeKey);
    if (!row) {
      next.set(scopeKey, { ...draft, baseline: snapshot.policy, preview: null, previewPending: false, issue: "scope_removed", errorMessage: "This scope is no longer registered." });
      continue;
    }
    if (routingMatrixDraftMatchesRow(row, draft)) continue;
    const selectedRoute = draft.selectedRoute;
    const selected = selectedRoute === null ? null : row.routeChoices.find((choice) => routeIdentityKey(choice.route) === routeIdentityKey(selectedRoute));
    let issue: RoutingDraftIssue = selected && selected.eligible || selectedRoute === null ? null : "route_unavailable";
    const fallbackRoute = draft.fallbackRoute;
    if (issue === null && draft.failureMode === "reroute_route_once" && fallbackRoute !== null) {
      const fallback = row.routeChoices.find((choice) => routeIdentityKey(choice.route) === routeIdentityKey(fallbackRoute));
      if (!fallback || !fallback.eligible) issue = "fallback_unavailable";
    }
    next.set(scopeKey, { ...draft, baseline: snapshot.policy, preview: null, previewPending: false, issue, errorMessage: null });
  }
  return next;
}

export function routingMatrixRows(snapshot: RoutingMatrixSnapshotV1): ReadonlyMap<string, RoutingMatrixRowV1> {
  return new Map<string, RoutingMatrixRowV1>([
    [snapshot.global.scopeKey, snapshot.global],
    ...snapshot.groups.flatMap((group) => [group.typeDefault, ...group.actions].map((row) => [row.scopeKey, row] as const)),
  ]);
}

function routeIdentitiesEqual(left: RouteIdentityV1 | null, right: RouteIdentityV1 | null): boolean {
  return left === null || right === null
    ? left === right
    : routeIdentityKey(left) === routeIdentityKey(right);
}

function failurePolicyFromDraft(draft: RoutingMatrixDraftState): FailurePolicyV1 | null {
  if (draft.failureMode === "fail_immediately") return { kind: "fail_immediately" };
  if (draft.failureMode === "reroute_global_once") return { kind: "reroute_global_once" };
  return draft.fallbackRoute === null ? null : { kind: "reroute_route_once", fallbackRoute: draft.fallbackRoute };
}
