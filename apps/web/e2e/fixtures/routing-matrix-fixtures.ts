import type { Page } from "@playwright/test";
import {
  selectorScopeKey,
  type AgentActionId,
  type ProviderConnectionId,
  type RoutingMatrixAttentionAcknowledgeV1,
  type RoutingMatrixPreviewV1,
  type RoutingMatrixRouteV1,
  type RoutingMatrixRowDraftV1,
  type RoutingMatrixRowV1,
  type RoutingMatrixSnapshotV1,
} from "@hepha/shared";
import {
  fallbackRoute,
  globalRoute,
  implementationRoute,
  routingMatrixFixture,
} from "../../src/models/test-support/routing-matrix-fixture";
import { installDashboardFixtures } from "./dashboard-fixtures";

export const ROUTING_TEST_SECRET = "feat-070-routing-secret-never-expose";
export const RAW_SERVER_FAILURE = "private routing stack and provider payload";
export const weakRoute: RoutingMatrixRouteV1 = {
  route: { connectionId: "connection-weak" as ProviderConnectionId, modelId: "small-text-model" },
  connectionLabel: "Small Model Team",
  modelDisplayLabel: "Small Text Model",
  availability: "unavailable",
  eligible: false,
  reasons: [
    { code: "route_unavailable", message: "The connection/model route is unavailable." },
    { code: "context_window_too_small", message: "The model context window is too small." },
    { code: "tools_required", message: "Tool support is required." },
    { code: "api_required", message: "API support is required." },
  ],
};

export interface RoutingMatrixBrowserFixture {
  snapshot: RoutingMatrixSnapshotV1;
  matrixBodyOverride: unknown | null;
  matrixGate: Promise<void> | null;
  nextSaveError: { readonly code: string; readonly message: string; readonly status: number } | null;
  readonly previews: RoutingMatrixRowDraftV1[];
  readonly saves: RoutingMatrixRowDraftV1[];
  readonly acknowledgements: RoutingMatrixAttentionAcknowledgeV1[];
  readonly responseBodies: string[];
  readonly requestBodies: string[];
  readonly providerRequests: string[];
}

export function createRoutingMatrixBrowserFixture(snapshot = routingMatrixFixture()): RoutingMatrixBrowserFixture {
  return {
    snapshot,
    matrixBodyOverride: null,
    matrixGate: null,
    nextSaveError: null,
    previews: [],
    saves: [],
    acknowledgements: [],
    responseBodies: [],
    requestBodies: [],
    providerRequests: [],
  };
}

export function withSecurityReview(snapshot: RoutingMatrixSnapshotV1): RoutingMatrixSnapshotV1 {
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => group.actionType !== "review" ? group : {
      ...group,
      actions: [
        ...group.actions,
        {
          ...group.actions[0]!,
          scope: { kind: "action", actionId: "security-review" as AgentActionId },
          scopeKey: "action:security-review",
          label: "Security Review",
          displayOrder: 2,
          promptVersion: "security-review/v1",
        },
      ],
    }),
  };
}

export function withUnsafeCodeReviewChoice(snapshot: RoutingMatrixSnapshotV1): RoutingMatrixSnapshotV1 {
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => group.actionType !== "review" ? group : {
      ...group,
      actions: group.actions.map((row) => row.scopeKey !== "action:code-review" ? row : {
        ...row,
        requirements: { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: false },
        routeChoices: [...row.routeChoices, weakRoute],
      }),
    }),
    connectionStates: [...snapshot.connectionStates, {
      connectionId: weakRoute.route.connectionId,
      label: weakRoute.connectionLabel,
      providerKind: "known",
      scanState: "failed",
      guidanceCode: "scan_failed",
      claimedAt: "2026-07-25T00:00:00.000Z",
      settledAt: "2026-07-25T00:00:01.000Z",
      diagnosticOccurredAt: "2026-07-25T00:00:01.000Z",
      safeMessage: "The model route is unavailable.",
    }],
  };
}

