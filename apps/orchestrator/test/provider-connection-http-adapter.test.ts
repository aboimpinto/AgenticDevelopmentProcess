// Behavior suite: provider connection HTTP adapter.
/**
 * FEAT-058: HTTP Adapter Tests
 *
 * Tests the HTTP adapter's error redaction, status code mapping,
 * response DTO construction, and secret-safe error behavior.
 *
 * Code review finding F1 (secret leak) and F3 (adapter test coverage).
 */

import { describe, expect, it, vi } from "vitest";
import {
  toSafeErrorResponse,
  serviceResultToStatusCode,
  recordToSummary,
  recordToDetail,
  diagnosticToView,
  deletionBlockerToResponse,
  deletionPreflightToResponse,
  handleListConnections,
  handleGetConnection,
  handleCreateConnection,
  handleDeleteConnection,
  handleUpdateConnection,
  handleCreateSecret,
  handleRotateSecret,
  handleRevokeSecret,
  handleValidateConnection,
  handleGetDiagnostics,
  handleDeletionPreflight,
} from "../src/provider-connections/http-adapter.js";
import type { ProviderConnectionRecord, ConnectionDiagnosticRecord, DeletionPreflightResult, ProviderConnectionId, DeletionResolutionInput } from "@hepha/shared";
import type { ServerResponse, IncomingMessage } from "node:http";
import { ProviderConnectionService } from "../src/provider-connections/service.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockResponse(): { res: ServerResponse; statusCode: number; body: string } {
  const captured = { statusCode: 0, body: "" };
  const res = {
    writeHead: vi.fn((code: number) => { captured.statusCode = code; }) as unknown as ServerResponse["writeHead"],
    end: vi.fn((data: string) => { captured.body = data; }) as unknown as ServerResponse["end"],
  } as unknown as ServerResponse;
  return { res, statusCode: captured.statusCode, body: captured.body };
}

// ---------------------------------------------------------------------------
// Error safety
// ---------------------------------------------------------------------------

describe("toSafeErrorResponse — F1 secret leak protection", () => {
  it("replaces vault_unavailable errors with safe message", () => {
    const result = {
      success: false,
      error: "Vault error: HEPHA_VAULT_KEY=sk-secret-key-12345", // gitleaks:allow -- synthetic redaction fixture
      errorCode: "vault_unavailable" as const,
    };
    const safe = toSafeErrorResponse(result, "Failed to create secret");
    expect(safe.error).toBe("Service temporarily unavailable");
    expect(safe.error).not.toContain("sk-secret-key-12345");
    expect(safe.errorCode).toBe("vault_unavailable");
  });

  it("replaces generic errors with fallback message", () => {
    const result = {
      success: false,
      error: "Some raw error detail",
      errorCode: "generic" as const,
    };
    const safe = toSafeErrorResponse(result, "Failed to create connection");
    expect(safe.error).toBe("Failed to create connection");
    expect(safe.errorCode).toBe("generic");
  });

  it("uses fallback for missing errorCode", () => {
    const result = {
      success: false,
      error: "mystery error",
      errorCode: undefined,
    };
    const safe = toSafeErrorResponse(result, "Operation failed");
    expect(safe.error).toBe("Operation failed");
    expect(safe.errorCode).toBeUndefined();
  });

  it("never forwards raw vault error messages for create-secret failure", () => {
    // Simulate a vault driver that wraps the submitted secret in its error
    const leakedSecret = "sk-my-secret-value-abcdef123456";
    const result = {
      success: false,
      error: `Failed to store secret: database write error for value "${leakedSecret}"`,
      errorCode: "vault_unavailable" as const,
    };
    const safe = toSafeErrorResponse(result, "Failed to create secret");
    expect(safe.error).toBe("Service temporarily unavailable");
    expect(safe.error).not.toContain(leakedSecret);
    expect(safe.error).not.toContain("database write error");
  });

  it("never forwards raw vault error messages for rotate-secret failure", () => {
    const leakedSecret = "new-secret-value-xyz-789";
    const result = {
      success: false,
      error: `Rotation failed for value "${leakedSecret}": timeout`,
      errorCode: "vault_unavailable" as const,
    };
    const safe = toSafeErrorResponse(result, "Failed to rotate secret");
    expect(safe.error).toBe("Service temporarily unavailable");
    expect(safe.error).not.toContain(leakedSecret);
  });
});

