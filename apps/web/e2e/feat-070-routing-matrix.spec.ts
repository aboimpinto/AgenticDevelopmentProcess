/**
 * FEAT-070 browser acceptance for the closed server-projected routing matrix.
 * All HTTP state is deterministic and intercepted in browser memory; no test
 * contacts a model provider, Pi process, credential store, or worker adapter.
 *
 * @see apps/web/e2e/features/feat-070-routing-matrix.feature
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  RAW_SERVER_FAILURE,
  ROUTING_TEST_SECRET,
  accessibleAttributes,
  createRoutingMatrixBrowserFixture,
  fallbackRoute,
  implementationRoute,
  installRoutingMatrixBrowserFixtures,
  openRoutingDefaults,
  routingMatrixFixture,
  weakRoute,
  withResetAttention,
  withSecurityReview,
  withUnsafeCodeReviewChoice,
} from "./fixtures/routing-matrix-fixtures";

const feature = readFileSync(fileURLToPath(new URL("./features/feat-070-routing-matrix.feature", import.meta.url)), "utf8");
const scenarioTitles = [
  "A Global-only policy renders the complete authoritative hierarchy",
  "Independent Implementation drafts settle with friendly and immutable identity",
  "Failure-policy editing exposes every safe mode and refuses unsafe choices",
  "A newly registered action appears without a browser or policy migration",
  "Reset attention and revision conflict preserve drafts without unsafe claims",
  "Safe states remain accessible at reduced motion and constrained width",
] as const;

const routeKey = (route: { readonly connectionId: string; readonly modelId: string }) => `${route.connectionId}\u0000${route.modelId}`;
const rowFor = (page: Page, label: string) => page.getByRole("heading", { name: label, exact: true }).locator("xpath=ancestor::article[1]");

function captureConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  return messages;
}

function assertInventory(): void {
  expect(feature.match(/^  Scenario:/gmu)).toHaveLength(scenarioTitles.length);
  for (const title of scenarioTitles) expect(feature).toContain(`Scenario: ${title}`);
  for (const id of [
    "E011-PROV-003",
    "E011-ROUTE-002",
    "E011-ROUTE-003",
    "E011-ROUTE-004",
    "E011-ROUTE-006",
    "E011-ROUTE-007",
    "E011-ROUTE-008",
    "E011-ROUTE-009",
    "E011-ROUTE-010",
    "E011-SAFE-001",
    "E011-SAFE-002",
  ]) expect(feature).toContain(`@${id}`);
}

test.describe("FEAT-070 complete Routing Defaults matrix", () => {
  test.beforeAll(assertInventory);

  test(scenarioTitles[0], async ({ page }) => {
    const fixture = createRoutingMatrixBrowserFixture();
    await installRoutingMatrixBrowserFixtures(page, fixture);
    await openRoutingDefaults(page);

    await expect(page.getByRole("heading", { name: "Routing Defaults", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveText([
      "Global Default", "Discovery & Planning", "Implementation", "Review", "Completion", "Knowledge & Documentation",
    ]);
    await expect(page.locator(".routing-matrix-row")).toHaveCount(23);
    await expect(page.getByText("Type default", { exact: true })).toHaveCount(5);
    await expect(page.getByText("Action", { exact: true })).toHaveCount(17);
    await expect(page.locator('select[id$="-route"]')).toHaveCount(23);
    expect(await page.locator('select[id$="-route"]:not(#routing-global-route)').evaluateAll((selects) => selects.map((select) => (select as HTMLSelectElement).value))).toEqual(Array(22).fill("inherit"));
    await expect(page.getByText("Global", { exact: true })).toHaveCount(23);
    await expect(page.locator(".routing-effective-facts > div:first-child > dd", { hasText: "OpenAI Personal · global-model" })).toHaveCount(23);
    expect(fixture.previews).toEqual([]);
    expect(fixture.saves).toEqual([]);
    expect(fixture.acknowledgements).toEqual([]);
    expect(fixture.providerRequests).toEqual([]);
  });

  test(scenarioTitles[1], async ({ page }) => {
    const fixture = createRoutingMatrixBrowserFixture();
    await installRoutingMatrixBrowserFixtures(page, fixture);
    await openRoutingDefaults(page);

    await page.getByLabel("Configured route for Implementation").selectOption(routeKey(implementationRoute.route));
    await page.getByLabel("Configured route for Continue Implementing").selectOption(routeKey(fallbackRoute.route));
    await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(2);

    await page.getByRole("button", { name: "Save Implementation" }).click();
    await expect(page.getByText("Implementation saved in routing revision 2.")).toBeVisible();
    await expect(rowFor(page, "Start Feature").locator(".routing-effective-facts > div:first-child > dd")).toHaveText("DeepSeek Team · implementation-model");
    await expect(rowFor(page, "Start Feature").locator(".routing-effective-facts > div:nth-child(2) > dd")).toHaveText("Action type");
    await expect(page.getByLabel("Configured route for Continue Implementing")).toHaveValue(routeKey(fallbackRoute.route));
    await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(1);

    await page.getByRole("button", { name: "Save Continue Implementing" }).click();
    await expect(page.getByText("Continue Implementing saved in routing revision 3.")).toBeVisible();
    await expect(rowFor(page, "Continue Implementing").locator(".routing-effective-facts > div:first-child > dd")).toHaveText("OpenAI Work · fallback-model");
    await expect(rowFor(page, "Continue Implementing").locator(".routing-effective-facts > div:nth-child(2) > dd")).toHaveText("Action");

    expect(fixture.saves).toHaveLength(2);
    expect(fixture.saves[0]).toMatchObject({
      scope: { kind: "action_type", actionType: "implementation" },
      selection: { kind: "route", route: implementationRoute.route },
      expectedRevision: { revisionNumber: 1 },
      revisionGuard: "opaque-guard-1",
    });
    expect(fixture.saves[1]).toMatchObject({
      scope: { kind: "action", actionId: "continue-implementing" },
      selection: { kind: "route", route: fallbackRoute.route },
      expectedRevision: { revisionNumber: 2 },
      revisionGuard: "opaque-guard-2",
    });
    expect(fixture.providerRequests).toEqual([]);
  });

  test(scenarioTitles[2], async ({ page }) => {
    const fixture = createRoutingMatrixBrowserFixture(withUnsafeCodeReviewChoice(routingMatrixFixture()));
    await installRoutingMatrixBrowserFixtures(page, fixture);
    await openRoutingDefaults(page);

    const review = rowFor(page, "Code Review");
    const unsafe = review.getByRole("option", { name: /Small Model Team · small-text-model/ });
    await expect(unsafe).toBeDisabled();
    await expect(unsafe).toContainText("connection/model route is unavailable");
    await review.getByText("Route eligibility and immutable identity").click();
    for (const explanation of [
      "The connection/model route is unavailable.",
      "The model context window is too small.",
      "Tool support is required.",
      "API support is required.",
    ]) await expect(review.locator(".routing-eligibility li").filter({ hasText: explanation })).toBeVisible();

    await page.getByLabel("Configured route for Code Review").selectOption(routeKey(implementationRoute.route));
    await page.getByLabel("Failure policy for Code Review").selectOption("reroute_global_once");
    await page.getByLabel("Failure policy for Code Review").selectOption("reroute_route_once");
    const fallback = page.getByLabel("Fallback route for Code Review");
    const primary = fallback.getByRole("option", { name: /DeepSeek Team · implementation-model/ });
    await expect(primary).toBeDisabled();
    await expect(primary).toContainText("fallback route must differ");
    await fallback.selectOption(routeKey(fallbackRoute.route));
    await page.getByRole("button", { name: "Save Code Review" }).click();
    await expect(page.getByText("Code Review saved in routing revision 2.")).toBeVisible();

    expect(fixture.previews.map((draft) => draft.selection.kind === "route" ? draft.selection.failurePolicy.kind : "inherit"))
      .toEqual(expect.arrayContaining(["fail_immediately", "reroute_global_once", "reroute_route_once"]));
    expect(fixture.saves).toHaveLength(1);
    expect(fixture.saves[0]).toMatchObject({
      selection: {
        kind: "route",
        route: implementationRoute.route,
        failurePolicy: { kind: "reroute_route_once", fallbackRoute: fallbackRoute.route },
      },
    });
    expect(JSON.stringify(fixture.saves)).not.toContain(weakRoute.route.connectionId);
    expect(fixture.snapshot.policy.revisionNumber).toBe(2);
  });

  test(scenarioTitles[3], async ({ page }) => {
    const fixture = createRoutingMatrixBrowserFixture(withSecurityReview(routingMatrixFixture()));
    await installRoutingMatrixBrowserFixtures(page, fixture);
    await openRoutingDefaults(page);

    const review = page.locator(".routing-matrix-group").filter({ has: page.getByRole("heading", { name: "Review", exact: true }) });
    await expect(review.getByRole("heading", { name: "Security Review", exact: true })).toHaveCount(1);
    await expect(review.getByLabel("Configured route for Security Review")).toHaveValue("inherit");
    await expect(rowFor(page, "Security Review").locator(".routing-effective-facts > div:first-child > dd")).toHaveText("OpenAI Personal · global-model");
    await expect(rowFor(page, "Security Review").locator(".routing-effective-facts > div:nth-child(2) > dd")).toHaveText("Global");
    expect(fixture.previews).toEqual([]);
    expect(fixture.saves).toEqual([]);
  });

  test(scenarioTitles[4], async ({ page }) => {
    const fixture = createRoutingMatrixBrowserFixture(withResetAttention(routingMatrixFixture()));
    const consoleMessages = captureConsole(page);
    await installRoutingMatrixBrowserFixtures(page, fixture);
    await openRoutingDefaults(page);

    await expect(page.getByText("Routing attention required")).toBeVisible();
    await expect(page.getByText("DeepSeek Team · implementation-model", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("payment_required", { exact: false })).toHaveCount(0);
    await page.getByLabel("Configured route for Continue Implementing").selectOption(routeKey(fallbackRoute.route));
    await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(1);

    await page.getByRole("button", { name: "Acknowledge notice" }).click();
    await expect(page.getByText("Routing notice acknowledged. No routing policy was changed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Acknowledge notice" })).toHaveCount(0);
    await expect(page.getByLabel("Configured route for Continue Implementing")).toHaveValue(routeKey(fallbackRoute.route));
    expect(fixture.snapshot.policy.revisionNumber).toBe(1);
    expect(fixture.acknowledgements).toHaveLength(1);

    fixture.nextSaveError = { code: "ROUTING_POLICY_CONFLICT", message: RAW_SERVER_FAILURE, status: 409 };
    await page.getByRole("button", { name: "Save Continue Implementing" }).click();
    const conflict = page.getByRole("alert").filter({ hasText: "Routing policy conflict." });
    await expect(conflict).toBeFocused();
    await expect(conflict.getByRole("button", { name: "Reload latest and compare" })).toBeVisible();
    await expect(page.getByLabel("Configured route for Continue Implementing")).toHaveValue(routeKey(fallbackRoute.route));

    const visibleAndAccessible = `${await page.locator("body").innerText()}\n${await accessibleAttributes(page)}\n${consoleMessages.join("\n")}`;
    expect(visibleAndAccessible).not.toContain(RAW_SERVER_FAILURE);
    expect(visibleAndAccessible).not.toContain(ROUTING_TEST_SECRET);
    expect(visibleAndAccessible).not.toMatch(/worker (?:was )?launched|launch receipt|API key|Pi token/iu);
    expect(`${fixture.responseBodies.join("\n")}\n${fixture.requestBodies.join("\n")}`).not.toContain(ROUTING_TEST_SECRET);
    expect(fixture.responseBodies.join("\n")).toContain(RAW_SERVER_FAILURE);
    expect(fixture.providerRequests).toEqual([]);
  });

  test(scenarioTitles[5], async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 640, height: 900 });
    let releaseMatrix!: () => void;
    const fixture = createRoutingMatrixBrowserFixture(withResetAttention(routingMatrixFixture()));
    fixture.matrixBodyOverride = { schemaVersion: "agent-routing-matrix/v1", unsafeDiagnostic: RAW_SERVER_FAILURE };
    fixture.matrixGate = new Promise<void>((resolve) => { releaseMatrix = resolve; });
    await installRoutingMatrixBrowserFixtures(page, fixture);
    await openRoutingDefaults(page);

    const loading = page.getByRole("region", { name: "Routing Defaults" });
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Loading routing matrix…")).toBeVisible();
    releaseMatrix();
    await expect(page.getByRole("alert")).toContainText("Routing data could not be processed safely");
    await expect(page.locator(".routing-matrix-row")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(RAW_SERVER_FAILURE);

    fixture.matrixBodyOverride = null;
    fixture.matrixGate = null;
    await page.getByRole("button", { name: "Refresh routing matrix" }).click();
    await expect(page.locator(".routing-matrix-row")).toHaveCount(23);
    await expect(page.getByLabel("Configured route for Global Default")).toBeVisible();
    await page.getByLabel("Configured route for Global Default").focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
    expect(await page.locator(".routing-matrix-attention").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    expect(await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))).toMatchObject({ width: 640, scroll: 640 });
    expect(await page.locator(".routing-matrix-row").first().evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(fixture.providerRequests).toEqual([]);
  });
});
