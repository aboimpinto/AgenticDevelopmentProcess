import type { CatalogScanOutcome } from "./model-catalog.js";
import type { ProviderConnectionId, ProviderConnectionKind } from "./provider-connections.js";

export type CatalogReconciliationSchemaVersion = "catalog-reconciliation/v1";
export type CatalogScanState = "never_scanned" | "scanning" | "available" | "empty" | "failed";
export type CatalogScanTrigger =
  | "startup_reconciliation"
  | "connection_created"
  | "material_connection_change"
  | "connection_reactivated"
  | "credential_changed"
  | "individual_retry"
  | "scan_active";
export type CatalogSettledOutcome = "available" | "empty" | "failed";
export type CatalogReconciliationOutcomeCode =
  | CatalogScanOutcome
  | "interrupted_scan"
  | "coordinator_failure"
  | "legacy_evidence_adopted";
export type CatalogClaimMode = "eligible_only" | "force_settled";
export type CatalogGuidanceCode =
  | "scan_not_started"
  | "scan_in_progress"
  | "models_available"
  | "no_models_returned"
  | "scan_failed";

export const CATALOG_RECONCILIATION_SCHEMA_VERSION: CatalogReconciliationSchemaVersion =
  "catalog-reconciliation/v1";
export const CATALOG_RECONCILIATION_TARGET_VERSION = 2;
export const MAX_CATALOG_RECONCILIATION_TEXT_LENGTH = 10_000;
export const INVALID_CATALOG_RECONCILIATION_CONTRACT =
  "Invalid catalog reconciliation contract.";

export interface CatalogReconciliationRecord {
  readonly schemaVersion: CatalogReconciliationSchemaVersion;
  readonly connectionId: ProviderConnectionId;
  readonly reconciliationVersion: number;
  readonly scanState: CatalogScanState;
  readonly trigger: CatalogScanTrigger | null;
  readonly attemptId: string | null;
  readonly claimedAt: string | null;
  readonly settledAt: string | null;
  readonly settledOutcome: CatalogSettledOutcome | null;
  readonly modelCount: number | null;
  readonly outcomeCode: CatalogReconciliationOutcomeCode | null;
  readonly safeOutcomeMessage: string | null;
  readonly diagnosticId: string | null;
}

export interface ActiveCatalogConnectionState {
  readonly schemaVersion: CatalogReconciliationSchemaVersion;
  readonly connectionId: ProviderConnectionId;
  readonly label: string;
  readonly providerKind: ProviderConnectionKind;
  readonly lifecycleActive: true;
  readonly scanState: CatalogScanState;
  readonly trigger: CatalogScanTrigger | null;
  readonly attemptId: string | null;
  readonly modelCount: number | null;
  readonly claimedAt: string | null;
  readonly settledAt: string | null;
  readonly outcomeCode: CatalogReconciliationOutcomeCode | null;
  readonly safeMessage: string | null;
  readonly diagnosticId: string | null;
  readonly diagnosticOccurredAt: string | null;
  readonly guidanceCode: CatalogGuidanceCode;
}

export interface CatalogConnectionStatesResponse {
  readonly schemaVersion: CatalogReconciliationSchemaVersion;
  readonly connections: readonly ActiveCatalogConnectionState[];
}

export interface CatalogConnectionStateResponse {
  readonly schemaVersion: CatalogReconciliationSchemaVersion;
  readonly connection: ActiveCatalogConnectionState;
}

export interface InitializeCatalogReconciliationInput {
  readonly connectionId: ProviderConnectionId;
  readonly reconciliationVersion: number;
}

export interface AdoptCatalogLegacyEvidenceInput {
  readonly connectionId: ProviderConnectionId;
  readonly reconciliationVersion: number;
  readonly attemptId: string;
  readonly claimedAt: string;
  readonly settledAt: string;
  readonly settledOutcome: CatalogSettledOutcome;
  readonly modelCount: number;
  readonly safeOutcomeMessage: string;
  readonly diagnosticId: string | null;
}

export interface ClaimCatalogScanAttemptInput {
  readonly connectionId: ProviderConnectionId;
  readonly reconciliationVersion: number;
  readonly trigger: CatalogScanTrigger;
  readonly attemptId: string;
  readonly claimedAt: string;
  readonly mode: CatalogClaimMode;
}

export type ClaimCatalogScanAttemptResult =
  | { readonly kind: "claimed"; readonly record: CatalogReconciliationRecord }
  | { readonly kind: "already_scanning"; readonly record: CatalogReconciliationRecord }
  | { readonly kind: "settled_for_version"; readonly record: CatalogReconciliationRecord };

