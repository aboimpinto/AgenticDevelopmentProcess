/**
 * FEAT-058: Provider Connections — Presentation tests
 *
 * Tests for mappers, helpers, and format utilities.
 * No secret values in any output.
 */

import { describe, expect, it } from "vitest";
import type {
  ProviderConnectionRecord,
  ConnectionDiagnosticRecord,
  DeletionPreflightResult,
  ProviderConnectionId,
} from "@hepha/shared";
import {
  connectionRecordToSummary,
  connectionRecordToDetail,
  diagnosticRecordToView,
  deletionPreflightToDTO,
  isConnectionUsable,
  canManageSecrets,
  formatEndpointDisplay,
  formatLifecycleStateDisplay,
  formatDiagnosticSeverityLabel,
  formatFailureCode,
} from "./presentation.js";
import { getProviderDisplayLabel } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = "2026-07-12T10:00:00.000Z";

function makeConnection(overrides: Partial<ProviderConnectionRecord> = {}): ProviderConnectionRecord {
  return {
    connectionId: "test-conn-001" as ProviderConnectionId,
    kind: "custom",
    label: "Test Connection",
    provider: { kind: "custom", label: "test-provider" },
    endpointUrl: "https://api.test.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: "vault-ref-001",
    secretVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDiagnostic(overrides: Partial<ConnectionDiagnosticRecord> = {}): ConnectionDiagnosticRecord {
  return {
    diagnosticId: "diag-001",
    connectionId: "test-conn-001" as ProviderConnectionId,
    severity: "info",
    failureCode: null,
    safeMessage: "Connection created",
    httpStatusCode: null,
    diagnosticOperation: "create",
    timestamp: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// connectionRecordToSummary
// ---------------------------------------------------------------------------

describe("connectionRecordToSummary", () => {
  it("maps a custom connection to summary DTO", () => {
    const record = makeConnection();
    const dto = connectionRecordToSummary(record);

    expect(dto.connectionId).toBe("test-conn-001");
    expect(dto.kind).toBe("custom");
    expect(dto.label).toBe("Test Connection");
    expect(dto.providerLabel).toBe("test-provider");
    expect(dto.endpointUrl).toBe("https://api.test.com/v1");
    expect(dto.lifecycleState).toBe("active");
    expect(dto.hasSecret).toBe(true);
  });

  it("sets hasSecret to false when secretRef is null", () => {
    const record = makeConnection({ secretRef: null, secretVersion: null });
    const dto = connectionRecordToSummary(record);
    expect(dto.hasSecret).toBe(false);
  });

  it("maps a pi_session connection with no secret", () => {
    const record = makeConnection({
      kind: "pi_session",
      provider: { kind: "pi_session" },
      secretRef: null,
      secretVersion: null,
    });
    const dto = connectionRecordToSummary(record);
    expect(dto.kind).toBe("pi_session");
    expect(dto.hasSecret).toBe(false);
  });

  it("maps a known provider connection", () => {
    const record = makeConnection({
      kind: "known",
      provider: { kind: "known", providerId: "openai" },
    });
    const dto = connectionRecordToSummary(record);
    expect(dto.kind).toBe("known");
    expect(dto.providerLabel).toBe("OpenAI");
  });

  it("does not include secretValue in DTO", () => {
    const record = makeConnection();
    const dto = connectionRecordToSummary(record);
    expect("secretValue" in dto).toBe(false);
    expect("secret" in dto).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// connectionRecordToDetail
// ---------------------------------------------------------------------------

describe("connectionRecordToDetail", () => {
  it("maps a connection to detail DTO with provider identity", () => {
    const record = makeConnection();
    const dto = connectionRecordToDetail(record);

    expect(dto.connectionId).toBe("test-conn-001");
    expect(dto.provider).toEqual({ kind: "custom", label: "test-provider" });
    expect("secretVersion" in dto).toBe(false);
    expect(dto.hasSecret).toBe(true);
  });

  it("does not include secret value in detail DTO", () => {
    const record = makeConnection();
    const dto = connectionRecordToDetail(record);
    expect("secretValue" in dto).toBe(false);
    expect("value" in dto).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// diagnosticRecordToView
// ---------------------------------------------------------------------------

describe("diagnosticRecordToView", () => {
  it("maps an error diagnostic to view DTO", () => {
    const diag = makeDiagnostic({
      severity: "error",
      failureCode: "timeout",
      safeMessage: "Connection timed out",
      httpStatusCode: null,
    });
    const dto = diagnosticRecordToView(diag);

    expect(dto.severity).toBe("error");
    expect(dto.failureCode).toBe("timeout");
    expect(dto.safeMessage).toBe("Connection timed out");
    expect(dto.operation).toBe("create");
  });

  it("maps an info diagnostic", () => {
    const diag = makeDiagnostic({
      severity: "info",
      failureCode: null,
      safeMessage: "All good",
    });
    const dto = diagnosticRecordToView(diag);

    expect(dto.severity).toBe("info");
    expect(dto.failureCode).toBeNull();
    expect(dto.safeMessage).toBe("All good");
  });

  it("includes HTTP status code", () => {
    const diag = makeDiagnostic({
      severity: "error",
      failureCode: "http_error",
      httpStatusCode: 500,
    });
    const dto = diagnosticRecordToView(diag);
    expect(dto.httpStatusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// deletionPreflightToDTO
// ---------------------------------------------------------------------------

describe("deletionPreflightToDTO", () => {
  it("maps canDelete = true with no blockers", () => {
    const preflight: DeletionPreflightResult = { canDelete: true, blockers: [] };
    const dto = deletionPreflightToDTO(preflight);
    expect(dto.canDelete).toBe(true);
    expect(dto.blockers).toHaveLength(0);
  });

  it("maps blockers with correct types", () => {
    const preflight: DeletionPreflightResult = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "Route depends on this" },
        { blockerType: "active_worker", safeDescriptor: "Active session #1" },
      ],
    };
    const dto = deletionPreflightToDTO(preflight);
    expect(dto.canDelete).toBe(false);
    expect(dto.blockers).toHaveLength(2);
    expect(dto.blockers[0].blockerType).toBe("routing_policy");
    expect(dto.blockers[1].blockerType).toBe("active_worker");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("connection helpers", () => {
  it("isConnectionUsable returns true for active state", () => {
    expect(isConnectionUsable(makeConnection({ lifecycleState: "active" }))).toBe(true);
    expect(isConnectionUsable(makeConnection({ lifecycleState: "revoked" }))).toBe(false);
    expect(isConnectionUsable(makeConnection({ lifecycleState: "deleted" }))).toBe(false);
  });

  it("canManageSecrets returns false for pi_session", () => {
    expect(canManageSecrets(makeConnection({ kind: "pi_session" }))).toBe(false);
    expect(canManageSecrets(makeConnection({ kind: "custom" }))).toBe(true);
  });

  it("canManageSecrets returns false for non-active connections", () => {
    expect(canManageSecrets(makeConnection({ lifecycleState: "revoked" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

describe("format helpers", () => {
  it("formatEndpointDisplay shows local hint", () => {
    expect(formatEndpointDisplay("http://localhost:11434", true)).toBe("http://localhost:11434 (local)");
    expect(formatEndpointDisplay("https://api.test.com", false)).toBe("https://api.test.com");
  });

  it("formatLifecycleStateDisplay shows labels", () => {
    expect(formatLifecycleStateDisplay("active")).toBe("Active");
    expect(formatLifecycleStateDisplay("revoked")).toBe("Revoked");
    expect(formatLifecycleStateDisplay("deleted")).toBe("Deleted");
  });

  it("formatLifecycleStateDisplay returns raw for unknown state", () => {
    expect(formatLifecycleStateDisplay("unknown")).toBe("unknown");
  });

  it("formatDiagnosticSeverityLabel shows labels", () => {
    expect(formatDiagnosticSeverityLabel("error")).toBe("Error");
    expect(formatDiagnosticSeverityLabel("warning")).toBe("Warning");
    expect(formatDiagnosticSeverityLabel("info")).toBe("Info");
  });

  it("formatFailureCode formats codes", () => {
    expect(formatFailureCode("timeout")).toBe("Timeout");
    expect(formatFailureCode("auth_failed")).toBe("Auth Failed");
    expect(formatFailureCode("redirect_rejected")).toBe("Redirect Rejected");
    expect(formatFailureCode(null)).toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// getProviderDisplayLabel
// ---------------------------------------------------------------------------

describe("getProviderDisplayLabel", () => {
  it("returns label for known providers", () => {
    expect(getProviderDisplayLabel({ kind: "known", providerId: "openai" })).toBe("OpenAI");
    expect(getProviderDisplayLabel({ kind: "known", providerId: "deepseek" })).toBe("DeepSeek");
    expect(getProviderDisplayLabel({ kind: "known", providerId: "openai-codex" })).toBe("OpenAI Codex");
  });

  it("returns providerId for unknown known-provider", () => {
    expect(getProviderDisplayLabel({ kind: "known", providerId: "anthropic" })).toBe("anthropic");
  });

  it("returns label for custom provider", () => {
    expect(getProviderDisplayLabel({ kind: "custom", label: "my-llm" })).toBe("my-llm");
  });

  it("returns Pi Session for pi_session", () => {
    expect(getProviderDisplayLabel({ kind: "pi_session" })).toBe("Pi Session");
  });
});
