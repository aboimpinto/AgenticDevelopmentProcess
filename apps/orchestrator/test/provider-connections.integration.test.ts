// Behavior suite: provider connections.
/**
 * FEAT-058: Provider Connection Integration Tests
 *
 * Full lifecycle tests using InMemorySecretVault, FakeEndpointTransport,
 * and in-memory ProviderConnectionStore.
 *
 * Covers: create, update, secret lifecycle (create/rotate/revoke/delete),
 * endpoint validation, diagnostics, deletion guard, E011-PROV-005 redirect
 * security, and Pi Session no-secret behavior.
 */

import { describe, expect, it } from "vitest";
import { ProviderConnectionStore } from "@hepha/db";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { createDiagnostic } from "../src/provider-connections/diagnostics.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestService() {
  const store = ProviderConnectionStore.createInMemory();
  const vault = new InMemorySecretVault();
  const transport = new FakeEndpointTransport();
  const service = new ProviderConnectionService({ store, vault, transport });
  return { store, vault, transport, service };
}

// ---------------------------------------------------------------------------
// Connection Lifecycle
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Connection Lifecycle", () => {
  it("creates a custom provider connection with secret", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "custom",
      label: "My Custom LLM",
      provider: { kind: "custom", label: "my-llm" },
      endpointUrl: "https://api.my-llm.test/v1",
      secretValue: "sk-test-secret-12345",
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data!.kind).toBe("custom");
    expect(result.data!.endpointUrl).toBe("https://api.my-llm.test/v1");
    expect(result.data!.secretRef).toBeTruthy();
    expect(result.data!.secretVersion).toBe(1);
  });

  it("creates a known provider connection", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "known",
      label: "OpenAI",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://api.openai.com/v1",
      secretValue: "sk-abc123def456ghi789jkl", // gitleaks:allow -- synthetic redaction fixture
    });

    expect(result.success).toBe(true);
    expect(result.data!.provider).toEqual({ kind: "known", providerId: "openai" });
  });

  it("creates a Pi Session connection with no secret", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "pi_session",
      label: "Pi Session",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    expect(result.success).toBe(true);
    expect(result.data!.kind).toBe("pi_session");
    expect(result.data!.secretRef).toBeNull();
    expect(result.data!.secretVersion).toBeNull();
  });

  it("rejects creating a custom connection without secret", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "custom",
      label: "No Secret",
      provider: { kind: "custom", label: "no-secret" },
      endpointUrl: "https://api.test.com/v1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Secret value is required");
  });

  it("rejects creating a connection with HTTP remote endpoint", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "custom",
      label: "Insecure",
      provider: { kind: "custom", label: "insecure" },
      endpointUrl: "http://api.test.com/v1",
      secretValue: "test-key",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("lists all connections", async () => {
    const { service } = createTestService();
    await service.createConnection({
      kind: "custom",
      label: "First",
      provider: { kind: "custom", label: "first" },
      endpointUrl: "https://first.test/v1",
      secretValue: "key-1",
    });
    await service.createConnection({
      kind: "pi_session",
      label: "Second",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const connections = service.listConnections();
    expect(connections).toHaveLength(2);
  });

  it("gets a connection by ID", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "custom",
      label: "Test",
      provider: { kind: "custom", label: "test" },
      endpointUrl: "https://test.test/v1",
      secretValue: "test-key",
    });

    const found = service.getConnection(result.data!.connectionId);
    expect(found).not.toBeNull();
    expect(found!.label).toBe("Test");
  });
});

