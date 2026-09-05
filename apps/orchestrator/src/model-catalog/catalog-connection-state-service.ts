import {
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  isCatalogReconciliationRecord,
  type ActiveCatalogConnectionState,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import type { CatalogReconciliationStore, ModelCatalogStore } from "@hepha/db";
import { CatalogConnectionStateProjector } from "./catalog-connection-state-projector.js";

export interface CatalogConnectionStateServiceOptions {
  readonly connections: {
    listConnections(): ProviderConnectionRecord[];
  };
  readonly reconciliationStore: Pick<CatalogReconciliationStore, "list">;
  readonly catalogStore: Pick<ModelCatalogStore, "listDiagnostics" | "listModels">;
  readonly projector: CatalogConnectionStateProjector;
}

/** Composes guarded provider, ledger, catalog, and diagnostic facts into the canonical public state. */
export class CatalogConnectionStateService {
  constructor(private readonly options: CatalogConnectionStateServiceOptions) {}

  listActiveConnectionStates(): ActiveCatalogConnectionState[] {
    const connections = this.options.connections.listConnections();
    const knownConnectionIds = new Set(connections.map((connection) => connection.connectionId));
    const counts = new Map<ProviderConnectionId, number>(
      connections.map((connection) => [connection.connectionId, 0]),
    );
    for (const model of this.options.catalogStore.listModels()) {
      if (!knownConnectionIds.has(model.identity.connectionId)) continue;
      counts.set(model.identity.connectionId, counts.get(model.identity.connectionId)! + 1);
    }

    const storedReconciliationRecords: unknown = this.options.reconciliationStore.list();
    if (!Array.isArray(storedReconciliationRecords)
      || !storedReconciliationRecords.every(isCatalogReconciliationRecord)) {
      throw new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    }
    const reconciliationRecords = storedReconciliationRecords.filter((record) =>
      knownConnectionIds.has(record.connectionId));
    const settledDiagnostics = reconciliationRecords.flatMap((record) => {
      if (record.diagnosticId === null) return [];
      const diagnostic = this.options.catalogStore
        .listDiagnostics(record.connectionId)
        .find((candidate) => candidate.diagnosticId === record.diagnosticId);
      if (!diagnostic) throw new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      return [diagnostic];
    });

    return this.options.projector.project({
      connections: connections.map((connection) => ({
        connectionId: connection.connectionId,
        label: connection.label,
        providerKind: connection.kind,
        lifecycleState: connection.lifecycleState,
      })),
      reconciliationRecords,
      modelCounts: connections.map((connection) => ({
        connectionId: connection.connectionId,
        modelCount: counts.get(connection.connectionId)!,
      })),
      settledDiagnostics,
    });
  }
}
