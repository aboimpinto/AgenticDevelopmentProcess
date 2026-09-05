/**
 * FEAT-058: Provider Connection Service
 *
 * Orchestrates the provider connection lifecycle by delegating to the
 * store, vault, endpoint policy, and diagnostics modules.
 *
 * All results are sanitized — no secret values appear in responses,
 * errors, or diagnostics.
 */

import { randomUUID } from "node:crypto";
import type {
  ProviderConnectionId,
  ProviderConnectionKind,
  ProviderConnectionRecord,
  ConnectionLifecycleState,
  ProviderIdentifier,
  CreateProviderConnectionInput,
  UpdateProviderConnectionInput,
  SecretOperationInput,
  SecretReference,
  ConnectionDiagnosticRecord,
  DeletionPreflightResult,
  DeletionResolutionInput,
  DiagnosticFailureCode,
} from "@hepha/shared";

import type { ProviderConnectionStore } from "@hepha/db";
import type { SecretVaultAdapter } from "./secret-vault.js";
import type { EndpointTransport } from "./endpoint-policy.js";
import { classifyEndpoint } from "./endpoint-policy.js";
import { createDiagnostic, redactMessage, classifySeverity } from "./diagnostics.js";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ProviderConnectionServiceOptions {
  store: ProviderConnectionStore;
  vault: SecretVaultAdapter;
  transport: EndpointTransport;
}

export interface ProviderConnectionResult<T> {
  success: boolean;
  data?: T;
  diagnostic?: ConnectionDiagnosticRecord;
  error?: string;
  errorCode?: DiagnosticFailureCode | "generic" | "vault_unavailable" | "validation_error" | "not_found" | "blocked_deletion";
}

export class ProviderConnectionService {
  private readonly store: ProviderConnectionStore;
  private readonly vault: SecretVaultAdapter;
  private readonly transport: EndpointTransport;

  constructor(options: ProviderConnectionServiceOptions) {
    this.store = options.store;
    this.vault = options.vault;
    this.transport = options.transport;
  }

  // -----------------------------------------------------------------------
  // Connection CRUD
  // -----------------------------------------------------------------------

  async createConnection(
    input: CreateProviderConnectionInput,
  ): Promise<ProviderConnectionResult<ProviderConnectionRecord>> {
    const id = randomUUID() as ProviderConnectionId;
    const now = new Date().toISOString();

    // Validate endpoint
    const endpointValidation = classifyEndpoint(input.endpointUrl);
    if (!endpointValidation.valid) {
      return {
        success: false,
        error: endpointValidation.safeMessage,
        errorCode: endpointValidation.failureCode ?? "generic",
        diagnostic: createDiagnostic(id, "error", "create", {
          failureCode: endpointValidation.failureCode,
          safeMessage: endpointValidation.safeMessage,
        }),
      };
    }

    // Handle secret for non-pi_session connections
    let secretRef: string | null = null;
    let secretVersion: number | null = null;

    if (input.kind !== "pi_session") {
      if (!input.secretValue || input.secretValue.length === 0) {
        return {
          success: false,
          error: "Secret value is required for non-Pi Session connections",
          errorCode: "validation_error",
          diagnostic: createDiagnostic(id, "error", "create", {
            failureCode: null,
            safeMessage: "Secret value is required",
          }),
        };
      }

      if (!this.vault.isAvailable()) {
        return {
          success: false,
          error: "Secret vault is unavailable. Configure HEPHA_VAULT_KEY.",
          errorCode: "vault_unavailable",
          diagnostic: createDiagnostic(id, "error", "create", {
            failureCode: "unavailable_vault",
            safeMessage: "Secret vault unavailable — configure HEPHA_VAULT_KEY",
          }),
        };
      }

      try {
        const vaultRefId = `conn-${id}`;
        const ref = await this.vault.createSecret(vaultRefId, input.secretValue);
        secretRef = ref.refId;
        secretVersion = ref.version;
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to store secret",
          errorCode: "vault_unavailable",
          diagnostic: createDiagnostic(id, "error", "create", {
            failureCode: "unavailable_vault",
            safeMessage: "Failed to store secret in vault",
          }),
        };
      }
    }

    const record: ProviderConnectionRecord = {
      connectionId: id,
      kind: input.kind,
      label: input.label,
      provider: input.provider,
      endpointUrl: input.endpointUrl,
      endpointLocal: endpointValidation.classification === "local",
      lifecycleState: "active",
      secretRef,
      secretVersion,
      createdAt: now,
      updatedAt: now,
    };

    this.store.insertConnection(record);

    const diagnostic = createDiagnostic(id, "info", "create", {
      safeMessage: `Connection created: ${input.label}`,
    });
    this.store.insertDiagnostic(diagnostic);