// ---------------------------------------------------------------------------
// Secret Lifecycle
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Secret Lifecycle", () => {
  it("creates and rotates a secret", async () => {
    const { service, vault } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Rotate Test",
      provider: { kind: "custom", label: "rotate-test" },
      endpointUrl: "https://rotate.test/v1",
      secretValue: "original-key",
    });

    expect(createResult.success).toBe(true);
    const connId = createResult.data!.connectionId!;

    // Rotate
    const rotateResult = await service.rotateSecret({
      connectionId: connId,
      secretValue: "rotated-key",
    });

    expect(rotateResult.success).toBe(true);
    expect(rotateResult.data!.version).toBe(2);

    // Verify vault has rotated value
    const vaultValue = await vault.readSecret(`conn-${connId}`);
    expect(vaultValue).toBe("rotated-key");
  });

  it("revokes a secret and marks connection revoked", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Revoke Test",
      provider: { kind: "custom", label: "revoke-test" },
      endpointUrl: "https://revoke.test/v1",
      secretValue: "test-key",
    });

    expect(createResult.success).toBe(true);
    const connId = createResult.data!.connectionId!;

    // Revoke
    const revokeResult = await service.revokeSecret(connId);
    expect(revokeResult.success).toBe(true);

    // Connection is now revoked
    const conn = service.getConnection(connId);
    expect(conn!.lifecycleState).toBe("revoked");
  });

  it("rejects secret operations on pi_session connections", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "pi_session",
      label: "Pi Test",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const connId = createResult.data!.connectionId!;

    const revokeResult = await service.revokeSecret(connId);
    expect(revokeResult.success).toBe(false);
    expect(revokeResult.error).toContain("Pi Session");
  });

  it("handles unavailable vault gracefully", async () => {
    const store = ProviderConnectionStore.createInMemory();
    const vault = new InMemorySecretVault(false); // unavailable
    const transport = new FakeEndpointTransport();
    const service = new ProviderConnectionService({ store, vault, transport });

    const result = await service.createConnection({
      kind: "custom",
      label: "Vault Unavailable",
      provider: { kind: "custom", label: "vault-unavailable" },
      endpointUrl: "https://test.test/v1",
      secretValue: "test-key",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("vault");
  });
});

// ---------------------------------------------------------------------------
// Endpoint Validation
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Endpoint Validation", () => {
  it("validates a reachable endpoint", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Validate Test",
      provider: { kind: "custom", label: "validate-test" },
      endpointUrl: "https://valid.test/v1",
      secretValue: "test-key",
    });

    transport.setResponse("https://valid.test/v1", { statusCode: 200 });

    const result = await service.validateConnection(createResult.data!.connectionId);
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
  });

  it("records diagnostic for failed validation", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Fail Val",
      provider: { kind: "custom", label: "fail-val" },
      endpointUrl: "https://fail.test/v1",
      secretValue: "test-key",
    });

    transport.setResponse("https://fail.test/v1", { statusCode: 500 });

    const result = await service.validateConnection(createResult.data!.connectionId);
    expect(result.success).toBe(false);
    expect(result.data!.severity).toBe("error");
    expect(result.data!.httpStatusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Diagnostics", () => {
  it("retrieves diagnostics for a connection", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "pi_session",
      label: "Diag Test",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const diagnostics = service.getDiagnostics(createResult.data!.connectionId);
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].diagnosticOperation).toBe("create");
  });
});

