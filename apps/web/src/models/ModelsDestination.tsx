import { useCallback, useEffect, useRef, useState } from "react";
import "./models.css";
import type {
  ActiveCatalogConnectionState,
  CatalogModelIdentity,
  CatalogModelRecord,
  CatalogScanDiagnostic,
  ProviderConnectionId,
} from "@hepha/shared";
import { listConnections } from "../provider-connections/api.js";
import { ProviderConnectionsView } from "../provider-connections/ProviderConnectionsView.js";
import { ActiveConnectionCatalogPanel } from "./ActiveConnectionCatalogPanel.js";
import { CatalogModelList } from "./CatalogModelList.js";
import { CatalogRecoveryAttention } from "./CatalogRecoveryAttention.js";
import { CatalogToolbar } from "./CatalogToolbar.js";
import { findCatalogRow, filterCatalogRows, sameCatalogIdentity, toCatalogPresentation } from "./catalog-presentation.js";
import { modelCatalogApi, type ModelCatalogApi } from "./api.js";
import { ModelsSectionTabs, type ModelsSection } from "./ModelsSectionTabs.js";
import { SelectedModelDetail } from "./SelectedModelDetail.js";
import { RoutingDefaultsPanel } from "./RoutingDefaultsPanel.js";
import type { RoutingPolicyApi } from "./routing-policy-api.js";
import type { CatalogConnectionSummary } from "./types.js";

export interface ModelsDestinationProps {
  readonly catalogApi?: ModelCatalogApi;
  readonly loadConnections?: () => Promise<readonly CatalogConnectionSummary[]>;
  readonly routingPolicyApi?: RoutingPolicyApi;
}

