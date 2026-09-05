import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogReconciliationStore, ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { CatalogConnectionStateProjector } from "../src/model-catalog/catalog-connection-state-projector.js";
import { CatalogConnectionStateService } from "../src/model-catalog/catalog-connection-state-service.js";
import { CatalogDiscoveryService } from "../src/model-catalog/catalog-discovery-service.js";
import { CatalogFailClosedOutcomeWriter } from "../src/model-catalog/catalog-fail-closed-outcome-writer.js";
import { CatalogScanCoordinator } from "../src/model-catalog/catalog-scan-coordinator.js";
import type { AuthorizedCatalogTransport, AuthorizedCatalogTransportResult, PiCatalogProcess, PiCatalogProcessResult } from "../src/model-catalog/catalog-ports.js";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";
import { handleModelCatalogRoutes } from "../src/transport/http/routes/model-catalog-routes.js";

class FakePiProcess implements PiCatalogProcess {
  calls = 0;
  async listModels(): Promise<PiCatalogProcessResult> {
    this.calls += 1;
    return { kind: "success", stdout: JSON.stringify({ models: [{ modelId: "pi-model", capabilities: { tools: true } }] }) };
  }
}

class FakeAuthorizedTransport implements AuthorizedCatalogTransport {
  calls = 0;
  result: AuthorizedCatalogTransportResult = {
    kind: "success",
    statusCode: 200,
    body: { data: [{ id: "compatible-model", name: "Compatible Model", context_window_tokens: 128000, capabilities: { tools: true, api: true } }] },
  };

  async requestModels(): Promise<AuthorizedCatalogTransportResult> {
    this.calls += 1;
    return this.result;
  }
}