export function withResetAttention(snapshot: RoutingMatrixSnapshotV1): RoutingMatrixSnapshotV1 {
  return {
    ...snapshot,
    attention: [{
      attentionId: "attention-code-review-reset",
      attentionRevisionId: snapshot.policy.revisionId,
      affectedRoute: implementationRoute.route,
      reasonCode: "payment_required",
      occurredAt: "2026-07-25T00:00:02.000Z",
      acknowledgedAt: null,
    }],
  };
}

export async function installRoutingMatrixBrowserFixtures(page: Page, fixture: RoutingMatrixBrowserFixture): Promise<void> {
  await installDashboardFixtures(page, []);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" && url.hostname === "127.0.0.1") return;
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (/(?:provider|openai|deepseek|anthropic|openrouter)/iu.test(url.hostname)) fixture.providerRequests.push(request.url());
  });
  await page.route("**/api/provider-connections", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/api/model-catalog**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ schemaVersion: "model-catalog/v1", models: [] }),
  }));
  await page.route("**/api/agent-routing/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const postData = request.postData();
    if (postData !== null) fixture.requestBodies.push(postData);

    let status = 200;
    let response: unknown;
    if (url.pathname === "/api/agent-routing/matrix" && request.method() === "GET") {
      if (fixture.matrixGate) await fixture.matrixGate;
      response = fixture.matrixBodyOverride ?? fixture.snapshot;
    } else if (url.pathname === "/api/agent-routing/matrix/preview" && request.method() === "POST") {
      const draft = JSON.parse(postData ?? "{}") as RoutingMatrixRowDraftV1;
      fixture.previews.push(draft);
      response = previewFor(fixture.snapshot, draft);
    } else if (url.pathname === "/api/agent-routing/matrix/row" && request.method() === "PUT") {
      const draft = JSON.parse(postData ?? "{}") as RoutingMatrixRowDraftV1;
      fixture.saves.push(draft);
      if (fixture.nextSaveError) {
        const error = fixture.nextSaveError;
        fixture.nextSaveError = null;
        status = error.status;
        response = { error: { code: error.code, message: error.message } };
      } else {
        fixture.snapshot = settleSave(fixture.snapshot, draft);
        response = fixture.snapshot;
      }
    } else if (url.pathname === "/api/agent-routing/matrix/attention/acknowledge" && request.method() === "POST") {
      const input = JSON.parse(postData ?? "{}") as RoutingMatrixAttentionAcknowledgeV1;
      fixture.acknowledgements.push(input);
      fixture.snapshot = {
        ...fixture.snapshot,
        attention: fixture.snapshot.attention.map((item) => item.attentionId === input.attentionIdentity.attentionId
          ? { ...item, acknowledgedAt: input.acknowledgedAt }
          : item),
      };
      response = fixture.snapshot;
    } else {
      status = 404;
      response = { error: { code: "ROUTING_UNKNOWN_SCOPE", message: "Routing scope was not found." } };
    }

    const body = JSON.stringify(response);
    fixture.responseBodies.push(body);
    await route.fulfill({ contentType: "application/json", status, body });
  });
}

export async function openRoutingDefaults(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Models" }).click();
  await page.getByRole("tab", { name: "Routing Defaults" }).click();
}

export function accessibleAttributes(page: Page): Promise<string> {
  return page.locator("[aria-label], [aria-labelledby], [aria-describedby], [title]").evaluateAll((elements) => elements.map((element) => [
    element.getAttribute("aria-label"),
    element.getAttribute("aria-labelledby"),
    element.getAttribute("aria-describedby"),
    element.getAttribute("title"),
  ].join(" ")).join("\n"));
}

