import { describe, expect, it } from "vitest";
import type { ProviderConnectionId, ProviderConnectionRecord } from "@hepha/shared";
import type { SecretVaultAdapter } from "../src/provider-connections/secret-vault.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";
import type { AuthorizedCatalogTransport, AuthorizedCatalogTransportResult } from "../src/model-catalog/catalog-ports.js";

const connection: ProviderConnectionRecord = {
  connectionId: "broker-connection" as ProviderConnectionId,
  kind: "custom",
  label: "Broker provider",
  provider: { kind: "custom", label: "broker-provider" },
  endpointUrl: "https://provider.test/v1",
  endpointLocal: false,
  lifecycleState: "active",
  secretRef: "opaque-secret-ref",
  secretVersion: 7,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
};

class FakeVault implements Pick<SecretVaultAdapter, "isAvailable" | "readSecret"> {
  readCount = 0;
  constructor(private readonly value: string | null, private readonly available = true) {}
  isAvailable(): boolean { return this.available; }
  async readSecret(_refId: string): Promise<string | null> { this.readCount += 1; return this.value; }
}

class FakeTransport implements AuthorizedCatalogTransport {
  callCount = 0;
  urls: string[] = [];
  constructor(private readonly result: AuthorizedCatalogTransportResult) {}
  async requestModels(input: { readonly url: string; readonly authorizationHeader: string; readonly timeoutMs: number }): Promise<AuthorizedCatalogTransportResult> {
    this.callCount += 1;
    this.urls.push(input.url);
    // The fake deliberately never persists, serializes, or exposes the header.
    return this.result;
  }
}

describe("ScanCredentialBroker", () => {
  it("reads one opaque vault reference and makes one /models request", async () => {
    const vault = new FakeVault("broker-test-secret");
    const transport = new FakeTransport({ kind: "success", statusCode: 200, body: { data: [] } });
    const result = await new ScanCredentialBroker(vault as SecretVaultAdapter, transport).requestModels(connection);

    expect(result).toEqual({ kind: "success", statusCode: 200, body: { data: [] } });
    expect(vault.readCount).toBe(1);
    expect(transport.callCount).toBe(1);
    expect(transport.urls).toEqual(["https://provider.test/v1/models"]);
  });

  it.each([
    [{ ...connection, lifecycleState: "revoked" } as ProviderConnectionRecord, "not_scannable"],
    [{ ...connection, kind: "pi_session", secretRef: null, secretVersion: null } as ProviderConnectionRecord, "not_scannable"],
    [{ ...connection, secretRef: null } as ProviderConnectionRecord, "not_scannable"],
    [{ ...connection, endpointUrl: "http://remote.test/v1" } as ProviderConnectionRecord, "not_scannable"],
  ])("rejects ineligible connection before a vault read", async (ineligibleConnection, expectedKind) => {
    const vault = new FakeVault("broker-test-secret");
    const transport = new FakeTransport({ kind: "success", statusCode: 200, body: {} });
    await expect(new ScanCredentialBroker(vault as SecretVaultAdapter, transport).requestModels(ineligibleConnection)).resolves.toEqual({ kind: expectedKind });
    expect(vault.readCount).toBe(0);
    expect(transport.callCount).toBe(0);
  });

  it("rejects unavailable vault and null secret without making a request", async () => {
    const unavailableVault = new FakeVault("broker-test-secret", false);
    const nullSecretVault = new FakeVault(null);
    const transport = new FakeTransport({ kind: "success", statusCode: 200, body: {} });

    await expect(new ScanCredentialBroker(unavailableVault as SecretVaultAdapter, transport).requestModels(connection)).resolves.toEqual({ kind: "vault_unavailable" });
    await expect(new ScanCredentialBroker(nullSecretVault as SecretVaultAdapter, transport).requestModels(connection)).resolves.toEqual({ kind: "authentication_failed", statusCode: 401 });
    expect(unavailableVault.readCount).toBe(0);
    expect(nullSecretVault.readCount).toBe(1);
    expect(transport.callCount).toBe(0);
  });
});