async function createFixture() {
  const providerStore = ProviderConnectionStore.createInMemory();
  const catalogStore = ModelCatalogStore.createInMemory();
  const vault = new InMemorySecretVault();
  const connections = new ProviderConnectionService({ store: providerStore, vault, transport: new FakeEndpointTransport() });
  const custom = await connections.createConnection({
    kind: "custom",
    label: "Compatible",
    provider: { kind: "custom", label: "compatible" },
    endpointUrl: "https://compatible.test/v1",
    secretValue: "catalog-http-distinctive-secret",
  });
  const pi = await connections.createConnection({
    kind: "pi_session",
    label: "Pi Session",
    provider: { kind: "pi_session" },
    endpointUrl: "http://localhost:11434",
  });
  if (!custom.data || !pi.data) throw new Error("catalog HTTP fixture setup failed");
  const piProcess = new FakePiProcess();
  const transport = new FakeAuthorizedTransport();
  const discovery = new CatalogDiscoveryService({
    connections,
    store: catalogStore,
    piScanner: new PiModelCatalogScanner(piProcess),
    openAiScanner: new OpenAiCompatibleCatalogScanner(),
    credentialBroker: new ScanCredentialBroker(vault, transport),
    clock: { now: () => "2026-07-22T15:30:00.000Z" },
  });
  const reconciliationStore = CatalogReconciliationStore.createInMemory();
  let attempt = 0;
  const coordinator = new CatalogScanCoordinator({
    connections,
    reconciliationStore,
    discovery,
    failureWriter: new CatalogFailClosedOutcomeWriter({ store: catalogStore }),
    clock: { now: () => "2026-07-22T15:30:00.000Z" },
    createAttemptId: () => `catalog-http-attempt-${++attempt}`,
  });
  const states = new CatalogConnectionStateService({
    connections,
    reconciliationStore,
    catalogStore,
    projector: new CatalogConnectionStateProjector(),
  });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!await handleModelCatalogRoutes(request, response, url, { connections, coordinator, states, store: catalogStore })) {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected an HTTP port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, catalogStore, connections, custom: custom.data, pi: pi.data, piProcess, server, transport };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe("model catalog HTTP public boundary", () => {
  const servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(close)); });

  it("scans safe Pi and compatible catalogs through the composed routes and reads stable V1 DTOs", async () => {
    const fixture = await createFixture();
    servers.push(fixture.server);
    const connectionBefore = fixture.connections.listConnections().map(({ connectionId, lifecycleState, updatedAt }) => ({ connectionId, lifecycleState, updatedAt }));

    const compatibleScan = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan`, { method: "POST" });
    expect(compatibleScan.status).toBe(200);
    await expect(compatibleScan.json()).resolves.toMatchObject({
      schemaVersion: "catalog-reconciliation/v1",
      connection: { connectionId: fixture.custom.connectionId, modelCount: 1, scanState: "available", outcomeCode: "success" },
    });
    const piScan = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.pi.connectionId}/scan`, { method: "POST" });
    expect(piScan.status).toBe(200);

    const read = await fetch(`${fixture.baseUrl}/api/model-catalog`);
    expect(read.status).toBe(200);
    const body = await read.json() as { schemaVersion: string; models: Array<{ identity: { connectionId: string; modelId: string }; providerLabel: string }> };
    expect(body.schemaVersion).toBe("model-catalog/v1");
    expect(body.models.map((model) => `${model.identity.connectionId}/${model.identity.modelId}`)).toEqual(
      [...body.models.map((model) => `${model.identity.connectionId}/${model.identity.modelId}`)].sort(),
    );
    expect(body.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: { connectionId: fixture.custom.connectionId, modelId: "compatible-model" }, providerLabel: "Compatible" }),
      expect.objectContaining({ identity: { connectionId: fixture.pi.connectionId, modelId: "pi-model" }, providerLabel: "Pi Session" }),
    ]));
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("catalog-http-distinctive-secret");
    expect(serialized).not.toMatch(/secretRef|secretVersion|authorization|endpointUrl/i);
    expect(fixture.connections.listConnections().map(({ connectionId, lifecycleState, updatedAt }) => ({ connectionId, lifecycleState, updatedAt }))).toEqual(connectionBefore);
    expect(fixture.transport.calls).toBe(1);
    expect(fixture.piProcess.calls).toBe(1);
  });

  it("scans active connections through the public route in lexical connection order", async () => {
    const fixture = await createFixture();
    servers.push(fixture.server);

    const response = await fetch(`${fixture.baseUrl}/api/model-catalog/scan-active`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = await response.json() as { schemaVersion: string; connections: Array<{ connectionId: string; scanState: string }> };
    expect(body.schemaVersion).toBe("catalog-reconciliation/v1");
    expect(body).not.toHaveProperty("results");
    expect(body.connections).toHaveLength(2);
    expect(body.connections.map((result) => result.connectionId)).toEqual(
      [...body.connections.map((result) => result.connectionId)].sort(),
    );
    expect(body.connections.map((result) => result.scanState)).toEqual(["available", "available"]);
    expect(fixture.transport.calls).toBe(1);
    expect(fixture.piProcess.calls).toBe(1);
  });

  it("rejects malformed public input before scan work and clears only a failed connection snapshot", async () => {
    const fixture = await createFixture();
    servers.push(fixture.server);
    await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan`, { method: "POST" });
    await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.pi.connectionId}/scan`, { method: "POST" });
    const scansBeforeRefusal = fixture.transport.calls;

    const malformed = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan?unexpected=1`, { method: "POST" });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ errorCode: "invalid_request", message: "Invalid model catalog request." });
    expect(fixture.transport.calls).toBe(scansBeforeRefusal);
    const bodyRefusal = await fetch(`${fixture.baseUrl}/api/model-catalog/scan-active`, {
      body: JSON.stringify({ unexpected: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(bodyRefusal.status).toBe(400);
    await expect(bodyRefusal.json()).resolves.toEqual({ errorCode: "invalid_request", message: "Invalid model catalog request." });
    expect(fixture.transport.calls).toBe(scansBeforeRefusal);
    const missing = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/missing/scan`, { method: "POST" });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ errorCode: "connection_not_found", message: "Catalog connection was not found." });
    expect(fixture.transport.calls).toBe(scansBeforeRefusal);

    fixture.transport.result = { kind: "authentication_failed", statusCode: 401 };
    const failed = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan`, { method: "POST" });
    await expect(failed.json()).resolves.toMatchObject({
      schemaVersion: "catalog-reconciliation/v1",
      connection: { outcomeCode: "authentication_failed", modelCount: 0, scanState: "failed" },
    });
    const models = await (await fetch(`${fixture.baseUrl}/api/model-catalog`)).json() as { models: Array<{ identity: { connectionId: string } }> };
    expect(models.models.map((model) => model.identity.connectionId)).not.toContain(fixture.custom.connectionId);
    expect(models.models.map((model) => model.identity.connectionId)).toContain(fixture.pi.connectionId);
    const diagnostics = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/diagnostics?limit=2`);
    const diagnosticBody = await diagnostics.json() as { schemaVersion: string; diagnostics: Array<{ outcome: string; safeMessage: string }> };
    expect(diagnosticBody.schemaVersion).toBe("model-catalog/v1");
    expect(diagnosticBody.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: "authentication_failed", safeMessage: "Provider authentication was rejected." }),
    ]));
    const invalidLimit = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/diagnostics?limit=00`);
    expect(invalidLimit.status).toBe(400);
    await expect(invalidLimit.json()).resolves.toEqual({ errorCode: "invalid_request", message: "Invalid model catalog request." });
    const scansBeforeInactiveRefusal = fixture.transport.calls;
    await expect(fixture.connections.revokeSecret(fixture.custom.connectionId)).resolves.toMatchObject({ success: true });
    const inactive = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan`, { method: "POST" });
    expect(inactive.status).toBe(409);
    await expect(inactive.json()).resolves.toEqual({ errorCode: "connection_not_scannable", message: "Catalog connection is not active." });
    expect(fixture.transport.calls).toBe(scansBeforeInactiveRefusal);
    expect(fixture.catalogStore.listModelsForConnection(fixture.pi.connectionId)).toHaveLength(1);
  });
});