// ---------------------------------------------------------------------------
// Status code mapping
// ---------------------------------------------------------------------------

describe("serviceResultToStatusCode", () => {
  it("returns 200 for success", () => {
    expect(serviceResultToStatusCode({ success: true, data: "ok" })).toBe(200);
  });

  it("returns 503 for vault_unavailable", () => {
    expect(serviceResultToStatusCode({ success: false, error: "", errorCode: "vault_unavailable" })).toBe(503);
  });

  it("returns 400 for generic errors", () => {
    expect(serviceResultToStatusCode({ success: false, error: "", errorCode: "generic" })).toBe(400);
  });

  it("returns 400 for unknown errorCode", () => {
    expect(serviceResultToStatusCode({ success: false, error: "" })).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Response DTO mapping
// ---------------------------------------------------------------------------

describe("recordToSummary", () => {
  const baseRecord: ProviderConnectionRecord = {
    connectionId: "conn-1" as any,
    kind: "known",
    label: "My OpenAI",
    provider: { kind: "known" as const, providerId: "openai" },
    endpointUrl: "https://api.openai.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: "ref-1",
    secretVersion: 3,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };

  it("maps a known provider record to summary", () => {
    const summary = recordToSummary(baseRecord);
    expect(summary.connectionId).toBe("conn-1");
    expect(summary.providerLabel).toBe("OpenAI");
    expect(summary.hasSecret).toBe(true);
    expect(summary.lifecycleState).toBe("active");
  });

  it("marks Pi Session as no secret", () => {
    const piRecord: ProviderConnectionRecord = {
      ...baseRecord,
      kind: "pi_session",
      provider: { kind: "pi_session" as const },
      secretRef: null,
      secretVersion: null,
    };
    const summary = recordToSummary(piRecord);
    expect(summary.providerLabel).toBe("Pi Session");
    expect(summary.hasSecret).toBe(false);
  });

  it("marks custom provider with label", () => {
    const customRecord: ProviderConnectionRecord = {
      ...baseRecord,
      kind: "custom",
      provider: { kind: "custom" as const, label: "my-llm" },
    };
    const summary = recordToSummary(customRecord);
    expect(summary.providerLabel).toBe("my-llm");
  });
});

describe("recordToDetail", () => {
  it("includes secretVersion when present", () => {
    const record: ProviderConnectionRecord = {
      connectionId: "conn-1" as any,
      kind: "known",
      label: "Test",
      provider: { kind: "known" as const, providerId: "openai" },
      endpointUrl: "https://api.openai.com/v1",
      endpointLocal: false,
      lifecycleState: "active",
      secretRef: "ref-1",
      secretVersion: 5,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    };
    const detail = recordToDetail(record);
    // The source record retains its vault-internal version, but the Models-reachable DTO must not expose it.
    expect(record.secretVersion).toBe(5);
    expect("secretVersion" in detail).toBe(false);
    expect(detail.hasSecret).toBe(true);
  });

  it("returns null secretVersion when no secret", () => {
    const record: ProviderConnectionRecord = {
      connectionId: "conn-2" as any,
      kind: "pi_session",
      label: "Pi Session",
      provider: { kind: "pi_session" as const },
      endpointUrl: "http://localhost:11434",
      endpointLocal: true,
      lifecycleState: "active",
      secretRef: null,
      secretVersion: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const detail = recordToDetail(record);
    // A versionless source record must take the same sanitized detail path.
    expect(record.secretVersion).toBeNull();
    expect("secretVersion" in detail).toBe(false);
    expect(detail.hasSecret).toBe(false);
  });
});

describe("diagnosticToView", () => {
  const diag: ConnectionDiagnosticRecord = {
    diagnosticId: "diag-1",
    connectionId: "conn-1" as any,
    severity: "error",
    failureCode: "unreachable",
    safeMessage: "Cannot reach endpoint",
    httpStatusCode: null,
    diagnosticOperation: "validate",
    timestamp: "2026-01-01T00:00:00Z",
  };

  it("maps diagnostic fields correctly", () => {
    const view = diagnosticToView(diag);
    expect(view.severity).toBe("error");
    expect(view.failureCode).toBe("unreachable");
    expect(view.safeMessage).toBe("Cannot reach endpoint");
    expect(view.httpStatusCode).toBeNull();
    expect(view.operation).toBe("validate");
  });

  it("preserves failureCode null for info diagnostics", () => {
    const infoDiag: ConnectionDiagnosticRecord = {
      ...diag,
      severity: "info",
      failureCode: null,
      safeMessage: "Connection created",
    };
    const view = diagnosticToView(infoDiag);
    expect(view.failureCode).toBeNull();
    expect(view.safeMessage).toBe("Connection created");
  });
});

describe("deletionBlockerToResponse", () => {
  it("maps blocker with type and safeDescriptor", () => {
    const response = deletionBlockerToResponse({
      blockerType: "active_worker",
      safeDescriptor: "Worker using connection",
    });
    expect(response.blockerType).toBe("active_worker");
    expect(response.safeDescriptor).toBe("Worker using connection");
  });
});

describe("deletionPreflightToResponse", () => {
  it("maps preflight with blockers", () => {
    const preflight: DeletionPreflightResult = {
      canDelete: false,
      blockers: [
        { blockerType: "active_worker", safeDescriptor: "Worker using connection" },
        { blockerType: "routing_policy", safeDescriptor: "Policy references connection" },
      ],
    };
    const response = deletionPreflightToResponse(preflight);
    expect(response.canDelete).toBe(false);
    expect(response.blockers).toHaveLength(2);
    expect(response.blockers[0].blockerType).toBe("active_worker");
    expect(response.blockers[1].blockerType).toBe("routing_policy");
  });

  it("maps preflight with no blockers", () => {
    const preflight: DeletionPreflightResult = {
      canDelete: true,
      blockers: [],
    };
    const response = deletionPreflightToResponse(preflight);
    expect(response.canDelete).toBe(true);
    expect(response.blockers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Handler-level tests (F2)
// ---------------------------------------------------------------------------

describe("handleListConnections", () => {
  it("returns 200 with summaries", async () => {
    const { res } = createMockResponse();
    const service = {
      listConnections: () => [{
        connectionId: "conn-1" as any,
        kind: "known" as const,
        label: "Test",
        provider: { kind: "known" as const, providerId: "openai" },
        endpointUrl: "https://api.openai.com/v1",
        endpointLocal: false,
        lifecycleState: "active" as const,
        secretRef: "ref-1",
        secretVersion: 3,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      }],
    } as unknown as ProviderConnectionService;

    await handleListConnections(res, service);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it("returns empty array when no connections", async () => {
    const { res } = createMockResponse();
    const service = {
      listConnections: () => [],
    } as unknown as ProviderConnectionService;

    await handleListConnections(res, service);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });
});

describe("handleGetConnection", () => {
  it("returns 404 when connection not found", async () => {
    const { res } = createMockResponse();
    const service = {
      getConnection: () => undefined,
    } as unknown as ProviderConnectionService;

    await handleGetConnection(res, service, "nonexistent");

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it("returns 200 with detail when found", async () => {
    const { res } = createMockResponse();
    const service = {
      getConnection: () => ({
        connectionId: "conn-1" as any,
        kind: "known" as const,
        label: "Test",
        provider: { kind: "known" as const, providerId: "openai" },
        endpointUrl: "https://api.openai.com/v1",
        endpointLocal: false,
        lifecycleState: "active" as const,
        secretRef: "ref-1",
        secretVersion: 3,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      }),
    } as unknown as ProviderConnectionService;

    await handleGetConnection(res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });
});

describe("handleCreateConnection — error mapping", () => {
  it("returns 400 with safe error when service returns validation_error", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      createConnection: async () => ({
        success: false,
        error: "Validation failed",
        errorCode: "validation_error" as const,
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({
      kind: "known",
      label: "Test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://api.openai.com/v1",
      secretValue: "sk-test",
    }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleCreateConnection(req, res, service);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.errorCode).toBe("validation_error");
    expect(parsed.error).toBe("Failed to create connection");
  });

  it("returns 503 when service returns vault_unavailable", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      createConnection: async () => ({
        success: false,
        error: "Vault failure",
        errorCode: "vault_unavailable" as const,
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({
      kind: "known",
      label: "Test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://api.openai.com/v1",
      secretValue: "sk-test",
    }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleCreateConnection(req, res, service);

    const parsed = JSON.parse(capturedBody);
    expect(parsed.errorCode).toBe("vault_unavailable");
    expect(parsed.error).toBe("Service temporarily unavailable");
  });
});

describe("handleDeleteConnection — blocked deletion", () => {
  it("returns 409 with blocked_deletion code when no resolution sent (empty body)", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn((code: number, _headers?: Record<string, string>) => { capturedBody = capturedBody || String(code); }),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;

    const service = {
      deleteConnection: async (_id: ProviderConnectionId, _resolution?: DeletionResolutionInput) => ({
        success: false,
        error: "Connection has active dependencies",
        errorCode: "blocked_deletion" as const,
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(null); // empty body
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(409, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.errorCode).toBe("blocked_deletion");
  });

  it("returns 200 with acknowledged deletion (resolution body sent via chunked encoding)", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;

    const service = {
      deleteConnection: async (_id: ProviderConnectionId, resolution?: DeletionResolutionInput) => {
        expect(resolution).toBeDefined();
        expect(resolution!.acknowledgedBlockers).toHaveLength(1);
        return { success: true };
      },
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: [{ blockerType: "routing_policy", safeDescriptor: "Route depends" }] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it("returns 400 when delete body is malformed JSON", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push("not-json-in-delete");
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body is JSON null and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push("null");
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body is an empty object and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push("{}");
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body is an array and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push("[]");
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body is a boolean and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push("true");
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body has null blocker element and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: [null] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body has numeric array element and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: [123] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body has string array element and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: ["string"] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  // Blocker type validation tests (F3: repeated prior F1)
  it("returns 400 when delete body has unknown blockerType and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: [{ blockerType: "unknown", safeDescriptor: "test" }] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body has blockerType 123 and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: [{ blockerType: 123, safeDescriptor: "test" }] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when delete body has safeDescriptor as number and does not call service", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const deleteConnection = vi.fn();
    const service = {
      deleteConnection,
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ acknowledgedBlockers: [{ blockerType: "routing_policy", safeDescriptor: 123 }] }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: {} }) as unknown as IncomingMessage;

    await handleDeleteConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Invalid deletion resolution shape");
    expect(parsed.errorCode).toBe("validation_error");
    expect(deleteConnection).not.toHaveBeenCalled();
  });
});

describe("handleUpdateConnection", () => {
  it("returns 200 with detail on success", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      updateConnection: async () => ({
        success: true,
        data: {
          connectionId: "conn-1" as any,
          kind: "known" as const,
          label: "Updated",
          provider: { kind: "known" as const, providerId: "openai" },
          endpointUrl: "https://api.openai.com/v1",
          endpointLocal: false,
          lifecycleState: "active" as const,
          secretRef: "ref-1",
          secretVersion: 3,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        },
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ label: "Updated" }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.label).toBe("Updated");
  });

  it("returns 400 with safe error on failure", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      updateConnection: async () => ({
        success: false,
        error: "Not found",
        errorCode: "generic" as const,
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ label: "Updated" }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleUpdateConnection(req, res, service, "nonexistent");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });
});

describe("handleCreateSecret", () => {
  it("returns 200 with version on success", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      createSecret: async () => ({
        success: true,
        data: { refId: "ref-1", version: 1 },
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: "sk-new-key" }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleCreateSecret(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.version).toBe(1);
  });

  it("returns 503 with safe error on vault failure", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      createSecret: async () => ({
        success: false,
        error: "Vault error",
        errorCode: "vault_unavailable" as const,
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: "sk-new-key" }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleCreateSecret(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.errorCode).toBe("vault_unavailable");
  });

  // F2: secretValue type validation (T17:26 review)
  it("returns 400 when create-secret has numeric secretValue and does not call service", async () => {
    let capturedBody: string = "";
    let capturedStatusCode = 0;
    const res = {
      writeHead: vi.fn((code: number) => { capturedStatusCode = code; }),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const createSecret = vi.fn();
    const service = { createSecret } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: 12345 }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleCreateSecret(req, res, service, "conn-1");

    expect(capturedStatusCode).toBe(400);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Secret value must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns 400 when create-secret has object secretValue and does not call service", async () => {
    let capturedBody: string = "";
    let capturedStatusCode = 0;
    const res = {
      writeHead: vi.fn((code: number) => { capturedStatusCode = code; }),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const createSecret = vi.fn();
    const service = { createSecret } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: { key: "sk-value" } }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleCreateSecret(req, res, service, "conn-1");

    expect(capturedStatusCode).toBe(400);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Secret value must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createSecret).not.toHaveBeenCalled();
  });
});

describe("handleRotateSecret", () => {
  it("returns 200 with version on success", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      rotateSecret: async () => ({
        success: true,
        data: { refId: "ref-1", version: 2 },
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: "sk-rotated" }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleRotateSecret(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.version).toBe(2);
  });

  it("returns 400 with safe error on failure", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      rotateSecret: async () => ({
        success: false,
        error: "No secret exists",
        errorCode: "generic" as const,
      }),
    } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: "sk-rotated" }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleRotateSecret(req, res, service, "no-secret");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });

  // F2: secretValue type validation (T17:26 review)
  it("returns 400 when rotate-secret has numeric secretValue and does not call service", async () => {
    let capturedBody: string = "";
    let capturedStatusCode = 0;
    const res = {
      writeHead: vi.fn((code: number) => { capturedStatusCode = code; }),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const rotateSecret = vi.fn();
    const service = { rotateSecret } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: 12345 }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleRotateSecret(req, res, service, "conn-1");

    expect(capturedStatusCode).toBe(400);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Secret value must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(rotateSecret).not.toHaveBeenCalled();
  });

  it("returns 400 when rotate-secret has object secretValue and does not call service", async () => {
    let capturedBody: string = "";
    let capturedStatusCode = 0;
    const res = {
      writeHead: vi.fn((code: number) => { capturedStatusCode = code; }),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const rotateSecret = vi.fn();
    const service = { rotateSecret } as unknown as ProviderConnectionService;

    const mockStream = new (await import("stream")).Readable();
    mockStream.push(JSON.stringify({ secretValue: { key: "sk-value" } }));
    mockStream.push(null);
    const req = Object.assign(mockStream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;

    await handleRotateSecret(req, res, service, "conn-1");

    expect(capturedStatusCode).toBe(400);
    const parsed = JSON.parse(capturedBody);
    expect(parsed.error).toBe("Secret value must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(rotateSecret).not.toHaveBeenCalled();
  });
});

describe("handleRevokeSecret", () => {
  it("returns 200 on success", async () => {
    const { res } = createMockResponse();
    const service = {
      revokeSecret: async () => ({ success: true }),
    } as unknown as ProviderConnectionService;

    await handleRevokeSecret(res, service, "conn-1");
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it("returns 400 on failure", async () => {
    const { res } = createMockResponse();
    const service = {
      revokeSecret: async () => ({
        success: false,
        error: "Not found",
        errorCode: "generic" as const,
      }),
    } as unknown as ProviderConnectionService;

    await handleRevokeSecret(res, service, "nonexistent");
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });
});

describe("handleValidateConnection", () => {
  it("returns 200 with diagnostic on success", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      validateConnection: async () => ({
        success: true,
        data: {
          connectionId: "conn-1" as any,
          severity: "info" as const,
          operation: "validate" as const,
          message: "Validation passed",
          safeMessage: "Validation passed",
          timestamp: "2026-01-01T00:00:00Z",
        },
      }),
    } as unknown as ProviderConnectionService;

    await handleValidateConnection(res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.severity).toBe("info");
  });

  it("returns error status when validation fails", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      validateConnection: async () => ({
        success: false,
        error: "Connection not found",
        errorCode: "generic" as const,
      }),
    } as unknown as ProviderConnectionService;

    await handleValidateConnection(res, service, "nonexistent");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });
});

describe("handleGetDiagnostics", () => {
  it("returns 200 with diagnostics array", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      getDiagnostics: () => [{
        connectionId: "conn-1" as any,
        severity: "info" as const,
        operation: "diagnostic" as const,
        message: "Connection healthy",
        safeMessage: "Connection healthy",
        timestamp: "2026-01-01T00:00:00Z",
      }],
    } as unknown as ProviderConnectionService;

    await handleGetDiagnostics(res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].severity).toBe("info");
  });

  it("returns empty array when no diagnostics", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      getDiagnostics: () => [],
    } as unknown as ProviderConnectionService;

    await handleGetDiagnostics(res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });
});

describe("handleDeletionPreflight", () => {
  it("returns 200 with preflight result", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      deletionPreflight: () => ({
        canDelete: false,
        blockers: [
          { blockerType: "active_worker" as const, safeDescriptor: "Worker using connection" },
        ],
      }),
    } as unknown as ProviderConnectionService;

    await handleDeletionPreflight(res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.canDelete).toBe(false);
    expect(parsed.blockers).toHaveLength(1);
    expect(parsed.blockers[0].blockerType).toBe("active_worker");
  });

  it("returns canDelete true when no blockers", async () => {
    let capturedBody: string = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { capturedBody = data; }),
    } as unknown as ServerResponse;
    const service = {
      deletionPreflight: () => ({
        canDelete: true,
        blockers: [],
      }),
    } as unknown as ProviderConnectionService;

    await handleDeletionPreflight(res, service, "conn-2");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.canDelete).toBe(true);
    expect(parsed.blockers).toHaveLength(0);
  });
});

describe("Malformed JSON handling", () => {
  function makeMockResponse(): { res: ServerResponse & { _body: string }; body: () => string } {
    let body = "";
    const res = {
      writeHead: vi.fn(),
      end: vi.fn((data: string) => { body = data; }),
      _body: "",
    } as unknown as ServerResponse & { _body: string };
    return {
      res,
      body: () => body,
    };
  }

  async function mockStreamFrom(body: string): Promise<IncomingMessage> {
    const stream = new (await import("stream")).Readable();
    stream.push(body);
    stream.push(null);
    return Object.assign(stream, { headers: { "content-type": "application/json" } }) as unknown as IncomingMessage;
  }

  it("returns 400 when create request body is malformed JSON and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("not-json-at-all");

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create request body is empty and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("");

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create request body is whitespace-only and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("   ");

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create request body is JSON null and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("null");

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // Empty-body tests for update, create-secret, and rotate-secret handlers
  it("returns 400 when update request body is empty", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("");

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create-secret request body is empty", async () => {
    const { res, body } = makeMockResponse();
    const createSecret = vi.fn();
    const service = { createSecret } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("");

    await handleCreateSecret(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createSecret).not.toHaveBeenCalled();
  });

  it("returns 400 when rotate-secret request body is empty", async () => {
    const { res, body } = makeMockResponse();
    const rotateSecret = vi.fn();
    const service = { rotateSecret } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("");

    await handleRotateSecret(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid JSON in request body");
    expect(parsed.errorCode).toBe("validation_error");
    expect(rotateSecret).not.toHaveBeenCalled();
  });

  // Create input validation tests (F2: missing/invalid provider)
  it("returns 400 when create input is missing provider and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "pi_session",
      endpointUrl: "https://valid.example.com",
      label: "test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing provider");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input provider is null and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      provider: null,
      endpointUrl: "https://valid.example.com",
      label: "test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing provider");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input provider is a string and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      provider: "openai",
      endpointUrl: "https://valid.example.com",
      label: "test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing provider");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // DTO discriminant validation tests (complete DTO validation)
  it("returns 400 when create input has unsupported top-level kind and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "unsupported",
      label: "x",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
      secretValue: "x",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing connection kind");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has missing label and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing label");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has empty label and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing label");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has unknown known providerId and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "claude" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unknown provider ID");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has missing known providerId and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing known provider ID");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has missing custom provider label and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "custom",
      label: "test",
      provider: { kind: "custom" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing custom provider label");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has unsupported provider kind and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "unsupported" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid provider kind");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has invalid provider kind type and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: 123 },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid or missing provider kind");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // F1: kind/provider.kind discriminant consistency (T17:26 review)
  it("returns 400 when pi_session kind has known provider and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "pi_session",
      label: "test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Connection kind and provider kind do not match");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when known kind has custom provider and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "custom", label: "my-provider" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Connection kind and provider kind do not match");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when custom kind has pi_session provider and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "custom",
      label: "test",
      provider: { kind: "pi_session" },
      endpointUrl: "https://example.test",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Connection kind and provider kind do not match");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // F2: secretValue type validation (T17:26 review)
  it("returns 400 when create input has numeric secretValue and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
      secretValue: 12345,
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Secret value must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has object secretValue and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
      secretValue: { key: "sk-value" },
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Secret value must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // F2 (review phase-4-code-review-2026-07-12T18-12-08-150Z): pi_session with secretValue silently accepted
  it("returns 400 when pi_session create has secretValue and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "pi_session",
      label: "test",
      provider: { kind: "pi_session" },
      endpointUrl: "https://valid.example.com",
      secretValue: "sk-should-not-be-accepted",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Pi Session connections do not use secrets");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // F1 (repeated — phase-4-code-review-2026-07-12T18-16-28-464Z): pi_session with secretValue: null still passes
  it("returns 400 when pi_session create has secretValue: null and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "pi_session",
      label: "test",
      provider: { kind: "pi_session" },
      endpointUrl: "https://valid.example.com",
      secretValue: null,
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Pi Session connections do not use secrets");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // NEW-F21: Create allowlist rejects unknown top-level keys before service call
  it("returns 400 when create input has legacy nonSecretSettings and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
      secretValue: "sk-test",
      nonSecretSettings: { timeout: 30 },
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in create input: nonSecretSettings");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when create input has unsupported secret-bearing field (apiKey) and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "openai" },
      endpointUrl: "https://example.test",
      apiKey: "sk-leaked-via-unknown-field",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in create input: apiKey");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // NEW-F22: Provider nested object key allowlist per variant
  // -----------------------------------------------------------------------

  it("returns 400 when known provider has unsupported nested field (apiKey) and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "openai", apiKey: "sk-leaked-via-nested-field" },
      endpointUrl: "https://example.test",
      secretValue: "sk-valid",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in provider: apiKey");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when known provider has nested token field and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "known",
      label: "test",
      provider: { kind: "known", providerId: "openai", token: "eyJhbGci" },
      endpointUrl: "https://example.test",
      secretValue: "sk-valid",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in provider: token");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when custom provider has unsupported nested field (secretValue) and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "custom",
      label: "my-provider",
      provider: { kind: "custom", label: "My Custom", secretValue: "sk-secret-in-nested" },
      endpointUrl: "https://custom.example",
      secretValue: "sk-valid",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in provider: secretValue");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when pi_session provider has unsupported nested field and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const createConnection = vi.fn();
    const service = { createConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({
      kind: "pi_session",
      label: "pi session",
      provider: { kind: "pi_session", providerId: "openai" },
      endpointUrl: "https://pi.default",
    }));

    await handleCreateConnection(req, res, service);

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in provider: providerId");
    expect(parsed.errorCode).toBe("validation_error");
    expect(createConnection).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Update input validation tests (F1: update DTO lacks runtime validation)
  // -----------------------------------------------------------------------

  it("returns 400 when update input is an array and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify(["label", "updated"]));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid request body: update input must be a non-array object");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input is a number and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("42");

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid request body: update input must be a non-array object");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has null label and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: null }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    // null label passes safeReadJson (valid JSON) but hits validateUpdateInput
    expect(parsed.error).toBe("Invalid label: must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input is empty object and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom("{}");

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Update input must contain at least one of: label, endpointUrl");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has numeric label and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: 42 }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid label: must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has empty label string and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: "" }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid label: must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has numeric endpointUrl and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ endpointUrl: 123 }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid endpoint URL: must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has empty endpointUrl and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ endpointUrl: "" }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Invalid endpoint URL: must be a non-empty string");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });



  it("returns 400 when update input has secretValue and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: "Updated", secretValue: "sk-secret" }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in update input: secretValue");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has unknown field and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: "Updated", nonSecretSettings: { key: "value" } }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.error).toBe("Unsupported field in update input: nonSecretSettings");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("returns 400 when update input has multiple unknown fields and does not call service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn();
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: "Updated", endpointUrl: "https://test.com", secretValue: "sk", foo: "bar" }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    const parsed = JSON.parse(body());
    // Should report the first unsupported field encountered
    expect(parsed.error).toContain("secretValue");
    expect(parsed.errorCode).toBe("validation_error");
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it("accepts valid update input with only label and calls service", async () => {
    const { res, body } = makeMockResponse();
    const updateConnection = vi.fn().mockResolvedValue({
      success: true,
      data: {
        connectionId: "conn-1",
        kind: "known",
        label: "Updated",
        provider: { kind: "known", providerId: "openai" },
        endpointUrl: "https://api.openai.com/v1",
        endpointLocal: false,
        lifecycleState: "active",
        secretRef: "ref-1",
        secretVersion: 3,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    });
    const service = { updateConnection } as unknown as ProviderConnectionService;
    const req = await mockStreamFrom(JSON.stringify({ label: "Updated" }));

    await handleUpdateConnection(req, res, service, "conn-1");

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const parsed = JSON.parse(body());
    expect(parsed.label).toBe("Updated");
    expect(updateConnection).toHaveBeenCalledWith("conn-1", { label: "Updated" });
  });
});
