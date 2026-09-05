/**
 * FEAT-058: Provider Connections — Main View Container
 *
 * Integrates ConnectionList, ConnectionDetail, ConnectionCreateDialog,
 * and ConnectionDeleteDialog with state management and API orchestration.
 */

import React, { useState, useEffect, useCallback } from "react";
import type {
  ActiveCatalogConnectionState,
  ProviderConnectionId,
  CreateProviderConnectionInput,
  DeletionBlocker,
} from "@hepha/shared";
import type {
  ConnectionSummaryDTO,
  ConnectionDetailDTO,
  DiagnosticViewDTO,
  DeletionPreflightDTO,
} from "./types.js";
import { ConnectionList } from "./ConnectionList.js";
import { ConnectionDetail } from "./ConnectionDetail.js";
import { ConnectionCreateDialog } from "./ConnectionCreateDialog.js";
import { ConnectionDeleteDialog } from "./ConnectionDeleteDialog.js";
import { modelCatalogApi, type ModelCatalogApi } from "../models/api.js";
import {
  listConnections,
  getConnection,
  createConnection,
  rotateSecret,
  revokeSecret,
  validateConnection,
  getDiagnostics,
  deletionPreflight,
  deleteConnection,
} from "./api.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ProviderConnectionsViewProps {
  readonly catalogStateApi?: Pick<ModelCatalogApi, "readConnectionStates">;
}