export interface SettleCatalogScanAttemptInput {
  readonly connectionId: ProviderConnectionId;
  readonly reconciliationVersion: number;
  readonly attemptId: string;
  readonly settledAt: string;
  readonly settledOutcome: CatalogSettledOutcome;
  readonly modelCount: number;
  readonly outcomeCode: Exclude<CatalogReconciliationOutcomeCode, "legacy_evidence_adopted">;
  readonly safeOutcomeMessage: string;
  readonly diagnosticId: string;
}

const recordKeys = [
  "schemaVersion", "connectionId", "reconciliationVersion", "scanState", "trigger", "attemptId",
  "claimedAt", "settledAt", "settledOutcome", "modelCount", "outcomeCode",
  "safeOutcomeMessage", "diagnosticId",
] as const;
const stateKeys = [
  "schemaVersion", "connectionId", "label", "providerKind", "lifecycleActive", "scanState",
  "trigger", "attemptId", "modelCount", "claimedAt", "settledAt", "outcomeCode", "safeMessage",
  "diagnosticId", "diagnosticOccurredAt", "guidanceCode",
] as const;
const stateCollectionResponseKeys = ["schemaVersion", "connections"] as const;
const stateResponseKeys = ["schemaVersion", "connection"] as const;
const initializeKeys = ["connectionId", "reconciliationVersion"] as const;
const adoptionKeys = [
  "connectionId", "reconciliationVersion", "attemptId", "claimedAt", "settledAt", "settledOutcome",
  "modelCount", "safeOutcomeMessage", "diagnosticId",
] as const;
const claimKeys = [
  "connectionId", "reconciliationVersion", "trigger", "attemptId", "claimedAt", "mode",
] as const;
const settlementKeys = [
  "connectionId", "reconciliationVersion", "attemptId", "settledAt", "settledOutcome", "modelCount",
  "outcomeCode", "safeOutcomeMessage", "diagnosticId",
] as const;

const scanStates: readonly CatalogScanState[] = ["never_scanned", "scanning", "available", "empty", "failed"];
const triggers: readonly CatalogScanTrigger[] = [
  "startup_reconciliation", "connection_created", "material_connection_change", "connection_reactivated",
  "credential_changed", "individual_retry", "scan_active",
];
const settledOutcomes: readonly CatalogSettledOutcome[] = ["available", "empty", "failed"];
const catalogOutcomeCodes: readonly CatalogScanOutcome[] = [
  "success", "unavailable", "authentication_failed", "timeout", "redirect_rejected", "malformed_response",
  "normalization_failed", "vault_unavailable", "not_scannable", "process_failed",
];
const additionalOutcomeCodes = ["interrupted_scan", "coordinator_failure", "legacy_evidence_adopted"] as const;
const providerKinds: readonly ProviderConnectionKind[] = ["custom", "known", "pi_session"];
const claimModes: readonly CatalogClaimMode[] = ["eligible_only", "force_settled"];
const guidanceByState: Readonly<Record<CatalogScanState, CatalogGuidanceCode>> = {
  never_scanned: "scan_not_started",
  scanning: "scan_in_progress",
  available: "models_available",
  empty: "no_models_returned",
  failed: "scan_failed",
};

/** Guards the complete closed ledger record, including legal state/nullability combinations. */
export function isCatalogReconciliationRecord(value: unknown): value is CatalogReconciliationRecord {
  if (!hasExactKeys(value, recordKeys)) return false;
  if (value.schemaVersion !== CATALOG_RECONCILIATION_SCHEMA_VERSION
    || !isBoundedId(value.connectionId)
    || !isPositiveInteger(value.reconciliationVersion)
    || !isOneOf(value.scanState, scanStates)
    || !isNullableOneOf(value.trigger, triggers)
    || !isNullableBoundedString(value.attemptId)
    || !isNullableCanonicalIso(value.claimedAt)
    || !isNullableCanonicalIso(value.settledAt)
    || !isNullableOneOf(value.settledOutcome, settledOutcomes)
    || !isNullableNonNegativeInteger(value.modelCount)
    || !isNullableOutcomeCode(value.outcomeCode)
    || !isNullableBoundedString(value.safeOutcomeMessage)
    || !isNullableBoundedString(value.diagnosticId)) return false;

  if (value.scanState === "never_scanned") {
    return allNull(value.trigger, value.attemptId, value.claimedAt, value.settledAt, value.settledOutcome,
      value.modelCount, value.outcomeCode, value.safeOutcomeMessage, value.diagnosticId);
  }
  if (value.trigger === null || value.attemptId === null || value.claimedAt === null) return false;
  if (value.scanState === "scanning") {
    return allNull(value.settledAt, value.settledOutcome, value.modelCount, value.outcomeCode,
      value.safeOutcomeMessage, value.diagnosticId);
  }
  if (value.settledAt === null || value.settledOutcome !== value.scanState || value.modelCount === null
    || value.outcomeCode === null || value.safeOutcomeMessage === null
    || Date.parse(value.settledAt) < Date.parse(value.claimedAt)) return false;
  if (value.outcomeCode === "legacy_evidence_adopted"
    && (value.trigger !== "startup_reconciliation" || value.claimedAt !== value.settledAt)) return false;
  if (!outcomeMatchesState(value.scanState, value.modelCount, value.outcomeCode)) return false;
  return value.diagnosticId !== null
    || (value.scanState === "available" && value.outcomeCode === "legacy_evidence_adopted");
}

