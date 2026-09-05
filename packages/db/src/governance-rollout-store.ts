/**
 * FEAT-068 V1 append-only storage for shadow governance parity and migration audit.
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This internal development
 * schema has no approved external consumer or legacy persistence lane.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 1;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const RESULT = new Set(["MATCH", "MISMATCH"]);
const OUTCOME = new Set(["APPLIED", "ALREADY_CURRENT", "FAILED"]);
const CATEGORY_ORDER = ["SCHEMA", "PROJECT", "SOURCE_VERSION", "REPLAN", "DEBT", "QUEUE", "METRICS"] as const;
const CATEGORIES = new Set<string>(CATEGORY_ORDER);
const TABLES = [
  "hepha_governance_rollout_schema_migrations",
  "hepha_governance_parity_receipts",
  "hepha_governance_migration_audit",
  "hepha_governance_pilot_events",
] as const;
type Row = Record<string, unknown>;

export interface GovernanceParityReceipt {
  readonly receiptId: string; readonly projectId: string; readonly projectionSchema: "hepha-governance-parity/v1";
  readonly sourceVersionHash: string; readonly authoritativeHash: string; readonly dashboardHash: string;
  readonly result: "MATCH" | "MISMATCH"; readonly differenceCategories: readonly ("SCHEMA" | "PROJECT" | "SOURCE_VERSION" | "REPLAN" | "DEBT" | "QUEUE" | "METRICS")[]; readonly differenceCount: number;
  readonly comparedAt: string; readonly validUntil: string;
}
export interface GovernanceMigrationAudit {
  readonly auditId: string; readonly projectId: string; readonly schemaArea: "GOVERNANCE_ROLLOUT";
  readonly fromVersion: number; readonly toVersion: number; readonly outcome: "APPLIED" | "ALREADY_CURRENT" | "FAILED";
  readonly startedAt: string; readonly completedAt: string; readonly readBackHash: string | null; readonly safeCode: string | null;
}
/** Public rollout-status DTO. Internal persistence fields never cross this boundary. */
export interface GovernancePilotApproval {
  readonly approvalReceiptId: string; readonly pilotId: string; readonly featureId: string; readonly phaseContractId: string; readonly taskId: string; readonly contractVersion: number; readonly pilotConfigHash: string; readonly actorId: string; readonly authorizedRole: "ARCHITECTURE_STEWARD"; readonly reason: string; readonly parityReceiptId: string; readonly migrationAuditId: string; readonly approvedAt: string; readonly expiresAt: string; readonly expectedVersion: number; readonly resultingVersion: number;
}
export interface GovernancePilotStatus {
  readonly pilotId: string; readonly featureId: string; readonly phaseContractId: string; readonly taskId: string; readonly contractVersion: number; readonly pilotConfigHash: string; readonly approvalReceiptId: string; readonly approvedAt: string; readonly expiresAt: string; readonly lastOutcome: string;
}
export interface GovernanceRolloutStatus {
  readonly mode: "DISABLED" | "ACTIVE" | "NEEDS_HUMAN"; readonly eventVersion: number;
  readonly parity: Readonly<Pick<GovernanceParityReceipt, "receiptId" | "projectionSchema" | "sourceVersionHash" | "authoritativeHash" | "dashboardHash" | "result" | "differenceCategories" | "comparedAt" | "validUntil">> | null;
  readonly migration: Readonly<Pick<GovernanceMigrationAudit, "auditId" | "schemaArea" | "fromVersion" | "toVersion" | "outcome" | "completedAt" | "readBackHash">> | null;
  readonly pilot: GovernancePilotStatus | null;
}
export interface GovernancePilotEventInput { readonly projectId: string; readonly expectedVersion: number; readonly pilotId: string; readonly eventKind: "PILOT_ADMITTED" | "DISABLED_BY_OPERATOR" | "PILOT_EXPIRED" | "PILOT_STOPPED" | "DISPATCH_ALLOWED" | "DISPATCH_REFUSED"; readonly state: "ACTIVE" | "NEEDS_HUMAN"; readonly payload: GovernancePilotApproval | Readonly<{ readonly lastOutcome: string }>; readonly occurredAt: string; }
export type GovernanceRolloutStoreResult<T> = { readonly kind: "success"; readonly value: T } | { readonly kind: "refusal"; readonly code: "invalid_input" | "persistence_failed" };

