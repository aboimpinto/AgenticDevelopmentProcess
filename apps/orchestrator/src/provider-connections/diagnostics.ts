/**
 * FEAT-058: Connection Diagnostics
 *
 * Safe diagnostic classification and redaction utilities.
 * All diagnostic messages are scrubbed — no secret values, headers,
 * or raw provider response bodies appear in diagnostic output.
 */

import type {
  ConnectionDiagnosticRecord,
  DiagnosticFailureCode,
  DiagnosticSeverity,
  ProviderConnectionId,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Diagnostic Factory
// ---------------------------------------------------------------------------

let diagnosticCounter = 0;

export function createDiagnostic(
  connectionId: ProviderConnectionId,
  severity: DiagnosticSeverity,
  operation: string,
  overrides?: {
    failureCode?: DiagnosticFailureCode | null;
    safeMessage?: string;
    httpStatusCode?: number | null;
  },
): ConnectionDiagnosticRecord {
  diagnosticCounter++;
  return {
    diagnosticId: `diag-${connectionId}-${Date.now()}-${diagnosticCounter}`,
    connectionId,
    severity,
    failureCode: overrides?.failureCode ?? null,
    safeMessage: overrides?.safeMessage ?? `${operation} completed`,
    httpStatusCode: overrides?.httpStatusCode ?? null,
    diagnosticOperation: operation,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Message Redaction
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,               // OpenAI-style keys
  /[A-Za-z0-9+/=]{40,}/g,                // Generic long base64-like tokens
  /(api[_-]?key|api[_-]?secret|password|token|secret|auth[_-]?token)[=:]\s*\S+/gi, // key=value patterns
  /Bearer\s+[A-Za-z0-9\-._~+/]+/gi,      // Bearer tokens
  /Authorization:\s*\S+/gi,               // Authorization headers
];

const REDACTION_PLACEHOLDER = "[REDACTED]";

/**
 * Redact potential secret values from a message string.
 * Returns a safe message with secrets replaced.
 */
export function redactMessage(message: string): string {
  let safe = message;
  for (const pattern of SECRET_PATTERNS) {
    safe = safe.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return safe;
}

// ---------------------------------------------------------------------------
// Failure Code Lookup
// ---------------------------------------------------------------------------

const FAILURE_CODE_LABELS: Record<DiagnosticFailureCode, string> = {
  timeout: "Connection timed out",
  unreachable: "Cannot reach endpoint",
  auth_failed: "Authentication failed",
  http_error: "HTTP error response",
  malformed_response: "Malformed response from endpoint",
  redirect_rejected: "Redirect rejected",
  protocol_downgrade: "Protocol downgrade rejected",
  invalid_endpoint: "Invalid endpoint URL",
  local_endpoint: "Local endpoint (permitted)",
  unavailable_vault: "Secret vault unavailable",
  unknown: "Unknown connection error",
};

export function getFailureLabel(code: DiagnosticFailureCode): string {
  return FAILURE_CODE_LABELS[code] ?? "Unknown error";
}

export function classifySeverity(failureCode: DiagnosticFailureCode | null): DiagnosticSeverity {
  if (failureCode === null) return "info";
  if (failureCode === "local_endpoint") return "warning";
  return "error";
}
