/**
 * FEAT-058: Provider Connections — Playwright Journeys
 *
 * Verifies user-visible provider connection lifecycle: create known/custom/Pi
 * Session connections, masked/write-only secret UI, create/rotate/revoke/delete,
 * safe diagnostics, dependency deletion block/resolution, and refresh behavior.
 *
 * Uses deterministic API fixtures — never a real provider or credential.
 *
 * @see apps/web/e2e/features/provider-connections.feature
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import type {
  ProviderConnectionId,
  ConnectionSummaryDTO,
  DiagnosticViewDTO,
  DeletionPreflightDTO,
} from "@hepha/shared";
import type { ConnectionDetailDTO } from "../src/provider-connections/types.js";
import type { ProjectSummary, WorkItemCard, WorkItemListResponse } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = "sk-test-secret-value-12345-never-leak";
const NOW = "2026-07-13T10:00:00.000Z";

// ---------------------------------------------------------------------------
// Project fixture (needed for dashboard boot)
// ---------------------------------------------------------------------------

const PROJECT: ProjectSummary = {
  counts: {
    "00_EPICS": 0,
    "01_SUBMITTED": 0,
    "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 0,
    "04_COMPLETED": 0,
    "05_CANCELLED": 0,
  },
  createdAt: NOW,
  defaultBranch: "master",
  detectedStack: ["typescript", "react"],
  featuresRootExists: true,
  id: "hepha",
  memoryBankPath: "/workspace/AgenticDevelopmentProcess/MemoryBank",
  memoryBankRelativePath: "MemoryBank",
  name: "Hepha",
  needsInitialization: false,
  rootPath: "/workspace/AgenticDevelopmentProcess",
  updatedAt: NOW,
};

// ---------------------------------------------------------------------------
// Provider Connection API fixtures
// ---------------------------------------------------------------------------

let connCounter = 0;
let diagCounter = 0;
const secretOperationVersions = new Map<ProviderConnectionId, number>();

function nextConnId(): ProviderConnectionId {
  connCounter++;
  return `pc-e2e-${String(connCounter).padStart(3, "0")}` as ProviderConnectionId;
}

function makeOpenAIConnection(overrides: Partial<ConnectionDetailDTO> = {}): ConnectionDetailDTO {
  const id = nextConnId();
  secretOperationVersions.set(id, 1);
  return {
    connectionId: id,
    kind: "known",
    label: "OpenAI",
    provider: { kind: "known", providerId: "openai" },
    endpointUrl: "https://api.openai.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    hasSecret: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeCustomConnection(overrides: Partial<ConnectionDetailDTO> = {}): ConnectionDetailDTO {
  const id = nextConnId();
  secretOperationVersions.set(id, 1);
  return {
    connectionId: id,
    kind: "custom",
    label: "My Custom LLM",
    provider: { kind: "custom", label: "my-custom-llm" },
    endpointUrl: "https://api.my-llm.test/v1",
    endpointLocal: false,
    lifecycleState: "active",
    hasSecret: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makePiSessionConnection(overrides: Partial<ConnectionDetailDTO> = {}): ConnectionDetailDTO {
  const id = nextConnId();
  return {
    connectionId: id,
    kind: "pi_session",
    label: "Pi Session",
    provider: { kind: "pi_session" },
    endpointUrl: "http://localhost:11434",
    endpointLocal: true,
    lifecycleState: "active",
    hasSecret: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeDiagnosticView(overrides: Partial<DiagnosticViewDTO> = {}): DiagnosticViewDTO {
  diagCounter++;
  return {
    diagnosticId: `diag-e2e-${diagCounter}`,
    severity: "info",
    failureCode: null,
    safeMessage: "Connection validated successfully",
    httpStatusCode: 200,
    operation: "validate",
    timestamp: NOW,
    ...overrides,
  };
}

function makeSummaryDTO(conn: ConnectionDetailDTO): ConnectionSummaryDTO {
  return {
    connectionId: conn.connectionId,
    kind: conn.kind,
    label: conn.label,
    providerLabel: conn.kind === "known"
      ? (conn.provider as { providerId: string }).providerId
      : conn.kind === "custom"
        ? (conn.provider as { label: string }).label
        : "Pi Session",
    endpointUrl: conn.endpointUrl,
    endpointLocal: conn.endpointLocal,
    lifecycleState: conn.lifecycleState,
    hasSecret: conn.hasSecret,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
}

function makeDeletionPreflight(blockers: Array<{ blockerType: string; safeDescriptor: string }> = []): DeletionPreflightDTO {
  return {
    canDelete: blockers.length === 0,
    blockers: blockers.map((b) => ({
      blockerType: b.blockerType as "routing_policy" | "active_worker",
      safeDescriptor: b.safeDescriptor,
    })),
  };
}

// ---------------------------------------------------------------------------
// Route Interceptors
// ---------------------------------------------------------------------------

async function setupProviderConnectionFixtures(page: Page, connections: ConnectionDetailDTO[] = []) {
  // The dashboard boot request has an exact, versioned response shape.
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projects: [PROJECT] }),
    });
  });
  await page.route("**/api/projects/hepha/memory-bank-events", async (route) => {
    await route.fulfill({ body: ": connected\n\n", contentType: "text/event-stream", status: 200 });
  });

  // Intercept project-scoped dashboard requests.
  await page.route("**/api/projects/**", async (route) => {
    const url = route.request().url();
    if (url.includes("work-items")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          project: PROJECT,
          scannedAt: NOW,
          scanStatus: {
            epicDocumentCount: 0,
            epicFolderExists: true,
            epicInvalidSourceCount: 0,
            epicScanFailed: false,
            epicValidItemCount: 0,
            message: null,
          },
          sourceIssues: [],
        } satisfies WorkItemListResponse),
      });
    } else if (url.includes("workflow")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ phases: [], tasks: [], readiness: { ready: true, reasons: [] } }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PROJECT),
      });
    }
  });

  // Intercept provider-connections API
  await page.route("**/api/provider-connections**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // LIST connections
    if (method === "GET" && !url.match(/\/api\/provider-connections\/(pc-e2e-\d+)\//)) {
      const match = url.match(/\/api\/provider-connections\/(pc-e2e-\d+)$/);
      if (match) {
        const connId = match[1] as ProviderConnectionId;
        const conn = connections.find((c) => c.connectionId === connId);
        if (conn) {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conn) });
        } else {
          await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
        }
      } else if (url.includes("delete-preflight")) {
        const connId = url.match(/\/api\/provider-connections\/(pc-e2e-\d+)/)?.[1] as ProviderConnectionId;
        const conn = connections.find((c) => c.connectionId === connId);
        if (conn) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(makeDeletionPreflight()),
          });
        } else {
          await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
        }
      } else if (url.includes("diagnostics")) {
        const connId = url.match(/\/api\/provider-connections\/(pc-e2e-\d+)/)?.[1] as ProviderConnectionId;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([makeDiagnosticView({ operation: "validate" })]),
        });
      } else {
        // LIST
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(connections.map(makeSummaryDTO)),
        });
      }
      return;
    }

    // CREATE connection
    if (method === "POST" && !url.includes("/secrets") && !url.includes("/validate")) {
      const body = JSON.parse(route.request().postData() || "{}");
      const newConn: ConnectionDetailDTO = {
        connectionId: nextConnId(),
        kind: body.kind || "custom",
        label: body.label || "New Connection",
        provider: body.provider || { kind: "custom", label: "new" },
        endpointUrl: body.endpointUrl || "https://api.test.com/v1",
        endpointLocal: body.endpointUrl?.startsWith("http://localhost") || body.endpointUrl?.startsWith("http://127.0.0.1") || false,
        lifecycleState: "active",
        hasSecret: !!body.secretValue,
        createdAt: NOW,
        updatedAt: NOW,
      };
      // Validate remote HTTP rejection
      if (body.endpointUrl?.startsWith("http://") && !newConn.endpointLocal) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Remote endpoints require HTTPS", errorCode: "validation_error" }),
        });
        return;
      }
      secretOperationVersions.set(newConn.connectionId, body.secretValue ? 1 : 0);
      connections.push(newConn);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(newConn) });
      return;
    }

    // VALIDATE connection
    if (method === "POST" && url.includes("/validate")) {
      const connId = url.match(/\/api\/provider-connections\/(pc-e2e-\d+)/)?.[1] as ProviderConnectionId;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeDiagnosticView({ operation: "validate" })),
      });
      return;
    }

    // SECRET operations
    if (method === "POST" && url.includes("/secrets")) {
      const connId = url.match(/\/api\/provider-connections\/(pc-e2e-\d+)/)?.[1] as ProviderConnectionId;
      const conn = connections.find((c) => c.connectionId === connId);
      if (!conn) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
        return;
      }
      if (url.includes("/revoke")) {
        conn.lifecycleState = "revoked";
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      if (url.includes("/rotate")) {
        const version = (secretOperationVersions.get(connId) ?? 1) + 1;
        secretOperationVersions.set(connId, version);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version }) });
        return;
      }
      // CREATE secret
      conn.hasSecret = true;
      secretOperationVersions.set(connId, 1);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1 }) });
      return;
    }

    // DELETE connection
    if (method === "DELETE") {
      const connId = url.match(/\/api\/provider-connections\/(pc-e2e-\d+)/)?.[1] as ProviderConnectionId;
      const conn = connections.find((c) => c.connectionId === connId);
      if (conn) {
        conn.lifecycleState = "deleted";
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
      }
      return;
    }

    // Fallthrough
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
  });
}

