import type { CatalogModelIdentity, CatalogModelRecord } from "@hepha/shared";
import type { CatalogConnectionSummary, CatalogPresentationRow } from "./types.js";

/** Maps validated current catalog records into display rows without changing server availability or order. */
export function toCatalogPresentation(
  models: readonly CatalogModelRecord[],
  connections: readonly CatalogConnectionSummary[],
): readonly CatalogPresentationRow[] {
  const connectionsById = new Map(connections.map((connection) => [connection.connectionId, connection]));
  return models.map((model) => {
    const connection = connectionsById.get(model.identity.connectionId);
    return {
      connectionLabel: connection?.label ?? model.providerLabel,
      endpointUrl: connection?.endpointUrl ?? null,
      identity: model.identity,
      model,
    };
  });
}

/** Filters only the current validated rows; it never creates or reclassifies a catalog record. */
export function filterCatalogRows(rows: readonly CatalogPresentationRow[], query: string): readonly CatalogPresentationRow[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return rows;
  return rows.filter((row) => [
    row.connectionLabel,
    row.model.providerLabel,
    row.identity.modelId,
    row.model.displayName ?? "",
  ].some((value) => value.toLocaleLowerCase().includes(normalized)));
}

/** Compares the complete immutable connection/model pair, never a presentation label. */
export function sameCatalogIdentity(
  left: CatalogModelIdentity | null,
  right: CatalogModelIdentity | null,
): boolean {
  return left !== null && right !== null
    && left.connectionId === right.connectionId && left.modelId === right.modelId;
}

/** Finds a row only when its complete immutable identity remains in the current catalog. */
export function findCatalogRow(
  rows: readonly CatalogPresentationRow[],
  identity: CatalogModelIdentity | null,
): CatalogPresentationRow | null {
  if (!identity) return null;
  return rows.find((row) => sameCatalogIdentity(row.identity, identity)) ?? null;
}

/** Uses the complete validated pair for a React key without making it a selection protocol. */
export function catalogIdentityKey(identity: CatalogModelIdentity): string {
  return `${encodeURIComponent(identity.connectionId)}:${encodeURIComponent(identity.modelId)}`;
}
