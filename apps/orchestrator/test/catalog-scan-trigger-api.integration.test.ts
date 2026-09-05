import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogReconciliationStore, ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import type {
  AuthorizedCatalogTransport,
  AuthorizedCatalogTransportResult,
  PiCatalogProcess,
  PiCatalogProcessResult,
} from "../src/model-catalog/catalog-ports.js";
import { CatalogConnectionStateProjector } from "../src/model-catalog/catalog-connection-state-projector.js";
import { CatalogConnectionStateService } from "../src/model-catalog/catalog-connection-state-service.js";
import { CatalogDiscoveryService } from "../src/model-catalog/catalog-discovery-service.js";
import { CatalogFailClosedOutcomeWriter } from "../src/model-catalog/catalog-fail-closed-outcome-writer.js";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import { ProviderCatalogScanApplication } from "../src/model-catalog/provider-catalog-scan-application.js";
import { CatalogScanCoordinator } from "../src/model-catalog/catalog-scan-coordinator.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { handleModelCatalogRoutes } from "../src/transport/http/routes/model-catalog-routes.js";
import { handleProviderConnectionRoutes } from "../src/transport/http/routes/provider-connection-routes.js";

const featurePath = fileURLToPath(new URL("./catalog-scan-trigger-api.feature", import.meta.url));
const DISTINCTIVE_SECRET = "catalog-trigger-distinctive-secret";

class FakePiProcess implements PiCatalogProcess {
  calls = 0;
  async listModels(): Promise<PiCatalogProcessResult> {
    this.calls += 1;
    return { kind: "success", stdout: JSON.stringify({ models: [{ modelId: "pi-model" }] }) };
  }
}

class ControlledCatalogTransport implements AuthorizedCatalogTransport {
  calls = 0;
  readonly urls: string[] = [];
  result: AuthorizedCatalogTransportResult = {
    kind: "success",
    statusCode: 200,
    body: { data: [{ id: "custom-model" }] },
  };
  private blocked: Promise<void> | null = null;
  private releaseBlocked: (() => void) | null = null;

  blockNext(): void {
    this.blocked = new Promise((resolve) => { this.releaseBlocked = resolve; });
  }

  release(): void {
    this.releaseBlocked?.();
    this.blocked = null;
    this.releaseBlocked = null;
  }

  async requestModels(input: { readonly url: string }): Promise<AuthorizedCatalogTransportResult> {
    this.calls += 1;
    this.urls.push(input.url);
    const blocked = this.blocked;
    if (blocked) await blocked;
    return this.result;
  }
}

interface Fixture {
  readonly baseUrl: string;
  readonly providerService: ProviderConnectionService;
  readonly retryRequestCount: () => number;
  readonly server: Server;
  readonly transport: ControlledCatalogTransport;
}

async function createFixture(): Promise<Fixture> {
  const providerStore = ProviderConnectionStore.createInMemory();
  const catalogStore = ModelCatalogStore.createInMemory();
  const reconciliationStore = CatalogReconciliationStore.createInMemory();
  const vault = new InMemorySecretVault();
  const providerService = new ProviderConnectionService({
    store: providerStore,
    vault,
    transport: new FakeEndpointTransport(),
  });
  const transport = new ControlledCatalogTransport();
  const discovery = new CatalogDiscoveryService({
    connections: providerService,
    store: catalogStore,
    piScanner: new PiModelCatalogScanner(new FakePiProcess()),
    openAiScanner: new OpenAiCompatibleCatalogScanner(),
    credentialBroker: new ScanCredentialBroker(vault, transport),
    clock: { now: () => "2026-07-24T18:00:00.000Z" },
  });
  let attempt = 0;
  const coordinator = new CatalogScanCoordinator({
    connections: providerService,
    reconciliationStore,
    discovery,
    failureWriter: new CatalogFailClosedOutcomeWriter({ store: catalogStore }),
    clock: { now: () => "2026-07-24T18:00:00.000Z" },
    createAttemptId: () => `catalog-trigger-attempt-${++attempt}`,
  });
  const states = new CatalogConnectionStateService({
    connections: providerService,
    reconciliationStore,
    catalogStore,
    projector: new CatalogConnectionStateProjector(),
  });
  const mutations = new ProviderCatalogScanApplication(providerService, coordinator);
  let retryRequests = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (/^\/api\/model-catalog\/connections\/[^/]+\/scan$/.test(url.pathname)) retryRequests += 1;
    if (await handleProviderConnectionRoutes(request, response, url, {
      service: providerService,
      mutations,
    })) return;
    if (await handleModelCatalogRoutes(request, response, url, {
      connections: providerService,
      coordinator,
      states,
      store: catalogStore,
    })) return;
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected HTTP fixture port.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    providerService,
    retryRequestCount: () => retryRequests,
    server,
    transport,
  };
}

