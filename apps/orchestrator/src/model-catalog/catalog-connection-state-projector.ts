import {
  CATALOG_RECONCILIATION_SCHEMA_VERSION,
  CATALOG_RECONCILIATION_TARGET_VERSION,
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  MAX_CATALOG_RECONCILIATION_TEXT_LENGTH,
  isActiveCatalogConnectionState,
  isCatalogReconciliationRecord,
  isCatalogScanDiagnostic,
  type ActiveCatalogConnectionState,
  type CatalogReconciliationRecord,
  type CatalogScanDiagnostic,
  type ConnectionLifecycleState,
  type ProviderConnectionId,
  type ProviderConnectionKind,
} from "@hepha/shared";

export interface CatalogConnectionProjectionSource {
  readonly connectionId: ProviderConnectionId;
  readonly label: string;
  readonly providerKind: ProviderConnectionKind;
  readonly lifecycleState: ConnectionLifecycleState;
}

export interface CatalogConnectionModelCount {
  readonly connectionId: ProviderConnectionId;
  readonly modelCount: number;
}

export interface CatalogConnectionStateProjectionInput {
  readonly connections: readonly CatalogConnectionProjectionSource[];
  readonly reconciliationRecords: readonly CatalogReconciliationRecord[];
  readonly modelCounts: readonly CatalogConnectionModelCount[];
  /** Only diagnostics referenced by the current settled ledger rows belong here. */
  readonly settledDiagnostics: readonly CatalogScanDiagnostic[];
}

const inputKeys = ["connections", "reconciliationRecords", "modelCounts", "settledDiagnostics"] as const;
const connectionKeys = ["connectionId", "label", "providerKind", "lifecycleState"] as const;
const modelCountKeys = ["connectionId", "modelCount"] as const;
const diagnosticKeys = [
  "schemaVersion", "diagnosticId", "connectionId", "scanCorrelationId", "outcome", "safeMessage",
  "httpStatusCode", "occurredAt",
] as const;
const providerKinds: readonly ProviderConnectionKind[] = ["custom", "known", "pi_session"];
const lifecycleStates: readonly ConnectionLifecycleState[] = ["active", "revoked", "deleted"];

/** Projects the only authoritative active-connection scan-state DTO from guarded server facts. */
export class CatalogConnectionStateProjector {
  project(input: unknown): ActiveCatalogConnectionState[] {
    if (!isProjectionInput(input)) throwContractError();

    const connections = new Map<string, CatalogConnectionProjectionSource>();
    const records = new Map<string, CatalogReconciliationRecord>();
    const counts = new Map<string, number>();
    const diagnosticsById = new Map<string, CatalogScanDiagnostic>();
    const diagnosticsByConnection = new Map<string, CatalogScanDiagnostic>();

    for (const connection of input.connections) addUnique(connections, connection.connectionId, connection);
    for (const record of input.reconciliationRecords) {
      requireKnownConnection(connections, record.connectionId);
      addUnique(records, record.connectionId, record);
    }
    for (const count of input.modelCounts) {
      requireKnownConnection(connections, count.connectionId);
      addUnique(counts, count.connectionId, count.modelCount);
    }
    for (const diagnostic of input.settledDiagnostics) {
      requireKnownConnection(connections, diagnostic.connectionId);
      addUnique(diagnosticsById, diagnostic.diagnosticId, diagnostic);
      addUnique(diagnosticsByConnection, diagnostic.connectionId, diagnostic);
    }

    if (counts.size !== connections.size) throwContractError();
    for (const connectionId of connections.keys()) {
      if (!counts.has(connectionId)) throwContractError();
    }
    for (const diagnostic of diagnosticsByConnection.values()) {
      const record = records.get(diagnostic.connectionId);
      if (!record || record.diagnosticId !== diagnostic.diagnosticId) throwContractError();
    }

    const projected: ActiveCatalogConnectionState[] = [];
    const orderedConnections = [...connections.values()].sort(compareConnections);
    for (const connection of orderedConnections) {
      if (connection.lifecycleState !== "active") continue;
      projected.push(projectConnection(
        connection,
        records.get(connection.connectionId) ?? null,
        counts.get(connection.connectionId)!,
        diagnosticsById,
      ));
    }
    return projected;
  }
}

function projectConnection(
  connection: CatalogConnectionProjectionSource,
  record: CatalogReconciliationRecord | null,
  currentModelCount: number,
  diagnosticsById: ReadonlyMap<string, CatalogScanDiagnostic>,
): ActiveCatalogConnectionState {
  const effectiveRecord = record ?? neverScannedRecord(connection.connectionId);
  const diagnostic = effectiveRecord.diagnosticId === null
    ? null
    : diagnosticsById.get(effectiveRecord.diagnosticId) ?? throwContractError();

  validateConsistentFacts(effectiveRecord, currentModelCount, diagnostic);

  const state: ActiveCatalogConnectionState = {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId: connection.connectionId,
    label: connection.label,
    providerKind: connection.providerKind,
    lifecycleActive: true,
    scanState: effectiveRecord.scanState,
    trigger: effectiveRecord.trigger,
    attemptId: effectiveRecord.attemptId,
    modelCount: effectiveRecord.modelCount,
    claimedAt: effectiveRecord.claimedAt,
    settledAt: effectiveRecord.settledAt,
    outcomeCode: effectiveRecord.outcomeCode,
    safeMessage: effectiveRecord.safeOutcomeMessage,
    diagnosticId: effectiveRecord.diagnosticId,
    diagnosticOccurredAt: diagnostic?.occurredAt ?? null,
    guidanceCode: guidanceCode(effectiveRecord.scanState),
  };
  if (!isActiveCatalogConnectionState(state)) throwContractError();
  return state;
}

