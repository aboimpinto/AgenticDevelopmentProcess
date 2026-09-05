import { describe, expect, it } from "vitest";
import { ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import type { ProviderConnectionId } from "@hepha/shared";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { CatalogDiscoveryService } from "../src/model-catalog/catalog-discovery-service.js";
import type { AuthorizedCatalogTransport, AuthorizedCatalogTransportResult, PiCatalogProcess, PiCatalogProcessResult } from "../src/model-catalog/catalog-ports.js";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";

class FakePiProcess implements PiCatalogProcess {
  calls = 0;
  constructor(private readonly result: PiCatalogProcessResult) {}
  async listModels(): Promise<PiCatalogProcessResult> { this.calls += 1; return this.result; }
}

class FakeTransport implements AuthorizedCatalogTransport {
  calls = 0;
  constructor(public result: AuthorizedCatalogTransportResult) {}
  async requestModels(_input: { readonly url: string; readonly authorizationHeader: string; readonly timeoutMs: number }): Promise<AuthorizedCatalogTransportResult> {
    this.calls += 1;
    return this.result;
  }
}

async function createFixture() {
  const providerStore = ProviderConnectionStore.createInMemory();
  const vault = new InMemorySecretVault();
  const connections = new ProviderConnectionService({ store: providerStore, vault, transport: new FakeEndpointTransport() });
  const pi = await connections.createConnection({
    kind: "pi_session", label: "Pi Session", provider: { kind: "pi_session" }, endpointUrl: "http://localhost:11434",
  });
  const custom = await connections.createConnection({
    kind: "custom", label: "Compatible", provider: { kind: "custom", label: "compatible" }, endpointUrl: "https://compatible.test/v1", secretValue: "integration-secret",
  });
  if (!pi.data || !custom.data) throw new Error("fixture creation failed");
  const store = ModelCatalogStore.createInMemory();
  const piProcess = new FakePiProcess({ kind: "success", stdout: JSON.stringify({ models: [{ modelId: "pi-model" }] }) });
  const transport = new FakeTransport({ kind: "success", statusCode: 200, body: { data: [{ id: "compatible-model" }] } });
  const service = new CatalogDiscoveryService({
    connections,
    store,
    piScanner: new PiModelCatalogScanner(piProcess),
    openAiScanner: new OpenAiCompatibleCatalogScanner(),
    credentialBroker: new ScanCredentialBroker(vault, transport),
    clock: { now: () => "2026-07-22T12:00:00.000Z" },
  });
  return { connections, custom: custom.data, pi: pi.data, piProcess, service, store, transport };
}

describe("CatalogDiscoveryService", () => {
  it("scans Pi Session without a vault read and persists a normalized safe result", async () => {
    const fixture = await createFixture();
    const result = await fixture.service.scanConnection({ connectionId: fixture.pi.connectionId, scanCorrelationId: "pi-scan" });

    expect(result.outcome).toBe("success");
    expect(result.modelCount).toBe(1);
    expect(fixture.piProcess.calls).toBe(1);
    expect(fixture.transport.calls).toBe(0);
    expect(fixture.store.listModelsForConnection(fixture.pi.connectionId)).toMatchObject([{ identity: { modelId: "pi-model" }, providerLabel: "Pi Session" }]);
  });

  it("makes one authenticated OpenAI-compatible scan and atomically clears a failed rescan", async () => {
    const fixture = await createFixture();
    await expect(fixture.service.scanConnection({ connectionId: fixture.custom.connectionId, scanCorrelationId: "custom-success" })).resolves.toMatchObject({ outcome: "success", modelCount: 1 });
    fixture.transport.result = { kind: "redirect_rejected", statusCode: 302 };

    await expect(fixture.service.scanConnection({ connectionId: fixture.custom.connectionId, scanCorrelationId: "custom-failure" })).resolves.toMatchObject({ outcome: "redirect_rejected", modelCount: 0 });
    expect(fixture.transport.calls).toBe(2);
    expect(fixture.store.listModelsForConnection(fixture.custom.connectionId)).toEqual([]);
    expect(fixture.store.listDiagnostics(fixture.custom.connectionId, 2).map((diagnostic) => diagnostic.outcome).sort()).toEqual(["redirect_rejected", "success"]);
  });

  it("rejects absent, primitive, incomplete, and extra-key claim correlation before provider or store work", async () => {
    const fixture = await createFixture();
    for (const malformed of [
      undefined,
      "connection-id-only",
      { connectionId: fixture.pi.connectionId },
      { connectionId: fixture.pi.connectionId, scanCorrelationId: "attempt", extra: true },
      { connectionId: fixture.pi.connectionId, scanCorrelationId: null },
    ]) {
      await expect(fixture.service.scanConnection(malformed as never))
        .rejects.toThrow("Invalid catalog discovery scan request.");
    }
    expect(fixture.piProcess.calls).toBe(0);
    expect(fixture.transport.calls).toBe(0);
    expect(fixture.store.listModels()).toEqual([]);
  });

  it("sorts active connections and refuses inactive records before scanner or store work", async () => {
    const fixture = await createFixture();
    const active = fixture.connections.listConnections()
      .filter((connection) => connection.lifecycleState === "active")
      .sort((left, right) => left.connectionId < right.connectionId ? -1 : left.connectionId > right.connectionId ? 1 : 0);
    const results = [];
    for (const [index, connection] of active.entries()) {
      results.push(await fixture.service.scanConnection({
        connectionId: connection.connectionId,
        scanCorrelationId: `ordered-scan-${index}`,
      }));
    }
    expect(results.map((result) => result.connectionId)).toEqual([...results.map((result) => result.connectionId)].sort());

    await fixture.connections.revokeSecret(fixture.custom.connectionId);
    const refused = await fixture.service.scanConnection({ connectionId: fixture.custom.connectionId, scanCorrelationId: "inactive-scan" });
    expect(refused.outcome).toBe("not_scannable");
    expect(fixture.transport.calls).toBe(1);
    expect(fixture.store.listModelsForConnection(fixture.custom.connectionId as ProviderConnectionId)).toHaveLength(1);
  });
});
