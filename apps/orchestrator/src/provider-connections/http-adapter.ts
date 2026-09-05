/**
 * FEAT-058: Provider Connections — HTTP Adapter
 *
 * Maps ProviderConnectionService results to HTTP response DTOs.
 * All responses are sanitized — no secret values.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ProviderConnectionId,
  ProviderConnectionRecord,
  ConnectionDiagnosticRecord,
  DeletionPreflightResult,
  DeletionBlocker,
  CreateProviderConnectionInput,
  UpdateProviderConnectionInput,
  SecretOperationInput,
  DeletionResolutionInput,
  SecretReference,
} from "@hepha/shared";
import type { ProviderConnectionService, ProviderConnectionResult } from "./service.js";

// ---------------------------------------------------------------------------
// Response DTOs (mirrors apps/web/src/provider-connections/types.ts)
// ---------------------------------------------------------------------------

export interface ConnectionSummaryResponse {
  readonly connectionId: string;
  readonly kind: string;
  readonly label: string;
  readonly providerLabel: string;
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: string;
  readonly hasSecret: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConnectionDetailResponse {
  readonly connectionId: string;
  readonly kind: string;
  readonly label: string;
  readonly provider: { readonly kind: string; readonly providerId?: string; readonly label?: string };
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: string;
  readonly hasSecret: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DiagnosticViewResponse {
  readonly diagnosticId: string;
  readonly severity: string;
  readonly failureCode: string | null;
  readonly safeMessage: string;
  readonly httpStatusCode: number | null;
  readonly operation: string;
  readonly timestamp: string;
}

export interface DeletionBlockerResponse {
  readonly blockerType: string;
  readonly safeDescriptor: string;
}

export interface DeletionPreflightResponse {
  readonly canDelete: boolean;
  readonly blockers: DeletionBlockerResponse[];
}

export interface SecretVersionResponse {
  readonly version: number;
}

export interface ErrorResponse {
  readonly error: string;
  readonly errorCode?: string;
}

// ---------------------------------------------------------------------------
// Mapper helpers
// ---------------------------------------------------------------------------

function getProviderLabel(record: ProviderConnectionRecord): string {
  switch (record.provider.kind) {
    case "known":
      return KNOWN_PROVIDER_LABELS[record.provider.providerId] ?? record.provider.providerId;
    case "custom":
      return record.provider.label;
    case "pi_session":
      return "Pi Session";
  }
}

const KNOWN_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  "openai-codex": "OpenAI Codex",
};

export function recordToSummary(record: ProviderConnectionRecord): ConnectionSummaryResponse {
  return {
    connectionId: record.connectionId,
    kind: record.kind,
    label: record.label,
    providerLabel: getProviderLabel(record),
    endpointUrl: record.endpointUrl,
    endpointLocal: record.endpointLocal,
    lifecycleState: record.lifecycleState,
    hasSecret: record.secretRef !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function recordToDetail(record: ProviderConnectionRecord): ConnectionDetailResponse {
  const provider = record.provider;
  return {
    connectionId: record.connectionId,
    kind: record.kind,
    label: record.label,
    provider: { kind: provider.kind, providerId: provider.kind === "known" ? provider.providerId : undefined, label: provider.kind === "custom" ? provider.label : undefined },
    endpointUrl: record.endpointUrl,
    endpointLocal: record.endpointLocal,
    lifecycleState: record.lifecycleState,
    hasSecret: record.secretRef !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function diagnosticToView(diag: ConnectionDiagnosticRecord): DiagnosticViewResponse {
  return {
    diagnosticId: diag.diagnosticId,
    severity: diag.severity,
    failureCode: diag.failureCode,
    safeMessage: diag.safeMessage,
    httpStatusCode: diag.httpStatusCode,
    operation: diag.diagnosticOperation,
    timestamp: diag.timestamp,
  };
}

export function deletionBlockerToResponse(blocker: DeletionBlocker): DeletionBlockerResponse {
  return {
    blockerType: blocker.blockerType,
    safeDescriptor: blocker.safeDescriptor,
  };
}

export function deletionPreflightToResponse(preflight: DeletionPreflightResult): DeletionPreflightResponse {
  return {
    canDelete: preflight.canDelete,
    blockers: preflight.blockers.map(deletionBlockerToResponse),
  };
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function serviceResultToStatusCode(result: ProviderConnectionResult<unknown>): number {
  if (result.success) return 200;
  switch (result.errorCode) {
    case "vault_unavailable":
      return 503;
    case "not_found":
      return 404;
    case "blocked_deletion":
      return 409;
    case "validation_error":
    case "generic":
    default:
      return 400;
  }
}

/**
 * Map a service error result to a safe ErrorResponse.
 * Never forwards raw error messages — they may contain secret material
 * from vault/driver errors (F1, code-review finding).
 */
