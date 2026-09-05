import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogReconciliationStore, ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

const featurePath = fileURLToPath(new URL("./feat-059-model-discovery.feature", import.meta.url));

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
    body: { data: [{ id: "compatible-model", capabilities: { tools: true } }] },
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
    secretValue: "gherkin-distinctive-secret",
  });
  const pi = await connections.createConnection({
    kind: "pi_session",
    label: "Pi Session",
    provider: { kind: "pi_session" },
    endpointUrl: "http://localhost:11434",
  });
  if (!custom.data || !pi.data) throw new Error("catalog Gherkin fixture setup failed");
  const piProcess = new FakePiProcess();
  const transport = new FakeAuthorizedTransport();
  const discovery = new CatalogDiscoveryService({
    connections,
    store: catalogStore,
    piScanner: new PiModelCatalogScanner(piProcess),
    openAiScanner: new OpenAiCompatibleCatalogScanner(),
    credentialBroker: new ScanCredentialBroker(vault, transport),
    clock: { now: () => "2026-07-22T17:30:00.000Z" },
  });
  const reconciliationStore = CatalogReconciliationStore.createInMemory();
  let attempt = 0;
  const coordinator = new CatalogScanCoordinator({
    connections,
    reconciliationStore,
    discovery,
    failureWriter: new CatalogFailClosedOutcomeWriter({ store: catalogStore }),
    clock: { now: () => "2026-07-22T17:30:00.000Z" },
    createAttemptId: () => `catalog-gherkin-attempt-${++attempt}`,
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
  return { baseUrl: `http://127.0.0.1:${address.port}`, custom: custom.data, pi: pi.data, piProcess, server, transport };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe("safe model catalog discovery backend Gherkin", () => {
  const servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(close)); });

  it("keeps the FEAT-059 public catalog scenarios observable and bounded to backend behavior", async () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Safe connection-plus-model metadata is available through the catalog boundary");
    expect(feature).toContain("Scenario: An authenticated compatible scan makes its model safely selectable");
    expect(feature).toContain("Scenario: A failed scan removes only its stale connection snapshot");
    expect(feature).toContain("Scenario: Pi Session discovery does not require catalog credential injection");
    expect(feature).toContain("no catalog response exposes an endpoint, credential, vault reference, or secret version");
    expect(feature).toContain("the other connection retains its catalog model");
    expect(feature).toContain("does not use the compatible-provider credential transport");
    expect(feature).not.toMatch(/browser|Playwright|routing policy|worker launch/i);

    const fixture = await createFixture();
    servers.push(fixture.server);
    const piScan = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.pi.connectionId}/scan`, { method: "POST" });
    expect(piScan.status).toBe(200);
    await expect(piScan.json()).resolves.toMatchObject({
      connection: { connectionId: fixture.pi.connectionId, modelCount: 1, scanState: "available" },
    });
    expect(fixture.piProcess.calls).toBe(1);
    expect(fixture.transport.calls).toBe(0);

    const compatibleScan = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan`, { method: "POST" });
    expect(compatibleScan.status).toBe(200);
    await expect(compatibleScan.json()).resolves.toMatchObject({
      connection: { connectionId: fixture.custom.connectionId, modelCount: 1, scanState: "available" },
    });
    const read = await fetch(`${fixture.baseUrl}/api/model-catalog`);
    const catalog = await read.json() as { models: Array<{ identity: { connectionId: string; modelId: string } }> };
    expect(catalog.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ identity: { connectionId: fixture.pi.connectionId, modelId: "pi-model" } }),
      expect.objectContaining({ identity: { connectionId: fixture.custom.connectionId, modelId: "compatible-model" } }),
    ]));
    expect(JSON.stringify(catalog)).not.toMatch(/gherkin-distinctive-secret|secretRef|secretVersion|authorization|endpointUrl/i);

    fixture.transport.result = { kind: "authentication_failed", statusCode: 401 };
    const failedScan = await fetch(`${fixture.baseUrl}/api/model-catalog/connections/${fixture.custom.connectionId}/scan`, { method: "POST" });
    await expect(failedScan.json()).resolves.toMatchObject({
      connection: { connectionId: fixture.custom.connectionId, modelCount: 0, scanState: "failed", outcomeCode: "authentication_failed" },
    });
    const afterFailure = await (await fetch(`${fixture.baseUrl}/api/model-catalog`)).json() as { models: Array<{ identity: { connectionId: string } }> };
    expect(afterFailure.models.map((model) => model.identity.connectionId)).not.toContain(fixture.custom.connectionId);
    expect(afterFailure.models.map((model) => model.identity.connectionId)).toContain(fixture.pi.connectionId);
  });
});