// ---------------------------------------------------------------------------
// Deletion Guard (E011-PROV-005 subset)
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Deletion Guard", () => {
  it("allows deletion when no dependencies exist", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "pi_session",
      label: "Delete Test",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const connId = createResult.data!.connectionId;
    const preflight = service.deletionPreflight(connId);
    expect(preflight.canDelete).toBe(true);

    const deleteResult = await service.deleteConnection(connId);
    expect(deleteResult.success).toBe(true);
    expect(service.getConnection(connId)).toBeNull();
  });

  it("blocks deletion when dependencies exist", async () => {
    const { store, service } = createTestService();
    const createResult = await service.createConnection({
      kind: "pi_session",
      label: "Dep Test",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const connId = createResult.data!.connectionId;

    // Register a dependency (simulating FEAT-061 behavior)
    store.insertDependency({
      dependencyId: `dep-test-${connId}`,
      connectionId: connId,
      ownerFeat: "FEAT-061",
      safeDescriptor: "Route policy references this connection",
      registeredAt: new Date().toISOString(),
    });

    const preflight = service.deletionPreflight(connId);
    expect(preflight.canDelete).toBe(false);
    expect(preflight.blockers).toHaveLength(1);
    expect(preflight.blockers[0].blockerType).toBe("routing_policy");
  });

  it("resolves deletion when blockers are acknowledged", async () => {
    const { store, service } = createTestService();
    const createResult = await service.createConnection({
      kind: "pi_session",
      label: "Ack Test",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const connId = createResult.data!.connectionId;
    store.insertDependency({
      dependencyId: `dep-ack-${connId}`,
      connectionId: connId,
      ownerFeat: "FEAT-062",
      safeDescriptor: "Active worker session #42",
      registeredAt: new Date().toISOString(),
    });

    const deleteResult = await service.deleteConnection(connId, {
      connectionId: connId,
      acknowledgedBlockers: [{ blockerType: "active_worker", safeDescriptor: "Active worker session #42" }],
    });
    expect(deleteResult.success).toBe(true);
    expect(service.getConnection(connId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Non-Leak / Redaction
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Non-Leak", () => {
  it("does not return secret values in connection records", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "custom",
      label: "Secret Check",
      provider: { kind: "custom", label: "secret-check" },
      endpointUrl: "https://secret.test/v1",
      secretValue: "this-is-a-secret-value-that-should-never-leak",
    });

    expect(result.success).toBe(true);
    const record = result.data!;
    // SecretRef is an opaque reference, not the value
    expect(record.secretRef).toContain("conn-");
    expect("secretValue" in record).toBe(false);

    // Verify via getConnection too
    const fetched = service.getConnection(record.connectionId)!;
    expect(fetched.secretRef).toBeTruthy();
    expect("secretValue" in fetched).toBe(false);
    expect("secret" in fetched).toBe(false);
  });

  it("diagnostics contain no secret material", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Diag Non-Leak",
      provider: { kind: "custom", label: "diag-non-leak" },
      endpointUrl: "https://diag.test/v1",
      secretValue: "super-secret-key-12345",
    });

    // Force a failed validation
    transport.setResponse("https://diag.test/v1", { statusCode: 500 });
    await service.validateConnection(createResult.data!.connectionId);

    const diagnostics = service.getDiagnostics(createResult.data!.connectionId);
    for (const diag of diagnostics) {
      expect(diag.safeMessage).not.toContain("super-secret-key-12345");
      expect(diag.safeMessage).not.toContain("sk-");
    }
  });

  it("Pi Session connection has no secret ref", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "pi_session",
      label: "Pi No Secret",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    expect(result.data!.secretRef).toBeNull();
    expect(result.data!.secretVersion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E011-PROV-005: Redirect cannot receive API key
// ---------------------------------------------------------------------------

describe("E011-PROV-005 — Redirect Security", () => {
  it("rejects cross-host redirect during validation", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Redirect Test",
      provider: { kind: "custom", label: "redirect-test" },
      endpointUrl: "https://safe.test/v1",
      secretValue: "test-key",
    });

    // Simulate redirect to different host
    transport.setResponse("https://safe.test/v1", {
      statusCode: 302,
      headers: { location: "https://evil.com/steal-key" },
    });

    const result = await service.validateConnection(createResult.data!.connectionId);
    expect(result.success).toBe(false);
    expect(result.data!.failureCode).toBe("redirect_rejected");
    // The safe message should mention the rejected host but not the secret
    expect(result.data!.safeMessage).toContain("evil.com");
    expect(result.data!.safeMessage).not.toContain("test-key");
  });

  it("rejects protocol downgrade redirect", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Downgrade Test",
      provider: { kind: "custom", label: "downgrade-test" },
      endpointUrl: "https://safe.test/v1",
      secretValue: "test-key",
    });

    transport.setResponse("https://safe.test/v1", {
      statusCode: 302,
      headers: { location: "http://safe.test/v2" },
    });

    const result = await service.validateConnection(createResult.data!.connectionId);
    expect(result.success).toBe(false);
    expect(result.data!.failureCode).toBe("protocol_downgrade");
  });
});

// ---------------------------------------------------------------------------
// Failure behavior: duplicate, stale, not-found, already-deleted
// ---------------------------------------------------------------------------