export function toSafeErrorResponse(
  result: ProviderConnectionResult<unknown>,
  fallbackMessage: string,
): ErrorResponse {
  return {
    error: getSafeErrorMessage(result.errorCode, fallbackMessage),
    errorCode: result.errorCode,
  };
}

function getSafeErrorMessage(errorCode: string | undefined, fallbackMessage: string): string {
  switch (errorCode) {
    case "vault_unavailable":
      return "Service temporarily unavailable";
    case "not_found":
      return "Connection not found";
    case "blocked_deletion":
      return "Connection has active dependencies";
    case "validation_error":
    case "generic":
    default:
      return fallbackMessage;
  }
}

function sendJson<T>(response: ServerResponse, statusCode: number, body: T): void {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Route handler helpers
// ---------------------------------------------------------------------------

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    // Empty or whitespace-only body is malformed for non-delete handlers.
    // The delete handler reads body text directly, so this throw is safe.
    throw new MalformedRequestError();
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null) {
      // JSON.parse("null") returns JavaScript null. Reject it as malformed
      // so handlers get a safe 400 response instead of a no-response hang.
      throw new MalformedRequestError();
    }
    return parsed as T;
  } catch {
    throw new MalformedRequestError();
  }
}

class MalformedRequestError extends Error {
  readonly statusCode = 400;
  constructor() {
    super("Invalid JSON in request body");
    this.name = "MalformedRequestError";
  }
}

/**
 * Safe variant of readJson that catches MalformedRequestError and sends
 * a serialized 400 response instead of letting the error propagate.
 */