/** Composes Models sections and coordinates only guarded catalog presentation state. */
export function ModelsDestination({ catalogApi = modelCatalogApi, loadConnections = listConnections, routingPolicyApi }: ModelsDestinationProps) {
  const [selectedSection, setSelectedSection] = useState<ModelsSection>("available-models");
  const [models, setModels] = useState<readonly CatalogModelRecord[]>([]);
  const [connections, setConnections] = useState<readonly CatalogConnectionSummary[]>([]);
  const [connectionStates, setConnectionStates] = useState<readonly ActiveCatalogConnectionState[]>([]);
  const [connectionStateUnavailable, setConnectionStateUnavailable] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<CatalogModelIdentity | null>(null);
  const [query, setQuery] = useState("");
  const [diagnostic, setDiagnostic] = useState<CatalogScanDiagnostic | null>(null);
  const [busyActions, setBusyActions] = useState<ReadonlySet<string>>(() => new Set());
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const busyActionsRef = useRef(new Set<string>());
  const listboxRef = useRef<HTMLDivElement>(null);
  const scanAllRef = useRef<HTMLButtonElement>(null);
  const scanSelectedRef = useRef<HTMLButtonElement>(null);
  const selectionRemovedDuringScanRef = useRef(false);

  const rows = toCatalogPresentation(models, connections);
  const filteredRows = filterCatalogRows(rows, query);
  const selectedRow = findCatalogRow(rows, selectedIdentity);

  const loadCurrentCatalog = useCallback(async () => {
    const [catalogResult, providerResult, stateResult] = await Promise.allSettled([
      catalogApi.readCatalog(),
      loadConnections(),
      catalogApi.readConnectionStates(),
    ]);

    if (stateResult.status === "fulfilled") {
      setConnectionStates(stateResult.value);
      setConnectionStateUnavailable(false);
    } else {
      setConnectionStates([]);
      setConnectionStateUnavailable(true);
    }

    if (catalogResult.status === "rejected" || providerResult.status === "rejected") {
      setModels([]);
      setSelectedIdentity(null);
      setPresentationError("Catalog data is unavailable. Refresh the catalog and try again.");
      return;
    }

    const nextModels = catalogResult.value;
    const providerConnections = providerResult.value;
    setModels(nextModels);
    setConnections(providerConnections);
    setPresentationError(null);
    setSelectedIdentity((previous) => {
      if (!previous || findCatalogRow(toCatalogPresentation(nextModels, providerConnections), previous)) return previous;
      selectionRemovedDuringScanRef.current = true;
      setAnnouncement("The selected model is no longer available.");
      queueMicrotask(() => listboxRef.current?.focus());
      return null;
    });
  }, [catalogApi, loadConnections]);

  useEffect(() => {
    void loadCurrentCatalog();
  }, [loadCurrentCatalog]);

  const scan = useCallback(async (connectionId: ProviderConnectionId | null, restoreToolbarFocus = true) => {
    const action = connectionId ?? "all";
    if (busyActionsRef.current.has(action)) return;
    selectionRemovedDuringScanRef.current = false;
    busyActionsRef.current.add(action);
    setBusyActions(new Set(busyActionsRef.current));
    const connectionLabel = connectionId
      ? connectionStates.find((state) => state.connectionId === connectionId)?.label ?? "the selected connection"
      : null;
    setAnnouncement(connectionLabel
      ? `Catalog scan started for ${connectionLabel}.`
      : "Catalog scan started for all active connections.");
    try {
      const states = connectionId ? [await catalogApi.scanConnection(connectionId)] : await catalogApi.scanActive();
      const scanningState = states.find((state) => state.scanState === "scanning");
      const failedState = states.find((state) => state.scanState === "failed");
      if (failedState) {
        const diagnostics = await catalogApi.readDiagnostics(failedState.connectionId).catch(() => []);
        setDiagnostic(diagnostics[0] ?? null);
      } else {
        setDiagnostic(null);
      }
      await loadCurrentCatalog();
      setAnnouncement(scanningState
        ? "Catalog scan remains in progress."
        : failedState
          ? "Catalog scan finished with a recovery notice."
          : "Catalog scan completed.");
    } catch {
      setConnectionStates([]);
      setConnectionStateUnavailable(true);
      setAnnouncement("Catalog connection state could not be presented safely.");
    } finally {
      busyActionsRef.current.delete(action);
      setBusyActions(new Set(busyActionsRef.current));
      if (restoreToolbarFocus) {
        requestAnimationFrame(() => {
          if (selectionRemovedDuringScanRef.current) {
            listboxRef.current?.focus();
            selectionRemovedDuringScanRef.current = false;
            return;
          }
          (connectionId ? scanSelectedRef.current : scanAllRef.current)?.focus();
        });
      }
    }
  }, [catalogApi, connectionStates, loadCurrentCatalog]);

  return (
    <section aria-labelledby="models-heading" className="models-destination">
      <header>
        <h1 id="models-heading">Models</h1>
        <p>Installation-wide connections, available catalog, and worker routing.</p>
      </header>
      <ModelsSectionTabs onSelectSection={setSelectedSection} selectedSection={selectedSection} />
      {selectedSection === "provider-connections" ? (
        <div aria-labelledby="provider-connections-tab" id="provider-connections-panel" role="tabpanel">
          <ProviderConnectionsView catalogStateApi={catalogApi} />
        </div>
      ) : null}
      {selectedSection === "available-models" ? (
        <div aria-labelledby="available-models-tab" id="available-models-panel" role="tabpanel">
          <section className="available-models-section">
            <header><h2>Available Models</h2><p>Current catalog only · Models are identified by connection and model ID.</p></header>
            <CatalogToolbar
              isScanningAll={busyActions.has("all")}
              isScanningSelected={selectedRow !== null && busyActions.has(selectedRow.identity.connectionId)}
              onQueryChange={setQuery}
              onScanAll={() => void scan(null)}
              onScanSelected={() => { if (selectedRow) void scan(selectedRow.identity.connectionId); }}
              query={query}
              scanAllRef={scanAllRef}
              scanSelectedRef={scanSelectedRef}
              selectedConnectionLabel={selectedRow?.connectionLabel ?? null}
            />
            <p aria-live="polite" className="catalog-announcement">{announcement}</p>
            {presentationError ? <p className="catalog-error" role="alert">{presentationError}</p> : null}
            <CatalogRecoveryAttention diagnostic={diagnostic} />
            <ActiveConnectionCatalogPanel
              connections={connectionStates}
              onRetry={(connectionId) => scan(connectionId, false)}
              retryingConnectionIds={busyActions}
              stateUnavailable={connectionStateUnavailable}
            />
            {!presentationError ? (
              <div className="catalog-content">
                <CatalogModelList listboxRef={listboxRef} onSelect={setSelectedIdentity} rows={filteredRows} selectedIdentity={selectedIdentity} />
                <SelectedModelDetail row={selectedRow} />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {selectedSection === "routing-defaults" ? (
        <div aria-labelledby="routing-defaults-tab" id="routing-defaults-panel" role="tabpanel">
          <RoutingDefaultsPanel api={routingPolicyApi} />
        </div>
      ) : null}
    </section>
  );
}


