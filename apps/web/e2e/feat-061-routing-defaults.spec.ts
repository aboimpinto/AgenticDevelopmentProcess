/**
 * FEAT-061 Routing Defaults regression journeys migrated to the closed V1
 * matrix transport by FEAT-070. Fixtures never contact providers or Pi.
 *
 * @see apps/web/e2e/features/feat-061-routing-defaults.feature
 */
import { expect, test, type Page } from "@playwright/test";
import { installDashboardFixtures } from "./fixtures/dashboard-fixtures";

const SCHEMA = "agent-routing-matrix/v1";
const FIXTURE_TIME = "2026-07-23T05:00:00.000Z";
const TEST_SECRET = "feat-061-routing-secret-never-expose";
const globalIdentity = { connectionId: "global-connection", modelId: "global-model" };
const reviewIdentity = { connectionId: "review-connection", modelId: "review-model" };
const smallIdentity = { connectionId: "small-connection", modelId: "small-model" };
const requirements = { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: false };
const globalRoute = matrixRoute(globalIdentity, "OpenAI Personal");
const reviewRoute = matrixRoute(reviewIdentity, "Review Team");
const smallRoute = matrixRoute(smallIdentity, "Small Model Team", [
  ["context_window_too_small", "The model context window is too small."],
  ["tools_required", "Tool support is required."],
  ["api_required", "API support is required."],
]);

type RoutingFixture = { readonly responseBodies: string[]; readonly updates: unknown[]; attentionAcknowledgedAt: string | null };

function matrixRoute(route: typeof globalIdentity, connectionLabel: string, reasons: ReadonlyArray<readonly [string, string]> = []) {
  return { route, connectionLabel, modelDisplayLabel: null, availability: "available", eligible: reasons.length === 0, reasons: reasons.map(([code, message]) => ({ code, message })) };
}
function matrixFixture(attentionAcknowledgedAt: string | null = null) {
  const base = {
    configured: { kind: "inherit" }, configuredFailurePolicy: null,
    effectiveRoute: reviewRoute, effectiveFailurePolicy: { kind: "reroute_global_once" }, policySource: "action_type",
    requirements, eligibility: { eligible: true, reasons: [] }, routeChoices: [globalRoute, reviewRoute, smallRoute],
  };
  return {
    schemaVersion: SCHEMA,
    policy: { policyId: "installation-global", revisionId: "routing-revision-41", revisionNumber: 41, registryVersion: "agent-registry/v1", revisionGuard: "opaque-guard-41" },
    state: "ready",
    global: {
      ...base, kind: "global", scope: { kind: "global" }, scopeKey: "global", label: "Global Default", displayOrder: 0,
      configured: { kind: "route", route: globalIdentity }, configuredFailurePolicy: { kind: "fail_immediately" },
      effectiveRoute: globalRoute, effectiveFailurePolicy: { kind: "fail_immediately" }, policySource: "global",
    },
    groups: [{
      actionType: "review", label: "Review", displayOrder: 3,
      typeDefault: {
        ...base, kind: "action_type", scope: { kind: "action_type", actionType: "review" }, scopeKey: "action_type:review", label: "Review", displayOrder: 3,
        configured: { kind: "route", route: reviewIdentity }, configuredFailurePolicy: { kind: "reroute_global_once" },
      },
      actions: [{
        ...base, kind: "action", scope: { kind: "action", actionId: "code-review" }, scopeKey: "action:code-review", label: "Code Review", displayOrder: 1,
        roleId: "code-review-agent", promptVersion: "code-review/v1",
      }],
    }],
    connectionStates: [
      connectionState("global-connection", "OpenAI Personal"), connectionState("review-connection", "Review Team"), connectionState("small-connection", "Small Model Team"),
    ],
    attention: [{
      attentionId: "attention-review-route", attentionRevisionId: "routing-revision-41", affectedRoute: reviewIdentity,
      reasonCode: "payment_required", occurredAt: FIXTURE_TIME, acknowledgedAt: attentionAcknowledgedAt,
    }],
  };
}
function connectionState(connectionId: string, label: string) {
  return { connectionId, label, providerKind: "known", scanState: "available", guidanceCode: "models_available", claimedAt: FIXTURE_TIME, settledAt: "2026-07-23T05:00:01.000Z", diagnosticOccurredAt: "2026-07-23T05:00:01.000Z", safeMessage: "Models are available." };
}
function scopeKey(scope: Record<string, string>) {
  return scope.kind === "global" ? "global" : scope.kind === "action_type" ? `action_type:${scope.actionType}` : `action:${scope.actionId}`;
}

