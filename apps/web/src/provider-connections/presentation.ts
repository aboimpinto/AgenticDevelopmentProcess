/**
 * FEAT-058: Provider Connections — Presentation mappers
 *
 * Pure mappers for converting API DTOs to UI state.
 * No secret values are handled, stored, or returned.
 */

import type {
  ProviderConnectionRecord,
  ConnectionDiagnosticRecord,
  ProviderIdentifier,
  DeletionPreflightResult,
  DeletionBlocker,
} from "@hepha/shared";
import type {
  ConnectionSummaryDTO,
  ConnectionDetailDTO,
  DiagnosticViewDTO,
  DeletionBlockerDTO,
  DeletionPreflightDTO,
} from "./types.js";
import { getProviderDisplayLabel, getLifecycleStateLabel } from "./types.js";

// ---------------------------------------------------------------------------
// Connection Mappers
// ---------------------------------------------------------------------------

export function connectionRecordToSummary(record: ProviderConnectionRecord): ConnectionSummaryDTO {
  return {
    connectionId: record.connectionId,
    kind: record.kind,
    label: record.label,
    providerLabel: getProviderDisplayLabel(record.provider),
    endpointUrl: record.endpointUrl,
    endpointLocal: record.endpointLocal,
    lifecycleState: record.lifecycleState,
    hasSecret: record.secretRef !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function connectionRecordToDetail(record: ProviderConnectionRecord): ConnectionDetailDTO {
  return {
    connectionId: record.connectionId,
    kind: record.kind,
    label: record.label,
    provider: record.provider,
    endpointUrl: record.endpointUrl,
    endpointLocal: record.endpointLocal,
    lifecycleState: record.lifecycleState,
    hasSecret: record.secretRef !== null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic Mapper
// ---------------------------------------------------------------------------

export function diagnosticRecordToView(diag: ConnectionDiagnosticRecord): DiagnosticViewDTO {
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

// ---------------------------------------------------------------------------
// Deletion Mapper
// ---------------------------------------------------------------------------

export function deletionBlockerToDTO(blocker: DeletionBlocker): DeletionBlockerDTO {
  return {
    blockerType: blocker.blockerType,
    safeDescriptor: blocker.safeDescriptor,
  };
}

export function deletionPreflightToDTO(preflight: DeletionPreflightResult): DeletionPreflightDTO {
  return {
    canDelete: preflight.canDelete,
    blockers: preflight.blockers.map(deletionBlockerToDTO),
  };
}

// ---------------------------------------------------------------------------
// Connection State Helpers
// ---------------------------------------------------------------------------

export function isConnectionUsable(record: { lifecycleState: string }): boolean {
  return record.lifecycleState === "active";
}

export function canManageSecrets(record: { kind: string; lifecycleState: string }): boolean {
  return record.kind !== "pi_session" && isConnectionUsable(record);
}

export function formatEndpointDisplay(url: string, local: boolean): string {
  if (local) {
    return `${url} (local)`;
  }
  return url;
}

export function formatLifecycleStateDisplay(state: string): string {
  return getLifecycleStateLabel(state as any) ?? state;
}

export function formatDiagnosticSeverityLabel(severity: "info" | "warning" | "error"): string {
  switch (severity) {
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
  }
}

/**
 * Format a diagnostic failure code into a human-readable label.
 */
export function formatFailureCode(code: string | null): string {
  if (!code) return "OK";
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
