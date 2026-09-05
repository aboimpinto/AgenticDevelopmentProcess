/**
 * FEAT-069 browser acceptance for the canonical active-connection state projection.
 *
 * Provider/model responses are fulfilled in browser memory. The fixture rejects
 * every unexpected external request and never places its distinctive secret in
 * an API response, DOM value, accessible attribute, console event, or assertion.
 * Startup contact counts and restart idempotency are proved by the paired real-
 * composition backend binder in
 * apps/orchestrator/test/feat-069-catalog-reconciliation.integration.test.ts.
 *
 * @see apps/web/e2e/features/feat-069-catalog-reconciliation.feature
 */

import { expect, test, type Page } from "@playwright/test";
import type {
  ActiveCatalogConnectionState,
  CatalogModelRecord,
  CatalogScanDiagnostic,
  CatalogScanState,
  ProviderConnectionId,
} from "@hepha/shared";
import { installDashboardFixtures } from "./fixtures/dashboard-fixtures";

const FIXTURE_TIME = "2026-07-24T19:00:00.000Z";
const DISTINCTIVE_SECRET = "feat-069-browser-secret-never-expose";
const id = (value: string) => value as ProviderConnectionId;

type FixtureConnection = {
  readonly connectionId: ProviderConnectionId;
  readonly kind: "custom" | "known" | "pi_session";
  readonly label: string;
  readonly providerLabel: string;
  readonly endpointUrl: string;
};

type ReconciliationBrowserFixture = {
  readonly connections: readonly FixtureConnection[];
  readonly states: Map<string, ActiveCatalogConnectionState>;
  models: CatalogModelRecord[];
  readonly retryCalls: string[];
  readonly responseBodies: string[];
  readonly providerRequests: string[];
};

function connection(
  connectionId: string,
  label: string,
  kind: FixtureConnection["kind"] = "custom",
): FixtureConnection {
  return {
    connectionId: id(connectionId),
    kind,
    label,
    providerLabel: label,
    endpointUrl: kind === "pi_session" ? "local Pi session" : `https://${connectionId}.test/v1`,
  };
}

function state(
  connectionId: string,
  label: string,
  scanState: CatalogScanState,
): ActiveCatalogConnectionState {
  const neverScanned = scanState === "never_scanned";
  const modelCount = scanState === "available" ? 1 : scanState === "scanning" ? null : neverScanned ? null : 0;
  const outcomeCode = scanState === "failed" ? "authentication_failed" : scanState === "available" || scanState === "empty" ? "success" : null;
  return {
    schemaVersion: "catalog-reconciliation/v1",
    connectionId: id(connectionId),
    label,
    providerKind: connectionId === "openai-connection" || connectionId === "deepseek-connection" ? "pi_session" : "custom",
    lifecycleActive: true,
    scanState,
    trigger: neverScanned ? null : "scan_active",
    attemptId: neverScanned ? null : `attempt-${connectionId}`,
    modelCount,
    claimedAt: neverScanned ? null : FIXTURE_TIME,
    settledAt: scanState === "scanning" || neverScanned ? null : FIXTURE_TIME,
    outcomeCode,
    safeMessage: scanState === "failed"
      ? "Authentication failed. Retry after repairing the connection."
      : scanState === "empty"
        ? "Model catalog scan completed with zero models."
        : scanState === "available"
          ? "Model catalog scan completed."
          : null,
    diagnosticId: scanState === "scanning" || neverScanned ? null : `diagnostic-${connectionId}`,
    diagnosticOccurredAt: scanState === "scanning" || neverScanned ? null : FIXTURE_TIME,
    guidanceCode: scanState === "never_scanned"
      ? "scan_not_started"
      : scanState === "scanning"
        ? "scan_in_progress"
        : scanState === "available"
          ? "models_available"
          : scanState === "empty"
            ? "no_models_returned"
            : "scan_failed",
  };
}

function model(connectionId: string, label: string, modelId: string): CatalogModelRecord {
  return {
    schemaVersion: "model-catalog/v1",
    identity: { connectionId: id(connectionId), modelId },
    providerKind: connectionId === "openai-connection" || connectionId === "deepseek-connection" ? "pi_session" : "custom",
    providerLabel: label,
    displayName: `${label} fixture model`,
    description: "Deterministic secret-free FEAT-069 model fixture.",
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_000,
    inputModalities: ["text"],
    capabilities: { reasoning: true, tools: true, api: true },
    pricing: null,
    availability: "available",
    lastSuccessfulScanAt: FIXTURE_TIME,
  };
}

