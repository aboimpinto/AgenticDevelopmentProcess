import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  canonicalizeRuntimeJson,
  isDirectHostRuntimeEvidenceV1,
  runtimePersistenceRejection,
  type DirectHostRuntimeEvidenceV1,
  type RuntimeEvidenceGuardContextV1,
  type RuntimePersistenceResultV1,
} from "@hepha/shared";
import {
  directHostRuntimeEvidenceValues,
  mapDirectHostRuntimeEvidenceRow,
} from "./direct-host-runtime-evidence-row-mapper.js";
import { ensureDirectHostRuntimeEvidenceSchema } from "./direct-host-runtime-evidence-schema.js";
import type { RuntimeSqliteRow } from "./runtime-invocation-row-mapper.js";

const INSERT_DIRECT_EVIDENCE = `insert into hepha_direct_host_runtime_evidence (
  evidence_id,schema_version,mode,project_id,card_key,phase_execution_contract_id,phase_number,
  task_id,procedure_id,action_id,host_kind,host_identity,started_at,settled_at,duration_ms,outcome,
  failure_code,state_sync_status,state_sync_operation_id,state_sync_failure_code,model_evidence_status,
  model_id,provider_id,instrumentation_source,model_observed_at
) values (${Array.from({ length: 25 }, () => "?").join(",")})`;

export interface DirectHostRuntimeEvidenceFilterV1 {
  readonly schemaVersion: typeof RUNTIME_EXECUTION_SCHEMA_VERSION;
  readonly projectId: string;
  readonly cardKey: string | null;
  readonly limit: number;
}

/** Owns replay-safe writes and guarded read-back for route-incapable direct-host evidence. */
export class DirectHostRuntimeEvidenceStore {
  private readonly database: DatabaseSync;

  constructor(
    readonly databasePath: string,
    private readonly context: RuntimeEvidenceGuardContextV1,
  ) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
    if (databasePath !== ":memory:") this.database.exec("pragma journal_mode = WAL;");
    ensureDirectHostRuntimeEvidenceSchema(this.database);
    this.validateInstalledEvidence();
  }

  static createInMemory(context: RuntimeEvidenceGuardContextV1): DirectHostRuntimeEvidenceStore {
    return new DirectHostRuntimeEvidenceStore(":memory:", context);
  }

  close(): void { this.database.close(); }

  append(raw: unknown): RuntimePersistenceResultV1<DirectHostRuntimeEvidenceV1> {
    if (!isDirectHostRuntimeEvidenceV1(raw, this.context)) {
      return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    }
    try {
      const existing = this.read(raw.evidenceId);
      if (existing !== null) return same(existing, raw)
        ? { ok: true, value: existing }
        : runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      this.database.prepare(INSERT_DIRECT_EVIDENCE).run(...directHostRuntimeEvidenceValues(raw));
      const settled = this.read(raw.evidenceId);
      return settled === null
        ? runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT")
        : { ok: true, value: settled };
    } catch {
      return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
    }
  }

  get(evidenceId: unknown): RuntimePersistenceResultV1<DirectHostRuntimeEvidenceV1 | null> {
    if (!text(evidenceId, 512)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try { return { ok: true, value: this.read(evidenceId) }; }
    catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT"); }
  }

  listFeatureEvidence(raw: unknown): RuntimePersistenceResultV1<readonly DirectHostRuntimeEvidenceV1[]> {
    if (!isFilter(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try {
      this.validateInstalledEvidence();
      const sql = raw.cardKey === null
        ? "select * from hepha_direct_host_runtime_evidence where project_id=? and card_key is null order by started_at,evidence_id limit ?"
        : "select * from hepha_direct_host_runtime_evidence where project_id=? and card_key=? order by started_at,evidence_id limit ?";
      const values = raw.cardKey === null ? [raw.projectId, raw.limit + 1] : [raw.projectId, raw.cardKey, raw.limit + 1];
      const rows = this.database.prepare(sql).all(...values) as RuntimeSqliteRow[];
      if (rows.length > raw.limit) return runtimePersistenceRejection("RUNTIME_EVIDENCE_HISTORY_LIMIT");
      return { ok: true, value: rows.map((row) => mapDirectHostRuntimeEvidenceRow(row, this.context)) };
    } catch {
      return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT");
    }
  }

  private read(evidenceId: string): DirectHostRuntimeEvidenceV1 | null {
    const row = this.database.prepare(
      "select * from hepha_direct_host_runtime_evidence where evidence_id=?",
    ).get(evidenceId) as RuntimeSqliteRow | undefined;
    return row ? mapDirectHostRuntimeEvidenceRow(row, this.context) : null;
  }

  private validateInstalledEvidence(): void {
    const rows = this.database.prepare(
      "select * from hepha_direct_host_runtime_evidence order by started_at,evidence_id",
    ).all() as RuntimeSqliteRow[];
    for (const row of rows) mapDirectHostRuntimeEvidenceRow(row, this.context);
  }
}

function isFilter(value: unknown): value is DirectHostRuntimeEvidenceFilterV1 {
  return record(value) && exact(value, ["schemaVersion", "projectId", "cardKey", "limit"])
    && value.schemaVersion === RUNTIME_EXECUTION_SCHEMA_VERSION
    && text(value.projectId, 512) && (value.cardKey === null || text(value.cardKey, 512))
    && typeof value.limit === "number" && Number.isSafeInteger(value.limit) && value.limit >= 1 && value.limit <= 256;
}
function same(left: unknown, right: unknown): boolean {
  return canonicalizeRuntimeJson(left) === canonicalizeRuntimeJson(right);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