async function createCustom(fixture: Fixture, label = "Provider A"): Promise<{ connectionId: string }> {
  const response = await fetch(`${fixture.baseUrl}/api/provider-connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "custom",
      label,
      provider: { kind: "custom", label: "provider-a" },
      endpointUrl: "https://provider-a.test/v1",
      secretValue: DISTINCTIVE_SECRET,
    }),
  });
  expect(response.status).toBe(201);
  const body = await response.json() as { connectionId: string };
  expect(JSON.stringify(body)).not.toContain(DISTINCTIVE_SECRET);
  return body;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for deterministic test condition.");
}

describe("coordinated catalog trigger backend Gherkin", () => {
  const servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(close)); });

  it("binds the generic backend scenarios to real provider and model-catalog HTTP composition", async () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Material provider mutations scan only after durable persistence");
    expect(feature).toContain("Scenario: Revoked credentials can reactivate one connection safely");
    expect(feature).toContain("Scenario: Public scan state and forced retries remain isolated");
    expect(feature).toContain("Scenario: Deleted reconciliation history cannot hide current connections");
    expect(feature).toContain("no legacy results response or secret-bearing field is returned");

    const fixture = await createFixture();
    servers.push(fixture.server);
    const connection = await createCustom(fixture);
    expect(fixture.transport.calls).toBe(1);

    const labelOnly = await fetch(`${fixture.baseUrl}/api/provider-connections/${connection.connectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Provider A renamed" }),
    });
    expect(labelOnly.status).toBe(200);
    expect(fixture.transport.calls).toBe(1);

    const endpointChange = await fetch(`${fixture.baseUrl}/api/provider-connections/${connection.connectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpointUrl: "https://provider-a.test/v2" }),
    });
    expect(endpointChange.status).toBe(200);
    expect(fixture.transport.calls).toBe(2);

    const rejected = await fetch(`${fixture.baseUrl}/api/provider-connections/${connection.connectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpointUrl: "https://provider-a.test/v3", credential: DISTINCTIVE_SECRET }),
    });
    expect(rejected.status).toBe(400);
    const preflight = await fetch(`${fixture.baseUrl}/api/provider-connections/${connection.connectionId}/delete-preflight`);
    expect(preflight.status).toBe(200);
    expect(fixture.transport.calls).toBe(2);

    const states = await (await fetch(`${fixture.baseUrl}/api/model-catalog/connections`)).json() as {
      schemaVersion: string;
      connections: Array<{ connectionId: string; scanState: string }>;
    };
    expect(states.schemaVersion).toBe("catalog-reconciliation/v1");
    expect(states.connections).toContainEqual(expect.objectContaining({
      connectionId: connection.connectionId,
      scanState: "available",
    }));
    expect(JSON.stringify(states)).not.toMatch(new RegExp(`${DISTINCTIVE_SECRET}|secretRef|secretVersion|authorization`, "i"));
  });

  it("reactivates a revoked secret atomically and scans once after persistence", async () => {
    const fixture = await createFixture();
    servers.push(fixture.server);
    const connection = await createCustom(fixture);

    const revoke = await fetch(`${fixture.baseUrl}/api/provider-connections/${connection.connectionId}/secrets/revoke`, { method: "POST" });
    expect(revoke.status).toBe(200);
    const callsBeforeReplacement = fixture.transport.calls;
    expect(fixture.providerService.getConnection(connection.connectionId as never)?.lifecycleState).toBe("revoked");

    const replacement = await fetch(`${fixture.baseUrl}/api/provider-connections/${connection.connectionId}/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secretValue: "replacement-distinctive-secret" }),
    });
    expect(replacement.status).toBe(200);
    await expect(replacement.json()).resolves.toEqual({ version: 2 });
    expect(fixture.providerService.getConnection(connection.connectionId as never)).toMatchObject({
      lifecycleState: "active",
      secretVersion: 2,
    });
    expect(fixture.transport.calls).toBe(callsBeforeReplacement + 1);
  });

  it("omits hard-deleted ledger identities from state reads and all-active scans", async () => {
    const fixture = await createFixture();
    servers.push(fixture.server);
    const deleted = await createCustom(fixture, "Provider To Delete");
    const remaining = await createCustom(fixture, "Provider Remaining");

    const deletion = await fetch(
      `${fixture.baseUrl}/api/provider-connections/${deleted.connectionId}`,
      { method: "DELETE" },
    );
    expect(deletion.status).toBe(200);

    const readResponse = await fetch(`${fixture.baseUrl}/api/model-catalog/connections`);
    expect(readResponse.status).toBe(200);
    const readBody = await readResponse.json() as {
      schemaVersion: string;
      connections: Array<{ connectionId: string; scanState: string }>;
    };
    expect(readBody.schemaVersion).toBe("catalog-reconciliation/v1");
    expect(readBody).not.toHaveProperty("results");
    expect(readBody.connections).toEqual([
      expect.objectContaining({ connectionId: remaining.connectionId, scanState: "available" }),
    ]);

    const scanResponse = await fetch(`${fixture.baseUrl}/api/model-catalog/scan-active`, { method: "POST" });
    expect(scanResponse.status).toBe(200);
    const scanBody = await scanResponse.json() as {
      schemaVersion: string;
      connections: Array<{ connectionId: string; scanState: string }>;
    };
    expect(scanBody.schemaVersion).toBe("catalog-reconciliation/v1");
    expect(scanBody).not.toHaveProperty("results");
    expect(scanBody.connections).toEqual([
      expect.objectContaining({ connectionId: remaining.connectionId, scanState: "available" }),
    ]);
    expect(JSON.stringify({ readBody, scanBody })).not.toContain(deleted.connectionId);
  });

  it("deduplicates overlapping retry and isolates mixed all-active outcomes in the V1 response", async () => {
    const fixture = await createFixture();
    servers.push(fixture.server);
    const connection = await createCustom(fixture);
    const beforeOverlap = fixture.transport.calls;
    const retryRequestsBeforeOverlap = fixture.retryRequestCount();

    fixture.transport.blockNext();
    const first = fetch(`${fixture.baseUrl}/api/model-catalog/connections/${connection.connectionId}/scan`, { method: "POST" });
    let second: Promise<Response> | null = null;
    try {
      await waitFor(() => fixture.transport.calls === beforeOverlap + 1);
      second = fetch(`${fixture.baseUrl}/api/model-catalog/connections/${connection.connectionId}/scan`, { method: "POST" });
      await waitFor(() => fixture.retryRequestCount() === retryRequestsBeforeOverlap + 2);
    } finally {
      fixture.transport.release();
    }
    if (!second) throw new Error("The overlapping retry request was not dispatched.");
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fixture.transport.calls).toBe(beforeOverlap + 1);

    await fetch(`${fixture.baseUrl}/api/provider-connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "pi_session",
        label: "Pi Session",
        provider: { kind: "pi_session" },
        endpointUrl: "http://localhost:11434",
      }),
    });
    fixture.transport.result = { kind: "authentication_failed", statusCode: 401 };
    const scanAll = await fetch(`${fixture.baseUrl}/api/model-catalog/scan-active`, { method: "POST" });
    expect(scanAll.status).toBe(200);
    const body = await scanAll.json() as {
      schemaVersion: string;
      connections: Array<{ connectionId: string; scanState: string }>;
    };
    expect(body.schemaVersion).toBe("catalog-reconciliation/v1");
    expect(body).not.toHaveProperty("results");
    expect(body.connections.map((state) => state.connectionId))
      .toEqual([...body.connections.map((state) => state.connectionId)].sort());
    expect(body.connections.map((state) => state.scanState).sort()).toEqual(["available", "failed"]);
    expect(JSON.stringify(body)).not.toMatch(new RegExp(`${DISTINCTIVE_SECRET}|secretRef|secretVersion|authorization`, "i"));
  }, 15_000);
});
