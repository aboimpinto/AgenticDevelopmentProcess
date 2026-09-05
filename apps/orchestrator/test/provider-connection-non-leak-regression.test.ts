// Behavior suite: provider connection non-leak regression.
/**
 * FEAT-058: Non-Leak Regression Tests
 *
 * Sink-level redaction regression tests using a distinctive fake secret.
 *
 * Verifies that the distinctive secret value NEVER appears in:
 * 1. Database records (connection store)
 * 2. API DTOs (summary, detail, diagnostic, deletion responses)
 * 3. HTTP adapter responses (safe error responses, response DTOs)
 * 4. Error messages (service result errors, vault errors)
 * 5. Log messages (redactMessage utility)
 * 6. Diagnostic records (safeMessage field)
 * 7. Service results (create, update, get, list return values)
 * 8. Deletion responses (blocker descriptors)
 *
 * Every test uses the same DISTINCTIVE_FAKE_SECRET value and asserts
 * it is absent from the output of the respective sink.
 */

import { describe, expect, it } from "vitest";
import { ProviderConnectionStore } from "@hepha/db";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { redactMessage } from "../src/provider-connections/diagnostics.js";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import {
  toSafeErrorResponse,
  recordToSummary,
  recordToDetail,
  diagnosticToView,
  deletionBlockerToResponse,
  deletionPreflightToResponse,
} from "../src/provider-connections/http-adapter.js";
import type {
  ProviderConnectionId,
  ProviderConnectionRecord,
  ConnectionDiagnosticRecord,
  DeletionPreflightResult,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Distinctive fake secret — must not appear in any sink
// ---------------------------------------------------------------------------

const DISTINCTIVE_FAKE_SECRET = "sk-SINKTESTOKAYLEAK12345ABCDEFGHIJKLMNOP"; // gitleaks:allow -- synthetic non-leak fixture
const CONN_ID = "sink-test-conn" as ProviderConnectionId;

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

function assertNoSecretLeak(value: unknown, sink: string): void {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.includes(DISTINCTIVE_FAKE_SECRET)) {
    throw new Error(
      `Non-leak violation: DISTINCTIVE_FAKE_SECRET found in sink "${sink}": ${str.substring(0, 200)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Database Records (Connection Store)
// ---------------------------------------------------------------------------

describe("Sink: Database Records", () => {
  it("connection record does not contain secret value", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record: ProviderConnectionRecord = {
        connectionId: CONN_ID,
        kind: "custom",
        label: "Sink Test",
        provider: { kind: "custom", label: "sink-test" },
        endpointUrl: "https://sink.test/v1",
        endpointLocal: false,
        lifecycleState: "active",
        secretRef: "opaque-vault-ref",
        secretVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.insertConnection(record);

      // Check the stored record
      const stored = store.getConnection(CONN_ID);
      assertNoSecretLeak(stored, "db/connection-record");
      expect(stored?.secretRef).toBe("opaque-vault-ref");
      expect("secretValue" in (stored ?? {})).toBe(false);
      expect("secret_data" in (stored ?? {})).toBe(false);
    } finally {
      store.close();
    }
  });

  it("connection record with null secret is safe", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record: ProviderConnectionRecord = {
        connectionId: "sink-test-null" as ProviderConnectionId,
        kind: "pi_session",
        label: "Pi Session",
        provider: { kind: "pi_session" },
        endpointUrl: "http://localhost:11434",
        endpointLocal: true,
        lifecycleState: "active",
        secretRef: null,
        secretVersion: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.insertConnection(record);

      const stored = store.getConnection("sink-test-null" as ProviderConnectionId);
      assertNoSecretLeak(stored, "db/pi-session-record");
      expect(stored?.secretRef).toBeNull();
    } finally {
      store.close();
    }
  });

  it("diagnostic records do not contain secret value", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn: ProviderConnectionRecord = {
        connectionId: CONN_ID,
        kind: "custom",
        label: "Sink Diag Test",
        provider: { kind: "custom", label: "sink-diag" },
        endpointUrl: "https://sink-diag.test/v1",
        endpointLocal: false,
        lifecycleState: "active",
        secretRef: "vault-ref",
        secretVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.insertConnection(conn);

      const diag: ConnectionDiagnosticRecord = {
        diagnosticId: "diag-sink-001",
        connectionId: CONN_ID,
        severity: "error",
        failureCode: "http_error",
        safeMessage: `Endpoint returned HTTP 500`,
        httpStatusCode: 500,
        diagnosticOperation: "validate",
        timestamp: new Date().toISOString(),
      };
      store.insertDiagnostic(diag);

      const diags = store.listDiagnostics(CONN_ID);
      for (const d of diags) {
        assertNoSecretLeak(d.safeMessage, "db/diagnostic-safeMessage");
      }
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. API DTOs (from http-adapter mappers)
// ---------------------------------------------------------------------------

describe("Sink: API DTOs", () => {
  const baseRecord: ProviderConnectionRecord = {
    connectionId: CONN_ID,
    kind: "custom",
    label: "DTO Test",
    provider: { kind: "custom", label: "dto-test" },
    endpointUrl: "https://dto.test/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: "vault-ref-dto",
    secretVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("summary DTO has no secret value", () => {
    const summary = recordToSummary(baseRecord);
    assertNoSecretLeak(summary, "dto/summary");
    expect("secretValue" in summary).toBe(false);
    expect("secret" in summary).toBe(false);
    expect(summary.hasSecret).toBe(true);
  });

  it("detail DTO has no secret value", () => {
    const detail = recordToDetail(baseRecord);
    assertNoSecretLeak(detail, "dto/detail");
    expect("secretValue" in detail).toBe(false);
    expect("value" in detail).toBe(false);
  });

  it("diagnostic view DTO has safe message", () => {
    const diag: ConnectionDiagnosticRecord = {
      diagnosticId: "diag-dto-001",
      connectionId: CONN_ID,
      severity: "error",
      failureCode: "timeout",
      safeMessage: "Connection timed out",
      httpStatusCode: null,
      diagnosticOperation: "validate",
      timestamp: new Date().toISOString(),
    };
    const view = diagnosticToView(diag);
    assertNoSecretLeak(view, "dto/diagnostic-view");
    expect(view.safeMessage).not.toContain(DISTINCTIVE_FAKE_SECRET);
  });

  it("deletion blocker DTO has safe descriptor", () => {
    const blocker = deletionBlockerToResponse({
      blockerType: "routing_policy",
      safeDescriptor: "Routing policy: global-default uses this connection",
    });
    assertNoSecretLeak(blocker, "dto/deletion-blocker");
    expect(blocker.blockerType).toBe("routing_policy");
  });

  it("deletion preflight DTO is safe", () => {
    const preflight: DeletionPreflightResult = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "Routing policy depends on this connection" },
      ],
    };
    const dto = deletionPreflightToResponse(preflight);
    assertNoSecretLeak(dto, "dto/deletion-preflight");
    expect(dto.canDelete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. HTTP adapter responses (toSafeErrorResponse)
// ---------------------------------------------------------------------------

describe("Sink: HTTP Adapter Responses", () => {
  it("safe error response does not contain secret", () => {
    // Simulate a vault error that might contain the secret
    const result = {
      success: false,
      error: `Vault error: stored value "${DISTINCTIVE_FAKE_SECRET}"`,
      errorCode: "vault_unavailable" as const,
    };
    const safe = toSafeErrorResponse(result, "Failed to create secret");
    assertNoSecretLeak(safe, "http/safe-error-response");
    expect(safe.error).not.toContain(DISTINCTIVE_FAKE_SECRET);
    expect(safe.error).toBe("Service temporarily unavailable");
  });

  it("safe error with generic errorCode hides raw detail", () => {
    const result = {
      success: false,
      error: `Raw error mentioning ${DISTINCTIVE_FAKE_SECRET}`,
      errorCode: "generic" as const,
    };
    const safe = toSafeErrorResponse(result, "Operation failed");
    assertNoSecretLeak(safe, "http/generic-error");
    expect(safe.error).toBe("Operation failed");
  });

  it("safe error with no errorCode hides raw detail", () => {
    const result = {
      success: false,
      error: `Error: ${DISTINCTIVE_FAKE_SECRET}`,
    };
    const safe = toSafeErrorResponse(result, "Fallback message");
    assertNoSecretLeak(safe, "http/no-errorCode");
    expect(safe.error).toBe("Fallback message");
  });
});

// ---------------------------------------------------------------------------
// 4. Error Messages (Service Result Errors)
// ---------------------------------------------------------------------------

describe("Sink: Error Messages", () => {
  it("service create errors do not leak secret", async () => {
    const { service, vault } = createTestService();

    // Create a connection successfully
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Error Sink Test",
      provider: { kind: "custom", label: "error-sink" },
      endpointUrl: "https://error-sink.test/v1",
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });
    expect(createResult.success).toBe(true);

    // Now make vault unavailable
    vault.setAvailable(false);

    // Secret operations should fail with safe errors
    const secretResult = await service.createSecret({
      connectionId: createResult.data!.connectionId,
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });
    expect(secretResult.success).toBe(false);
    assertNoSecretLeak(secretResult, "service/error-secret-create");
    if ("error" in secretResult && typeof secretResult.error === "string") {
      expect(secretResult.error).not.toContain(DISTINCTIVE_FAKE_SECRET);
    }
  });

  it("service rotate errors do not leak secret", async () => {
    const { service, vault } = createTestService();

    const createResult = await service.createConnection({
      kind: "custom",
      label: "Rotate Error Test",
      provider: { kind: "custom", label: "rotate-error" },
      endpointUrl: "https://rotate-error.test/v1",
      secretValue: "initial-key",
    });
    expect(createResult.success).toBe(true);

    vault.setAvailable(false);

    const rotateResult = await service.rotateSecret({
      connectionId: createResult.data!.connectionId,
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });
    expect(rotateResult.success).toBe(false);
    assertNoSecretLeak(rotateResult, "service/error-rotate");
    if ("error" in rotateResult && typeof rotateResult.error === "string") {
      expect(rotateResult.error).not.toContain(DISTINCTIVE_FAKE_SECRET);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Log Messages (redactMessage utility)
// ---------------------------------------------------------------------------

describe("Sink: Log Messages", () => {
  it("redactMessage blocks secret in API key pattern", () => {
    const msg = `Using API key ${DISTINCTIVE_FAKE_SECRET} for connection`;
    const redacted = redactMessage(msg);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain(DISTINCTIVE_FAKE_SECRET);
  });

  it("redactMessage blocks secret in Bearer token pattern", () => {
    const msg = `Authorization: Bearer ${DISTINCTIVE_FAKE_SECRET}`;
    const redacted = redactMessage(msg);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain(DISTINCTIVE_FAKE_SECRET);
  });

  it("redactMessage blocks secret in key=value pattern", () => {
    const msg = `api_key=${DISTINCTIVE_FAKE_SECRET}`;
    const redacted = redactMessage(msg);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain(DISTINCTIVE_FAKE_SECRET);
  });

  it("redactMessage blocks secret in Authorization header", () => {
    const msg = `Authorization: ${DISTINCTIVE_FAKE_SECRET}`;
    const redacted = redactMessage(msg);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain(DISTINCTIVE_FAKE_SECRET);
  });

  it("redactMessage leaves safe messages unchanged", () => {
    const msg = "Connection validated successfully";
    expect(redactMessage(msg)).toBe(msg);
  });

  it("redactMessage handles empty string", () => {
    expect(redactMessage("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 6. Service Results (full lifecycle non-leak)
// ---------------------------------------------------------------------------

describe("Sink: Service Results", () => {
  it("createConnection result does not contain secret", async () => {
    const { service } = createTestService();
    const result = await service.createConnection({
      kind: "custom",
      label: "Service Sink Test",
      provider: { kind: "custom", label: "service-sink" },
      endpointUrl: "https://service-sink.test/v1",
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });
    expect(result.success).toBe(true);
    const data = result.data!;

    // The returned record should not contain the secret
    assertNoSecretLeak(data, "service/create-result");
    expect("secretValue" in data).toBe(false);
    expect(data.secretRef).toBeTruthy();
    expect(data.secretVersion).toBe(1);
  });

  it("getConnection result does not contain secret", async () => {
    const { service } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Get Sink Test",
      provider: { kind: "custom", label: "get-sink" },
      endpointUrl: "https://get-sink.test/v1",
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });
    const connId = createResult.data!.connectionId;

    const record = service.getConnection(connId);
    assertNoSecretLeak(record, "service/get-result");
    expect("secretValue" in (record ?? {})).toBe(false);
  });

  it("listConnections results do not contain secret", async () => {
    const { service } = createTestService();
    await service.createConnection({
      kind: "custom",
      label: "List Sink Test",
      provider: { kind: "custom", label: "list-sink" },
      endpointUrl: "https://list-sink.test/v1",
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });

    const all = service.listConnections();
    for (const record of all) {
      assertNoSecretLeak(record, "service/list-result");
    }
  });

  it("getDiagnostics results do not contain secret", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Diag Sink Test",
      provider: { kind: "custom", label: "diag-sink" },
      endpointUrl: "https://diag-sink.test/v1",
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });

    // Force a validation error
    transport.setResponse("https://diag-sink.test/v1", { statusCode: 500 });
    await service.validateConnection(createResult.data!.connectionId);

    const diagnostics = service.getDiagnostics(createResult.data!.connectionId);
    for (const diag of diagnostics) {
      assertNoSecretLeak(diag.safeMessage, "service/diagnostics");
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Deletion Responses
// ---------------------------------------------------------------------------

describe("Sink: Deletion Responses", () => {
  it("deletion preflight blockers have safe descriptors", () => {
    const blocker = deletionBlockerToResponse({
      blockerType: "routing_policy",
      safeDescriptor: `Routing policy: global-default uses this connection`,
    });
    assertNoSecretLeak(blocker, "deletion/blocker");
  });

  it("deletion preflight result is safe", () => {
    const preflight: DeletionPreflightResult = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "Routing policy depends on connection" },
        { blockerType: "active_worker", safeDescriptor: "Active worker session" },
      ],
    };
    const dto = deletionPreflightToResponse(preflight);
    assertNoSecretLeak(dto, "deletion/preflight");
  });
});

// ---------------------------------------------------------------------------
// 8. Redirect Security (no auth forwarding)
// ---------------------------------------------------------------------------

describe("Sink: Redirect Security", () => {
  it("redirect rejection message does not contain secret", async () => {
    const { service, transport } = createTestService();
    const createResult = await service.createConnection({
      kind: "custom",
      label: "Redirect Sink Test",
      provider: { kind: "custom", label: "redirect-sink" },
      endpointUrl: "https://redirect-sink.test/v1",
      secretValue: DISTINCTIVE_FAKE_SECRET,
    });

    transport.setResponse("https://redirect-sink.test/v1", {
      statusCode: 302,
      headers: { location: "https://evil.com/steal-key" },
    });

    const result = await service.validateConnection(createResult.data!.connectionId);
    expect(result.success).toBe(false);
    assertNoSecretLeak(result, "redirect/validate-result");
    if (result.data) {
      assertNoSecretLeak(result.data.safeMessage, "redirect/safe-message");
      expect(result.data.safeMessage).not.toContain(DISTINCTIVE_FAKE_SECRET);
    }
  });
});
