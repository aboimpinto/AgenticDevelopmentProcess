/**
 * FEAT-060: Models dashboard acceptance journeys.
 *
 * Every catalog, scan, connection, and dashboard response is intercepted in
 * browser memory. These journeys never contact a provider, Pi session, or
 * credential store.
 *
 * @see apps/web/e2e/features/feat-060-models-dashboard.feature
 */

import { expect, test, type Page } from "@playwright/test";
import type {
  ActiveCatalogConnectionState,
  CatalogModelRecord,
  CatalogScanDiagnostic,
  ProviderConnectionId,
} from "@hepha/shared";
import { installDashboardFixtures } from "./fixtures/dashboard-fixtures";

const FIXTURE_TIME = "2026-07-22T19:05:00.000Z";
const TEST_SECRET = "feat-060-distinctive-secret-never-expose"; // gitleaks:allow -- synthetic non-leak fixture

type FixtureConnection = {
  readonly connectionId: string;
  readonly kind: "custom" | "known" | "pi_session";
  readonly label: string;
  readonly providerLabel: string;
  readonly endpointUrl: string;
};

type ModelsFixtureState = {
  readonly connections: readonly FixtureConnection[];
  models: readonly CatalogModelRecord[];
  readonly scanResults: ReadonlyMap<string, { readonly result: ReturnType<typeof scanResult>; readonly nextModels: readonly CatalogModelRecord[] }>;
  readonly responseBodies: string[];
};

function catalogModel(
  connectionId: string,
  modelId: string,
  overrides: Partial<CatalogModelRecord> = {},
): CatalogModelRecord {
  return {
    schemaVersion: "model-catalog/v1",
    identity: { connectionId: connectionId as ProviderConnectionId, modelId },
    providerKind: "known",
    providerLabel: connectionId,
    displayName: "Shared display name",
    description: "Safe supplier description",
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_000,
    inputModalities: ["text"],
    capabilities: { reasoning: true, tools: true, api: true },
    pricing: { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5, currency: "USD" },
    availability: "available",
    lastSuccessfulScanAt: FIXTURE_TIME,
    ...overrides,
  };
}

function diagnostic(connectionId: string, outcome: "success" | "unavailable", safeMessage: string): CatalogScanDiagnostic {
  return {
    schemaVersion: "model-catalog/v1",
    diagnosticId: `diagnostic-${connectionId}-${outcome}`,
    connectionId: connectionId as ProviderConnectionId,
    scanCorrelationId: `scan-${connectionId}`,
    outcome,
    safeMessage,
    httpStatusCode: outcome === "success" ? null : 402,
    occurredAt: FIXTURE_TIME,
  };
}

function scanResult(connectionId: string, outcome: "success" | "unavailable", safeMessage: string) {
  const scanDiagnostic = diagnostic(connectionId, outcome, safeMessage);
  return {
    connectionId: connectionId as ProviderConnectionId,
    scanCorrelationId: scanDiagnostic.scanCorrelationId,
    outcome,
    modelCount: outcome === "success" ? 1 : 0,
    diagnostic: scanDiagnostic,
  };
}

function connection(connectionId: string, label: string, endpointUrl: string, kind: FixtureConnection["kind"] = "known"): FixtureConnection {
  return { connectionId, kind, label, providerLabel: label, endpointUrl };
}

function connectionState(
  item: FixtureConnection,
  outcome: "success" | "unavailable",
  modelCount: number,
): ActiveCatalogConnectionState {
  const failed = outcome !== "success";
  return {
    schemaVersion: "catalog-reconciliation/v1",
    connectionId: item.connectionId as ProviderConnectionId,
    label: item.label,
    providerKind: item.kind,
    lifecycleActive: true,
    scanState: failed ? "failed" : modelCount > 0 ? "available" : "empty",
    trigger: "individual_retry",
    attemptId: `scan-${item.connectionId}`,
    modelCount: failed ? 0 : modelCount,
    claimedAt: FIXTURE_TIME,
    settledAt: FIXTURE_TIME,
    outcomeCode: outcome,
    safeMessage: failed ? "Payment required." : "Scan completed.",
    diagnosticId: `diagnostic-${item.connectionId}-${outcome}`,
    diagnosticOccurredAt: FIXTURE_TIME,
    guidanceCode: failed ? "scan_failed" : modelCount > 0 ? "models_available" : "no_models_returned",
  };
}