function failedDiagnostic(connectionId: string): CatalogScanDiagnostic {
  return {
    schemaVersion: "model-catalog/v1",
    diagnosticId: `diagnostic-${connectionId}`,
    connectionId: id(connectionId),
    scanCorrelationId: `attempt-${connectionId}`,
    outcome: "authentication_failed",
    safeMessage: "Authentication failed. Retry after repairing the connection.",
    httpStatusCode: 401,
    occurredAt: FIXTURE_TIME,
  };
}

async function installReconciliationFixtures(page: Page, fixture: ReconciliationBrowserFixture): Promise<void> {
  await installDashboardFixtures(page, []);

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" && url.hostname === "127.0.0.1") return;
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    if (url.hostname.endsWith(".test")
      || /(?:openai|deepseek|openrouter|anthropic|provider)/iu.test(url.hostname)) {
      fixture.providerRequests.push(request.url());
    }
  });

  await page.route("**/api/provider-connections", async (route) => {
    const body = JSON.stringify(fixture.connections.map((item) => ({
      ...item,
      endpointLocal: item.kind === "pi_session",
      lifecycleState: "active",
      hasSecret: item.kind !== "pi_session",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    })));
    fixture.responseBodies.push(body);
    await route.fulfill({ contentType: "application/json", body });
  });

  await page.route("**/api/model-catalog**", async (route) => {
    const url = new URL(route.request().url());
    const retryMatch = url.pathname.match(/^\/api\/model-catalog\/connections\/([^/]+)\/scan$/u);
    const diagnosticMatch = url.pathname.match(/^\/api\/model-catalog\/connections\/([^/]+)\/diagnostics$/u);
    let response: unknown;

    if (url.pathname === "/api/model-catalog" && route.request().method() === "GET") {
      response = { schemaVersion: "model-catalog/v1", models: fixture.models };
    } else if (url.pathname === "/api/model-catalog/connections" && route.request().method() === "GET") {
      response = { schemaVersion: "catalog-reconciliation/v1", connections: orderedStates(fixture.states) };
    } else if (retryMatch && route.request().method() === "POST") {
      const connectionId = decodeURIComponent(retryMatch[1]!);
      fixture.retryCalls.push(connectionId);
      if (connectionId === "provider-failed") {
        fixture.states.set(connectionId, state(connectionId, "provider-failed", "available"));
        fixture.models.push(model(connectionId, "provider-failed", "recovered-model"));
      } else if (connectionId === "provider-new") {
        fixture.states.set(connectionId, state(connectionId, "provider-new", "empty"));
      } else {
        throw new Error(`Unexpected retry identity: ${connectionId}`);
      }
      response = { schemaVersion: "catalog-reconciliation/v1", connection: fixture.states.get(connectionId) };
    } else if (diagnosticMatch && route.request().method() === "GET") {
      const connectionId = decodeURIComponent(diagnosticMatch[1]!);
      response = {
        schemaVersion: "model-catalog/v1",
        diagnostics: connectionId === "provider-failed" ? [failedDiagnostic(connectionId)] : [],
      };
    } else if (url.pathname === "/api/model-catalog/scan-active" && route.request().method() === "POST") {
      response = { schemaVersion: "catalog-reconciliation/v1", connections: orderedStates(fixture.states) };
    } else {
      await route.fulfill({ contentType: "application/json", status: 404, body: JSON.stringify({ error: "Missing deterministic fixture." }) });
      return;
    }

    const body = JSON.stringify(response);
    if (body.includes(DISTINCTIVE_SECRET)) throw new Error("Distinctive secret entered a browser response fixture.");
    fixture.responseBodies.push(body);
    await route.fulfill({ contentType: "application/json", body });
  });
}

function orderedStates(states: ReadonlyMap<string, ActiveCatalogConnectionState>): ActiveCatalogConnectionState[] {
  return [...states.values()].sort((left, right) => left.connectionId.localeCompare(right.connectionId));
}

