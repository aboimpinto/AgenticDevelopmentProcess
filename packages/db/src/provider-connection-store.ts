/**
 * FEAT-058: ProviderConnectionStore
 *
 * SQLite-backed store for provider connection metadata, diagnostics,
 * secret references/version state, and dependency records.
 *
 * Follows the existing additive `CREATE TABLE IF NOT EXISTS` pattern.
 * No secret values are stored — only opaque references.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ProviderConnectionId,
  ProviderConnectionKind,
  ConnectionLifecycleState,
  ProviderIdentifier,
  ProviderConnectionRecord,
  ConnectionDiagnosticRecord,
  ConnectionDependencyRecord,
  DeletionPreflightResult,
  DeletionBlocker,
  DiagnosticFailureCode,
  DiagnosticSeverity,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const PROVIDER_CONNECTION_SCHEMA_SQL = `
create table if not exists provider_connections (
  connection_id text primary key,
  kind text not null check (kind in ('known', 'custom', 'pi_session')),
  label text not null,
  provider_kind text not null check (provider_kind in ('known', 'custom', 'pi_session')),
  known_provider_id text,
  custom_provider_label text,
  endpoint_url text not null,
  endpoint_local integer not null default 0,
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'revoked', 'deleted')),
  secret_ref text,
  secret_version integer,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_provider_connections_lifecycle
  on provider_connections (lifecycle_state);

create table if not exists connection_diagnostics (
  diagnostic_id text primary key,
  connection_id text not null references provider_connections(connection_id),
  severity text not null check (severity in ('info', 'warning', 'error')),
  failure_code text,
  safe_message text not null,
  http_status_code integer,
  diagnostic_operation text not null,
  timestamp text not null
);

create index if not exists idx_connection_diagnostics_lookup
  on connection_diagnostics (connection_id, timestamp);

create table if not exists connection_dependencies (
  dependency_id text primary key,
  connection_id text not null references provider_connections(connection_id),
  owner_feat text not null,
  safe_descriptor text not null,
  registered_at text not null
);

create index if not exists idx_connection_dependencies_lookup
  on connection_dependencies (connection_id);
`;

// ---------------------------------------------------------------------------
// Prepared Statement Cache (flat — one key per SQL pattern)
// ---------------------------------------------------------------------------

const SQL = {
  insertConnection: `
    insert into provider_connections (connection_id, kind, label, provider_kind, known_provider_id, custom_provider_label, endpoint_url, endpoint_local, lifecycle_state, secret_ref, secret_version, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  getConnection: `select * from provider_connections where connection_id = ?`,
  updateConnection: `
    update provider_connections set label = ?, endpoint_url = ?, endpoint_local = ?, updated_at = ? where connection_id = ?
  `,
  updateConnectionLifecycle: `
    update provider_connections set lifecycle_state = ?, updated_at = ? where connection_id = ?
  `,
  updateSecretRef: `
    update provider_connections set secret_ref = ?, secret_version = ?, updated_at = ? where connection_id = ?
  `,
  replaceSecretAndReactivate: `
    update provider_connections
    set secret_ref = ?, secret_version = ?, lifecycle_state = 'active', updated_at = ?
    where connection_id = ? and lifecycle_state = 'revoked'
  `,
  clearSecretRef: `
    update provider_connections set secret_ref = null, secret_version = null, updated_at = ? where connection_id = ?
  `,
  listConnections: `select * from provider_connections order by created_at asc`,
  listConnectionsByLifecycle: `select * from provider_connections where lifecycle_state = ? order by created_at asc`,
  countByEndpoint: `select count(*) as cnt from provider_connections where endpoint_url = ?`,

  insertDiagnostic: `
    insert into connection_diagnostics (diagnostic_id, connection_id, severity, failure_code, safe_message, http_status_code, diagnostic_operation, timestamp)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  listDiagnostics: `select * from connection_diagnostics where connection_id = ? order by timestamp desc limit ?`,
  countDiagnostics: `select count(*) as cnt from connection_diagnostics where connection_id = ?`,
  deleteOldDiagnostics: `
    delete from connection_diagnostics where diagnostic_id in (
      select diagnostic_id from connection_diagnostics where connection_id = ? order by timestamp asc limit ?
    )
  `,
  deleteAllDiagnostics: `delete from connection_diagnostics where connection_id = ?`,

  insertDependency: `
    insert into connection_dependencies (dependency_id, connection_id, owner_feat, safe_descriptor, registered_at)
    values (?, ?, ?, ?, ?)
  `,
  listDependencies: `select * from connection_dependencies where connection_id = ? order by registered_at asc`,
  deleteDependency: `delete from connection_dependencies where dependency_id = ?`,
  countDependencies: `select count(*) as cnt from connection_dependencies where connection_id = ?`,

  // Cleanup on connection deletion
  deleteConnection: `delete from provider_connections where connection_id = ?`,
  deleteDependenciesForConnection: `delete from connection_dependencies where connection_id = ?`,
} as const;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ProviderConnectionStoreOptions {
  databasePath: string;
}

export class ProviderConnectionStore {
  private readonly database: DatabaseSync;
  private schemaReady = false;

  constructor(databasePath: string) {
    const path = databasePath === ":memory:" ? databasePath : databasePath;
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.database = new DatabaseSync(path);
    this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
    if (path !== ":memory:") {
      this.database.exec("pragma journal_mode = WAL;");
    }
  }

  static createInMemory(): ProviderConnectionStore {
    return new ProviderConnectionStore(":memory:");
  }

  close(): void {
    this.database.close();
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.database.exec(PROVIDER_CONNECTION_SCHEMA_SQL);
    this.schemaReady = true;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private get<T extends Record<string, unknown>>(
    sql: string,
    params: (string | number | null)[],
  ): T | null {
    this.ensureSchema();
    const stmt = this.database.prepare(sql);
    const row = stmt.get(...params) as T | undefined;
    return row ?? null;
  }

  private all<T extends Record<string, unknown>>(
    sql: string,
    params: (string | number | null)[],
  ): T[] {
    this.ensureSchema();
    const stmt = this.database.prepare(sql);
    return stmt.all(...params) as T[];
  }

  private run(sql: string, params: (string | number | null)[]): void {
    this.ensureSchema();
    const stmt = this.database.prepare(sql);
    stmt.run(...params);
  }

  // -----------------------------------------------------------------------
  // Connection CRUD
  // -----------------------------------------------------------------------

  insertConnection(record: ProviderConnectionRecord): void {
    const provider = record.provider;
    const providerKind = provider.kind;
    const knownProviderId = provider.kind === "known" ? provider.providerId : null;
    const customProviderLabel = provider.kind === "custom" ? provider.label : null;

    this.run(SQL.insertConnection, [
      record.connectionId,
      record.kind,
      record.label,
      providerKind,
      knownProviderId,
      customProviderLabel,
      record.endpointUrl,
      record.endpointLocal ? 1 : 0,
      record.lifecycleState,
      record.secretRef,
      record.secretVersion,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  getConnection(connectionId: ProviderConnectionId): ProviderConnectionRecord | null {
    const row = this.get<Record<string, unknown>>(SQL.getConnection, [connectionId]);
    return row ? rowToConnectionRecord(row) : null;
  }

  updateConnectionFields(
    connectionId: ProviderConnectionId,
    fields: { label?: string; endpointUrl?: string; endpointLocal?: boolean },
    now: string,
  ): void {
    const existing = this.getConnection(connectionId);
    if (!existing) return;

    const label = fields.label ?? existing.label;
    const endpointUrl = fields.endpointUrl ?? existing.endpointUrl;
    const endpointLocal = fields.endpointLocal ?? existing.endpointLocal;

    this.run(SQL.updateConnection, [label, endpointUrl, endpointLocal ? 1 : 0, now, connectionId]);
  }

  updateLifecycleState(
    connectionId: ProviderConnectionId,
    lifecycleState: ConnectionLifecycleState,
    now: string,
  ): void {
    this.run(SQL.updateConnectionLifecycle, [lifecycleState, now, connectionId]);
  }

  updateSecretRef(
    connectionId: ProviderConnectionId,
    secretRef: string | null,
    secretVersion: number | null,
    now: string,
  ): void {
    if (secretRef === null) {
      this.run(SQL.clearSecretRef, [now, connectionId]);
    } else {
      this.run(SQL.updateSecretRef, [secretRef, secretVersion, now, connectionId]);
    }
  }

  replaceSecretAndReactivate(
    connectionId: ProviderConnectionId,
    secretRef: string,
    secretVersion: number,
    now: string,
  ): void {
    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const result = this.database.prepare(SQL.replaceSecretAndReactivate)
        .run(secretRef, secretVersion, now, connectionId);
      if (result.changes !== 1) throw new Error("Revoked provider connection was not reactivated.");
      this.database.exec("commit;");
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  listConnections(): ProviderConnectionRecord[] {
    const rows = this.all<Record<string, unknown>>(SQL.listConnections, []);
    return rows.map(rowToConnectionRecord);
  }

  listConnectionsByLifecycle(state: ConnectionLifecycleState): ProviderConnectionRecord[] {
    const rows = this.all<Record<string, unknown>>(SQL.listConnectionsByLifecycle, [state]);
    return rows.map(rowToConnectionRecord);
  }

  countByEndpoint(endpointUrl: string): number {
    const row = this.get<{ cnt: number }>(SQL.countByEndpoint, [endpointUrl]);
    return row?.cnt ?? 0;
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  insertDiagnostic(record: ConnectionDiagnosticRecord): void {
    this.run(SQL.insertDiagnostic, [
      record.diagnosticId,
      record.connectionId,
      record.severity,
      record.failureCode,
      record.safeMessage,
      record.httpStatusCode,
      record.diagnosticOperation,
      record.timestamp,
    ]);
    this.enforceDiagnosticRetention(record.connectionId);
  }

  listDiagnostics(
    connectionId: ProviderConnectionId,
    limit = 20,
  ): ConnectionDiagnosticRecord[] {
    const rows = this.all<Record<string, unknown>>(SQL.listDiagnostics, [connectionId, limit]);
    return rows.map(rowToDiagnosticRecord);
  }

  deleteAllDiagnostics(connectionId: ProviderConnectionId): void {
    this.run(SQL.deleteAllDiagnostics, [connectionId]);
  }

  private enforceDiagnosticRetention(connectionId: ProviderConnectionId): void {
    const row = this.get<{ cnt: number }>(SQL.countDiagnostics, [connectionId]);
    const count = row?.cnt ?? 0;
    if (count > 20) {
      const excess = count - 20;
      this.run(SQL.deleteOldDiagnostics, [connectionId, excess]);
    }
  }

  // -----------------------------------------------------------------------
  // Dependencies
  // -----------------------------------------------------------------------

  insertDependency(record: ConnectionDependencyRecord): void {
    this.run(SQL.insertDependency, [
      record.dependencyId,
      record.connectionId,
      record.ownerFeat,
      record.safeDescriptor,
      record.registeredAt,
    ]);
  }

  listDependencies(connectionId: ProviderConnectionId): ConnectionDependencyRecord[] {
    const rows = this.all<Record<string, unknown>>(SQL.listDependencies, [connectionId]);
    return rows.map(rowToDependencyRecord);
  }

  countDependencies(connectionId: ProviderConnectionId): number {
    const row = this.get<{ cnt: number }>(SQL.countDependencies, [connectionId]);
    return row?.cnt ?? 0;
  }

  deleteDependency(dependencyId: string): void {
    this.run(SQL.deleteDependency, [dependencyId]);
  }

  // -----------------------------------------------------------------------
  // Deletion
  // -----------------------------------------------------------------------

  /**
   * Preflight deletion: returns blockers if any dependency exists.
   */
  deletionPreflight(connectionId: ProviderConnectionId): DeletionPreflightResult {
    const deps = this.listDependencies(connectionId);
    if (deps.length === 0) {
      return { canDelete: true, blockers: [] };
    }
    const blockers: DeletionBlocker[] = deps.map((d) => ({
      blockerType: d.ownerFeat === "FEAT-062" ? "active_worker" : "routing_policy",
      safeDescriptor: d.safeDescriptor,
    }));
    return { canDelete: false, blockers };
  }

  /**
   * Delete a connection and all associated records.
   * Must only be called after preflight returns canDelete=true
   * or the caller has acknowledged blockers.
   */
  deleteConnectionAndDependencies(connectionId: ProviderConnectionId): void {
    this.run(SQL.deleteDependenciesForConnection, [connectionId]);
    this.run(SQL.deleteAllDiagnostics, [connectionId]);
    this.run(SQL.deleteConnection, [connectionId]);
  }
}