async function installModelsFixtures(page: Page, state: ModelsFixtureState) {
  await installDashboardFixtures(page, []);
  const connectionStates = new Map(state.connections.map((item) => {
    const modelCount = state.models.filter((entry) => entry.identity.connectionId === item.connectionId).length;
    return [item.connectionId, connectionState(item, "success", modelCount)] as const;
  }));

  await page.route("**/api/provider-connections", async (route) => {
    const body = JSON.stringify(state.connections.map((item) => ({
      ...item,
      endpointLocal: item.kind === "pi_session",
      lifecycleState: "active",
      hasSecret: item.kind !== "pi_session",
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    })));
    state.responseBodies.push(body);
    await route.fulfill({ contentType: "application/json", body });
  });

  await page.route("**/api/model-catalog**", async (route) => {
    const url = new URL(route.request().url());
    const scanMatch = url.pathname.match(/^\/api\/model-catalog\/connections\/([^/]+)\/scan$/);
    const diagnosticsMatch = url.pathname.match(/^\/api\/model-catalog\/connections\/([^/]+)\/diagnostics$/);
    let response: unknown;

    if (url.pathname === "/api/model-catalog" && route.request().method() === "GET") {
      response = { schemaVersion: "model-catalog/v1", models: state.models };
    } else if (url.pathname === "/api/model-catalog/connections" && route.request().method() === "GET") {
      response = {
        schemaVersion: "catalog-reconciliation/v1",
        connections: [...connectionStates.values()].sort((left, right) => left.connectionId.localeCompare(right.connectionId)),
      };
    } else if (scanMatch && route.request().method() === "POST") {
      const connectionId = decodeURIComponent(scanMatch[1]!);
      const scan = state.scanResults.get(connectionId);
      const item = state.connections.find((candidate) => candidate.connectionId === connectionId);
      if (!scan || !item) throw new Error(`Missing deterministic scan fixture for ${connectionId}`);
      state.models = [...scan.nextModels];
      const nextState = connectionState(
        item,
        scan.result.outcome,
        scan.nextModels.filter((entry) => entry.identity.connectionId === connectionId).length,
      );
      connectionStates.set(connectionId, nextState);
      response = { schemaVersion: "catalog-reconciliation/v1", connection: nextState };
    } else if (diagnosticsMatch && route.request().method() === "GET") {
      const connectionId = decodeURIComponent(diagnosticsMatch[1]!);
      const scan = state.scanResults.get(connectionId);
      response = { schemaVersion: "model-catalog/v1", diagnostics: scan ? [scan.result.diagnostic] : [] };
    } else if (url.pathname === "/api/model-catalog/scan-active" && route.request().method() === "POST") {
      response = {
        schemaVersion: "catalog-reconciliation/v1",
        connections: [...connectionStates.values()].sort((left, right) => left.connectionId.localeCompare(right.connectionId)),
      };
    } else {
      await route.fulfill({ contentType: "application/json", status: 404, body: JSON.stringify({ error: "Not found" }) });
      return;
    }

    const body = JSON.stringify(response);
    state.responseBodies.push(body);
    await route.fulfill({ contentType: "application/json", body });
  });
}

async function openModels(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Models" }).click();
  await expect(page.getByRole("heading", { name: "Models", exact: true })).toBeVisible();
}

function accessibleAttributes(page: Page) {
  return page.locator("[aria-label], [aria-labelledby], [aria-describedby], [title]").evaluateAll((elements) => elements.map((element) => [
    element.getAttribute("aria-label"),
    element.getAttribute("aria-labelledby"),
    element.getAttribute("aria-describedby"),
    element.getAttribute("title"),
  ].join(" ")).join("\n"));
}

