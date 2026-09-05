import { useRef } from "react";
import type { ActiveCatalogConnectionState, ProviderConnectionId } from "@hepha/shared";
import { CatalogScanStateBadge } from "./CatalogScanStateBadge.js";
import {
  catalogProviderKindLabel,
  catalogScanGuidance,
  catalogScanTimestamp,
} from "./catalog-scan-state-presentation.js";

interface ActiveConnectionCatalogPanelProps {
  readonly connections: readonly ActiveCatalogConnectionState[];
  readonly stateUnavailable: boolean;
  readonly retryingConnectionIds: ReadonlySet<string>;
  readonly onRetry: (connectionId: ProviderConnectionId) => Promise<void>;
}

/** Presents authoritative active-connection scan states and connection-scoped recovery controls. */
export function ActiveConnectionCatalogPanel({
  connections,
  stateUnavailable,
  retryingConnectionIds,
  onRetry,
}: ActiveConnectionCatalogPanelProps) {
  const retryRefs = useRef(new Map<string, HTMLButtonElement>());

  async function retry(connectionId: ProviderConnectionId): Promise<void> {
    await onRetry(connectionId);
    requestAnimationFrame(() => retryRefs.current.get(connectionId)?.focus());
  }

  return (
    <section aria-labelledby="active-catalog-connections-heading" className="active-catalog-connections">
      <header>
        <h3 id="active-catalog-connections-heading">Active Connections</h3>
        <p>Authoritative catalog scan state for every active provider connection.</p>
      </header>
      {stateUnavailable ? (
        <p className="catalog-state-unavailable" role="status">
          Active connection scan state is unavailable. Refresh the catalog and try again.
        </p>
      ) : connections.length === 0 ? (
        <p className="catalog-empty">No active provider connections configured.</p>
      ) : (
        <ul className="active-catalog-connection-list">
          {connections.map((connection) => {
            const retrying = retryingConnectionIds.has(connection.connectionId);
            const scanning = connection.scanState === "scanning";
            const timestamp = catalogScanTimestamp(connection);
            return (
              <li className="active-catalog-connection-row" key={connection.connectionId}>
                <div className="active-catalog-connection-summary">
                  <strong>{connection.label}</strong>
                  <span>{catalogProviderKindLabel(connection.providerKind)}</span>
                </div>
                <CatalogScanStateBadge state={connection.scanState} />
                <div className="active-catalog-connection-guidance">
                  <span role={connection.scanState === "failed" ? "alert" : undefined}>
                    {catalogScanGuidance(connection)}
                  </span>
                  {timestamp ? <time dateTime={timestamp}>{timestamp}</time> : <span>Not attempted yet</span>}
                </div>
                <button
                  aria-busy={retrying}
                  disabled={scanning || retrying}
                  onClick={() => void retry(connection.connectionId)}
                  ref={(element) => {
                    if (element) retryRefs.current.set(connection.connectionId, element);
                    else retryRefs.current.delete(connection.connectionId);
                  }}
                  type="button"
                >
                  {scanning ? `Scanning ${connection.label}` : retrying ? `Retrying ${connection.label}` : `Retry ${connection.label}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