function previewFor(snapshot: RoutingMatrixSnapshotV1, draft: RoutingMatrixRowDraftV1): RoutingMatrixPreviewV1 {
  const row = findRow(snapshot, selectorScopeKey(draft.scope));
  if (!row) throw new Error(`Missing deterministic row fixture ${selectorScopeKey(draft.scope)}`);
  const projectedRow = projectRow(row, draft);
  const allowedFallbackRoutes = row.kind === "global" || draft.selection.kind === "inherit" ? [] : row.routeChoices.map((choice) => (
    sameRoute(choice.route, draft.selection.kind === "route" ? draft.selection.route : globalRoute.route)
      ? { ...choice, eligible: false, reasons: [{ code: "same_as_primary" as const, message: "The fallback route must differ from the primary route." }] }
      : choice
  ));
  return {
    schemaVersion: snapshot.schemaVersion,
    policyId: draft.policyId,
    expectedRevision: draft.expectedRevision,
    revisionGuard: draft.revisionGuard,
    scope: draft.scope,
    scopeKey: selectorScopeKey(draft.scope),
    projectedRow,
    allowedFallbackRoutes,
  };
}

function settleSave(snapshot: RoutingMatrixSnapshotV1, draft: RoutingMatrixRowDraftV1): RoutingMatrixSnapshotV1 {
  const revisionNumber = snapshot.policy.revisionNumber + 1;
  const targetKey = selectorScopeKey(draft.scope);
  const update = (row: RoutingMatrixRowV1): RoutingMatrixRowV1 => row.scopeKey === targetKey ? projectRow(row, draft) : row;
  let groups = snapshot.groups.map((group) => ({
    ...group,
    typeDefault: update(group.typeDefault) as typeof group.typeDefault,
    actions: group.actions.map((row) => update(row) as typeof row),
  }));
  if (draft.scope.kind === "action_type" && draft.selection.kind === "route") {
    const selected = findRoute(findRow(snapshot, targetKey)!, draft.selection.route);
    groups = groups.map((group) => group.actionType !== draft.scope.actionType ? group : ({
      ...group,
      actions: group.actions.map((row) => row.configured.kind === "route" ? row : ({
        ...row,
        effectiveRoute: selected,
        effectiveFailurePolicy: draft.selection.kind === "route" ? draft.selection.failurePolicy : row.effectiveFailurePolicy,
        policySource: "action_type" as const,
      })),
    }));
  }
  return {
    ...snapshot,
    policy: {
      ...snapshot.policy,
      revisionId: `routing-revision-${revisionNumber}`,
      revisionNumber,
      revisionGuard: `opaque-guard-${revisionNumber}`,
    },
    global: update(snapshot.global) as typeof snapshot.global,
    groups,
  };
}

function projectRow(row: RoutingMatrixRowV1, draft: RoutingMatrixRowDraftV1): RoutingMatrixRowV1 {
  if (draft.selection.kind === "inherit") return row;
  const selected = findRoute(row, draft.selection.route);
  return {
    ...row,
    configured: { kind: "route", route: draft.selection.route },
    configuredFailurePolicy: draft.selection.failurePolicy,
    effectiveRoute: selected,
    effectiveFailurePolicy: draft.selection.failurePolicy,
    policySource: row.kind === "global" ? "global" : row.kind === "action_type" ? "action_type" : "action",
    eligibility: { eligible: selected.eligible, reasons: selected.reasons },
  } as RoutingMatrixRowV1;
}

function findRow(snapshot: RoutingMatrixSnapshotV1, scopeKey: string): RoutingMatrixRowV1 | undefined {
  return snapshot.global.scopeKey === scopeKey
    ? snapshot.global
    : snapshot.groups.flatMap((group) => [group.typeDefault, ...group.actions]).find((row) => row.scopeKey === scopeKey);
}

function findRoute(row: RoutingMatrixRowV1, identity: { readonly connectionId: string; readonly modelId: string }): RoutingMatrixRouteV1 {
  const selected = row.routeChoices.find((choice) => sameRoute(choice.route, identity));
  if (!selected) throw new Error(`Missing deterministic route fixture ${identity.connectionId}/${identity.modelId}`);
  return selected;
}

function sameRoute(left: { readonly connectionId: string; readonly modelId: string }, right: { readonly connectionId: string; readonly modelId: string }): boolean {
  return left.connectionId === right.connectionId && left.modelId === right.modelId;
}

export { fallbackRoute, globalRoute, implementationRoute, routingMatrixFixture };
