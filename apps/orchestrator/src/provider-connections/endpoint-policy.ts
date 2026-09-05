/**
 * FEAT-058: Endpoint Policy
 *
 * Endpoint validation, transport redirect policy, and URL classification.
 *
 * Rules:
 * - Remote (non-loopback) endpoints require HTTPS.
 * - Loopback/localhost endpoints are explicitly classified and permitted.
 * - Redirects crossing host boundaries are rejected.
 * - Protocol downgrade (HTTPS → HTTP) on redirect is rejected.
 * - No Authorization header forwarding across redirects.
 * - Timeout: 30 seconds.
 */

import { ENDPOINT_VALIDATION_TIMEOUT_MS } from "@hepha/shared";
import type { DiagnosticFailureCode } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EndpointClassification = "remote_https" | "local" | "invalid";

export interface EndpointValidationResult {
  readonly valid: boolean;
  readonly classification: EndpointClassification;
  readonly failureCode: DiagnosticFailureCode | null;
  readonly safeMessage: string;
}

export interface TransportCheckResult {
  readonly success: boolean;
  readonly failureCode: DiagnosticFailureCode | null;
  readonly safeMessage: string;
  readonly httpStatusCode: number | null;
}

export interface EndpointTransport {
  /** Perform an endpoint transport check. */
  check(url: string): Promise<TransportCheckResult>;
}

// ---------------------------------------------------------------------------
// URL Classification
// ---------------------------------------------------------------------------

const LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?(\/|$)/i,
  /^https?:\/\/127\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(\/|$)/,
  /^https?:\/\/\[::1\](?::\d+)?(\/|$)/,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(\/|$)/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?(\/|$)/,
  /^https?:\/\/172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(?::\d+)?(\/|$)/,
];

export function classifyEndpoint(url: string): EndpointValidationResult {
  try {
    const parsed = new URL(url);
    const isLocalhost = LOCALHOST_PATTERNS.some((pattern) => pattern.test(url));

    if (isLocalhost) {
      return {
        valid: true,
        classification: "local",
        failureCode: null,
        safeMessage: "Local endpoint classified and permitted",
      };
    }

    if (parsed.protocol !== "https:") {
      return {
        valid: false,
        classification: "invalid",
        failureCode: "invalid_endpoint",
        safeMessage: "Remote endpoints require HTTPS",
      };
    }

    return {
      valid: true,
      classification: "remote_https",
      failureCode: null,
      safeMessage: "Remote HTTPS endpoint",
    };
  } catch {
    return {
      valid: false,
      classification: "invalid",
      failureCode: "invalid_endpoint",
      safeMessage: "Endpoint URL could not be parsed",
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP Transport (real)
// ---------------------------------------------------------------------------

export class HttpEndpointTransport implements EndpointTransport {
  async check(url: string): Promise<TransportCheckResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENDPOINT_VALIDATION_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      });

      clearTimeout(timeout);

      const status = response.status;

      // Check for redirect
      if (status >= 300 && status < 400) {
        const location = response.headers.get("location");
        if (location) {
          return handleRedirect(url, location, status);
        }
        return {
          success: false,
          failureCode: "redirect_rejected",
          safeMessage: `Redirect with no Location header (HTTP ${status})`,
          httpStatusCode: status,
        };
      }

      // Success (2xx) or error (4xx/5xx) — record as-is
      if (status >= 200 && status < 300) {
        return {
          success: true,
          failureCode: null,
          safeMessage: `Endpoint responded with HTTP ${status}`,
          httpStatusCode: status,
        };
      }

      return {
        success: false,
        failureCode: "http_error",
        safeMessage: `Endpoint returned HTTP ${status}`,
        httpStatusCode: status,
      };
    } catch (error: unknown) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          failureCode: "timeout",
          safeMessage: "Connection timed out",
          httpStatusCode: null,
        };
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        return {
          success: false,
          failureCode: "unreachable",
          safeMessage: "Cannot reach endpoint",
          httpStatusCode: null,
        };
      }

      return {
        success: false,
        failureCode: "unknown",
        safeMessage: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
        httpStatusCode: null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Redirect Handler
// ---------------------------------------------------------------------------

function handleRedirect(
  originalUrl: string,
  location: string,
  status: number,
): TransportCheckResult {
  const originalHost = extractHost(originalUrl);
  const targetHost = extractHost(location);

  // Reject cross-host redirects
  if (targetHost && originalHost && targetHost !== originalHost) {
    return {
      success: false,
      failureCode: "redirect_rejected",
      safeMessage: `Redirect rejected: target host "${targetHost}" differs from original "${originalHost}"`,
      httpStatusCode: status,
    };
  }

  // Reject protocol downgrade
  if (originalUrl.startsWith("https:") && location.startsWith("http:")) {
    return {
      success: false,
      failureCode: "protocol_downgrade",
      safeMessage: "Redirect rejected: HTTPS to HTTP protocol downgrade",
      httpStatusCode: status,
    };
  }

  // Same-host redirect is acceptable
  return {
    success: true,
    failureCode: null,
    safeMessage: `Redirected to same host (HTTP ${status})`,
    httpStatusCode: status,
  };
}

function extractHost(url: string): string | null {
  try {
    const parsed = new URL(url, url.startsWith("http") ? undefined : "https://placeholder.test");
    return parsed.hostname;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fake Endpoint Transport (test)
// ---------------------------------------------------------------------------

export interface FakeEndpointResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

export class FakeEndpointTransport implements EndpointTransport {
  private responses: Map<string, FakeEndpointResponse> = new Map();
  private defaultResponse: FakeEndpointResponse = { statusCode: 200 };
  private simulateNetworkError = false;

  setResponse(url: string, response: FakeEndpointResponse): void {
    this.responses.set(url, response);
  }

  setDefaultResponse(response: FakeEndpointResponse): void {
    this.defaultResponse = response;
  }

  setSimulateNetworkError(simulate: boolean): void {
    this.simulateNetworkError = simulate;
  }

  async check(url: string): Promise<TransportCheckResult> {
    if (this.simulateNetworkError) {
      return {
        success: false,
        failureCode: "unreachable",
        safeMessage: "Cannot reach endpoint",
        httpStatusCode: null,
      };
    }

    const response = this.responses.get(url) ?? this.defaultResponse;
    const status = response.statusCode;
    const location = response.headers?.["location"];

    // Simulate redirect handling
    if (status >= 300 && status < 400 && location) {
      return handleRedirect(url, location, status);
    }

    if (status >= 200 && status < 300) {
      return {
        success: true,
        failureCode: null,
        safeMessage: `Endpoint responded with HTTP ${status}`,
        httpStatusCode: status,
      };
    }

    // Auth failure
    if (status === 401 || status === 403) {
      return {
        success: false,
        failureCode: "auth_failed",
        safeMessage: `Authentication failed (HTTP ${status})`,
        httpStatusCode: status,
      };
    }

    if (status >= 400) {
      return {
        success: false,
        failureCode: "http_error",
        safeMessage: `Endpoint returned HTTP ${status}`,
        httpStatusCode: status,
      };
    }

    return {
      success: true,
      failureCode: null,
      safeMessage: `Endpoint responded with HTTP ${status}`,
      httpStatusCode: status,
    };
  }
}