/** Guards the secret-safe public state DTO and its state-specific guidance/nullability. */
export function isActiveCatalogConnectionState(value: unknown): value is ActiveCatalogConnectionState {
  if (!hasExactKeys(value, stateKeys)) return false;
  if (value.schemaVersion !== CATALOG_RECONCILIATION_SCHEMA_VERSION
    || !isBoundedId(value.connectionId)
    || !isBoundedString(value.label)
    || !isOneOf(value.providerKind, providerKinds)
    || value.lifecycleActive !== true
    || !isOneOf(value.scanState, scanStates)
    || value.guidanceCode !== guidanceByState[value.scanState]
    || !isNullableOneOf(value.trigger, triggers)
    || !isNullableBoundedString(value.attemptId)
    || !isNullableNonNegativeInteger(value.modelCount)
    || !isNullableCanonicalIso(value.claimedAt)
    || !isNullableCanonicalIso(value.settledAt)
    || !isNullableOutcomeCode(value.outcomeCode)
    || !isNullableBoundedString(value.safeMessage)
    || !isNullableBoundedString(value.diagnosticId)
    || !isNullableCanonicalIso(value.diagnosticOccurredAt)) return false;

  const asRecord: CatalogReconciliationRecord = {
    schemaVersion: value.schemaVersion,
    connectionId: value.connectionId,
    reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
    scanState: value.scanState,
    trigger: value.trigger,
    attemptId: value.attemptId,
    claimedAt: value.claimedAt,
    settledAt: value.settledAt,
    settledOutcome: value.scanState === "available" || value.scanState === "empty" || value.scanState === "failed"
      ? value.scanState : null,
    modelCount: value.modelCount,
    outcomeCode: value.outcomeCode,
    safeOutcomeMessage: value.safeMessage,
    diagnosticId: value.diagnosticId,
  };
  if (!isCatalogReconciliationRecord(asRecord)) return false;
  return (value.diagnosticId === null) === (value.diagnosticOccurredAt === null);
}

/** Guards the exact public active-connection state collection and its stable unique order. */
export function isCatalogConnectionStatesResponse(value: unknown): value is CatalogConnectionStatesResponse {
  if (!hasExactKeys(value, stateCollectionResponseKeys)
    || value.schemaVersion !== CATALOG_RECONCILIATION_SCHEMA_VERSION
    || !Array.isArray(value.connections)
    || !value.connections.every(isActiveCatalogConnectionState)) return false;
  const identities = value.connections.map((connection) => connection.connectionId);
  return new Set(identities).size === identities.length
    && identities.every((identity, index) => index === 0 || identities[index - 1] < identity);
}

/** Guards the exact selected-connection retry response before any client dereference. */
export function isCatalogConnectionStateResponse(value: unknown): value is CatalogConnectionStateResponse {
  return hasExactKeys(value, stateResponseKeys)
    && value.schemaVersion === CATALOG_RECONCILIATION_SCHEMA_VERSION
    && isActiveCatalogConnectionState(value.connection);
}

export function isInitializeCatalogReconciliationInput(value: unknown): value is InitializeCatalogReconciliationInput {
  return hasExactKeys(value, initializeKeys)
    && isBoundedId(value.connectionId)
    && value.reconciliationVersion === CATALOG_RECONCILIATION_TARGET_VERSION;
}

