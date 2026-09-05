import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CATALOG_DIAGNOSTIC_RETENTION_LIMIT,
  MAX_CATALOG_MODEL_ID_LENGTH,
  MAX_CATALOG_PRICE_PER_MILLION_USD,
  MAX_CATALOG_TEXT_LENGTH,
  MAX_CATALOG_TOKEN_LIMIT,
  isCatalogModelRecord,
  isCatalogScanDiagnostic,
  isCatalogStoreScanOutcome,
  type CatalogModelRecord,
  type CatalogScanDiagnostic,
  type CatalogStoreScanOutcome,
  type ProviderConnectionId,
} from "@hepha/shared";

const MODEL_CATALOG_SCHEMA_SQL = `
create table if not exists catalog_models (
  connection_id text not null,
  model_id text not null,
  provider_kind text not null,
  provider_label text not null,
  display_name text,
  description text,
  context_window_tokens integer,
  max_output_tokens integer,
  input_modalities_json text not null,
  reasoning integer,
  tools integer,
  api integer,
  pricing_present integer not null check (pricing_present in (0, 1)),
  input_per_million_usd real,
  output_per_million_usd real,
  pricing_currency text,
  last_successful_scan_at text not null,
  primary key (connection_id, model_id)
);

create index if not exists idx_catalog_models_identity
  on catalog_models (connection_id, model_id);

create table if not exists catalog_scan_diagnostics (
  diagnostic_id text primary key,
  connection_id text not null,
  scan_correlation_id text not null,
  outcome text not null,
  safe_message text not null,
  http_status_code integer,
  occurred_at text not null
);

create index if not exists idx_catalog_scan_diagnostics_lookup
  on catalog_scan_diagnostics (connection_id, occurred_at desc, diagnostic_id desc);
`;

