import { describe, expect, it } from "vitest";
import { ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { CatalogDiscoveryService } from "../src/model-catalog/catalog-discovery-service.js";
import type { AuthorizedCatalogTransport, AuthorizedCatalogTransportResult, PiCatalogProcess, PiCatalogProcessResult } from "../src/model-catalog/catalog-ports.js";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";

const DISTINCTIVE_FAKE_SECRET = "catalog-secret-SINK-123456789-abcdefghijklmnop";
const OPAQUE_REF = "catalog-opaque-secret-reference";

class NoSecretPiProcess implements PiCatalogProcess {
  calls: Array<{ timeoutMs: number; maxStdoutBytes: number }> = [];
  async listModels(input: { readonly timeoutMs: number; readonly maxStdoutBytes: number }): Promise<PiCatalogProcessResult> {
    this.calls.push(input);
    return { kind: "success", stdout: JSON.stringify({ models: [{ modelId: "pi-safe-model" }] }) };
  }
}

class RedactingTransport implements AuthorizedCatalogTransport {
  calls = 0;
  async requestModels(_input: { readonly url: string; readonly authorizationHeader: string; readonly timeoutMs: number }): Promise<AuthorizedCatalogTransportResult> {
    this.calls += 1;
    // The authorization value is intentionally not captured by the fake.
    return { kind: "success", statusCode: 200, body: { data: [{ id: "safe-model" }] } };
  }
}

function assertNoSensitiveValue(value: unknown, sink: string): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [DISTINCTIVE_FAKE_SECRET, OPAQUE_REF, "secretVersion", "Authorization", "Bearer "]) {
    expect(serialized, sink).not.toContain(forbidden);
  }
}

describe("model catalog discovery sink redaction", () => {
  it("keeps scan credential material out of results, persisted models, and diagnostics", async () => {
    const providerStore = ProviderConnectionStore.createInMemory();
    const vault = new InMemorySecretVault();
    await vault.createSecret(OPAQUE_REF, DISTINCTIVE_FAKE_SECRET);
    const connections = new ProviderConnectionService({ store: providerStore, vault, transport: new FakeEndpointTransport() });
    const now = "2026-07-22T12:00:00.000Z";
    providerStore.insertConnection({
      connectionId: "safe-connection" as any,
      kind: "custom",
      label: "Safe connection",
      provider: { kind: "custom", label: "safe" },
      endpointUrl: "https://safe-provider.test/v1",
      endpointLocal: false,
      lifecycleState: "active",
      secretRef: OPAQUE_REF,
      secretVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    const store = ModelCatalogStore.createInMemory();
    const transport = new RedactingTransport();
    const service = new CatalogDiscoveryService({
      connections,
      store,
      piScanner: new PiModelCatalogScanner(new NoSecretPiProcess()),
      openAiScanner: new OpenAiCompatibleCatalogScanner(),
      credentialBroker: new ScanCredentialBroker(vault, transport),
      clock: { now: () => now },
    });

    const result = await service.scanConnection({ connectionId: "safe-connection", scanCorrelationId: "safe-scan" });
    assertNoSensitiveValue(result, "scan result");
    assertNoSensitiveValue(store.listModels(), "catalog model storage");
    assertNoSensitiveValue(store.listDiagnostics("safe-connection" as any), "catalog diagnostics");
    expect(transport.calls).toBe(1);
  });

  it("runs Pi discovery without a vault or HEPHA-injected provider secret", async () => {
    const process = new NoSecretPiProcess();
    const result = await new PiModelCatalogScanner(process).scan();
    assertNoSensitiveValue(result, "Pi scanner result");
    expect(process.calls).toEqual([{ timeoutMs: 10_000, maxStdoutBytes: 1_048_576 }]);
  });
});
