import type {
  CatalogScanTrigger,
  ConnectionLifecycleState,
  ProviderConnectionId,
  ProviderConnectionKind,
  ProviderIdentifier,
} from "@hepha/shared";

/** Secret-safe persisted facts used to decide whether a provider mutation needs a catalog scan. */
export interface CatalogScanTriggerFacts {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly provider: ProviderIdentifier;
  readonly endpointUrl: string;
  readonly endpointLocal: boolean;
  readonly lifecycleState: ConnectionLifecycleState;
  readonly credentialVersion: number | null;
}

export interface CatalogScanTriggerTransition {
  readonly before: CatalogScanTriggerFacts | null;
  readonly after: CatalogScanTriggerFacts;
}

/** Classifies one successfully persisted mutation using the frozen precedence order. */
export function classifyCatalogScanTrigger(
  transition: CatalogScanTriggerTransition,
): Exclude<CatalogScanTrigger, "startup_reconciliation" | "individual_retry" | "scan_active"> | null {
  const { before, after } = transition;
  if (before === null) return after.lifecycleState === "active" ? "connection_created" : null;
  if (before.connectionId !== after.connectionId) {
    throw new Error("Catalog scan trigger identities do not match.");
  }
  if (before.lifecycleState !== "active" && after.lifecycleState === "active") {
    return "connection_reactivated";
  }
  if (after.lifecycleState !== "active") return null;
  if (before.endpointUrl !== after.endpointUrl
    || before.endpointLocal !== after.endpointLocal
    || before.kind !== after.kind
    || !sameProvider(before.provider, after.provider)) {
    return "material_connection_change";
  }
  if (before.credentialVersion !== after.credentialVersion) return "credential_changed";
  return null;
}

function sameProvider(left: ProviderIdentifier, right: ProviderIdentifier): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "known" && right.kind === "known") return left.providerId === right.providerId;
  if (left.kind === "custom" && right.kind === "custom") return left.label === right.label;
  return left.kind === "pi_session" && right.kind === "pi_session";
}