export function ProviderConnectionsView({ catalogStateApi = modelCatalogApi }: ProviderConnectionsViewProps) {
  // Connection list state
  const [connections, setConnections] = useState<ConnectionSummaryDTO[]>([]);
  const [catalogStates, setCatalogStates] = useState<readonly ActiveCatalogConnectionState[]>([]);
  const [catalogStateUnavailable, setCatalogStateUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Selected connection state
  const [selectedId, setSelectedId] = useState<ProviderConnectionId | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<ConnectionDetailDTO | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticViewDTO[]>([]);
  const [deletionPreflightData, setDeletionPreflightData] = useState<DeletionPreflightDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action states
  const [validating, setValidating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePreflight, setDeletePreflight] = useState<DeletionPreflightDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const refreshList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const items = await listConnections();
      setConnections(items);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCatalogStates = useCallback(async () => {
    try {
      setCatalogStates(await catalogStateApi.readConnectionStates());
      setCatalogStateUnavailable(false);
    } catch {
      setCatalogStates([]);
      setCatalogStateUnavailable(true);
    }
  }, [catalogStateApi]);

  const loadDetail = useCallback(async (id: ProviderConnectionId) => {
    setDetailLoading(true);
    setDetailError(null);
    setSelectedConnection(null);
    setDiagnostics([]);
    setDeletionPreflightData(null);
    try {
      const [detail, diags] = await Promise.all([
        getConnection(id),
        getDiagnostics(id),
      ]);
      setSelectedConnection(detail);
      setDiagnostics(diags);
      // Load deletion preflight in background
      try {
        const preflight = await deletionPreflight(id);
        setDeletionPreflightData(preflight);
      } catch {
        // Preflight failure is non-blocking
      }
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to load connection detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
    void refreshCatalogStates();
  }, [refreshCatalogStates, refreshList]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setSelectedConnection(null);
      setDiagnostics([]);
      setDeletionPreflightData(null);
    }
  }, [selectedId, loadDetail]);

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  function handleSelect(id: string) {
    // Keep selection if same ID is clicked
    if (id === selectedId) return;
    setSelectedId(id as ProviderConnectionId);
    setShowDeleteDialog(false);
  }

  function handleCreateNew() {
    setShowCreateDialog(true);
    setCreateError(null);
  }

  async function handleCreate(input: CreateProviderConnectionInput) {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createConnection(input);
      await Promise.all([refreshList(), refreshCatalogStates()]);
      setShowCreateDialog(false);
      setSelectedId(created.connectionId);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setCreating(false);
    }
  }

  async function handleValidate() {
    if (!selectedId) return;
    setValidating(true);
    setDetailError(null);
    try {
      const diag = await validateConnection(selectedId);
      setDiagnostics((prev) => [diag, ...prev]);
      // Refresh detail to get updated state
      const detail = await getConnection(selectedId);
      setSelectedConnection(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function handleRotateSecret(secretValue: string) {
    if (!selectedId) return;
    setDetailError(null);
    try {
      await rotateSecret({ connectionId: selectedId, secretValue });
      await refreshCatalogStates();
      const detail = await getConnection(selectedId);
      setSelectedConnection(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to rotate secret");
    }
  }

  async function handleRevokeSecret() {
    if (!selectedId) return;
    setDetailError(null);
    try {
      await revokeSecret(selectedId);
      await refreshCatalogStates();
      const detail = await getConnection(selectedId);
      setSelectedConnection(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : "Failed to revoke secret");
    }
  }

  function handleDeleteClick() {
    if (!selectedId) return;
    // Refresh preflight when user initiates delete
    deletionPreflight(selectedId)
      .then((preflight) => {
        setDeletePreflight(preflight);
        setShowDeleteDialog(true);
        setDeleteError(null);
      })
      .catch((err: unknown) => {
        setDeleteError(err instanceof Error ? err.message : "Failed to check dependencies");
      });
  }

  async function handleDeleteConfirm(
    acknowledgedBlockers?: Array<{ blockerType: string; safeDescriptor: string }>,
  ) {
    if (!selectedId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (acknowledgedBlockers && acknowledgedBlockers.length > 0) {
        const typedBlockers: DeletionBlocker[] = acknowledgedBlockers.map((b) => ({
          blockerType: b.blockerType as DeletionBlocker["blockerType"],
          safeDescriptor: b.safeDescriptor,
        }));
        await deleteConnection(selectedId, {
          connectionId: selectedId,
          acknowledgedBlockers: typedBlockers,
        });
      } else {
        await deleteConnection(selectedId);
      }
      await Promise.all([refreshList(), refreshCatalogStates()]);
      setShowDeleteDialog(false);
      setSelectedId(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete connection");
    } finally {
      setDeleting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="provider-connections-view">
      {/* List panel */}
      <div className="provider-connections-list-panel">
        <ConnectionList
          catalogStates={catalogStates}
          catalogStateUnavailable={catalogStateUnavailable}
          connections={connections}
          selectedId={selectedId ?? undefined}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
          loading={loading}
        />
      </div>

      {/* Detail panel */}
      <div className="provider-connections-detail-panel">
        {detailLoading ? (
          <div className="provider-connections-detail-panel-empty" role="status">
            Loading connection details...
          </div>
        ) : listError && !selectedConnection ? (
          <div className="provider-connections-detail-panel-empty">
            <p className="text-warning">{listError}</p>
            <button className="primary-button" onClick={refreshList}>
              Retry
            </button>
          </div>
        ) : selectedConnection ? (
          <ConnectionDetail
            connection={selectedConnection}
            diagnostics={diagnostics}
            deletionPreflight={deletionPreflightData}
            onRotateSecret={handleRotateSecret}
            onRevokeSecret={handleRevokeSecret}
            onValidate={handleValidate}
            onDelete={handleDeleteClick}
            onClose={() => setSelectedId(null)}
            validating={validating}
            deleting={deleting}
          />
        ) : (
          <div className="provider-connections-detail-panel-empty">
            {connections.length === 0
              ? 'Click "+ New Connection" to add a provider.'
              : "Select a connection from the list to view details."}
          </div>
        )}

        {/* Detail-level error */}
        {detailError && (
          <div className="provider-conn-error" role="alert" style={{ marginTop: 12 }}>
            {detailError}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreateDialog && (
        <ConnectionCreateDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          isCreating={creating}
          error={createError}
        />
      )}

      {/* Delete dialog */}
      {showDeleteDialog && selectedConnection && (
        <ConnectionDeleteDialog
          connectionLabel={selectedConnection.label}
          preflight={deletePreflight}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteDialog(false);
            setDeleteError(null);
          }}
          isDeleting={deleting}
          error={deleteError}
        />
      )}
    </div>
  );
}
