/**
 * FEAT-058: Provider Connections — Web component types
 *
 * Local types for the provider connections UI.
 * No secret values appear in any type.
 */

import type {
  ProviderConnectionId,
  ProviderConnectionKind,
  ConnectionLifecycleState,
  ProviderIdentifier,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// UI DTOs (sanitized — no secret values)
// ---------------------------------------------------------------------------

/** Safe connection summary for list views. */
export interface ConnectionSummaryDTO {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly label: string;
  readonly providerLabel: string;
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: ConnectionLifecycleState;
  readonly hasSecret: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Safe connection detail for the detail view. */
export interface ConnectionDetailDTO {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly label: string;
  readonly provider: ProviderIdentifier;
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: ConnectionLifecycleState;
  readonly hasSecret: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Safe diagnostic result for display. */
export interface DiagnosticViewDTO {
  readonly diagnosticId: string;
  readonly severity: "info" | "warning" | "error";
  readonly failureCode: string | null;
  readonly safeMessage: string;
  readonly httpStatusCode: number | null;
  readonly operation: string;
  readonly timestamp: string;
}

/** Deletion blocker descriptor. */
export interface DeletionBlockerDTO {
  readonly blockerType: "routing_policy" | "active_worker";
  readonly safeDescriptor: string;
}

/** Deletion preflight result. */
export interface DeletionPreflightDTO {
  readonly canDelete: boolean;
  readonly blockers: DeletionBlockerDTO[];
}

// ---------------------------------------------------------------------------
// UI Action State
// ---------------------------------------------------------------------------

export type ConnectionActionState = "idle" | "creating" | "updating" | "validating" | "deleting" | "error";

export interface ProviderConnectionFormState {
  readonly kind: ProviderConnectionKind;
  readonly label: string;
  readonly providerKind: "known" | "custom" | "pi_session";
  readonly knownProviderId: string;
  readonly customProviderLabel: string;
  readonly endpointUrl: string;
}

// ---------------------------------------------------------------------------
// Provider Display Labels
// ---------------------------------------------------------------------------

export const KNOWN_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  "openai-codex": "OpenAI Codex",
};

export function getProviderDisplayLabel(provider: { kind: string; providerId?: string; label?: string }): string {
  switch (provider.kind) {
    case "known":
      return KNOWN_PROVIDER_LABELS[provider.providerId ?? ""] ?? provider.providerId ?? "Unknown";
    case "custom":
      return provider.label ?? "Custom";
    case "pi_session":
      return "Pi Session";
    default:
      return "Unknown Provider";
  }
}

export function getLifecycleStateLabel(state: ConnectionLifecycleState): string {
  switch (state) {
    case "active":
      return "Active";
    case "revoked":
      return "Revoked";
    case "deleted":
      return "Deleted";
  }
}
