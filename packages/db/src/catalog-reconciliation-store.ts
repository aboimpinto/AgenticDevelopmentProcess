import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CATALOG_RECONCILIATION_SCHEMA_VERSION,
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  MAX_CATALOG_RECONCILIATION_TEXT_LENGTH,
  isAdoptCatalogLegacyEvidenceInput,
  isCatalogReconciliationRecord,
  isClaimCatalogScanAttemptInput,
  isInitializeCatalogReconciliationInput,
  isSettleCatalogScanAttemptInput,
  type AdoptCatalogLegacyEvidenceInput,
  type CatalogReconciliationRecord,
  type ClaimCatalogScanAttemptInput,
  type ClaimCatalogScanAttemptResult,
  type InitializeCatalogReconciliationInput,
  type ProviderConnectionId,
  type SettleCatalogScanAttemptInput,
} from "@hepha/shared";

const SCHEMA_SQL = `
create table if not exists catalog_reconciliation_ledger (
  connection_id text primary key,
  reconciliation_version integer not null,
  scan_state text not null,
  trigger text,
  attempt_id text,
  claimed_at text,
  settled_at text,
  settled_outcome text,
  model_count integer,
  outcome_code text,
  safe_outcome_message text,
  diagnostic_id text
);
`;

const SQL = {
  read: "select * from catalog_reconciliation_ledger where connection_id = ?",
  list: "select * from catalog_reconciliation_ledger",
  insertNever: `
    insert into catalog_reconciliation_ledger (
      connection_id, reconciliation_version, scan_state, trigger, attempt_id, claimed_at,
      settled_at, settled_outcome, model_count, outcome_code, safe_outcome_message, diagnostic_id
    ) values (?, ?, 'never_scanned', null, null, null, null, null, null, null, null, null)
  `,
  replace: `
    insert into catalog_reconciliation_ledger (
      connection_id, reconciliation_version, scan_state, trigger, attempt_id, claimed_at,
      settled_at, settled_outcome, model_count, outcome_code, safe_outcome_message, diagnostic_id
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(connection_id) do update set
      reconciliation_version = excluded.reconciliation_version,
      scan_state = excluded.scan_state,
      trigger = excluded.trigger,
      attempt_id = excluded.attempt_id,
      claimed_at = excluded.claimed_at,
      settled_at = excluded.settled_at,
      settled_outcome = excluded.settled_outcome,
      model_count = excluded.model_count,
      outcome_code = excluded.outcome_code,
      safe_outcome_message = excluded.safe_outcome_message,
      diagnostic_id = excluded.diagnostic_id
  `,
} as const;

type SqliteValue = string | number | null;

