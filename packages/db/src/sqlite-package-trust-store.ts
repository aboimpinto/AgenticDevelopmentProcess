/**
 * FEAT-051: SqlitePackageTrustStore
 *
 * SQLite implementation of the PackageTrustStore interface.
 *
 * Uses additive CREATE TABLE IF NOT EXISTS conventions, matching the
 * existing SqliteCardMetadataStore pattern.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type {
  PackageTrustRecord,
  PackageCapabilityGrant,
  PackageRevocationRecord,
  PackageTrustStore,
} from "./package-trust-types.js";

// ---------------------------------------------------------------------------
// Schema Creation
// ---------------------------------------------------------------------------

const PACKAGE_TRUST_SCHEMA_SQL = `
create table if not exists package_trust_records (
  trust_id text primary key,
  project_id text not null,
  package_id text not null,
  pinned_version text not null,
  source_kind text not null check (source_kind in ('npm', 'git', 'local')),
  canonical_source_ref text not null,
  approval_reference text not null,
  created_at text not null default (datetime('now')),
  expires_at text,
  reviewer text not null,
  reason text not null
);

create index if not exists idx_package_trust_records_lookup
  on package_trust_records (project_id, package_id, pinned_version);

create table if not exists package_capability_grants (
  grant_id text primary key,
  project_id text not null,
  package_id text not null,
  package_version text not null,
  component_id text not null,
  capability_id text not null,
  approval_reference text not null,
  created_at text not null default (datetime('now')),
  expires_at text,
  reviewer text not null,
  reason text not null
);

create unique index if not exists idx_package_capability_grants_unique
  on package_capability_grants (project_id, package_id, package_version, component_id, capability_id);

create table if not exists package_revocations (
  revocation_id text primary key,
  project_id text not null,
  package_id text not null,
  revoked_version text not null,
  component_id text,
  capability_id text,
  approval_reference text not null,
  created_at text not null default (datetime('now')),
  reviewer text not null,
  reason text not null
);

create index if not exists idx_package_revocations_lookup
  on package_revocations (project_id, package_id, revoked_version);
`;

// ---------------------------------------------------------------------------
// SqlitePackageTrustStore
// ---------------------------------------------------------------------------

/**
 * SQLite-backed implementation of PackageTrustStore.
 *
 * Uses a dedicated database connection or accepts a shared database path.
 * Schema is created on first use via ensureSchema().
 */
export class SqlitePackageTrustStore implements PackageTrustStore {
  private readonly database: DatabaseSync;
  private schemaReady = false;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");