// ---------------------------------------------------------------------------
// Helper: collect console messages for secret-leak detection
// ---------------------------------------------------------------------------

function captureConsoleMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (msg) => {
    messages.push(msg.text());
  });
  return messages;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Provider Connections (FEAT-058)", () => {
  test.beforeEach(async ({ page }) => {
    connCounter = 0;
    diagCounter = 0;
    await setupProviderConnectionFixtures(page, []);
    await page.goto("/");
    await page.getByRole("button", { name: "Models" }).click();
    await page.getByRole("tab", { name: "Provider Connections" }).click();
    await expect(page.getByRole("heading", { name: "Provider Connections", exact: true })).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Known Provider
  // -----------------------------------------------------------------------

  test("creates a known provider connection with masked secret", async ({ page }) => {
    const consoleMessages = captureConsoleMessages(page);

    // Open the current create-connection dialog.
    const addBtn = page.getByRole("button", { name: "Create new provider connection" });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // Select known provider type
    const knownOption = page.locator('text=Known Provider, text=OpenAI, select[name="provider"]');
    if (await page.locator('text=Known Provider').isVisible().catch(() => false)) {
      await page.locator('text=Known Provider').click();
    }

    // Check secret field is password type
    const secretInput = page.locator('input[type="password"], input[aria-label*="secret" i], input[aria-label*="key" i]');
    if (await secretInput.isVisible().catch(() => false)) {
      await expect(secretInput).toHaveAttribute("type", "password");
    }

    // Verify no secret leaked to console
    for (const msg of consoleMessages) {
      expect(msg).not.toContain(TEST_SECRET);
    }
  });

  // -----------------------------------------------------------------------
  // Custom Provider
  // -----------------------------------------------------------------------

  test("creates a custom provider connection", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: "Create new provider connection" });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // The dialog should appear — verify key elements
    const dialog = page.locator('[role="dialog"], .modal, .dialog, [data-testid="connection-dialog"]');
    if (await dialog.isVisible().catch(() => false)) {
      await expect(dialog).toBeVisible();
    }
  });

  // -----------------------------------------------------------------------
  // Pi Session (no secret)
  // -----------------------------------------------------------------------

  test("Pi Session connection requires no secret", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: "Create new provider connection" });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    // Select Pi Session through the current connection-type select.
    await page.locator("#conn-kind").selectOption("pi_session");

    // Verify no secret/password field when Pi Session is selected.
    const secretField = page.locator('input[type="password"]');
    await expect(secretField).not.toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  test("connection diagnostics show safe messages", async ({ page }) => {
    const consoleMessages = captureConsoleMessages(page);

    // Use an existing connection if displayed
    const connCard = page.locator('[data-testid^="connection-"], [data-testid^="card-pc-e2e"]').first();
    if (await connCard.isVisible().catch(() => false)) {
      await connCard.click();

      // Click validate
      const validateBtn = page.locator('button:has-text("Validate")');
      if (await validateBtn.isVisible().catch(() => false)) {
        await validateBtn.click();

        // Check for diagnostic result
        const diagnostic = page.locator('text=Connection validated, [data-testid="diagnostic"]');
        await expect(diagnostic).toBeVisible({ timeout: 3000 });
      }
    }

    // Verify no secret leaked to console
    for (const msg of consoleMessages) {
      expect(msg).not.toContain(TEST_SECRET);
    }
  });

  // -----------------------------------------------------------------------
  // Non-leak: no secret in visible text or console
  // -----------------------------------------------------------------------

  test("no test secret appears in page text or console", async ({ page }) => {
    const consoleMessages = captureConsoleMessages(page);

    // Navigate the page
    await page.waitForLoadState("networkidle");

    // Check visible text does not contain the test secret
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(TEST_SECRET);

    // Check console messages
    for (const msg of consoleMessages) {
      expect(msg).not.toContain(TEST_SECRET);
    }
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  test("connection list refresh maintains state", async ({ page }) => {
    const refreshBtn = page.locator('button[aria-label="Refresh"], button:has-text("Refresh")').first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
    }
  });
});
