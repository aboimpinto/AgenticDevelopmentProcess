// Behavior suite: provider connection diagnostics.
/**
 * FEAT-058: Diagnostics Tests
 *
 * Tests for diagnostic creation, redaction, failure code labels,
 * and severity classification.
 */

import { describe, expect, it } from "vitest";
import {
  createDiagnostic,
  redactMessage,
  getFailureLabel,
  classifySeverity,
} from "../src/provider-connections/diagnostics.js";
import type { ProviderConnectionId } from "@hepha/shared";

// ---------------------------------------------------------------------------
// createDiagnostic
// ---------------------------------------------------------------------------

describe("createDiagnostic", () => {
  const connId = "test-conn-id" as ProviderConnectionId;

  it("creates an info diagnostic with safe message", () => {
    const diag = createDiagnostic(connId, "info", "test");
    expect(diag.connectionId).toBe(connId);
    expect(diag.severity).toBe("info");
    expect(diag.diagnosticOperation).toBe("test");
    expect(diag.safeMessage).toBeTruthy();
    expect(diag.diagnosticId).toBeTruthy();
    expect(diag.timestamp).toBeTruthy();
  });

  it("includes failure code when provided", () => {
    const diag = createDiagnostic(connId, "error", "validate", {
      failureCode: "timeout",
      safeMessage: "Connection timed out",
      httpStatusCode: null,
    });
    expect(diag.failureCode).toBe("timeout");
    expect(diag.severity).toBe("error");
  });

  it("includes HTTP status code when provided", () => {
    const diag = createDiagnostic(connId, "error", "validate", {
      failureCode: "http_error",
      safeMessage: "HTTP 500 error",
      httpStatusCode: 500,
    });
    expect(diag.httpStatusCode).toBe(500);
  });

  it("sets failureCode to null when omitted", () => {
    const diag = createDiagnostic(connId, "info", "create");
    expect(diag.failureCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// redactMessage
// ---------------------------------------------------------------------------

describe("redactMessage", () => {
  it("redacts OpenAI-style keys", () => {
    const result = redactMessage("API key: sk-abc123def456ghi789jkl"); // gitleaks:allow -- synthetic redaction fixture
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-abc123def456ghi789jkl");
  });

  it("redacts Bearer tokens", () => {
    const result = redactMessage("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiJ9.token");
  });

  it("redacts key=value patterns", () => {
    const result = redactMessage("api_key=sk-test-key-here");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-test-key-here");
  });

  it("redacts Authorization header pattern", () => {
    const result = redactMessage("Authorization: sk-test-key");
    expect(result).toContain("[REDACTED]");
  });

  it("leaves safe messages unchanged", () => {
    const result = redactMessage("Connection validated successfully");
    expect(result).toBe("Connection validated successfully");
  });

  it("leaves simple URL unchanged", () => {
    const result = redactMessage("Endpoint: https://api.test.com/v1");
    expect(result).toContain("https://api.test.com/v1");
  });

  it("handles empty string", () => {
    expect(redactMessage("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getFailureLabel
// ---------------------------------------------------------------------------

describe("getFailureLabel", () => {
  it("returns label for known failure code", () => {
    expect(getFailureLabel("timeout")).toBe("Connection timed out");
    expect(getFailureLabel("auth_failed")).toBe("Authentication failed");
    expect(getFailureLabel("unreachable")).toBe("Cannot reach endpoint");
  });

  it("returns 'Unknown error' for unknown code", () => {
    expect(getFailureLabel("unknown" as any)).toBe("Unknown connection error");
  });
});

// ---------------------------------------------------------------------------
// classifySeverity
// ---------------------------------------------------------------------------

describe("classifySeverity", () => {
  it("returns info for null failure code", () => {
    expect(classifySeverity(null)).toBe("info");
  });

  it("returns warning for local_endpoint", () => {
    expect(classifySeverity("local_endpoint")).toBe("warning");
  });

  it("returns error for failure codes", () => {
    expect(classifySeverity("timeout")).toBe("error");
    expect(classifySeverity("auth_failed")).toBe("error");
    expect(classifySeverity("http_error")).toBe("error");
  });
});