// ---------------------------------------------------------------------------
// Row → Record mappers
// ---------------------------------------------------------------------------

function rowToConnectionRecord(row: Record<string, unknown>): ProviderConnectionRecord {
  const provider: ProviderIdentifier = (() => {
    const pk = row.provider_kind as string;
    if (pk === "known") {
      return { kind: "known", providerId: row.known_provider_id as "openai" | "deepseek" | "openai-codex" };
    }
    if (pk === "custom") {
      return { kind: "custom", label: row.custom_provider_label as string };
    }
    return { kind: "pi_session" };
  })();

  return {
    connectionId: row.connection_id as ProviderConnectionId,
    kind: row.kind as ProviderConnectionKind,
    label: row.label as string,
    provider,
    endpointUrl: row.endpoint_url as string,
    endpointLocal: Boolean(row.endpoint_local),
    lifecycleState: row.lifecycle_state as ConnectionLifecycleState,
    secretRef: (row.secret_ref as string) ?? null,
    secretVersion: (row.secret_version as number) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToDiagnosticRecord(row: Record<string, unknown>): ConnectionDiagnosticRecord {
  return {
    diagnosticId: row.diagnostic_id as string,
    connectionId: row.connection_id as ProviderConnectionId,
    severity: row.severity as DiagnosticSeverity,
    failureCode: (row.failure_code as DiagnosticFailureCode) ?? null,
    safeMessage: row.safe_message as string,
    httpStatusCode: (row.http_status_code as number) ?? null,
    diagnosticOperation: row.diagnostic_operation as string,
    timestamp: row.timestamp as string,
  };
}

function rowToDependencyRecord(row: Record<string, unknown>): ConnectionDependencyRecord {
  return {
    dependencyId: row.dependency_id as string,
    connectionId: row.connection_id as ProviderConnectionId,
    ownerFeat: row.owner_feat as string,
    safeDescriptor: row.safe_descriptor as string,
    registeredAt: row.registered_at as string,
  };
}
