import type { ActiveCatalogConnectionState, CatalogScanState, ProviderConnectionKind } from "@hepha/shared";

export type PresentedCatalogScanState = CatalogScanState | "unavailable";

const stateLabels: Readonly<Record<PresentedCatalogScanState, string>> = {
  never_scanned: "Never scanned",
  scanning: "Scanning",
  available: "Available",
  empty: "Empty",
  failed: "Failed",
  unavailable: "Unavailable",
};

const providerKindLabels: Readonly<Record<ProviderConnectionKind, string>> = {
  known: "Known provider",
  custom: "Custom provider",
  pi_session: "Pi Session",
};

const guidanceByCode = {
  scan_not_started: "No catalog scan has completed yet.",
  scan_in_progress: "A catalog scan is in progress.",
  models_available: "Models from this connection are available.",
  no_models_returned: "The last scan completed without returning models.",
  scan_failed: "The last catalog scan failed. Retry this connection.",
} as const;

/** Presents the closed server-owned scan state without deriving it from catalog rows or diagnostics. */
export function catalogScanStateLabel(state: PresentedCatalogScanState): string {
  return stateLabels[state];
}

/** Presents the sanitized provider kind supplied by the canonical active-state DTO. */
export function catalogProviderKindLabel(kind: ProviderConnectionKind): string {
  return providerKindLabels[kind];
}

/** Presents server-safe outcome guidance, with a deterministic code-owned fallback. */
export function catalogScanGuidance(state: ActiveCatalogConnectionState): string {
  return state.safeMessage ?? guidanceByCode[state.guidanceCode];
}

/** Selects the authoritative attempt/outcome time appropriate to the projected state. */
export function catalogScanTimestamp(state: ActiveCatalogConnectionState): string | null {
  if (state.scanState === "scanning") return state.claimedAt;
  if (state.scanState === "failed") return state.diagnosticOccurredAt ?? state.settledAt;
  return state.settledAt;
}
