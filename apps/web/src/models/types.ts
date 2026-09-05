import type {
  CatalogModelIdentity,
  CatalogModelRecord,
} from "@hepha/shared";

/** Safe connection facts available to catalog presentation after FEAT-058 sanitization. */
export interface CatalogConnectionSummary {
  readonly connectionId: string;
  readonly label: string;
  readonly providerLabel: string;
  readonly endpointUrl: string;
}

/** Server-owned recovery facts that FEAT-061 may supply without granting local policy ownership. */
export interface CatalogRecoveryAttentionProjection {
  readonly connectionId: string;
  readonly connectionLabel: string;
  readonly safeReason: string;
  readonly occurredAt: string;
  readonly state: "unresolved" | "resolved" | "acknowledged";
  readonly affectedRouteResult?: string;
  readonly policyRevision?: string;
  readonly actionLabel?: string;
}

export interface CatalogPresentationRow {
  readonly connectionLabel: string;
  readonly endpointUrl: string | null;
  readonly identity: CatalogModelIdentity;
  readonly model: CatalogModelRecord;
}
