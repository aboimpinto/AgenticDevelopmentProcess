import { describe, expect, it, vi } from "vitest";
import { ProviderConnectionStore } from "@hepha/db";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { ProviderCatalogScanApplication } from "../src/model-catalog/provider-catalog-scan-application.js";

function fixture() {
  const store = ProviderConnectionStore.createInMemory();
  const service = new ProviderConnectionService({
    store,
    vault: new InMemorySecretVault(),
    transport: new FakeEndpointTransport(),
  });
  const scanConnection = vi.fn().mockResolvedValue({});
  const application = new ProviderCatalogScanApplication(service, { scanConnection } as never);
  return { application, scanConnection, service, store };
}

async function createCustom(application: ProviderCatalogScanApplication) {
  const result = await application.createConnection({
    kind: "custom",
    label: "Provider A",
    provider: { kind: "custom", label: "provider-a" },
    endpointUrl: "https://provider-a.test/v1",
    secretValue: "distinctive-provider-secret",
  });
  if (!result.data) throw new Error("Expected provider fixture creation.");
  return result.data;
}

describe("ProviderCatalogScanApplication", () => {
  it("scans active creation, material endpoint change, and credential rotation exactly once", async () => {
    const { application, scanConnection } = fixture();
    const connection = await createCustom(application);
    expect(scanConnection).toHaveBeenNthCalledWith(1, {
      connectionId: connection.connectionId,
      trigger: "connection_created",
      mode: "force_settled",
    });

    await application.updateConnection(connection.connectionId, { label: "Provider A renamed" });
    expect(scanConnection).toHaveBeenCalledTimes(1);

    await application.updateConnection(connection.connectionId, { endpointUrl: "https://provider-a.test/v2" });
    expect(scanConnection).toHaveBeenNthCalledWith(2, {
      connectionId: connection.connectionId,
      trigger: "material_connection_change",
      mode: "force_settled",
    });

    await application.rotateSecret({ connectionId: connection.connectionId, secretValue: "rotated-secret" });
    expect(scanConnection).toHaveBeenNthCalledWith(3, {
      connectionId: connection.connectionId,
      trigger: "credential_changed",
      mode: "force_settled",
    });
  });

  it("adds a missing credential to an active connection before requesting a credential scan", async () => {
    const { application, scanConnection, service, store } = fixture();
    store.insertConnection({
      connectionId: "connection-without-secret",
      kind: "custom",
      label: "Imported Provider",
      provider: { kind: "custom", label: "imported-provider" },
      endpointUrl: "https://imported-provider.test/v1",
      endpointLocal: false,
      lifecycleState: "active",
      secretRef: null,
      secretVersion: null,
      createdAt: "2026-07-24T19:00:00.000Z",
      updatedAt: "2026-07-24T19:00:00.000Z",
    } as never);

    await expect(application.createSecret({
      connectionId: "connection-without-secret" as never,
      secretValue: "new-imported-provider-secret",
    })).resolves.toMatchObject({ success: true, data: { version: 1 } });
    expect(service.getConnection("connection-without-secret" as never)).toMatchObject({
      lifecycleState: "active",
      secretVersion: 1,
    });
    expect(scanConnection).toHaveBeenCalledOnce();
    expect(scanConnection).toHaveBeenCalledWith({
      connectionId: "connection-without-secret",
      trigger: "credential_changed",
      mode: "force_settled",
    });
  });

  it("atomically reactivates a revoked connection before requesting one scan", async () => {
    const { application, scanConnection, service } = fixture();
    const connection = await createCustom(application);
    scanConnection.mockClear();

    await expect(service.revokeSecret(connection.connectionId)).resolves.toMatchObject({ success: true });
    expect(service.getConnection(connection.connectionId)?.lifecycleState).toBe("revoked");

    await expect(application.createSecret({
      connectionId: connection.connectionId,
      secretValue: "replacement-secret",
    })).resolves.toMatchObject({ success: true, data: { version: 2 } });
    expect(service.getConnection(connection.connectionId)).toMatchObject({
      lifecycleState: "active",
      secretVersion: 2,
    });
    expect(scanConnection).toHaveBeenCalledOnce();
    expect(scanConnection).toHaveBeenCalledWith({
      connectionId: connection.connectionId,
      trigger: "connection_reactivated",
      mode: "force_settled",
    });
  });

  it("does not scan rejected mutations and never rolls back a persisted mutation when scanning throws", async () => {
    const { application, scanConnection, service } = fixture();
    await expect(application.createConnection({
      kind: "custom",
      label: "Rejected",
      provider: { kind: "custom", label: "rejected" },
      endpointUrl: "http://remote-insecure.test/v1",
      secretValue: "not-persisted",
    })).resolves.toMatchObject({ success: false });
    expect(scanConnection).not.toHaveBeenCalled();

    const connection = await createCustom(application);
    scanConnection.mockRejectedValueOnce(new Error("fixed coordinator failure"));
    await expect(application.updateConnection(connection.connectionId, {
      endpointUrl: "https://provider-a.test/persisted-v3",
    })).resolves.toMatchObject({ success: true });
    expect(service.getConnection(connection.connectionId)?.endpointUrl)
      .toBe("https://provider-a.test/persisted-v3");
  });
});