async function openModels(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Models" }).click();
  await expect(page.getByRole("heading", { name: "Models", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active Connections" })).toBeVisible();
}

function connectionStateRow(page: Page, label: string) {
  return page.locator(".active-catalog-connection-row").filter({ has: page.getByText(label, { exact: true }) });
}

function accessibleAttributes(page: Page): Promise<string> {
  return page.locator("[aria-label], [aria-labelledby], [aria-describedby], [title]").evaluateAll((elements) => elements.map((element) => [
    element.getAttribute("aria-label"),
    element.getAttribute("aria-labelledby"),
    element.getAttribute("aria-describedby"),
    element.getAttribute("title"),
  ].join(" ")).join("\n"));
}

function assertSecretSafe(fixture: ReconciliationBrowserFixture, bodyText: string, attributes: string, consoleMessages: readonly string[]): void {
  expect(bodyText).not.toContain(DISTINCTIVE_SECRET);
  expect(attributes).not.toContain(DISTINCTIVE_SECRET);
  expect(fixture.responseBodies.join("\n")).not.toContain(DISTINCTIVE_SECRET);
  expect(consoleMessages.join("\n")).not.toContain(DISTINCTIVE_SECRET);
  expect(fixture.providerRequests).toEqual([]);
}

test.describe("FEAT-069 active connection catalog reconciliation", () => {
  test("E011-PROV-006 renders both migrated connection labels and immutable model identities", async ({ page }) => {
    const fixture: ReconciliationBrowserFixture = {
      connections: [
        connection("openai-connection", "OpenAI", "pi_session"),
        connection("deepseek-connection", "DeepSeek", "pi_session"),
      ],
      states: new Map([
        ["openai-connection", state("openai-connection", "OpenAI", "available")],
        ["deepseek-connection", state("deepseek-connection", "DeepSeek", "available")],
      ]),
      models: [
        model("openai-connection", "OpenAI", "gpt-fixture"),
        model("deepseek-connection", "DeepSeek", "deepseek-fixture"),
      ],
      retryCalls: [],
      responseBodies: [],
      providerRequests: [],
    };
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    await installReconciliationFixtures(page, fixture);
    await openModels(page);

    await expect(page.getByRole("option", { name: "OpenAI · gpt-fixture OpenAI fixture model" })).toBeVisible();
    await expect(page.getByRole("option", { name: "DeepSeek · deepseek-fixture DeepSeek fixture model" })).toBeVisible();
    await expect(connectionStateRow(page, "OpenAI")).toContainText("Available");
    await expect(connectionStateRow(page, "DeepSeek")).toContainText("Available");

    await page.getByRole("option", { name: "DeepSeek · deepseek-fixture DeepSeek fixture model" }).click();
    await expect(page.locator(".selected-model-detail .catalog-identity")).toHaveText("DeepSeek · deepseek-fixture");
    expect(fixture.retryCalls).toEqual([]);
    assertSecretSafe(fixture, await page.locator("body").innerText(), await accessibleAttributes(page), consoleMessages);
  });

  test("E011-PROV-007 keeps zero-row states visible and retries only the selected authoritative identity", async ({ page }) => {
    const fixture: ReconciliationBrowserFixture = {
      connections: [
        connection("provider-empty", "provider-empty"),
        connection("provider-failed", "provider-failed"),
        connection("provider-new", "provider-new"),
      ],
      states: new Map([
        ["provider-empty", state("provider-empty", "provider-empty", "empty")],
        ["provider-failed", state("provider-failed", "provider-failed", "failed")],
        ["provider-new", state("provider-new", "provider-new", "never_scanned")],
      ]),
      models: [],
      retryCalls: [],
      responseBodies: [],
      providerRequests: [],
    };
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    await installReconciliationFixtures(page, fixture);
    await openModels(page);

    await expect(connectionStateRow(page, "provider-empty")).toContainText("Empty");
    await expect(connectionStateRow(page, "provider-failed")).toContainText("Failed");
    await expect(connectionStateRow(page, "provider-new")).toContainText("Never scanned");

    const emptyBefore = await connectionStateRow(page, "provider-empty").innerText();
    const newBefore = await connectionStateRow(page, "provider-new").innerText();
    await page.getByRole("button", { name: "Retry provider-failed" }).click();
    await expect(connectionStateRow(page, "provider-failed")).toContainText("Available");
    await expect(page.getByRole("option", { name: "provider-failed · recovered-model provider-failed fixture model" })).toBeVisible();
    expect(await connectionStateRow(page, "provider-empty").innerText()).toBe(emptyBefore);
    expect(await connectionStateRow(page, "provider-new").innerText()).toBe(newBefore);
    expect(fixture.retryCalls).toEqual(["provider-failed"]);

    await page.getByRole("tab", { name: "Provider Connections" }).click();
    const providerRows = page.locator(".provider-connections-item");
    await expect(providerRows.filter({ hasText: "provider-empty" })).toContainText("Empty");
    await expect(providerRows.filter({ hasText: "provider-failed" })).toContainText("Available");
    await expect(providerRows.filter({ hasText: "provider-new" })).toContainText("Never scanned");
    assertSecretSafe(fixture, await page.locator("body").innerText(), await accessibleAttributes(page), consoleMessages);
  });
});