    if (databasePath !== ":memory:") {
      this.database.exec("pragma journal_mode = WAL;");
    }
  }

  /**
   * Create an in-memory store for testing.
   */
  static createInMemory(): SqlitePackageTrustStore {
    return new SqlitePackageTrustStore(":memory:");
  }

  close(): void {
    this.database.close();
  }

  // -----------------------------------------------------------------------
  // Schema
  // -----------------------------------------------------------------------

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.database.exec(PACKAGE_TRUST_SCHEMA_SQL);
    this.schemaReady = true;
  }

  // -----------------------------------------------------------------------
  // SQLite helpers
  // -----------------------------------------------------------------------

  /**
   * Execute a query and return the first row, or null.
   */
  private get<T extends Record<string, unknown>>(
    sql: string,
    params: (string | number | null)[],
  ): T | null {
    this.ensureSchema();
    const stmt = this.database.prepare(sql);
    const row = stmt.get(...params) as T | undefined;
    return row ?? null;
  }

  /**
   * Execute a query and return all rows.
   */
  private all<T extends Record<string, unknown>>(
    sql: string,
    params: (string | number | null)[],
  ): T[] {
    this.ensureSchema();
    const stmt = this.database.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Execute a write statement (INSERT, UPDATE, DELETE).
   */
  private run(sql: string, params: (string | number | null)[]): void {
    this.ensureSchema();
    const stmt = this.database.prepare(sql);
    stmt.run(...params);
  }

  // -----------------------------------------------------------------------
  // Policy Evaluation Queries
  // -----------------------------------------------------------------------

  async findTrustRecord(
    projectId: string,
    packageId: string,
    version: string,
  ): Promise<PackageTrustRecord | null> {
    const row = this.get<{
      trust_id: string;
      project_id: string;
      package_id: string;
      pinned_version: string;
      source_kind: string;
      canonical_source_ref: string;
      approval_reference: string;
      created_at: string;
      expires_at: string | null;
      reviewer: string;
      reason: string;
    }>(
      `
      select *
      from package_trust_records
      where project_id = ?
        and package_id = ?
        and pinned_version = ?
      limit 1
      `,
      [projectId, packageId, version],
    );

    if (!row) return null;

    return {
      trustId: row.trust_id,
      projectId: row.project_id,
      packageId: row.package_id,
      pinnedVersion: row.pinned_version,
      sourceKind: row.source_kind as "npm" | "git" | "local",
      canonicalSourceRef: row.canonical_source_ref,
      approvalReference: row.approval_reference,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      reviewer: row.reviewer,
      reason: row.reason,
    };
  }

  async findCapabilityGrant(
    projectId: string,
    packageId: string,
    version: string,
    componentId: string,
    capabilityId: string,
  ): Promise<PackageCapabilityGrant | null> {
    const row = this.get<{
      grant_id: string;
      project_id: string;
      package_id: string;
      package_version: string;
      component_id: string;
      capability_id: string;
      approval_reference: string;
      created_at: string;
      expires_at: string | null;
      reviewer: string;
      reason: string;
    }>(
      `
      select *
      from package_capability_grants
      where project_id = ?
        and package_id = ?
        and package_version = ?
        and component_id = ?
        and capability_id = ?
      limit 1
      `,
      [projectId, packageId, version, componentId, capabilityId],
    );

    if (!row) return null;

    return {
      grantId: row.grant_id,
      projectId: row.project_id,
      packageId: row.package_id,
      packageVersion: row.package_version,
      componentId: row.component_id,
      capabilityId: row.capability_id,
      approvalReference: row.approval_reference,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      reviewer: row.reviewer,
      reason: row.reason,
    };
  }

  async findRevocations(
    projectId: string,
    packageId: string,
    version: string,
  ): Promise<PackageRevocationRecord[]> {
    const rows = this.all<{
      revocation_id: string;
      project_id: string;
      package_id: string;
      revoked_version: string;
      component_id: string | null;
      capability_id: string | null;
      approval_reference: string;
      created_at: string;
      reviewer: string;
      reason: string;
    }>(
      `
      select *
      from package_revocations
      where project_id = ?
        and package_id = ?
        and (revoked_version = ? or revoked_version = '*')
      order by
        -- Most specific revocation first: exact version before wildcard
        case when revoked_version = '*' then 1 else 0 end,
        created_at desc
      `,
      [projectId, packageId, version],
    );

    return rows.map((row) => ({
      revocationId: row.revocation_id,
      projectId: row.project_id,
      packageId: row.package_id,
      revokedVersion: row.revoked_version,
      componentId: row.component_id,
      capabilityId: row.capability_id,
      approvalReference: row.approval_reference,
      createdAt: row.created_at,
      reviewer: row.reviewer,
      reason: row.reason,
    }));
  }

  // -----------------------------------------------------------------------
  // Admin Operations
  // -----------------------------------------------------------------------

  async createTrustRecord(record: PackageTrustRecord): Promise<void> {
    this.run(
      `
      insert into package_trust_records (
        trust_id, project_id, package_id, pinned_version,
        source_kind, canonical_source_ref, approval_reference,
        created_at, expires_at, reviewer, reason
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.trustId,
        record.projectId,
        record.packageId,
        record.pinnedVersion,
        record.sourceKind,
        record.canonicalSourceRef,
        record.approvalReference,
        record.createdAt,
        record.expiresAt,
        record.reviewer,
        record.reason,
      ],
    );
  }

  async createCapabilityGrant(grant: PackageCapabilityGrant): Promise<void> {
    this.run(
      `
      insert into package_capability_grants (
        grant_id, project_id, package_id, package_version,
        component_id, capability_id, approval_reference,
        created_at, expires_at, reviewer, reason
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        grant.grantId,
        grant.projectId,
        grant.packageId,
        grant.packageVersion,
        grant.componentId,
        grant.capabilityId,
        grant.approvalReference,
        grant.createdAt,
        grant.expiresAt,
        grant.reviewer,
        grant.reason,
      ],
    );
  }

  async createRevocation(revocation: PackageRevocationRecord): Promise<void> {
    this.run(
      `
      insert into package_revocations (
        revocation_id, project_id, package_id, revoked_version,
        component_id, capability_id, approval_reference,
        created_at, reviewer, reason
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        revocation.revocationId,
        revocation.projectId,
        revocation.packageId,
        revocation.revokedVersion,
        revocation.componentId,
        revocation.capabilityId,
        revocation.approvalReference,
        revocation.createdAt,
        revocation.reviewer,
        revocation.reason,
      ],
    );
  }

  async listTrustRecords(projectId: string): Promise<PackageTrustRecord[]> {
    const rows = this.all<{
      trust_id: string;
      project_id: string;
      package_id: string;
      pinned_version: string;
      source_kind: string;
      canonical_source_ref: string;
      approval_reference: string;
      created_at: string;
      expires_at: string | null;
      reviewer: string;
      reason: string;
    }>(
      "select * from package_trust_records where project_id = ? order by created_at desc",
      [projectId],
    );

    return rows.map((row) => ({
      trustId: row.trust_id,
      projectId: row.project_id,
      packageId: row.package_id,
      pinnedVersion: row.pinned_version,
      sourceKind: row.source_kind as "npm" | "git" | "local",
      canonicalSourceRef: row.canonical_source_ref,
      approvalReference: row.approval_reference,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      reviewer: row.reviewer,
      reason: row.reason,
    }));
  }

  async listCapabilityGrants(projectId: string): Promise<PackageCapabilityGrant[]> {
    const rows = this.all<{
      grant_id: string;
      project_id: string;
      package_id: string;
      package_version: string;
      component_id: string;
      capability_id: string;
      approval_reference: string;
      created_at: string;
      expires_at: string | null;
      reviewer: string;
      reason: string;
    }>(
      "select * from package_capability_grants where project_id = ? order by created_at desc",
      [projectId],
    );

    return rows.map((row) => ({
      grantId: row.grant_id,
      projectId: row.project_id,
      packageId: row.package_id,
      packageVersion: row.package_version,
      componentId: row.component_id,
      capabilityId: row.capability_id,
      approvalReference: row.approval_reference,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      reviewer: row.reviewer,
      reason: row.reason,
    }));
  }

  async listRevocations(projectId: string): Promise<PackageRevocationRecord[]> {
    const rows = this.all<{
      revocation_id: string;
      project_id: string;
      package_id: string;
      revoked_version: string;
      component_id: string | null;
      capability_id: string | null;
      approval_reference: string;
      created_at: string;
      reviewer: string;
      reason: string;
    }>(
      "select * from package_revocations where project_id = ? order by created_at desc",
      [projectId],
    );

    return rows.map((row) => ({
      revocationId: row.revocation_id,
      projectId: row.project_id,
      packageId: row.package_id,
      revokedVersion: row.revoked_version,
      componentId: row.component_id,
      capabilityId: row.capability_id,
      approvalReference: row.approval_reference,
      createdAt: row.created_at,
      reviewer: row.reviewer,
      reason: row.reason,
    }));
  }
}