const SQL = {
  deleteModelsForConnection: "delete from catalog_models where connection_id = ?",
  insertModel: `
    insert into catalog_models (
      connection_id, model_id, provider_kind, provider_label, display_name, description,
      context_window_tokens, max_output_tokens, input_modalities_json, reasoning, tools,
      api, pricing_present, input_per_million_usd, output_per_million_usd, pricing_currency, last_successful_scan_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  insertDiagnostic: `
    insert into catalog_scan_diagnostics (
      diagnostic_id, connection_id, scan_correlation_id, outcome, safe_message,
      http_status_code, occurred_at
    ) values (?, ?, ?, ?, ?, ?, ?)
  `,
  deleteOldDiagnostics: `
    delete from catalog_scan_diagnostics
    where diagnostic_id in (
      select diagnostic_id from catalog_scan_diagnostics
      where connection_id = ?
      order by occurred_at desc, diagnostic_id desc
      limit -1 offset ?
    )
  `,
  listModels: "select * from catalog_models order by connection_id asc, model_id asc",
  listModelsForConnection: "select * from catalog_models where connection_id = ? order by connection_id asc, model_id asc",
  listDiagnostics: `
    select * from catalog_scan_diagnostics
    where connection_id = ?
    order by occurred_at desc, diagnostic_id desc
    limit ?
  `,
  readDiagnosticById: "select * from catalog_scan_diagnostics where diagnostic_id = ?",
} as const;

type SqliteValue = string | number | null;

/**
 * Owns only catalog snapshots and safe scan diagnostics.
 * A scan outcome replaces exactly one connection's model snapshot atomically.
 */
export class ModelCatalogStore {
  private readonly database: DatabaseSync;
  private schemaReady = false;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma busy_timeout = 5000;");
    if (databasePath !== ":memory:") this.database.exec("pragma journal_mode = WAL;");
  }

  static createInMemory(): ModelCatalogStore {
    return new ModelCatalogStore(":memory:");
  }

  close(): void {
    this.database.close();
  }

  /**
   * Replaces one connection snapshot and records exactly one safe diagnostic.
   * Validation happens before the transaction so invalid input cannot clear a snapshot.
   */
  applyScanOutcome(outcome: CatalogStoreScanOutcome): void {
    if (!isCatalogStoreScanOutcome(outcome)) {
      throw new Error("Invalid catalog scan outcome.");
    }

    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      this.run(SQL.deleteModelsForConnection, [outcome.connectionId]);
      for (const model of outcome.models) this.insertModel(model);
      this.insertDiagnostic(outcome.diagnostic);
      this.run(SQL.deleteOldDiagnostics, [outcome.connectionId, CATALOG_DIAGNOSTIC_RETENTION_LIMIT]);
      this.database.exec("commit;");
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  /** Clears one snapshot and inserts or verifies one deterministic failure diagnostic atomically. */
  applyIdempotentFailureOutcome(outcome: CatalogStoreScanOutcome): void {
    if (!isCatalogStoreScanOutcome(outcome)
      || outcome.models.length !== 0
      || outcome.diagnostic.outcome === "success") {
      throw new Error("Invalid idempotent catalog failure outcome.");
    }

    this.ensureSchema();
    this.database.exec("begin immediate;");
    try {
      const existingRow = this.database.prepare(SQL.readDiagnosticById)
        .get(outcome.diagnostic.diagnosticId) as Record<string, unknown> | undefined;
      if (existingRow) {
        const existing = rowToCatalogDiagnostic(existingRow);
        if (!sameDiagnostic(existing, outcome.diagnostic)) {
          throw new Error("Catalog diagnostic identity collision.");
        }
      }
      this.run(SQL.deleteModelsForConnection, [outcome.connectionId]);
      if (!existingRow) this.insertDiagnostic(outcome.diagnostic);
      this.run(SQL.deleteOldDiagnostics, [outcome.connectionId, CATALOG_DIAGNOSTIC_RETENTION_LIMIT]);
      this.database.exec("commit;");
    } catch (error) {
      this.database.exec("rollback;");
      throw error;
    }
  }

  listModels(): CatalogModelRecord[] {
    return this.all(SQL.listModels, []).map(rowToCatalogModel);
  }

  listModelsForConnection(connectionId: ProviderConnectionId): CatalogModelRecord[] {
    return this.all(SQL.listModelsForConnection, [connectionId]).map(rowToCatalogModel);
  }

  listDiagnostics(connectionId: ProviderConnectionId, limit = CATALOG_DIAGNOSTIC_RETENTION_LIMIT): CatalogScanDiagnostic[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > CATALOG_DIAGNOSTIC_RETENTION_LIMIT) {
      throw new Error("Catalog diagnostic limit must be an integer from 1 to 20.");
    }
    return this.all(SQL.listDiagnostics, [connectionId, limit]).map(rowToCatalogDiagnostic);
  }

  private ensureSchema(): void {
    if (this.schemaReady) return;
    if (this.catalogModelsNeedRecreation()) {
      this.database.exec("begin immediate;");
      try {
        this.database.exec("drop table catalog_models;");
        this.database.exec(MODEL_CATALOG_SCHEMA_SQL);
        this.database.exec("commit;");
      } catch (error) {
        this.database.exec("rollback;");
        throw error;
      }
    } else {
      this.database.exec(MODEL_CATALOG_SCHEMA_SQL);
    }
    this.schemaReady = true;
  }

  private catalogModelsNeedRecreation(): boolean {
    const rows = this.database.prepare("pragma table_info(catalog_models)").all() as Record<string, unknown>[];
    if (rows.length === 0) return false;
    return !rows.some((row) => row.name === "pricing_present");
  }

  private insertModel(model: CatalogModelRecord): void {
    const pricing = model.pricing;
    this.run(SQL.insertModel, [
      model.identity.connectionId,
      model.identity.modelId,
      model.providerKind,
      model.providerLabel,
      model.displayName,
      model.description,
      model.contextWindowTokens,
      model.maxOutputTokens,
      JSON.stringify(model.inputModalities),
      booleanToSql(model.capabilities.reasoning),
      booleanToSql(model.capabilities.tools),
      booleanToSql(model.capabilities.api),
      pricing === null ? 0 : 1,
      pricing?.inputPerMillionUsd ?? null,
      pricing?.outputPerMillionUsd ?? null,
      pricing?.currency ?? null,
      model.lastSuccessfulScanAt,
    ]);
  }

  private insertDiagnostic(diagnostic: CatalogScanDiagnostic): void {
    this.run(SQL.insertDiagnostic, [
      diagnostic.diagnosticId,
      diagnostic.connectionId,
      diagnostic.scanCorrelationId,
      diagnostic.outcome,
      diagnostic.safeMessage,
      diagnostic.httpStatusCode,
      diagnostic.occurredAt,
    ]);
  }

  private all(sql: string, values: SqliteValue[]): Record<string, unknown>[] {
    this.ensureSchema();
    return this.database.prepare(sql).all(...values) as Record<string, unknown>[];
  }

  private run(sql: string, values: SqliteValue[]): void {
    this.database.prepare(sql).run(...values);
  }
}

const providerKinds = ["custom", "known", "pi_session"] as const;
const scanOutcomes = [
  "authentication_failed", "malformed_response", "normalization_failed", "not_scannable", "process_failed",
  "redirect_rejected", "success", "timeout", "unavailable", "vault_unavailable",
] as const;

function rowToCatalogModel(row: Record<string, unknown>): CatalogModelRecord {
  const connectionId = requiredString(row.connection_id, MAX_CATALOG_TEXT_LENGTH);
  const modelId = requiredString(row.model_id, MAX_CATALOG_MODEL_ID_LENGTH);
  const providerKind = requiredProviderKind(row.provider_kind);
  const providerLabel = requiredString(row.provider_label, MAX_CATALOG_TEXT_LENGTH);
  const displayName = nullableString(row.display_name);
  const description = nullableString(row.description);
  const contextWindowTokens = nullableLimit(row.context_window_tokens);
  const maxOutputTokens = nullableLimit(row.max_output_tokens);
  const inputModalities = parseInputModalities(row.input_modalities_json);
  const reasoning = nullableBoolean(row.reasoning);
  const tools = nullableBoolean(row.tools);
  const api = nullableBoolean(row.api);
  const pricing = pricingFromRow(row);
  const lastSuccessfulScanAt = canonicalIsoTimestamp(row.last_successful_scan_at);

  const model: CatalogModelRecord = {
    schemaVersion: "model-catalog/v1",
    identity: { connectionId: connectionId as ProviderConnectionId, modelId },
    providerKind,
    providerLabel,
    displayName,
    description,
    contextWindowTokens,
    maxOutputTokens,
    inputModalities,
    capabilities: { reasoning, tools, api },
    pricing,
    availability: "available",
    lastSuccessfulScanAt,
  };
  if (!isCatalogModelRecord(model)) throwStoredContractError();
  return model;
}

function rowToCatalogDiagnostic(row: Record<string, unknown>): CatalogScanDiagnostic {
  const diagnosticId = requiredString(row.diagnostic_id, MAX_CATALOG_TEXT_LENGTH);
  const connectionId = requiredString(row.connection_id, MAX_CATALOG_TEXT_LENGTH);
  const scanCorrelationId = requiredString(row.scan_correlation_id, MAX_CATALOG_TEXT_LENGTH);
  const outcome = requiredScanOutcome(row.outcome);
  const safeMessage = requiredString(row.safe_message, MAX_CATALOG_TEXT_LENGTH);
  const httpStatusCode = nullableHttpStatusCode(row.http_status_code);
  const occurredAt = canonicalIsoTimestamp(row.occurred_at);

  const diagnostic: CatalogScanDiagnostic = {
    schemaVersion: "model-catalog/v1",
    diagnosticId,
    connectionId: connectionId as ProviderConnectionId,
    scanCorrelationId,
    outcome,
    safeMessage,
    httpStatusCode,
    occurredAt,
  };
  if (!isCatalogScanDiagnostic(diagnostic)) throwStoredContractError();
  return diagnostic;
}

function pricingFromRow(row: Record<string, unknown>): CatalogModelRecord["pricing"] {
  const presence = row.pricing_present;
  if (presence === 0) {
    if (row.input_per_million_usd !== null || row.output_per_million_usd !== null || row.pricing_currency !== null) {
      throwStoredContractError();
    }
    return null;
  }
  if (presence !== 1) throwStoredContractError();
  return {
    inputPerMillionUsd: nullablePrice(row.input_per_million_usd),
    outputPerMillionUsd: nullablePrice(row.output_per_million_usd),
    currency: nullableCurrency(row.pricing_currency),
  };
}

function parseInputModalities(value: unknown): CatalogModelRecord["inputModalities"] {
  if (typeof value !== "string") throwStoredContractError();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throwStoredContractError();
    return parsed as CatalogModelRecord["inputModalities"];
  } catch {
    throwStoredContractError();
  }
}

function requiredString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throwStoredContractError();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return requiredString(value, MAX_CATALOG_TEXT_LENGTH);
}

function nullableLimit(value: unknown): number | null {
  if (value === null) return null;
  return finiteNonNegative(value, MAX_CATALOG_TOKEN_LIMIT);
}

function nullablePrice(value: unknown): number | null {
  if (value === null) return null;
  return finiteNonNegative(value, MAX_CATALOG_PRICE_PER_MILLION_USD);
}

function finiteNonNegative(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) throwStoredContractError();
  return value;
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null) return null;
  if (value === 0) return false;
  if (value === 1) return true;
  throwStoredContractError();
}

function nullableCurrency(value: unknown): "USD" | null {
  if (value === null) return null;
  if (value === "USD") return "USD";
  throwStoredContractError();
}

function nullableHttpStatusCode(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) throwStoredContractError();
  return value;
}

function requiredProviderKind(value: unknown): CatalogModelRecord["providerKind"] {
  if (typeof value !== "string" || !providerKinds.includes(value as CatalogModelRecord["providerKind"])) throwStoredContractError();
  return value as CatalogModelRecord["providerKind"];
}

function requiredScanOutcome(value: unknown): CatalogScanDiagnostic["outcome"] {
  if (typeof value !== "string" || !scanOutcomes.includes(value as CatalogScanDiagnostic["outcome"])) throwStoredContractError();
  return value as CatalogScanDiagnostic["outcome"];
}

function canonicalIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") throwStoredContractError();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throwStoredContractError();
  return value;
}

function throwStoredContractError(): never {
  throw new Error("Stored catalog contract is invalid.");
}

function sameDiagnostic(left: CatalogScanDiagnostic, right: CatalogScanDiagnostic): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.diagnosticId === right.diagnosticId
    && left.connectionId === right.connectionId
    && left.scanCorrelationId === right.scanCorrelationId
    && left.outcome === right.outcome
    && left.safeMessage === right.safeMessage
    && left.httpStatusCode === right.httpStatusCode
    && left.occurredAt === right.occurredAt;
}

function booleanToSql(value: boolean | null): number | null {
  return value === null ? null : value ? 1 : 0;
}