/** Owns the single current, transactionally claimed reconciliation row for each connection. */
export class CatalogReconciliationStore {
  private readonly database: DatabaseSync;
  private schemaReady = false;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma busy_timeout = 5000;");
    if (databasePath !== ":memory:") this.database.exec("pragma journal_mode = WAL;");
  }

  static createInMemory(): CatalogReconciliationStore {
    return new CatalogReconciliationStore(":memory:");
  }

  close(): void {
    this.database.close();
  }

  read(connectionId: ProviderConnectionId): CatalogReconciliationRecord | null {
    assertConnectionId(connectionId);
    return this.readWithinTransaction(connectionId);
  }

  list(): CatalogReconciliationRecord[] {
    const records = this.all(SQL.list, []).map(rowToRecord);
    return records.sort(compareByConnectionId);
  }

  initializeNeverScanned(input: InitializeCatalogReconciliationInput): CatalogReconciliationRecord {
    if (!isInitializeCatalogReconciliationInput(input)) throwContractError();
    return this.immediateTransaction(() => {
      const existing = this.readWithinTransaction(input.connectionId);
      if (existing) return existing;
      this.run(SQL.insertNever, [input.connectionId, input.reconciliationVersion]);
      return this.requireRecord(input.connectionId);
    });
  }

  adoptLegacyEvidence(input: AdoptCatalogLegacyEvidenceInput): CatalogReconciliationRecord {
    if (!isAdoptCatalogLegacyEvidenceInput(input)) throwContractError();
    const adopted = adoptionRecord(input);
    return this.immediateTransaction(() => {
      const existing = this.readWithinTransaction(input.connectionId);
      if (existing && (existing.reconciliationVersion !== input.reconciliationVersion
        || existing.scanState !== "never_scanned")) throwContractError();
      this.replace(adopted);
      return this.requireRecord(input.connectionId);
    });
  }

  claimAttempt(input: ClaimCatalogScanAttemptInput): ClaimCatalogScanAttemptResult {
    if (!isClaimCatalogScanAttemptInput(input)) throwContractError();
    return this.immediateTransaction(() => {
      const existing = this.readWithinTransaction(input.connectionId);
      if (existing?.scanState === "scanning") {
        return { kind: "already_scanning", record: existing };
      }
      if (existing && existing.reconciliationVersion > input.reconciliationVersion) throwContractError();
      if (existing && input.mode === "eligible_only"
        && existing.reconciliationVersion === input.reconciliationVersion
        && isSettled(existing)) {
        return { kind: "settled_for_version", record: existing };
      }

      const claimed: CatalogReconciliationRecord = {
        schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
        connectionId: input.connectionId,
        reconciliationVersion: input.reconciliationVersion,
        scanState: "scanning",
        trigger: input.trigger,
        attemptId: input.attemptId,
        claimedAt: input.claimedAt,
        settledAt: null,
        settledOutcome: null,
        modelCount: null,
        outcomeCode: null,
        safeOutcomeMessage: null,
        diagnosticId: null,
      };
      if (!isCatalogReconciliationRecord(claimed)) throwContractError();
      this.replace(claimed);
      return { kind: "claimed", record: this.requireRecord(input.connectionId) };
    });
  }

  settleAttempt(input: SettleCatalogScanAttemptInput): CatalogReconciliationRecord {
    if (!isSettleCatalogScanAttemptInput(input)) throwContractError();
    return this.immediateTransaction(() => {
      const existing = this.readWithinTransaction(input.connectionId);
      if (!existing || existing.scanState !== "scanning"
        || existing.reconciliationVersion !== input.reconciliationVersion
        || existing.attemptId !== input.attemptId
        || existing.claimedAt === null
        || Date.parse(input.settledAt) < Date.parse(existing.claimedAt)) throwContractError();

      const settled: CatalogReconciliationRecord = {
        ...existing,
        scanState: input.settledOutcome,
        settledAt: input.settledAt,
        settledOutcome: input.settledOutcome,
        modelCount: input.modelCount,
        outcomeCode: input.outcomeCode,
        safeOutcomeMessage: input.safeOutcomeMessage,
        diagnosticId: input.diagnosticId,
      };
      if (!isCatalogReconciliationRecord(settled)) throwContractError();
      this.replace(settled);
      return this.requireRecord(input.connectionId);
    });
  }

  listInterruptedClaims(): CatalogReconciliationRecord[] {
    return this.list().filter((record) => record.scanState === "scanning");
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    this.database.exec(SCHEMA_SQL);
    this.schemaReady = true;
  }

  private immediateTransaction<T>(operation: () => T): T {
    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const result = operation();
      this.database.exec("commit;");
      return result;
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  private readWithinTransaction(connectionId: ProviderConnectionId): CatalogReconciliationRecord | null {
    const row = this.get(SQL.read, [connectionId]);
    return row ? rowToRecord(row) : null;
  }

  private requireRecord(connectionId: ProviderConnectionId): CatalogReconciliationRecord {
    return this.readWithinTransaction(connectionId) ?? throwContractError();
  }

  private replace(record: CatalogReconciliationRecord): void {
    if (!isCatalogReconciliationRecord(record)) throwContractError();
    this.run(SQL.replace, [
      record.connectionId,
      record.reconciliationVersion,
      record.scanState,
      record.trigger,
      record.attemptId,
      record.claimedAt,
      record.settledAt,
      record.settledOutcome,
      record.modelCount,
      record.outcomeCode,
      record.safeOutcomeMessage,
      record.diagnosticId,
    ]);
  }

  private get(sql: string, values: SqliteValue[]): Record<string, unknown> | null {
    this.ensureSchema();
    return (this.database.prepare(sql).get(...values) as Record<string, unknown> | undefined) ?? null;
  }

  private all(sql: string, values: SqliteValue[]): Record<string, unknown>[] {
    this.ensureSchema();
    return this.database.prepare(sql).all(...values) as Record<string, unknown>[];
  }

  private run(sql: string, values: SqliteValue[]): void {
    this.ensureSchema();
    this.database.prepare(sql).run(...values);
  }
}

function adoptionRecord(input: AdoptCatalogLegacyEvidenceInput): CatalogReconciliationRecord {
  return {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId: input.connectionId,
    reconciliationVersion: input.reconciliationVersion,
    scanState: input.settledOutcome,
    trigger: "startup_reconciliation",
    attemptId: input.attemptId,
    claimedAt: input.claimedAt,
    settledAt: input.settledAt,
    settledOutcome: input.settledOutcome,
    modelCount: input.modelCount,
    outcomeCode: "legacy_evidence_adopted",
    safeOutcomeMessage: input.safeOutcomeMessage,
    diagnosticId: input.diagnosticId,
  };
}

function rowToRecord(row: Record<string, unknown>): CatalogReconciliationRecord {
  const record: CatalogReconciliationRecord = {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId: row.connection_id as ProviderConnectionId,
    reconciliationVersion: row.reconciliation_version as number,
    scanState: row.scan_state as CatalogReconciliationRecord["scanState"],
    trigger: row.trigger as CatalogReconciliationRecord["trigger"],
    attemptId: row.attempt_id as string | null,
    claimedAt: row.claimed_at as string | null,
    settledAt: row.settled_at as string | null,
    settledOutcome: row.settled_outcome as CatalogReconciliationRecord["settledOutcome"],
    modelCount: row.model_count as number | null,
    outcomeCode: row.outcome_code as CatalogReconciliationRecord["outcomeCode"],
    safeOutcomeMessage: row.safe_outcome_message as string | null,
    diagnosticId: row.diagnostic_id as string | null,
  };
  if (!isCatalogReconciliationRecord(record)) throwContractError();
  return record;
}

function isSettled(record: CatalogReconciliationRecord): boolean {
  return record.scanState === "available" || record.scanState === "empty" || record.scanState === "failed";
}

function assertConnectionId(value: unknown): asserts value is ProviderConnectionId {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CATALOG_RECONCILIATION_TEXT_LENGTH) {
    throwContractError();
  }
}

function compareByConnectionId(left: CatalogReconciliationRecord, right: CatalogReconciliationRecord): number {
  return left.connectionId < right.connectionId ? -1 : left.connectionId > right.connectionId ? 1 : 0;
}

function throwContractError(): never {
  throw new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT);
}