export function isAdoptCatalogLegacyEvidenceInput(value: unknown): value is AdoptCatalogLegacyEvidenceInput {
  if (!hasExactKeys(value, adoptionKeys)
    || !isBoundedId(value.connectionId)
    || value.reconciliationVersion !== CATALOG_RECONCILIATION_TARGET_VERSION
    || !isBoundedString(value.attemptId)
    || !isCanonicalIsoTimestamp(value.claimedAt)
    || !isCanonicalIsoTimestamp(value.settledAt)
    || value.claimedAt !== value.settledAt
    || !isOneOf(value.settledOutcome, settledOutcomes)
    || !isNonNegativeInteger(value.modelCount)
    || !isBoundedString(value.safeOutcomeMessage)
    || !isNullableBoundedString(value.diagnosticId)) return false;
  const record = legacyAdoptionRecord(value as unknown as AdoptCatalogLegacyEvidenceInput);
  return isCatalogReconciliationRecord(record);
}

export function isClaimCatalogScanAttemptInput(value: unknown): value is ClaimCatalogScanAttemptInput {
  return hasExactKeys(value, claimKeys)
    && isBoundedId(value.connectionId)
    && isPositiveInteger(value.reconciliationVersion)
    && isOneOf(value.trigger, triggers)
    && isBoundedString(value.attemptId)
    && isCanonicalIsoTimestamp(value.claimedAt)
    && isOneOf(value.mode, claimModes);
}

export function isSettleCatalogScanAttemptInput(value: unknown): value is SettleCatalogScanAttemptInput {
  if (!hasExactKeys(value, settlementKeys)
    || !isBoundedId(value.connectionId)
    || !isPositiveInteger(value.reconciliationVersion)
    || !isBoundedString(value.attemptId)
    || !isCanonicalIsoTimestamp(value.settledAt)
    || !isOneOf(value.settledOutcome, settledOutcomes)
    || !isNonNegativeInteger(value.modelCount)
    || !isOutcomeCode(value.outcomeCode)
    || value.outcomeCode === "legacy_evidence_adopted"
    || !isBoundedString(value.safeOutcomeMessage)
    || !isBoundedString(value.diagnosticId)) return false;
  return outcomeMatchesState(value.settledOutcome, value.modelCount, value.outcomeCode);
}

function legacyAdoptionRecord(value: AdoptCatalogLegacyEvidenceInput): CatalogReconciliationRecord {
  return {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId: value.connectionId,
    reconciliationVersion: value.reconciliationVersion,
    scanState: value.settledOutcome,
    trigger: "startup_reconciliation",
    attemptId: value.attemptId,
    claimedAt: value.claimedAt,
    settledAt: value.settledAt,
    settledOutcome: value.settledOutcome,
    modelCount: value.modelCount,
    outcomeCode: "legacy_evidence_adopted",
    safeOutcomeMessage: value.safeOutcomeMessage,
    diagnosticId: value.diagnosticId,
  };
}

function outcomeMatchesState(
  state: CatalogSettledOutcome,
  modelCount: number,
  outcomeCode: CatalogReconciliationOutcomeCode,
): boolean {
  if (state === "available") {
    return modelCount > 0 && (outcomeCode === "success" || outcomeCode === "legacy_evidence_adopted");
  }
  if (state === "empty") {
    return modelCount === 0 && (outcomeCode === "success" || outcomeCode === "legacy_evidence_adopted");
  }
  return modelCount === 0 && outcomeCode !== "success";
}

function hasExactKeys<const T extends readonly string[]>(
  value: unknown,
  expected: T,
): value is Record<T[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isBoundedId(value: unknown): value is ProviderConnectionId {
  return isBoundedString(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CATALOG_RECONCILIATION_TEXT_LENGTH;
}

function isNullableBoundedString(value: unknown): value is string | null {
  return value === null || isBoundedString(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNullableCanonicalIso(value: unknown): value is string | null {
  return value === null || isCanonicalIsoTimestamp(value);
}

function isOutcomeCode(value: unknown): value is CatalogReconciliationOutcomeCode {
  return isOneOf(value, catalogOutcomeCodes) || isOneOf(value, additionalOutcomeCodes);
}

function isNullableOutcomeCode(value: unknown): value is CatalogReconciliationOutcomeCode | null {
  return value === null || isOutcomeCode(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isNullableOneOf<T extends string>(value: unknown, values: readonly T[]): value is T | null {
  return value === null || isOneOf(value, values);
}

function allNull(...values: readonly unknown[]): boolean {
  return values.every((value) => value === null);
}
