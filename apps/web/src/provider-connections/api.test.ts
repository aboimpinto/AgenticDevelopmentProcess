/**
 * FEAT-058: API Client Tests
 *
 * Tests the typed provider-connection API client, including:
 * - ProviderConnectionApiError discriminator getters
 * - Error code and status code propagation from fetch responses
 * - Transport failure (network error) handling
 * - Malformed/non-JSON error response handling
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ProviderConnectionApiError } from "./api.js";

// ---------------------------------------------------------------------------
// ProviderConnectionApiError — pure discriminator getters
// ---------------------------------------------------------------------------

describe("ProviderConnectionApiError — discriminator getters", () => {
  it("isVaultUnavailable returns true for vault_unavailable errorCode", () => {
    const err = new ProviderConnectionApiError("Vault unavailable", 503, "vault_unavailable");
    expect(err.isVaultUnavailable).toBe(true);
    expect(err.isBlockedDeletion).toBe(false);
    expect(err.isValidationError).toBe(false);
    expect(err.isTransportFailure).toBe(false);
  });

  it("isBlockedDeletion returns true for blocked_deletion errorCode", () => {
    const err = new ProviderConnectionApiError("Blocked", 409, "blocked_deletion");
    expect(err.isBlockedDeletion).toBe(true);
    expect(err.isVaultUnavailable).toBe(false);
    expect(err.isValidationError).toBe(false);
    expect(err.isTransportFailure).toBe(false);
  });

  it("isValidationError returns true for validation_error errorCode", () => {
    const err = new ProviderConnectionApiError("Invalid input", 400, "validation_error");
    expect(err.isValidationError).toBe(true);
    expect(err.isVaultUnavailable).toBe(false);
    expect(err.isBlockedDeletion).toBe(false);
    expect(err.isTransportFailure).toBe(false);
  });

  it("isTransportFailure returns true when statusCode is 0 and no errorCode", () => {
    const err = new ProviderConnectionApiError("Network error", 0);
    expect(err.isTransportFailure).toBe(true);
    expect(err.isVaultUnavailable).toBe(false);
    expect(err.isBlockedDeletion).toBe(false);
    expect(err.isValidationError).toBe(false);
  });

  it("isTransportFailure returns false when statusCode is non-zero", () => {
    const err = new ProviderConnectionApiError("Server error", 500);
    expect(err.isTransportFailure).toBe(false);
  });

  it("isTransportFailure returns false when errorCode is set even with status 0", () => {
    const err = new ProviderConnectionApiError("Unknown", 0, "unknown_code");
    expect(err.isTransportFailure).toBe(false);
  });

  it("preserves all constructor arguments", () => {
    const err = new ProviderConnectionApiError("Custom message", 418, "teapot_code");
    expect(err.message).toBe("Custom message");
    expect(err.statusCode).toBe(418);
    expect(err.errorCode).toBe("teapot_code");
    expect(err.name).toBe("ProviderConnectionApiError");
  });

  it("handles missing errorCode gracefully", () => {
    const err = new ProviderConnectionApiError("No code", 400);
    expect(err.errorCode).toBeUndefined();
    expect(err.isValidationError).toBe(false);
    expect(err.isBlockedDeletion).toBe(false);
    expect(err.isVaultUnavailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// API request — error handling via mocked fetch
// ---------------------------------------------------------------------------

describe("API request error handling", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws ProviderConnectionApiError for validation_error response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "Invalid endpoint URL", errorCode: "validation_error" }),
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.createConnection({} as any));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.errorCode).toBe("validation_error");
      expect(apiErr.isValidationError).toBe(true);
      expect(apiErr.isBlockedDeletion).toBe(false);
      expect(apiErr.isVaultUnavailable).toBe(false);
      expect(apiErr.isTransportFailure).toBe(false);
    }
  });

  it("throws ProviderConnectionApiError for blocked_deletion response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ error: "Connection has active dependencies", errorCode: "blocked_deletion" }),
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.deleteConnection("conn-1" as any));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(409);
      expect(apiErr.errorCode).toBe("blocked_deletion");
      expect(apiErr.isBlockedDeletion).toBe(true);
      expect(apiErr.isValidationError).toBe(false);
      expect(apiErr.isVaultUnavailable).toBe(false);
      expect(apiErr.isTransportFailure).toBe(false);
    }
  });

  it("throws ProviderConnectionApiError for vault_unavailable response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({ error: "Secret vault is unavailable", errorCode: "vault_unavailable" }),
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.createSecret({ connectionId: "conn-1" as any, secretValue: "sk-test" }));
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(503);
      expect(apiErr.errorCode).toBe("vault_unavailable");
      expect(apiErr.isVaultUnavailable).toBe(true);
      expect(apiErr.isBlockedDeletion).toBe(false);
      expect(apiErr.isValidationError).toBe(false);
      expect(apiErr.isTransportFailure).toBe(false);
    }
  });

  it("throws ProviderConnectionApiError for transport failure (network error)", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    try {
      await import("./api.js").then((m) => m.listConnections());
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(0);
      expect(apiErr.errorCode).toBeUndefined();
      expect(apiErr.isTransportFailure).toBe(true);
      expect(apiErr.isValidationError).toBe(false);
      expect(apiErr.isBlockedDeletion).toBe(false);
      expect(apiErr.isVaultUnavailable).toBe(false);
    }
  });

  it("handles non-JSON error response gracefully", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => { throw new SyntaxError("Unexpected token < in JSON"); },
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.listConnections());
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(500);
      expect(apiErr.errorCode).toBeUndefined();
      expect(apiErr.isTransportFailure).toBe(false);
    }
  });

  it("handles JSON null error body without crashing", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => null,
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.listConnections());
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(500);
      expect(apiErr.errorCode).toBeUndefined();
      // Falls back to statusText since null body has no error message
      expect(apiErr.message).toBe("Internal Server Error");
    }
  });

  it("handles JSON string error body gracefully", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => "invalid",
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.listConnections());
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.errorCode).toBeUndefined();
      expect(apiErr.message).toBe("Bad Request");
    }
  });

  it("handles JSON number error body gracefully", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => 42,
    } as unknown as Response);

    try {
      await import("./api.js").then((m) => m.listConnections());
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConnectionApiError);
      const apiErr = err as ProviderConnectionApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.errorCode).toBeUndefined();
      expect(apiErr.message).toBe("Bad Request");
    }
  });
});
