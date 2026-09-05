/**
 * FEAT-058: Provider Connections — API client
 *
 * Typed API adapter for the orchestrator provider-connection endpoints.
 * All responses are sanitized — no secret values.
 */

import type {
  ProviderConnectionId,
  CreateProviderConnectionInput,
  UpdateProviderConnectionInput,
  SecretOperationInput,
  DeletionResolutionInput,
} from "@hepha/shared";
import type {
  ConnectionSummaryDTO,
  ConnectionDetailDTO,
  DiagnosticViewDTO,
  DeletionPreflightDTO,
} from "./types.js";

// ---------------------------------------------------------------------------
// Typed API Error
// ---------------------------------------------------------------------------

/**
 * Typed API error for provider connection operations.
 * Preserves errorCode and HTTP status for client-side recovery decisions.
 */
export class ProviderConnectionApiError extends Error {
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = "ProviderConnectionApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }

  get isVaultUnavailable(): boolean {
    return this.errorCode === "vault_unavailable";
  }

  get isBlockedDeletion(): boolean {
    return this.errorCode === "blocked_deletion";
  }

  get isValidationError(): boolean {
    return this.errorCode === "validation_error";
  }

  get isTransportFailure(): boolean {
    return this.errorCode === undefined && this.statusCode === 0;
  }
}

// ---------------------------------------------------------------------------
// API Base
// ---------------------------------------------------------------------------

const API_BASE = "/api/provider-connections";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new ProviderConnectionApiError("Network request failed", 0);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    // Safe access: errorBody may be null (JSON.parse("null")) or a primitive
    const safeError = (typeof errorBody === "object" && errorBody !== null)
      ? errorBody.error
      : undefined;
    const safeErrorCode = (typeof errorBody === "object" && errorBody !== null)
      ? (errorBody as Record<string, unknown>).errorCode
      : undefined;
    throw new ProviderConnectionApiError(
      (typeof safeError === "string" ? safeError : undefined) ?? response.statusText,
      response.status,
      typeof safeErrorCode === "string" ? safeErrorCode : undefined,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Connection CRUD
// ---------------------------------------------------------------------------

export async function listConnections(): Promise<ConnectionSummaryDTO[]> {
  return request<ConnectionSummaryDTO[]>(API_BASE);
}

export async function getConnection(id: ProviderConnectionId): Promise<ConnectionDetailDTO> {
  return request<ConnectionDetailDTO>(`${API_BASE}/${id}`);
}

export async function createConnection(
  input: CreateProviderConnectionInput,
): Promise<ConnectionDetailDTO> {
  return request<ConnectionDetailDTO>(API_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateConnection(
  id: ProviderConnectionId,
  input: UpdateProviderConnectionInput,
): Promise<ConnectionDetailDTO> {
  return request<ConnectionDetailDTO>(`${API_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Secret Lifecycle
// ---------------------------------------------------------------------------

export async function createSecret(input: SecretOperationInput): Promise<{ version: number }> {
  return request<{ version: number }>(`${API_BASE}/${input.connectionId}/secrets`, {
    method: "POST",
    body: JSON.stringify({ secretValue: input.secretValue }),
  });
}

export async function rotateSecret(input: SecretOperationInput): Promise<{ version: number }> {
  return request<{ version: number }>(`${API_BASE}/${input.connectionId}/secrets/rotate`, {
    method: "POST",
    body: JSON.stringify({ secretValue: input.secretValue }),
  });
}

export async function revokeSecret(connectionId: ProviderConnectionId): Promise<void> {
  await request<void>(`${API_BASE}/${connectionId}/secrets/revoke`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateConnection(
  connectionId: ProviderConnectionId,
): Promise<DiagnosticViewDTO> {
  return request<DiagnosticViewDTO>(`${API_BASE}/${connectionId}/validate`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export async function getDiagnostics(
  connectionId: ProviderConnectionId,
  limit?: number,
): Promise<DiagnosticViewDTO[]> {
  const params = limit ? `?limit=${limit}` : "";
  return request<DiagnosticViewDTO[]>(`${API_BASE}/${connectionId}/diagnostics${params}`);
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export async function deletionPreflight(
  connectionId: ProviderConnectionId,
): Promise<DeletionPreflightDTO> {
  return request<DeletionPreflightDTO>(`${API_BASE}/${connectionId}/delete-preflight`);
}

export async function deleteConnection(
  connectionId: ProviderConnectionId,
  resolution?: DeletionResolutionInput,
): Promise<void> {
  await request<void>(`${API_BASE}/${connectionId}`, {
    method: "DELETE",
    body: resolution ? JSON.stringify(resolution) : undefined,
  });
}