test.describe("Models dashboard (FEAT-060)", () => {
  test("E011-PROV-001 distinguishes duplicate model IDs and renders safe selection metadata", async ({ page }) => {
    const openAi = catalogModel("openai-personal", "gpt-test", { providerLabel: "OpenAI", displayName: "Duplicate model" });
    const openRouter = catalogModel("openrouter-team", "gpt-test", {
      providerLabel: "OpenRouter",
      displayName: "Duplicate model",
      description: "Safe OpenRouter description",
      pricing: { inputPerMillionUsd: 0.8, outputPerMillionUsd: 3.2, currency: "USD" },
    });
    const state: ModelsFixtureState = {
      connections: [
        connection("openai-personal", "OpenAI Personal", "https://api.openai.test/v1"),
        connection("openrouter-team", "OpenRouter Team", "https://openrouter.test/api/v1"),
      ],
      models: [openAi, openRouter],
      scanResults: new Map(),
      responseBodies: [],
    };
    await installModelsFixtures(page, state);
    await openModels(page);

    await expect(page.getByRole("option", { name: "OpenAI Personal · gpt-test Duplicate model" })).toBeVisible();
    const selected = page.getByRole("option", { name: "OpenRouter Team · gpt-test Duplicate model" });
    await selected.click();

    await expect(page.locator(".selected-model-detail .catalog-identity")).toHaveText("OpenRouter Team · gpt-test");
    await expect(page.getByText("Safe OpenRouter description")).toBeVisible();
    for (const label of ["Availability", "Endpoint identity", "Last scan", "Context window", "Maximum output", "Input modalities", "Reasoning controls", "Tool compatibility", "API compatibility", "Input pricing", "Output pricing"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("https://openrouter.test/api/v1")).toBeVisible();
    await expect(page.getByText("USD 0.8 per million tokens")).toBeVisible();
    await expect(page.getByText("USD 3.2 per million tokens")).toBeVisible();
  });

  test("E011-PROV-002 keeps a custom-provider test secret out of Models browser sinks while its model scans", async ({ page }) => {
    const customModel = catalogModel("custom-gemini", "gemini-test", {
      providerKind: "custom",
      providerLabel: "Custom Gemini",
      displayName: "Gemini test",
    });
    const state: ModelsFixtureState = {
      connections: [connection("custom-gemini", "Custom Gemini", "https://custom-gemini.test/v1", "custom")],
      models: [customModel],
      scanResults: new Map([["custom-gemini", { result: scanResult("custom-gemini", "success", "Scan completed."), nextModels: [customModel] }]]),
      responseBodies: [],
    };
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    await installModelsFixtures(page, state);
    await openModels(page);

    await page.getByRole("option", { name: "Custom Gemini · gemini-test Gemini test" }).click();
    await page.getByRole("button", { name: "Scan selected connection" }).click();
    await expect(page.getByRole("option", { name: "Custom Gemini · gemini-test Gemini test" })).toBeVisible();
    await expect(page.getByText("Scan completed.", { exact: true })).toBeVisible();

    expect(await page.locator("body").innerText()).not.toContain(TEST_SECRET);
    expect(await accessibleAttributes(page)).not.toContain(TEST_SECRET);
    expect(state.responseBodies.join("\n")).not.toContain(TEST_SECRET);
    expect(consoleMessages.join("\n")).not.toContain(TEST_SECRET);
    await expect(page.getByLabel(/API key/i)).toHaveCount(0);
  });

  test("E011-PROV-003 clears only the failed connection catalog and presents safe recovery", async ({ page }) => {
    const providerA = catalogModel("provider-a", "model-a", { description: "Provider A selected detail" });
    const providerB = catalogModel("provider-b", "model-b", { description: "Provider B remains current" });
    const state: ModelsFixtureState = {
      connections: [
        connection("provider-a", "Provider A", "https://provider-a.test/v1"),
        connection("provider-b", "Provider B", "https://provider-b.test/v1"),
      ],
      models: [providerA, providerB],
      scanResults: new Map([["provider-a", {
        result: scanResult("provider-a", "unavailable", "Payment required."),
        nextModels: [providerB],
      }]]),
      responseBodies: [],
    };
    await installModelsFixtures(page, state);
    await page.route("**/api/agent-routing/matrix", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ schemaVersion: "agent-routing-matrix/v1" }),
      });
    });
    await openModels(page);

    await page.getByRole("option", { name: "Provider A · model-a Shared display name" }).click();
    await expect(page.getByText("Provider A selected detail")).toBeVisible();
    await page.getByRole("button", { name: "Scan selected connection" }).click();

    await expect(page.getByRole("option", { name: /Provider A · model-a/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Provider B · model-b Shared display name" })).toBeVisible();
    await expect(page.getByText("Provider A selected detail")).toHaveCount(0);
    await expect(page.locator(".catalog-recovery-attention")).toContainText("Payment required.");
    await expect(page.locator(".catalog-recovery-attention")).toContainText("Repair the connection or scan models again.");

    await page.getByRole("tab", { name: "Routing Defaults" }).click();
    await expect(page.getByRole("alert")).toHaveText("Routing data could not be processed safely. Refresh and try again.");
    await expect(page.locator(".routing-matrix-row")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/worker (?:was )?launched|launch receipt/iu);
  });

  test("E011-PROV-004 presents a Pi Session catalog model without an API key, token, or launch receipt", async ({ page }) => {
    const piModel = catalogModel("pi-session", "pi-session-model", {
      providerKind: "pi_session",
      providerLabel: "Pi Session",
      displayName: "Pi session model",
    });
    const state: ModelsFixtureState = {
      connections: [connection("pi-session", "Pi Session", "local Pi session", "pi_session")],
      models: [piModel],
      scanResults: new Map([["pi-session", { result: scanResult("pi-session", "success", "Pi Session scan completed."), nextModels: [piModel] }]]),
      responseBodies: [],
    };
    await installModelsFixtures(page, state);
    await openModels(page);

    await page.getByRole("option", { name: "Pi Session · pi-session-model Pi session model" }).click();
    await page.getByRole("button", { name: "Scan selected connection" }).click();
    await expect(page.locator(".selected-model-detail .catalog-identity")).toHaveText("Pi Session · pi-session-model");
    await expect(page.getByText("Catalog scan completed.")).toBeVisible();
    await expect(page.getByLabel(/API key/i)).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/Pi (?:API )?token/i);
    await expect(page.getByText(/launch receipt/i)).toHaveCount(0);
  });
});