describe("ProviderConnectionService — Failure Behavior", () => {
  it("creates two connections with same label and different IDs (no collision)", async () => {
    const { service } = createTestService();
    const first = await service.createConnection({
      kind: "custom",
      label: "Same Label",
      provider: { kind: "custom", label: "same-provider" },
      endpointUrl: "https://first.test/v1",
      secretValue: "key-1",
    });
    expect(first.success).toBe(true);

    const second = await service.createConnection({
      kind: "custom",
      label: "Same Label",
      provider: { kind: "custom", label: "same-provider" },
      endpointUrl: "https://first.test/v1",
      secretValue: "key-2",
    });
    expect(second.success).toBe(true);
    expect(second.data!.connectionId).not.toBe(first.data!.connectionId);

    // Both connections exist in the list
    const all = service.listConnections();
    expect(all).toHaveLength(2);
  });

  it("update returns not_found for non-existent connection", async () => {
    const { service } = createTestService();
    const result = await service.updateConnection("nonexistent-id" as any, {
      label: "New Label",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("not_found");
  });

  it("createSecret returns not_found for non-existent connection", async () => {
    const { service } = createTestService();
    const result = await service.createSecret({
      connectionId: "nonexistent-id" as any,
      secretValue: "test-key",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("not_found");
  });

  it("delete returns not_found for already-deleted connection", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "pi_session",
      label: "Delete Twice",
      provider: { kind: "pi_session" },
      endpointUrl: "http://localhost:11434",
    });

    const connId = createResult.data!.connectionId;
    const firstDelete = await service.deleteConnection(connId);
    expect(firstDelete.success).toBe(true);

    // Second delete on the same (now deleted) connection
    const secondDelete = await service.deleteConnection(connId);
    expect(secondDelete.success).toBe(false);
    expect(secondDelete.errorCode).toBe("not_found");
  });

  it("stale validation after endpoint update runs against new endpoint", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Stale Val",
      provider: { kind: "custom", label: "stale-val" },
      endpointUrl: "https://old-endpoint.test/v1",
      secretValue: "test-key",
    });

    const connId = createResult.data!.connectionId;

    // Update to new endpoint
    transport.setResponse("https://old-endpoint.test/v1", { statusCode: 200 });
    transport.setResponse("https://new-endpoint.test/v1", { statusCode: 200 });

    const updateResult = await service.updateConnection(connId, {
      endpointUrl: "https://new-endpoint.test/v1",
    });
    expect(updateResult.success).toBe(true);

    // Validate against the new endpoint (should use updated URL)
    const validation = await service.validateConnection(connId);
    expect(validation.success).toBe(true);

    // Verify the stored connection points to the new endpoint
    const conn = service.getConnection(connId);
    expect(conn!.endpointUrl).toBe("https://new-endpoint.test/v1");
  });

  it("revoke then delete succeeds", async () => {
    const { service, vault } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Revoke Delete",
      provider: { kind: "custom", label: "revoke-delete" },
      endpointUrl: "https://revoke-delete.test/v1",
      secretValue: "test-key",
    });

    const connId = createResult.data!.connectionId;

    // Revoke first
    const revokeResult = await service.revokeSecret(connId);
    expect(revokeResult.success).toBe(true);

    // Connection is now revoked
    expect(service.getConnection(connId)!.lifecycleState).toBe("revoked");

    // Delete succeeds
    const deleteResult = await service.deleteConnection(connId);
    expect(deleteResult.success).toBe(true);

    // Connection is gone
    expect(service.getConnection(connId)).toBeNull();
  });

  it("rejects createSecret with empty string secretValue", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Empty Secret",
      provider: { kind: "custom", label: "empty-secret" },
      endpointUrl: "https://empty-secret.test/v1",
      secretValue: "initial-key",
    });

    const connId = createResult.data!.connectionId;

    const result = await service.createSecret({
      connectionId: connId,
      secretValue: "",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("validation_error");
  });

  it("rejects rotate secret with missing value", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Rotate Missing",
      provider: { kind: "custom", label: "rotate-missing" },
      endpointUrl: "https://rotate-missing.test/v1",
      secretValue: "initial-key",
    });

    const connId = createResult.data!.connectionId;

    const result = await service.rotateSecret({
      connectionId: connId,
      secretValue: "",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("validation_error");
  });

  it("revoke on already-revoked connection is idempotent (still succeeds for vault)", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Double Revoke",
      provider: { kind: "custom", label: "double-revoke" },
      endpointUrl: "https://double-revoke.test/v1",
      secretValue: "test-key",
    });

    const connId = createResult.data!.connectionId;

    // First revoke
    const first = await service.revokeSecret(connId);
    expect(first.success).toBe(true);
    expect(service.getConnection(connId)!.lifecycleState).toBe("revoked");

    // Second revoke — secretRef is still set, vault revoke is idempotent
    const second = await service.revokeSecret(connId);
    expect(second.success).toBe(true);
    expect(service.getConnection(connId)!.lifecycleState).toBe("revoked");
  });
});