function record(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Row, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, maximum = 256): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f-\u009f]/.test(value) && !/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i.test(value) && !/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(value) && !/<\/?[A-Za-z][^>]*>/.test(value) && !/(?:javascript|data|vbscript)\s*:/i.test(value); }
function identifier(value: unknown): value is string { return text(value) && ID.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function utc(value: unknown): value is string { return typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function sqliteInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return undefined;
}
function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= CATEGORY_ORDER.length
    && value.every((item): item is string => typeof item === "string" && CATEGORIES.has(item))
    && value.every((item, index, items) => index === 0 || CATEGORY_ORDER.indexOf(items[index - 1]! as typeof CATEGORY_ORDER[number]) < CATEGORY_ORDER.indexOf(item as typeof CATEGORY_ORDER[number]))
    && new Set(value).size === value.length;
}
function validParity(value: unknown): value is GovernanceParityReceipt {
  return record(value) && exact(value, ["receiptId", "projectId", "projectionSchema", "sourceVersionHash", "authoritativeHash", "dashboardHash", "result", "differenceCategories", "differenceCount", "comparedAt", "validUntil"])
    && identifier(value.receiptId) && identifier(value.projectId) && value.projectionSchema === "hepha-governance-parity/v1" && hash(value.sourceVersionHash) && hash(value.authoritativeHash) && hash(value.dashboardHash)
    && typeof value.result === "string" && RESULT.has(value.result) && stringArray(value.differenceCategories) && integer(value.differenceCount) && value.differenceCount === value.differenceCategories.length
    && utc(value.comparedAt) && utc(value.validUntil) && Date.parse(value.validUntil) > Date.parse(value.comparedAt) && Date.parse(value.validUntil) - Date.parse(value.comparedAt) <= 24 * 60 * 60 * 1000;
}
function validAudit(value: unknown): value is GovernanceMigrationAudit {
  return record(value) && exact(value, ["auditId", "projectId", "schemaArea", "fromVersion", "toVersion", "outcome", "startedAt", "completedAt", "readBackHash", "safeCode"])
    && identifier(value.auditId) && identifier(value.projectId) && value.schemaArea === "GOVERNANCE_ROLLOUT" && integer(value.fromVersion) && integer(value.toVersion)
    && typeof value.outcome === "string" && OUTCOME.has(value.outcome) && utc(value.startedAt) && utc(value.completedAt) && (value.readBackHash === null || hash(value.readBackHash)) && (value.safeCode === null || identifier(value.safeCode));
}
function validPilotApproval(value: unknown): value is GovernancePilotApproval {
  return record(value) && exact(value, ["approvalReceiptId", "pilotId", "featureId", "phaseContractId", "taskId", "contractVersion", "pilotConfigHash", "actorId", "authorizedRole", "reason", "parityReceiptId", "migrationAuditId", "approvedAt", "expiresAt", "expectedVersion", "resultingVersion"])
    && ["approvalReceiptId", "pilotId", "featureId", "phaseContractId", "taskId", "actorId", "parityReceiptId", "migrationAuditId"].every((key) => identifier(value[key])) && integer(value.contractVersion) && hash(value.pilotConfigHash) && value.authorizedRole === "ARCHITECTURE_STEWARD" && text(value.reason, 1024) && utc(value.approvedAt) && utc(value.expiresAt) && Date.parse(value.expiresAt) > Date.parse(value.approvedAt) && Date.parse(value.expiresAt) - Date.parse(value.approvedAt) <= 86400000 && integer(value.expectedVersion) && integer(value.resultingVersion);
}
function validPilotEvent(value: unknown): value is GovernancePilotEventInput {
  return record(value) && exact(value, ["projectId", "expectedVersion", "pilotId", "eventKind", "state", "payload", "occurredAt"]) && identifier(value.projectId) && integer(value.expectedVersion) && identifier(value.pilotId) && typeof value.eventKind === "string" && ["PILOT_ADMITTED", "DISABLED_BY_OPERATOR", "PILOT_EXPIRED", "PILOT_STOPPED", "DISPATCH_ALLOWED", "DISPATCH_REFUSED"].includes(value.eventKind) && (value.state === "ACTIVE" || value.state === "NEEDS_HUMAN") && utc(value.occurredAt) && (value.eventKind === "PILOT_ADMITTED" ? validPilotApproval(value.payload) : record(value.payload) && exact(value.payload, ["lastOutcome"]) && text(value.payload.lastOutcome));
}
const SCHEMA = `
create table hepha_governance_rollout_schema_migrations (version integer primary key, applied_at text not null);
create table hepha_governance_parity_receipts (receipt_id text primary key, project_id text not null, projection_schema text not null, source_version_hash text not null, authoritative_hash text not null, dashboard_hash text not null, result text not null, difference_categories_json text not null, difference_count integer not null, compared_at text not null, valid_until text not null);
create table hepha_governance_migration_audit (audit_id text primary key, project_id text not null, schema_area text not null, from_version integer not null, to_version integer not null, outcome text not null, started_at text not null, completed_at text not null, read_back_hash text, safe_code text);
create table hepha_governance_pilot_events (project_id text not null, event_version integer not null, pilot_id text not null, event_kind text not null, state text not null, payload_json text not null, occurred_at text not null, primary key(project_id,event_version));
`;
function triggerNames(): readonly string[] { return TABLES.flatMap((table) => [`trg_${table}_no_update`, `trg_${table}_no_delete`]).sort(); }
function appendOnly(): string { return TABLES.flatMap((table) => [`create trigger trg_${table}_no_update before update on ${table} begin select raise(abort, 'append-only'); end;`, `create trigger trg_${table}_no_delete before delete on ${table} begin select raise(abort, 'append-only'); end;`]).join("\n"); }
function canonicalHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function configure(database: DatabaseSync, databasePath: string): void {
  database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
  if (databasePath !== ":memory:") database.exec("pragma journal_mode = wal;");
}
function objectNames(database: DatabaseSync, type: "table" | "trigger"): string[] {
  return (database.prepare("select name from sqlite_master where type=? order by name").all(type) as Row[])
    .map((row) => row.name).filter((name): name is string => typeof name === "string");
}
function expectedTablesPresent(database: DatabaseSync): boolean {
  const tables = new Set(objectNames(database, "table"));
  return TABLES.every((table) => tables.has(table));
}
function validateInstalledSchema(database: DatabaseSync): number {
  if (!expectedTablesPresent(database)) throw new Error("schema-table-missing");
  const triggers = new Set(objectNames(database, "trigger"));
  if (!triggerNames().every((name) => triggers.has(name))) throw new Error("schema-trigger-missing");
  const versions = (database.prepare("select version from hepha_governance_rollout_schema_migrations order by version").all() as Row[]).map((row) => sqliteInteger(row.version));
  if (versions.length !== 1 || versions[0] !== SCHEMA_VERSION) throw new Error("schema-version-invalid");
  return SCHEMA_VERSION;
}
function migrationReadBackHash(database: DatabaseSync, auditId: string): string {
  const version = validateInstalledSchema(database);
  const migrationRows = database.prepare("select version from hepha_governance_rollout_schema_migrations order by version").all() as Row[];
  const migrationVersions = migrationRows.map((row) => sqliteInteger(row.version));
  if (!identifier(auditId) || migrationVersions.some((item) => item === undefined)) throw new Error("migration-read-back-invalid");
  return canonicalHash({ auditId, migrationCount: migrationVersions.length, migrationVersions, tables: [...TABLES], triggers: triggerNames(), version });
}
function hasNewerForeignEvidence(database: DatabaseSync, projectId: string): boolean {
  const rows = database.prepare("select project_id, compared_at as occurred_at, receipt_id as evidence_id from hepha_governance_parity_receipts union all select project_id, completed_at as occurred_at, audit_id as evidence_id from hepha_governance_migration_audit order by occurred_at desc, evidence_id desc").all() as Row[];
  if (!rows.every((row) => exact(row, ["project_id", "occurred_at", "evidence_id"]) && identifier(row.project_id) && utc(row.occurred_at) && identifier(row.evidence_id))) throw new Error("rollout-evidence-invalid");
  const newestRequested = rows.find((row) => row.project_id === projectId);
  const newestForeign = rows.find((row) => row.project_id !== projectId);
  return newestForeign !== undefined && (newestRequested === undefined || Date.parse(newestForeign.occurred_at as string) > Date.parse(newestRequested.occurred_at as string));
}

