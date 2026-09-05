/**
 * FEAT-058: Provider Connection domain types.
 *
 * Defines the provider connection identity, configuration, diagnostics,
 * and deletion dependency contracts. No secret values appear in any
 * exported type or DTO.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Connection Identity
// ---------------------------------------------------------------------------

/** Immutable provider connection identifier. */
export type ProviderConnectionId = string & { readonly __brand: "ProviderConnectionId" };

/** Connection kind — determines configuration rules and secret handling. */
export type ProviderConnectionKind = "known" | "custom" | "pi_session";

/** Lifecycle state for a provider connection. */
export type ConnectionLifecycleState = "active" | "revoked" | "deleted";

// ---------------------------------------------------------------------------
// Provider Identity
// ---------------------------------------------------------------------------

/** Recognised known-provider identifiers. */
export type KnownProviderId = "openai" | "deepseek" | "openai-codex";

/**
 * Disambiguated provider identity.
 *
 * - `known`: a built-in known provider (OpenAI, DeepSeek, etc.).
 * - `custom`: a user-defined OpenAI-compatible endpoint.
 * - `pi_session`: uses the host Pi session's own provider configuration.
 */
export type ProviderIdentifier =
  | { readonly kind: "known"; readonly providerId: KnownProviderId }
  | { readonly kind: "custom"; readonly label: string }
  | { readonly kind: "pi_session" };

// ---------------------------------------------------------------------------
// Provider Connection Record (persisted)
// ---------------------------------------------------------------------------

/**
 * Sanitized provider connection record.
 *
 * No secret material is stored here. The `secretRef` is an opaque
 * vault lookup key; the `secretVersion` tracks rotation.
 * `pi_session` connections have neither `secretRef` nor `secretVersion`.
 */
export interface ProviderConnectionRecord {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly label: string;
  readonly provider: ProviderIdentifier;
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: ConnectionLifecycleState;
  readonly secretRef: string | null;
  readonly secretVersion: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Connection Input / Update DTOs
// ---------------------------------------------------------------------------

/** Input for creating a new provider connection. */
export interface CreateProviderConnectionInput {
  readonly kind: ProviderConnectionKind;
  readonly label: string;
  readonly provider: ProviderIdentifier;
  readonly endpointUrl: string;
  /** Write-only secret value. Must not be returned in any response. */
  readonly secretValue?: string;
}

/** Input for updating an existing connection's non-secret fields. */
export interface UpdateProviderConnectionInput {
  readonly label?: string;
  readonly endpointUrl?: string;
}

// ---------------------------------------------------------------------------
// Connection Summary (for list views)
// ---------------------------------------------------------------------------

/** Safe summary of a provider connection — no secrets. */
export interface ProviderConnectionSummary {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly label: string;
  readonly providerKind: "known" | "custom" | "pi_session";
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: ConnectionLifecycleState;
  readonly hasSecret: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Secret Lifecycle
// ---------------------------------------------------------------------------

/** Secret lifecycle action type. */
export type SecretLifecycleAction = "create" | "rotate" | "revoke" | "delete";

/** Input for secret lifecycle operations. */
export interface SecretOperationInput {
  readonly connectionId: ProviderConnectionId;
  readonly secretValue?: string;
}

/** Opaque secret reference returned after create/rotate. */
export interface SecretReference {
  readonly refId: string;
  readonly version: number;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticFailureCode =
  | "timeout"
  | "unreachable"
  | "auth_failed"
  | "http_error"
  | "malformed_response"
  | "redirect_rejected"
  | "protocol_downgrade"
  | "invalid_endpoint"
  | "local_endpoint"
  | "unavailable_vault"
  | "unknown";

/** Safe diagnostic record — no secret material. */
export interface ConnectionDiagnosticRecord {
  readonly diagnosticId: string;
  readonly connectionId: ProviderConnectionId;
  readonly severity: DiagnosticSeverity;
  readonly failureCode: DiagnosticFailureCode | null;
  readonly safeMessage: string;
  readonly httpStatusCode: number | null;
  readonly diagnosticOperation: string;
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Deletion Guard
// ---------------------------------------------------------------------------

export type DeletionBlockerType = "routing_policy" | "active_worker";

export interface DeletionBlocker {
  readonly blockerType: DeletionBlockerType;
  readonly safeDescriptor: string;
}

export interface DeletionPreflightResult {
  readonly canDelete: boolean;
  readonly blockers: DeletionBlocker[];
}

export interface DeletionResolutionInput {
  readonly connectionId: ProviderConnectionId;
  readonly acknowledgedBlockers: DeletionBlocker[];
}

// ---------------------------------------------------------------------------
// Dependency Reference Record
// ---------------------------------------------------------------------------

/**
 * Generic dependency reference record.
 *
 * FEAT-061 (routing policy) and FEAT-062 (active workers) write
 * dependency records referencing a connection ID.  The deletion guard
 * consults these records during preflight.
 */
export interface ConnectionDependencyRecord {
  readonly dependencyId: string;
  readonly connectionId: ProviderConnectionId;
  readonly ownerFeat: string;
  readonly safeDescriptor: string;
  readonly registeredAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DIAGNOSTIC_RETENTION_LIMIT = 20;
export const ENDPOINT_VALIDATION_TIMEOUT_MS = 30_000;
