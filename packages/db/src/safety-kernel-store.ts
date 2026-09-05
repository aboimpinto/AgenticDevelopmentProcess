import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface SafetyKernelArtifactRecord {
  artifactHash: string;
  artifactKind: "review_manifest" | "safe_incident";
  projectId: string;
  cardKey: string;
  canonicalJson: string;
  createdAt: string;
}

export interface SafetyKernelSafeIncident {
  id: string;
  projectId: string;
  cardKey: string;
  incidentCode: string;
  stage: "validation" | "persistence" | "read_back" | "render";
  artifactHash: string | null;
  createdAt: string;
}

export interface SafetyKernelDebtObservation {
  id: string;
  projectId: string;
  cardKey: string;
  ruleId: string;
  location: string;
  summary: string;
  createdAt: string;
}

/** Narrow append-only store. It deliberately has no update/delete API. */
export class SafetyKernelSqliteStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma foreign_keys = on; pragma journal_mode = wal; pragma busy_timeout = 5000;");
    this.ensureSchema();
  }

  close(): void { this.database.close(); }

  persistManifest(record: SafetyKernelArtifactRecord, debts: SafetyKernelDebtObservation[] = []): SafetyKernelArtifactRecord {
    try {
      this.database.exec("begin immediate");
      this.database.prepare(`insert into hepha_safety_kernel_artifacts
        (artifact_hash, artifact_kind, project_id, card_key, canonical_json, created_at)
        values (?, ?, ?, ?, ?, ?)`)
        .run(record.artifactHash, record.artifactKind, record.projectId, record.cardKey, record.canonicalJson, record.createdAt);
      for (const debt of debts) {
        this.database.prepare(`insert into hepha_safety_kernel_debt_observations
          (id, project_id, card_key, rule_id, location, summary, status, created_at)
          values (?, ?, ?, ?, ?, ?, 'PENDING_TRIAGE', ?)`)
          .run(debt.id, debt.projectId, debt.cardKey, debt.ruleId, debt.location, debt.summary, debt.createdAt);
      }
      this.database.exec("commit");
      const stored = this.getArtifactByHash(record.artifactHash);
      if (!stored || stored.canonicalJson !== record.canonicalJson) throw new Error("read-back mismatch");
      return stored;
    } catch {
      try { this.database.exec("rollback"); } catch { /* no transaction to roll back */ }
      throw new Error("KERNEL_STORAGE_UNAVAILABLE");
    }
  }

  recordSafeIncident(incident: SafetyKernelSafeIncident): void {
    try {
      this.database.prepare(`insert into hepha_safety_kernel_safe_incidents
        (id, project_id, card_key, incident_code, stage, artifact_hash, created_at)
        values (?, ?, ?, ?, ?, ?, ?)`)
        .run(incident.id, incident.projectId, incident.cardKey, incident.incidentCode, incident.stage, incident.artifactHash, incident.createdAt);
    } catch {
      throw new Error("KERNEL_STORAGE_UNAVAILABLE");
    }
  }

  getArtifactByHash(hash: string): SafetyKernelArtifactRecord | null {
    const row = this.database.prepare(`select artifact_hash, artifact_kind, project_id, card_key, canonical_json, created_at
      from hepha_safety_kernel_artifacts where artifact_hash = ?`).get(hash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { artifactHash: String(row.artifact_hash), artifactKind: row.artifact_kind as SafetyKernelArtifactRecord["artifactKind"], projectId: String(row.project_id), cardKey: String(row.card_key), canonicalJson: String(row.canonical_json), createdAt: String(row.created_at) };
  }

  private ensureSchema(): void {
    this.database.exec(`
      create table if not exists hepha_safety_kernel_artifacts (
        artifact_hash text primary key, artifact_kind text not null check (artifact_kind in ('review_manifest', 'safe_incident')),
        project_id text not null, card_key text not null, canonical_json text not null, created_at text not null
      );
      create table if not exists hepha_safety_kernel_debt_observations (
        id text primary key, project_id text not null, card_key text not null, rule_id text not null,
        location text not null, summary text not null, status text not null check (status = 'PENDING_TRIAGE'), created_at text not null
      );
      create table if not exists hepha_safety_kernel_safe_incidents (
        id text primary key, project_id text not null, card_key text not null, incident_code text not null,
        stage text not null check (stage in ('validation', 'persistence', 'read_back', 'render')),
        artifact_hash text, created_at text not null
      );
      create trigger if not exists hepha_safety_kernel_artifacts_no_update before update on hepha_safety_kernel_artifacts begin select raise(abort, 'append-only'); end;
      create trigger if not exists hepha_safety_kernel_artifacts_no_delete before delete on hepha_safety_kernel_artifacts begin select raise(abort, 'append-only'); end;
      create trigger if not exists hepha_safety_kernel_debt_no_update before update on hepha_safety_kernel_debt_observations begin select raise(abort, 'append-only'); end;
      create trigger if not exists hepha_safety_kernel_incidents_no_update before update on hepha_safety_kernel_safe_incidents begin select raise(abort, 'append-only'); end;
      create trigger if not exists hepha_safety_kernel_incidents_no_delete before delete on hepha_safety_kernel_safe_incidents begin select raise(abort, 'append-only'); end;
      create trigger if not exists hepha_safety_kernel_debt_no_delete before delete on hepha_safety_kernel_debt_observations begin select raise(abort, 'append-only'); end;
    `);
  }
}