async function installRoutingFixtures(page: Page, state: RoutingFixture) {
  await installDashboardFixtures(page, []);
  await page.route("**/api/provider-connections", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/api/model-catalog**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ schemaVersion: "model-catalog/v1", models: [] }) }));
  await page.route("**/api/agent-routing/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const matrix = matrixFixture(state.attentionAcknowledgedAt);
    let response: unknown = { error: { code: "ROUTING_INVALID_REQUEST", message: "Routing request is invalid." } };
    let status = 400;
    if (url.pathname.endsWith("/matrix") && request.method() === "GET") {
      response = matrix; status = 200;
    } else if (url.pathname.endsWith("/preview") && request.method() === "POST") {
      const draft = JSON.parse(request.postData() ?? "{}") as any;
      const action = matrix.groups[0]!.actions[0]!;
      const selected = draft.selection.kind === "route" ? [globalRoute, reviewRoute, smallRoute].find((choice) => choice.route.connectionId === draft.selection.route.connectionId)! : null;
      const projectedRow = draft.selection.kind === "inherit" ? action : {
        ...action, configured: { kind: "route", route: draft.selection.route }, configuredFailurePolicy: draft.selection.failurePolicy,
        effectiveRoute: selected, effectiveFailurePolicy: draft.selection.failurePolicy, policySource: "action", eligibility: { eligible: selected.eligible, reasons: selected.reasons },
      };
      const allowedFallbackRoutes = selected === null ? [] : [globalRoute, reviewRoute, smallRoute].map((choice) => choice.route.connectionId !== selected.route.connectionId ? choice : {
        ...choice, eligible: false, reasons: [{ code: "same_as_primary", message: "The fallback route must differ from the primary route." }],
      });
      response = { schemaVersion: SCHEMA, policyId: draft.policyId, expectedRevision: draft.expectedRevision, revisionGuard: draft.revisionGuard, scope: draft.scope, scopeKey: scopeKey(draft.scope), projectedRow, allowedFallbackRoutes };
      status = 200;
    } else if (url.pathname.endsWith("/attention/acknowledge") && request.method() === "POST") {
      const acknowledgement = JSON.parse(request.postData() ?? "{}") as { acknowledgedAt?: unknown };
      state.attentionAcknowledgedAt = typeof acknowledgement.acknowledgedAt === "string" ? acknowledgement.acknowledgedAt : null;
      response = matrixFixture(state.attentionAcknowledgedAt); status = 200;
    } else if (url.pathname.endsWith("/row") && request.method() === "PUT") {
      state.updates.push(JSON.parse(request.postData() ?? "{}"));
      response = { error: { code: "ROUTING_INVALID_HANDOFF_CHAIN", message: "The routing handoff chain is invalid." } }; status = 422;
    }
    const body = JSON.stringify(response);
    state.responseBodies.push(body);
    await route.fulfill({ contentType: "application/json", status, body });
  });
}
async function openRoutingDefaults(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Models" }).click();
  await page.getByRole("tab", { name: "Routing Defaults" }).click();
  await expect(page.getByRole("heading", { name: "Routing Defaults", exact: true })).toBeVisible();
}

test.describe("Routing Defaults policy safety (FEAT-061)", () => {
  test("E011-ROUTE-002 presents the server-calculated action-type inherited route", async ({ page }) => {
    const state: RoutingFixture = { attentionAcknowledgedAt: null, responseBodies: [], updates: [] };
    await installRoutingFixtures(page, state); await openRoutingDefaults(page);
    await expect(page.getByText("Review Team · review-model").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Code Review" })).toBeVisible();
    await expect(page.getByLabel("Configured route for Code Review")).toHaveValue("inherit");
    await expect(page.getByText("Action type", { exact: true })).toHaveCount(2);
    await expect(page.getByText("routing-revision-41")).toBeVisible();
    expect(state.updates).toHaveLength(0);
  });

  test("E011-ROUTE-004 refuses an ineligible route without advancing the policy revision", async ({ page }) => {
    const state: RoutingFixture = { attentionAcknowledgedAt: null, responseBodies: [], updates: [] };
    await installRoutingFixtures(page, state); await openRoutingDefaults(page);
    const option = page.getByLabel("Configured route for Code Review").locator("option", { hasText: "Small Model Team · small-model" });
    await expect(option).toBeDisabled();
    await page.getByText("Route eligibility and immutable identity").last().click();
    await expect(page.getByText("Tool support is required.").last()).toBeVisible();
    await expect(page.getByText("API support is required.").last()).toBeVisible();
    await expect(page.getByText("The model context window is too small.").last()).toBeVisible();
    expect(state.updates).toHaveLength(0);
  });

  test("E011-SAFE-002 presents no browser fallback when the server rejects a cyclic mutation", async ({ page }) => {
    const state: RoutingFixture = { attentionAcknowledgedAt: null, responseBodies: [], updates: [] };
    await installRoutingFixtures(page, state); await openRoutingDefaults(page);
    await page.getByLabel("Configured route for Code Review").selectOption(`${reviewIdentity.connectionId}\u0000${reviewIdentity.modelId}`);
    await page.getByLabel("Failure policy for Code Review").selectOption("reroute_route_once");
    const primaryFallback = page.getByLabel("Fallback route for Code Review").locator("option", { hasText: "Review Team · review-model" });
    await expect(primaryFallback).toBeDisabled();
    await expect(primaryFallback).toContainText("fallback route must differ");
    expect(state.updates).toHaveLength(0);
    expect(JSON.stringify(state.responseBodies)).not.toContain(TEST_SECRET);
  });

  test("E011-SAFE-003 and E011-PROV-003 acknowledge durable reset attention without presenting runtime or secret evidence", async ({ page }) => {
    const state: RoutingFixture = { attentionAcknowledgedAt: null, responseBodies: [], updates: [] };
    const consoleMessages: string[] = []; page.on("console", (message) => consoleMessages.push(message.text()));
    await installRoutingFixtures(page, state); await openRoutingDefaults(page);
    await expect(page.getByText("Routing attention required")).toBeVisible();
    await expect(page.getByText("Review Team · review-model").first()).toBeVisible();
    await page.getByRole("button", { name: "Acknowledge notice" }).click();
    await expect(page.getByRole("button", { name: "Acknowledge notice" })).toHaveCount(0);
    await expect(page.getByText("Routing notice acknowledged. No routing policy was changed.")).toBeVisible();
    const sinks = `${await page.locator("body").innerText()}\n${consoleMessages.join("\n")}\n${state.responseBodies.join("\n")}`;
    expect(sinks).not.toContain(TEST_SECRET); expect(sinks).not.toMatch(/API key|Pi token/i);
  });
});