async function safeReadJson<T>(request: IncomingMessage, response: ServerResponse): Promise<T | null> {
  try {
    return await readJson<T>(request);
  } catch (err) {
    if (err instanceof MalformedRequestError) {
      sendJson(response, 400, { error: "Invalid JSON in request body", errorCode: "validation_error" } satisfies ErrorResponse);
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a create-connection input has all required discriminant fields.
 * Returns a safe error message or null if valid.
 *
 * Without this check, an input with valid JSON syntax but missing the
 * required discriminant fields would reach the service and could be
 * persisted with partial or undefined fields, causing a raw 500 when
 * recordToDetail() dereferences provider.kind or connection properties.
 */
function validateCreateInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "Invalid request body";
  }

  const obj = input as Record<string, unknown>;

  // Validate top-level kind is a valid ProviderConnectionKind
  if (obj.kind !== "known" && obj.kind !== "custom" && obj.kind !== "pi_session") {
    return "Invalid or missing connection kind";
  }

  // Validate label is a non-empty string
  if (typeof obj.label !== "string" || obj.label.trim().length === 0) {
    return "Invalid or missing label";
  }

  // Validate provider discriminator
  if (typeof obj.provider !== "object" || obj.provider === null || Array.isArray(obj.provider)) {
    return "Invalid or missing provider";
  }

  const provider = obj.provider as Record<string, unknown>;

  if (typeof provider.kind !== "string") {
    return "Invalid or missing provider kind";
  }

  // Validate provider discriminant based on kind
  if (provider.kind === "known") {
    if (typeof provider.providerId !== "string" || provider.providerId.trim().length === 0) {
      return "Invalid or missing known provider ID";
    }
    // Validate providerId is a recognized KnownProviderId
    if (provider.providerId !== "openai" && provider.providerId !== "deepseek" && provider.providerId !== "openai-codex") {
      return "Unknown provider ID";
    }
  } else if (provider.kind === "custom") {
    if (typeof provider.label !== "string" || provider.label.trim().length === 0) {
      return "Invalid or missing custom provider label";
    }
  } else if (provider.kind !== "pi_session") {
    return "Invalid provider kind";
  }

  // Reject unsupported provider keys per variant — the provider object
  // is a discriminated union and must not contain fields that belong to
  // a different variant or carry secret-bearing fields (e.g. apiKey, token).
  // Without this allowlist, `{ kind:"known", providerId:"openai", apiKey:"..." }`
  // would pass validation and forward the unsupported nested field to the
  // service, which silently discards it. This violates the strict DTO
  // / no-silent-no-op architecture (NEW-F22).
  const providerAllowedKeys: string[] =
    provider.kind === "known" ? ["kind", "providerId"] :
    provider.kind === "custom" ? ["kind", "label"] :
    ["kind"]; // pi_session
  for (const key of Object.keys(provider)) {
    if (!providerAllowedKeys.includes(key)) {
      return `Unsupported field in provider: ${key}`;
    }
  }

  // Validate top-level kind matches provider kind (discriminant consistency)
  if (obj.kind !== provider.kind) {
    return "Connection kind and provider kind do not match";
  }

  // Validate secretValue is a non-empty string when present for non-pi_session connections
  if (obj.kind !== "pi_session") {
    if (obj.secretValue !== undefined && obj.secretValue !== null) {
      if (typeof obj.secretValue !== "string" || obj.secretValue.trim().length === 0) {
        return "Secret value must be a non-empty string";
      }
    }
  }

  // Reject any present secretValue property for pi_session connections
  // pi_session has no secret — accepting one (even null) would silently discard it.
  // Use property-existence check ("secretValue" in obj) rather than value truthiness
  // so that null, undefined-as-value, and any other sentinel is caught.
  if (obj.kind === "pi_session" && "secretValue" in obj) {
    return "Pi Session connections do not use secrets";
  }

  // Validate endpointUrl
  if (typeof obj.endpointUrl !== "string" || obj.endpointUrl.trim().length === 0) {
    return "Invalid or missing endpoint URL";
  }

  // Reject unknown top-level keys — only allowed keys are:
  // kind, label, provider, endpointUrl, secretValue
  // Without this allowlist, a raw create body containing nonSecretSettings,
  // an alternate secret-bearing field (e.g. apiKey, token), or any other
  // unsupported configuration would be accepted with a success response
  // while the service silently drops it. This contradicts the secret-safe
  // architecture and the removed-nonSecretSettings contract (NEW-F21).
  const allowedKeys = new Set(["kind", "label", "provider", "endpointUrl", "secretValue"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return `Unsupported field in create input: ${key}`;
    }
  }

  return null;
}

/**
 * Validate an update-connection input has the correct shape.
 * Update inputs have all optional fields; at least one must be present
 * and each present field must be valid.
 */
function validateUpdateInput(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "Invalid request body: update input must be a non-array object";
  }

  const obj = input as Record<string, unknown>;

  // At least one permitted field must be present
  if (obj.label === undefined && obj.endpointUrl === undefined) {
    return "Update input must contain at least one of: label, endpointUrl";
  }

  // Validate label if present
  if (obj.label !== undefined) {
    if (typeof obj.label !== "string" || obj.label.trim().length === 0) {
      return "Invalid label: must be a non-empty string";
    }
  }

  // Validate endpointUrl if present
  if (obj.endpointUrl !== undefined) {
    if (typeof obj.endpointUrl !== "string" || obj.endpointUrl.trim().length === 0) {
      return "Invalid endpoint URL: must be a non-empty string";
    }
  }

  // Reject any unsupported fields — the update endpoint accepts only label and endpointUrl.
  // Fields like secretValue, nonSecretSettings, or any other unknown key would
  // otherwise reach the service and be silently ignored, creating a false success.
  const allowedKeys = new Set(["label", "endpointUrl"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return `Unsupported field in update input: ${key}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function handleListConnections(
  response: ServerResponse,
  service: ProviderConnectionService,
): Promise<void> {
  const records = service.listConnections();
  const summaries = records.map(recordToSummary);
  sendJson(response, 200, summaries);
}

export async function handleGetConnection(
  response: ServerResponse,
  service: ProviderConnectionService,
  connectionId: string,
): Promise<void> {
  const record = service.getConnection(connectionId as ProviderConnectionId);
  if (!record) {
    sendJson(response, 404, { error: "Connection not found" } satisfies ErrorResponse);
    return;
  }
  sendJson(response, 200, recordToDetail(record));
}

export async function handleCreateConnection(
  request: IncomingMessage,
  response: ServerResponse,
  service: Pick<ProviderConnectionService, "createConnection">,
): Promise<void> {
  const input = await safeReadJson<CreateProviderConnectionInput>(request, response);
  if (input === null) return;

  // Validate discriminant and required fields before calling the service.
  // Without this check, a valid-JSON payload with missing `provider` would
  // reach the service, be persisted, and then crash in recordToDetail().
  const validationError = validateCreateInput(input);
  if (validationError !== null) {
    sendJson(response, 400, { error: validationError, errorCode: "validation_error" } satisfies ErrorResponse);
    return;
  }

  const result = await service.createConnection(input);

  if (!result.success) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Failed to create connection"));
    return;
  }

  sendJson(response, 201, recordToDetail(result.data!));
}

export async function handleUpdateConnection(
  request: IncomingMessage,
  response: ServerResponse,
  service: Pick<ProviderConnectionService, "updateConnection">,
  connectionId: string,
): Promise<void> {
  const input = await safeReadJson<UpdateProviderConnectionInput>(request, response);
  if (input === null) return;

  // Validate update input before calling the service.
  // Without this check, `{ "label": 42 }`, `{}`, or `[]` would reach
  // the service and could produce a no-op update or persist malformed values.
  const validationError = validateUpdateInput(input);
  if (validationError !== null) {
    sendJson(response, 400, { error: validationError, errorCode: "validation_error" } satisfies ErrorResponse);
    return;
  }

  const result = await service.updateConnection(connectionId as ProviderConnectionId, input);

  if (!result.success) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Failed to update connection"));
    return;
  }

  sendJson(response, 200, recordToDetail(result.data!));
}

export async function handleCreateSecret(
  request: IncomingMessage,
  response: ServerResponse,
  service: Pick<ProviderConnectionService, "createSecret">,
  connectionId: string,
): Promise<void> {
  const body = await safeReadJson<{ secretValue?: string }>(request, response);
  if (body === null) return;

  // Validate secretValue is a non-empty string; reject numeric/object values
  // that would bypass the erased TypeScript cast and reach the vault.
  const secretValue = body.secretValue;
  if (secretValue === undefined || secretValue === null || typeof secretValue !== "string" || secretValue.trim().length === 0) {
    sendJson(response, 400, { error: "Secret value must be a non-empty string", errorCode: "validation_error" } satisfies ErrorResponse);
    return;
  }

  const input: SecretOperationInput = {
    connectionId: connectionId as ProviderConnectionId,
    secretValue,
  };
  const result = await service.createSecret(input);

  if (!result.success) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Failed to create secret"));
    return;
  }

  sendJson(response, 200, { version: result.data!.version } satisfies SecretVersionResponse);
}

export async function handleRotateSecret(
  request: IncomingMessage,
  response: ServerResponse,
  service: Pick<ProviderConnectionService, "rotateSecret">,
  connectionId: string,
): Promise<void> {
  const body = await safeReadJson<{ secretValue?: string }>(request, response);
  if (body === null) return;

  // Validate secretValue is a non-empty string; reject numeric/object values
  // that would bypass the erased TypeScript cast and reach the vault.
  const secretValue = body.secretValue;
  if (secretValue === undefined || secretValue === null || typeof secretValue !== "string" || secretValue.trim().length === 0) {
    sendJson(response, 400, { error: "Secret value must be a non-empty string", errorCode: "validation_error" } satisfies ErrorResponse);
    return;
  }

  const input: SecretOperationInput = {
    connectionId: connectionId as ProviderConnectionId,
    secretValue,
  };
  const result = await service.rotateSecret(input);

  if (!result.success) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Failed to rotate secret"));
    return;
  }

  sendJson(response, 200, { version: result.data!.version } satisfies SecretVersionResponse);
}

export async function handleRevokeSecret(
  response: ServerResponse,
  service: ProviderConnectionService,
  connectionId: string,
): Promise<void> {
  const result = await service.revokeSecret(connectionId as ProviderConnectionId);

  if (!result.success) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Failed to revoke secret"));
    return;
  }

  sendJson(response, 200, { success: true });
}

export async function handleValidateConnection(
  response: ServerResponse,
  service: ProviderConnectionService,
  connectionId: string,
): Promise<void> {
  const result = await service.validateConnection(connectionId as ProviderConnectionId);

  if (!result.success && !result.data) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Validation failed"));
    return;
  }

  sendJson(response, 200, diagnosticToView(result.data!));
}

export async function handleGetDiagnostics(
  response: ServerResponse,
  service: ProviderConnectionService,
  connectionId: string,
  limit?: number,
): Promise<void> {
  const diagnostics = service.getDiagnostics(connectionId as ProviderConnectionId, limit ?? 20);
  const views = diagnostics.map(diagnosticToView);
  sendJson(response, 200, views);
}

export async function handleDeletionPreflight(
  response: ServerResponse,
  service: ProviderConnectionService,
  connectionId: string,
): Promise<void> {
  const preflight = service.deletionPreflight(connectionId as ProviderConnectionId);
  sendJson(response, 200, deletionPreflightToResponse(preflight));
}

export async function handleDeleteConnection(
  request: IncomingMessage,
  response: ServerResponse,
  service: ProviderConnectionService,
  connectionId: string,
): Promise<void> {
  // Read optional body independently of Content-Length to support
  // chunked encoding and no-Content-Length requests.
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const rawText = Buffer.concat(chunks).toString("utf8");

  let resolution: DeletionResolutionInput | undefined;
  if (rawText.trim()) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed === null) {
        sendJson(response, 400, { error: "Invalid JSON in request body", errorCode: "validation_error" } satisfies ErrorResponse);
        return;
      }

      // Validate parsed body is a proper DeletionResolutionInput shape
      // before calling service; otherwise an unchecked cast could reach
      // service code that throws (e.g., .some() on undefined).
      if (
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Array.isArray((parsed as Record<string, unknown>).acknowledgedBlockers)
      ) {
        sendJson(response, 400, { error: "Invalid deletion resolution shape", errorCode: "validation_error" } satisfies ErrorResponse);
        return;
      }

      // Validate every array element is a non-null object with required string fields.
      // Otherwise service.ts dereferences null.blockerType, throwing a raw 500.
      const blockers = (parsed as Record<string, unknown>).acknowledgedBlockers as unknown[];
      if (!blockers.every(
        (b) =>
          b !== null &&
          typeof b === "object" &&
          !Array.isArray(b) &&
          ((b as Record<string, unknown>).blockerType === "routing_policy" ||
           (b as Record<string, unknown>).blockerType === "active_worker") &&
          typeof (b as Record<string, unknown>).safeDescriptor === "string",
      )) {
        sendJson(response, 400, { error: "Invalid deletion resolution shape", errorCode: "validation_error" } satisfies ErrorResponse);
        return;
      }

      resolution = parsed as DeletionResolutionInput;
    } catch {
      sendJson(response, 400, { error: "Invalid JSON in request body", errorCode: "validation_error" } satisfies ErrorResponse);
      return;
    }
  }

  const result = await service.deleteConnection(connectionId as ProviderConnectionId, resolution);

  if (!result.success) {
    sendJson(response, serviceResultToStatusCode(result), toSafeErrorResponse(result, "Failed to delete connection"));
    return;
  }

  sendJson(response, 200, { success: true });
}