function validateConsistentFacts(
  record: CatalogReconciliationRecord,
  currentModelCount: number,
  diagnostic: CatalogScanDiagnostic | null,
): void {
  if (record.scanState === "never_scanned") {
    if (currentModelCount !== 0 || diagnostic !== null) throwContractError();
    return;
  }
  if (record.scanState === "scanning") {
    if (diagnostic !== null) throwContractError();
    return;
  }
  if (record.scanState === "available") {
    if (record.modelCount !== currentModelCount || currentModelCount <= 0) throwContractError();
  } else if (currentModelCount !== 0 || record.modelCount !== 0) {
    throwContractError();
  }

  if (diagnostic === null) {
    if (!(record.scanState === "available" && record.outcomeCode === "legacy_evidence_adopted")) {
      throwContractError();
    }
    return;
  }
  if (record.attemptId === null || record.claimedAt === null || record.settledAt === null
    || diagnostic.connectionId !== record.connectionId
    || diagnostic.scanCorrelationId !== record.attemptId
    || diagnostic.safeMessage !== record.safeOutcomeMessage
    || (record.outcomeCode === "legacy_evidence_adopted"
      ? diagnostic.occurredAt !== record.claimedAt || diagnostic.occurredAt !== record.settledAt
      : Date.parse(diagnostic.occurredAt) < Date.parse(record.claimedAt)
        || Date.parse(diagnostic.occurredAt) > Date.parse(record.settledAt))
    || !diagnosticOutcomeMatches(record, diagnostic)) throwContractError();
}

function diagnosticOutcomeMatches(
  record: CatalogReconciliationRecord,
  diagnostic: CatalogScanDiagnostic,
): boolean {
  if (record.outcomeCode === "legacy_evidence_adopted") {
    return record.scanState === "failed" ? diagnostic.outcome !== "success" : diagnostic.outcome === "success";
  }
  if (record.outcomeCode === "interrupted_scan" || record.outcomeCode === "coordinator_failure") {
    return record.scanState === "failed" && diagnostic.outcome === "process_failed";
  }
  return diagnostic.outcome === record.outcomeCode;
}

function neverScannedRecord(connectionId: ProviderConnectionId): CatalogReconciliationRecord {
  return {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId,
    reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
    scanState: "never_scanned",
    trigger: null,
    attemptId: null,
    claimedAt: null,
    settledAt: null,
    settledOutcome: null,
    modelCount: null,
    outcomeCode: null,
    safeOutcomeMessage: null,
    diagnosticId: null,
  };
}

function isProjectionInput(value: unknown): value is CatalogConnectionStateProjectionInput {
  return hasExactKeys(value, inputKeys)
    && Array.isArray(value.connections)
    && value.connections.every(isProjectionConnection)
    && Array.isArray(value.reconciliationRecords)
    && value.reconciliationRecords.every(isCatalogReconciliationRecord)
    && Array.isArray(value.modelCounts)
    && value.modelCounts.every(isModelCount)
    && Array.isArray(value.settledDiagnostics)
    && value.settledDiagnostics.every(isExactCatalogScanDiagnostic);
}

function isProjectionConnection(value: unknown): value is CatalogConnectionProjectionSource {
  return hasExactKeys(value, connectionKeys)
    && isBoundedString(value.connectionId)
    && isBoundedString(value.label)
    && isOneOf(value.providerKind, providerKinds)
    && isOneOf(value.lifecycleState, lifecycleStates);
}

function isModelCount(value: unknown): value is CatalogConnectionModelCount {
  return hasExactKeys(value, modelCountKeys)
    && isBoundedString(value.connectionId)
    && typeof value.modelCount === "number"
    && Number.isSafeInteger(value.modelCount)
    && value.modelCount >= 0;
}

function isExactCatalogScanDiagnostic(value: unknown): value is CatalogScanDiagnostic {
  return hasExactKeys(value, diagnosticKeys) && isCatalogScanDiagnostic(value);
}

function guidanceCode(scanState: CatalogReconciliationRecord["scanState"]): ActiveCatalogConnectionState["guidanceCode"] {
  switch (scanState) {
    case "never_scanned": return "scan_not_started";
    case "scanning": return "scan_in_progress";
    case "available": return "models_available";
    case "empty": return "no_models_returned";
    case "failed": return "scan_failed";
  }
}

function addUnique<T>(target: Map<string, T>, key: string, value: T): void {
  if (target.has(key)) throwContractError();
  target.set(key, value);
}

function requireKnownConnection(
  connections: ReadonlyMap<string, CatalogConnectionProjectionSource>,
  connectionId: string,
): void {
  if (!connections.has(connectionId)) throwContractError();
}

function compareConnections(left: CatalogConnectionProjectionSource, right: CatalogConnectionProjectionSource): number {
  return left.connectionId < right.connectionId ? -1 : left.connectionId > right.connectionId ? 1 : 0;
}

function hasExactKeys<const T extends readonly string[]>(
  value: unknown,
  expected: T,
): value is Record<T[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CATALOG_RECONCILIATION_TEXT_LENGTH;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function throwContractError(): never {
  throw new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT);
}