export class GovernanceRolloutSqliteStore {
  private database: DatabaseSync;
  constructor(private readonly databasePath: string, private readonly now: () => string = () => new Date().toISOString(), private readonly migrationProjectId = "governance-rollout", private readonly recordCurrentAudit = true) {
    // A memory database cannot prove the required committed independent reopen.
    if (databasePath === ":memory:") throw new Error("GOVERNANCE_ROLLOUT_FILE_DATABASE_REQUIRED");
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    configure(this.database, databasePath);
    this.ensureSchema();
  }
  close(): void { this.database.close(); }
  private rollback(): void { try { this.database.exec("rollback"); } catch { /* no active transaction */ } }
  private reopenAndVerify(auditId: string): void {
    this.database.close();
    let verifier: DatabaseSync | undefined;
    try {
      verifier = new DatabaseSync(this.databasePath);
      configure(verifier, this.databasePath);
      validateInstalledSchema(verifier);
      const audit = this.readAuditFrom(verifier, auditId);
      if (!audit || audit.readBackHash !== migrationReadBackHash(verifier, auditId)) throw new Error("migration-reopen-read-back");
    } finally {
      verifier?.close();
    }
    this.database = new DatabaseSync(this.databasePath);
    configure(this.database, this.databasePath);
  }
  private ensureSchema(): void {
    const startedAt = this.now();
    try {
      this.database.exec("begin immediate");
      const existingTables = new Set(objectNames(this.database, "table"));
      const ledgerExists = existingTables.has(TABLES[0]);
      let fromVersion = 0;
      if (ledgerExists) {
        const versions = (this.database.prepare("select version from hepha_governance_rollout_schema_migrations order by version").all() as Row[]).map((row) => sqliteInteger(row.version));
        if (versions.length !== 1 || versions[0] === undefined || versions[0]! > SCHEMA_VERSION) throw new Error("schema-version-invalid");
        fromVersion = versions[0]!;
        if (fromVersion === SCHEMA_VERSION) {
          validateInstalledSchema(this.database);
          const auditIds = (this.database.prepare("select audit_id from hepha_governance_migration_audit order by audit_id").all() as Row[]).map((row) => row.audit_id);
          if (!auditIds.every((auditId): auditId is string => identifier(auditId) && this.readAudit(auditId)?.readBackHash === migrationReadBackHash(this.database, auditId))) throw new Error("existing-migration-read-back-invalid");
          // A newer record from another project must fail closed before this
          // request can append an ALREADY_CURRENT audit and obscure the conflict.
          if (hasNewerForeignEvidence(this.database, this.migrationProjectId)) throw new Error("newer-foreign-rollout-evidence");
        }
        else if ([...existingTables].some((name) => name !== TABLES[0] && TABLES.includes(name as typeof TABLES[number]))) throw new Error("partial-version-zero-schema");
      } else if ([...existingTables].some((name) => TABLES.includes(name as typeof TABLES[number]))) {
        throw new Error("schema-ledger-missing");
      }
      // A confirmed action validates the installed schema but must not append a
      // new ALREADY_CURRENT audit between the dashboard read and its exact
      // migration-audit binding check.
      if (fromVersion === SCHEMA_VERSION && !this.recordCurrentAudit) {
        this.database.exec("commit");
        return;
      }
      if (fromVersion === 0) {
        this.database.exec(SCHEMA);
        this.database.exec(appendOnly());
        this.database.prepare("insert into hepha_governance_rollout_schema_migrations(version, applied_at) values (?,?)").run(SCHEMA_VERSION, startedAt);
      }
      validateInstalledSchema(this.database);
      const audit: GovernanceMigrationAudit = {
        auditId: `migration-${randomUUID()}`, projectId: this.migrationProjectId, schemaArea: "GOVERNANCE_ROLLOUT", fromVersion, toVersion: SCHEMA_VERSION,
        outcome: fromVersion === 0 ? "APPLIED" : "ALREADY_CURRENT", startedAt, completedAt: this.now(), readBackHash: null, safeCode: null,
      };
      const verified = { ...audit, readBackHash: migrationReadBackHash(this.database, audit.auditId) };
      this.database.prepare("insert into hepha_governance_migration_audit(audit_id,project_id,schema_area,from_version,to_version,outcome,started_at,completed_at,read_back_hash,safe_code) values (?,?,?,?,?,?,?,?,?,?)").run(verified.auditId, verified.projectId, verified.schemaArea, verified.fromVersion, verified.toVersion, verified.outcome, verified.startedAt, verified.completedAt, verified.readBackHash, verified.safeCode);
      this.database.exec("commit");
      this.reopenAndVerify(verified.auditId);
    } catch {
      this.rollback();
      throw new Error("GOVERNANCE_ROLLOUT_SCHEMA_FAILED");
    }
  }
  appendParityReceipt(raw: unknown): GovernanceRolloutStoreResult<GovernanceParityReceipt> {
    if (!validParity(raw)) return { kind: "refusal", code: "invalid_input" };
    try {
      this.database.exec("begin immediate");
      this.database.prepare("insert into hepha_governance_parity_receipts(receipt_id,project_id,projection_schema,source_version_hash,authoritative_hash,dashboard_hash,result,difference_categories_json,difference_count,compared_at,valid_until) values (?,?,?,?,?,?,?,?,?,?,?)").run(raw.receiptId, raw.projectId, raw.projectionSchema, raw.sourceVersionHash, raw.authoritativeHash, raw.dashboardHash, raw.result, JSON.stringify(raw.differenceCategories), raw.differenceCount, raw.comparedAt, raw.validUntil);
      const saved = this.readParity(raw.receiptId);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(raw)) throw new Error("read-back");
      this.database.exec("commit"); return { kind: "success", value: saved };
    } catch { this.rollback(); return { kind: "refusal", code: "persistence_failed" }; }
  }
  readStatus(rawProjectId: unknown): GovernanceRolloutStoreResult<GovernanceRolloutStatus> {
    if (!identifier(rawProjectId) || rawProjectId !== this.migrationProjectId) return { kind: "refusal", code: "invalid_input" };
    try {
      const parityRows = this.database.prepare("select receipt_id from hepha_governance_parity_receipts where project_id=? order by compared_at desc, receipt_id desc limit 1").all(rawProjectId) as Row[];
      const auditRows = this.database.prepare("select audit_id from hepha_governance_migration_audit where project_id=? order by completed_at desc, audit_id desc limit 1").all(rawProjectId) as Row[];
      const parity = parityRows.length === 0 ? null : typeof parityRows[0]?.receipt_id === "string" ? this.readParity(parityRows[0].receipt_id) : null;
      const migration = auditRows.length === 0 ? null : typeof auditRows[0]?.audit_id === "string" ? this.readAudit(auditRows[0].audit_id) : null;
      if ((parityRows.length > 0 && (!parity || parity.projectId !== rawProjectId)) || (auditRows.length > 0 && (!migration || migration.projectId !== rawProjectId))) return { kind: "refusal", code: "persistence_failed" };
      const safeParity = parity === null ? null : Object.freeze({ receiptId: parity.receiptId, projectionSchema: parity.projectionSchema, sourceVersionHash: parity.sourceVersionHash, authoritativeHash: parity.authoritativeHash, dashboardHash: parity.dashboardHash, result: parity.result, differenceCategories: parity.differenceCategories, comparedAt: parity.comparedAt, validUntil: parity.validUntil });
      const safeMigration = migration === null ? null : Object.freeze({ auditId: migration.auditId, schemaArea: migration.schemaArea, fromVersion: migration.fromVersion, toVersion: migration.toVersion, outcome: migration.outcome, completedAt: migration.completedAt, readBackHash: migration.readBackHash });
      const events = this.database.prepare("select event_version,pilot_id,event_kind,state,payload_json,occurred_at from hepha_governance_pilot_events where project_id=? order by event_version").all(rawProjectId) as Row[];
      let mode: GovernanceRolloutStatus["mode"] = "DISABLED"; let eventVersion = 0; let pilot: GovernancePilotStatus | null = null;
      for (const row of events) {
        if (!exact(row, ["event_version", "pilot_id", "event_kind", "state", "payload_json", "occurred_at"]) || sqliteInteger(row.event_version) !== eventVersion + 1 || !identifier(row.pilot_id) || typeof row.event_kind !== "string" || !["PILOT_ADMITTED", "DISABLED_BY_OPERATOR", "PILOT_EXPIRED", "PILOT_STOPPED", "DISPATCH_ALLOWED", "DISPATCH_REFUSED"].includes(row.event_kind) || (row.state !== "ACTIVE" && row.state !== "NEEDS_HUMAN") || typeof row.payload_json !== "string" || !utc(row.occurred_at)) return { kind: "refusal", code: "persistence_failed" };
        let payload: unknown; try { payload = JSON.parse(row.payload_json); } catch { return { kind: "refusal", code: "persistence_failed" }; }
        eventVersion += 1;
        if (row.event_kind === "PILOT_ADMITTED") {
          if (!validPilotApproval(payload) || payload.pilotId !== row.pilot_id || payload.resultingVersion !== eventVersion || payload.expectedVersion !== eventVersion - 1) return { kind: "refusal", code: "persistence_failed" };
          pilot = Object.freeze({ pilotId: payload.pilotId, featureId: payload.featureId, phaseContractId: payload.phaseContractId, taskId: payload.taskId, contractVersion: payload.contractVersion, pilotConfigHash: payload.pilotConfigHash, approvalReceiptId: payload.approvalReceiptId, approvedAt: payload.approvedAt, expiresAt: payload.expiresAt, lastOutcome: "PILOT_ADMITTED" }); mode = "ACTIVE";
        } else { if (!pilot || !record(payload) || !exact(payload, ["lastOutcome"]) || !text(payload.lastOutcome)) return { kind: "refusal", code: "persistence_failed" }; const activePilot: GovernancePilotStatus = pilot; pilot = Object.freeze({ ...activePilot, lastOutcome: payload.lastOutcome }); mode = row.state; }
      }
      return { kind: "success", value: Object.freeze({ mode, eventVersion, parity: safeParity, migration: safeMigration, pilot }) };
    } catch { return { kind: "refusal", code: "persistence_failed" }; }
  }
  appendPilotEvent(raw: unknown): GovernanceRolloutStoreResult<GovernanceRolloutStatus> {
    if (!validPilotEvent(raw) || raw.projectId !== this.migrationProjectId) return { kind: "refusal", code: "invalid_input" };
    try {
      this.database.exec("begin immediate"); const current = this.readStatus(raw.projectId); if (current.kind !== "success" || current.value.eventVersion !== raw.expectedVersion) throw new Error("stale-pilot-event");
      this.database.prepare("insert into hepha_governance_pilot_events(project_id,event_version,pilot_id,event_kind,state,payload_json,occurred_at) values (?,?,?,?,?,?,?)").run(raw.projectId, raw.expectedVersion + 1, raw.pilotId, raw.eventKind, raw.state, JSON.stringify(raw.payload), raw.occurredAt);
      const saved = this.readStatus(raw.projectId); if (saved.kind !== "success" || saved.value.eventVersion !== raw.expectedVersion + 1) throw new Error("pilot-read-back");
      this.database.exec("commit"); return saved;
    } catch { this.rollback(); return { kind: "refusal", code: "persistence_failed" }; }
  }
  private readParity(receiptId: string): GovernanceParityReceipt | null {
    const row = this.database.prepare("select receipt_id,project_id,projection_schema,source_version_hash,authoritative_hash,dashboard_hash,result,difference_categories_json,difference_count,compared_at,valid_until from hepha_governance_parity_receipts where receipt_id=?").get(receiptId) as Row | undefined;
    if (!row || !exact(row, ["receipt_id", "project_id", "projection_schema", "source_version_hash", "authoritative_hash", "dashboard_hash", "result", "difference_categories_json", "difference_count", "compared_at", "valid_until"]) || typeof row.difference_categories_json !== "string") return null;
    let categories: unknown; try { categories = JSON.parse(row.difference_categories_json); } catch { return null; }
    const value = { receiptId: row.receipt_id, projectId: row.project_id, projectionSchema: row.projection_schema, sourceVersionHash: row.source_version_hash, authoritativeHash: row.authoritative_hash, dashboardHash: row.dashboard_hash, result: row.result, differenceCategories: categories, differenceCount: sqliteInteger(row.difference_count), comparedAt: row.compared_at, validUntil: row.valid_until };
    return validParity(value) ? Object.freeze(value) : null;
  }
  private readAudit(auditId: string): GovernanceMigrationAudit | null { return this.readAuditFrom(this.database, auditId); }
  private readAuditFrom(database: DatabaseSync, auditId: string): GovernanceMigrationAudit | null {
    const row = database.prepare("select audit_id,project_id,schema_area,from_version,to_version,outcome,started_at,completed_at,read_back_hash,safe_code from hepha_governance_migration_audit where audit_id=?").get(auditId) as Row | undefined;
    if (!row || !exact(row, ["audit_id", "project_id", "schema_area", "from_version", "to_version", "outcome", "started_at", "completed_at", "read_back_hash", "safe_code"])) return null;
    const value = { auditId: row.audit_id, projectId: row.project_id, schemaArea: row.schema_area, fromVersion: sqliteInteger(row.from_version), toVersion: sqliteInteger(row.to_version), outcome: row.outcome, startedAt: row.started_at, completedAt: row.completed_at, readBackHash: row.read_back_hash, safeCode: row.safe_code };
    return validAudit(value) ? Object.freeze(value) : null;
  }
}
