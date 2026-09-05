import type { CatalogScanDiagnostic } from "@hepha/shared";
import type { CatalogRecoveryAttentionProjection } from "./types.js";

interface CatalogRecoveryAttentionProps {
  readonly diagnostic: CatalogScanDiagnostic | null;
  readonly projection?: CatalogRecoveryAttentionProjection;
}

/** Presents safe scan diagnostics and server-owned recovery facts without deriving routing policy. */
export function CatalogRecoveryAttention({ diagnostic, projection }: CatalogRecoveryAttentionProps) {
  const isFailure = diagnostic !== null && diagnostic.outcome !== "success";
  const isUnresolved = projection?.state === "unresolved";
  if (!isFailure && !isUnresolved) return null;
  const label = projection?.connectionLabel ?? diagnostic?.connectionId ?? "Connection";
  const reason = projection?.safeReason ?? diagnostic?.safeMessage ?? "Catalog recovery needs attention.";
  const occurredAt = projection?.occurredAt ?? diagnostic?.occurredAt;
  return (
    <section aria-live="polite" className={isUnresolved ? "catalog-recovery-attention is-unresolved" : "catalog-recovery-attention"} role="status">
      <h3>Catalog recovery needed</h3>
      <p><strong>{label}:</strong> {reason}</p>
      {occurredAt ? <p>Reported {occurredAt}</p> : null}
      {projection?.affectedRouteResult ? <p>{projection.affectedRouteResult}</p> : null}
      {projection?.policyRevision ? <p>Policy revision {projection.policyRevision}</p> : null}
      {projection?.actionLabel ? <p>{projection.actionLabel}</p> : null}
      <p>Repair the connection or scan models again.</p>
    </section>
  );
}