    return {
      success: true,
      data: record,
      diagnostic,
    };
  }

  getConnection(connectionId: ProviderConnectionId): ProviderConnectionRecord | null {
    return this.store.getConnection(connectionId);
  }

  listConnections(): ProviderConnectionRecord[] {
    return this.store.listConnections();
  }

  async updateConnection(
    connectionId: ProviderConnectionId,
    input: UpdateProviderConnectionInput,
  ): Promise<ProviderConnectionResult<ProviderConnectionRecord>> {
    const existing = this.store.getConnection(connectionId);
    if (!existing) {
      return {
        success: false,
        error: "Connection not found",
        errorCode: "not_found",
      };
    }

    const now = new Date().toISOString();

    if (input.endpointUrl) {
      const endpointValidation = classifyEndpoint(input.endpointUrl);
      if (!endpointValidation.valid) {
        return {
          success: false,
          error: endpointValidation.safeMessage,
          errorCode: endpointValidation.failureCode ?? "generic",
          diagnostic: createDiagnostic(connectionId, "error", "update", {
            failureCode: endpointValidation.failureCode,
            safeMessage: endpointValidation.safeMessage,
          }),
        };
      }

      this.store.updateConnectionFields(connectionId, {
        label: input.label ?? existing.label,
        endpointUrl: input.endpointUrl,
        endpointLocal: endpointValidation.classification === "local",
      }, now);
    } else if (input.label) {
      this.store.updateConnectionFields(connectionId, {
        label: input.label,
        endpointUrl: existing.endpointUrl,
        endpointLocal: existing.endpointLocal,
      }, now);
    }

    const updated = this.store.getConnection(connectionId)!;
    const diagnostic = createDiagnostic(connectionId, "info", "update", {
      safeMessage: `Connection updated`,
    });
    this.store.insertDiagnostic(diagnostic);

    return { success: true, data: updated, diagnostic };
  }

  // -----------------------------------------------------------------------
  // Secret Lifecycle
  // -----------------------------------------------------------------------

  async createSecret(input: SecretOperationInput): Promise<ProviderConnectionResult<SecretReference>> {
    const existing = this.store.getConnection(input.connectionId);
    if (!existing) {
      return { success: false, error: "Connection not found", errorCode: "not_found" };
    }

    if (existing.kind === "pi_session") {
      return {
        success: false,
        error: "Pi Session connections do not use secrets",
        errorCode: "validation_error",
      };
    }

    if (!this.vault.isAvailable()) {
      return {
        success: false,
        error: "Secret vault is unavailable",
        errorCode: "vault_unavailable",
        diagnostic: createDiagnostic(input.connectionId, "error", "create-secret", {
          failureCode: "unavailable_vault",
          safeMessage: "Secret vault unavailable",
        }),
      };
    }

    try {
      const secretValue = input.secretValue;
      if (!secretValue) {
        return { success: false, error: "Secret value is required", errorCode: "validation_error" };
      }

      const vaultRefId = `conn-${input.connectionId}`;
      const restoringRevokedSecret = existing.lifecycleState === "revoked" && existing.secretRef !== null;
      let ref: SecretReference;
      if (restoringRevokedSecret) {
        ref = await this.vault.rotateSecret(existing.secretRef, secretValue);
      } else {
        ref = await this.vault.createSecret(vaultRefId, secretValue);
      }
      const now = new Date().toISOString();
      if (restoringRevokedSecret) {
        this.store.replaceSecretAndReactivate(input.connectionId, ref.refId, ref.version, now);
      } else {
        this.store.updateSecretRef(input.connectionId, ref.refId, ref.version, now);
      }

      const diagnostic = createDiagnostic(input.connectionId, "info", "create-secret", {
        safeMessage: "Secret created",
      });
      this.store.insertDiagnostic(diagnostic);

      return { success: true, data: ref, diagnostic };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create secret",
        errorCode: "vault_unavailable",
        diagnostic: createDiagnostic(input.connectionId, "error", "create-secret", {
          failureCode: "unavailable_vault",
          safeMessage: "Failed to create secret in vault",
        }),
      };
    }
  }

  async rotateSecret(input: SecretOperationInput): Promise<ProviderConnectionResult<SecretReference>> {
    const existing = this.store.getConnection(input.connectionId);
    if (!existing) {
      return { success: false, error: "Connection not found", errorCode: "not_found" };
    }

    if (existing.kind === "pi_session") {
      return {
        success: false,
        error: "Pi Session connections do not use secrets",
        errorCode: "validation_error",
      };
    }

    if (!existing.secretRef) {
      return {
        success: false,
        error: "No secret exists to rotate",
        errorCode: "validation_error",
      };
    }

    if (!this.vault.isAvailable()) {
      return {
        success: false,
        error: "Secret vault is unavailable",
        errorCode: "vault_unavailable",
        diagnostic: createDiagnostic(input.connectionId, "error", "rotate-secret", {
          failureCode: "unavailable_vault",
          safeMessage: "Secret vault unavailable",
        }),
      };
    }

    try {
      const secretValue = input.secretValue;
      if (!secretValue) {
        return { success: false, error: "New secret value is required", errorCode: "validation_error" };
      }

      const ref = await this.vault.rotateSecret(existing.secretRef, secretValue);
      const now = new Date().toISOString();
      this.store.updateSecretRef(input.connectionId, ref.refId, ref.version, now);

      const diagnostic = createDiagnostic(input.connectionId, "info", "rotate-secret", {
        safeMessage: "Secret rotated",
      });
      this.store.insertDiagnostic(diagnostic);

      return { success: true, data: ref, diagnostic };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to rotate secret",
        errorCode: "vault_unavailable",
        diagnostic: createDiagnostic(input.connectionId, "error", "rotate-secret", {
          failureCode: "unavailable_vault",
          safeMessage: "Failed to rotate secret",
        }),
      };
    }
  }

  async revokeSecret(connectionId: ProviderConnectionId): Promise<ProviderConnectionResult<void>> {
    const existing = this.store.getConnection(connectionId);
    if (!existing) {
      return { success: false, error: "Connection not found", errorCode: "not_found" };
    }

    if (existing.kind === "pi_session") {
      return {
        success: false,
        error: "Pi Session connections do not use secrets",
        errorCode: "validation_error",
      };
    }

    if (!existing.secretRef) {
      return {
        success: false,
        error: "No secret to revoke",
        errorCode: "validation_error",
      };
    }

    if (!this.vault.isAvailable()) {
      return {
        success: false,
        error: "Secret vault is unavailable",
        errorCode: "vault_unavailable",
        diagnostic: createDiagnostic(connectionId, "error", "revoke-secret", {
          failureCode: "unavailable_vault",
          safeMessage: "Secret vault unavailable",
        }),
      };
    }

    try {
      await this.vault.revokeSecret(existing.secretRef);
      const now = new Date().toISOString();
      this.store.updateLifecycleState(connectionId, "revoked", now);

      const diagnostic = createDiagnostic(connectionId, "warning", "revoke-secret", {
        safeMessage: "Secret revoked — connection is unusable",
      });
      this.store.insertDiagnostic(diagnostic);

      return { success: true, diagnostic };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to revoke secret",
        errorCode: "vault_unavailable",
        diagnostic: createDiagnostic(connectionId, "error", "revoke-secret", {
          failureCode: "unavailable_vault",
          safeMessage: "Failed to revoke secret",
        }),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Endpoint Validation
  // -----------------------------------------------------------------------

  async validateConnection(
    connectionId: ProviderConnectionId,
  ): Promise<ProviderConnectionResult<ConnectionDiagnosticRecord>> {
    const existing = this.store.getConnection(connectionId);
    if (!existing) {
      return { success: false, error: "Connection not found", errorCode: "not_found" };
    }

    const transportCheck = await this.transport.check(existing.endpointUrl);
    const severity = classifySeverity(transportCheck.failureCode);
    const safeMessage = transportCheck.safeMessage;

    const diagnostic = createDiagnostic(connectionId, severity, "validate", {
      failureCode: transportCheck.failureCode,
      safeMessage,
      httpStatusCode: transportCheck.httpStatusCode,
    });
    this.store.insertDiagnostic(diagnostic);

    return {
      success: transportCheck.success,
      data: diagnostic,
    };
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  getDiagnostics(
    connectionId: ProviderConnectionId,
    limit = 20,
  ): ConnectionDiagnosticRecord[] {
    return this.store.listDiagnostics(connectionId, limit);
  }

  // -----------------------------------------------------------------------
  // Deletion
  // -----------------------------------------------------------------------

  deletionPreflight(
    connectionId: ProviderConnectionId,
  ): DeletionPreflightResult {
    return this.store.deletionPreflight(connectionId);
  }

  async deleteConnection(
    connectionId: ProviderConnectionId,
    resolution?: DeletionResolutionInput,
  ): Promise<ProviderConnectionResult<void>> {
    const existing = this.store.getConnection(connectionId);
    if (!existing) {
      return { success: false, error: "Connection not found", errorCode: "not_found" };
    }

    // Check deletion guard
    const preflight = this.store.deletionPreflight(connectionId);
    if (!preflight.canDelete) {
      if (!resolution) {
        return {
          success: false,
          error: "Connection has active dependencies and cannot be deleted",
          errorCode: "blocked_deletion",
          data: undefined,
        };
      }

      // Verify resolution acknowledges all blockers
      const unresolved = preflight.blockers.filter(
        (b) => !resolution.acknowledgedBlockers.some(
          (ab) => ab.blockerType === b.blockerType && ab.safeDescriptor === b.safeDescriptor,
        ),
      );
      if (unresolved.length > 0) {
        return {
          success: false,
          error: `Unresolved blockers: ${unresolved.map((b) => b.safeDescriptor).join(", ")}`,
          errorCode: "blocked_deletion",
        };
      }
    }

    // Delete vault secret if present
    if (existing.secretRef && this.vault.isAvailable()) {
      try {
        await this.vault.deleteSecret(existing.secretRef);
      } catch {
        // Non-blocking: vault entry may already be deleted
      }
    }

    // Delete store records
    this.store.deleteConnectionAndDependencies(connectionId);

    return { success: true };
  }
}
