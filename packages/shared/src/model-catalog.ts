import type {
  ProviderConnectionId,
  ProviderConnectionKind,
} from "./provider-connections.js";

/** The only persisted catalog schema accepted by the current internal contract. */
export type CatalogSchemaVersion = "model-catalog/v1";
export type CatalogAvailability = "available";
export type CatalogInputModality = "text" | "image" | "audio" | "video" | "file";
export type CatalogScanOutcome =
  | "success"
  | "unavailable"
  | "authentication_failed"
  | "timeout"
  | "redirect_rejected"
  | "malformed_response"
  | "normalization_failed"
  | "vault_unavailable"
  | "not_scannable"
  | "process_failed";

export interface CatalogModelIdentity {
  readonly connectionId: ProviderConnectionId;
  readonly modelId: string;
}

/** The only connection facts the catalog normalizer is allowed to consume. */
export interface CatalogNormalizationConnection {
  readonly connectionId: ProviderConnectionId;
  readonly kind: ProviderConnectionKind;
  readonly label: string;
}

export interface CatalogModelCapabilities {
  readonly reasoning: boolean | null;
  readonly tools: boolean | null;
  readonly api: boolean | null;
}

export interface CatalogModelPricing {
  readonly inputPerMillionUsd: number | null;
  readonly outputPerMillionUsd: number | null;
  readonly currency: "USD" | null;
}

export interface CatalogModelRecord {
  readonly schemaVersion: CatalogSchemaVersion;
  readonly identity: CatalogModelIdentity;
  readonly providerKind: ProviderConnectionKind;
  readonly providerLabel: string;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly contextWindowTokens: number | null;
  readonly maxOutputTokens: number | null;
  readonly inputModalities: readonly CatalogInputModality[];
  readonly capabilities: CatalogModelCapabilities;
  readonly pricing: CatalogModelPricing | null;
  readonly availability: CatalogAvailability;
  readonly lastSuccessfulScanAt: string;
}

export interface CatalogScanDiagnostic {
  readonly schemaVersion: CatalogSchemaVersion;
  readonly diagnosticId: string;
  readonly connectionId: ProviderConnectionId;
  readonly scanCorrelationId: string;
  readonly outcome: CatalogScanOutcome;
  readonly safeMessage: string;
  readonly httpStatusCode: number | null;
  readonly occurredAt: string;
}

export interface CatalogScanResult {
  readonly connectionId: ProviderConnectionId;
  readonly scanCorrelationId: string;
  readonly outcome: CatalogScanOutcome;
  readonly modelCount: number;
  readonly diagnostic: CatalogScanDiagnostic;
}

/** A complete connection-scoped snapshot accepted by ModelCatalogStore. */
export interface CatalogStoreScanOutcome {
  readonly connectionId: ProviderConnectionId;
  readonly models: readonly CatalogModelRecord[];
  readonly diagnostic: CatalogScanDiagnostic;
}

export type CatalogNormalizationResult =
  | { readonly kind: "success"; readonly models: readonly CatalogModelRecord[] }
  | { readonly kind: "rejected"; readonly reason: CatalogNormalizationRejectionReason };

export type CatalogNormalizationRejectionReason =
  | "invalid_connection"
  | "invalid_scan_timestamp"
  | "invalid_payload"
  | "invalid_candidate"
  | "duplicate_identity";

export const MODEL_CATALOG_SCHEMA_VERSION: CatalogSchemaVersion = "model-catalog/v1";
export const CATALOG_DIAGNOSTIC_RETENTION_LIMIT = 20;
export const MAX_CATALOG_MODEL_ID_LENGTH = 512;
export const MAX_CATALOG_TEXT_LENGTH = 10_000;
export const MAX_CATALOG_TOKEN_LIMIT = 10_000_000;
export const MAX_CATALOG_PRICE_PER_MILLION_USD = 1_000_000;

const modalities: readonly CatalogInputModality[] = ["audio", "file", "image", "text", "video"];
const outcomes: readonly CatalogScanOutcome[] = [
  "authentication_failed",
  "malformed_response",
  "normalization_failed",
  "not_scannable",
  "process_failed",
  "redirect_rejected",
  "success",
  "timeout",
  "unavailable",
  "vault_unavailable",
];
const providerKinds: readonly ProviderConnectionKind[] = ["custom", "known", "pi_session"];

/**
 * Converts a scanner's untrusted, in-memory payload into a safe V1 snapshot.
 * It never retains or returns source fields outside the closed catalog contract.
 */
export function normalizeDiscoveredCatalog(
  connection: CatalogNormalizationConnection,
  payload: unknown,
  scanAt: string,
): CatalogNormalizationResult {
  const safeConnection = normalizeConnection(connection);
  if (!safeConnection) return { kind: "rejected", reason: "invalid_connection" };
  if (!isCanonicalIsoTimestamp(scanAt)) return { kind: "rejected", reason: "invalid_scan_timestamp" };
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return { kind: "rejected", reason: "invalid_payload" };
  }

  const records: CatalogModelRecord[] = [];
  const identities = new Set<string>();
  for (const candidate of payload.models) {
    const normalized = normalizeCandidate(safeConnection, candidate, scanAt);
    if (!normalized) return { kind: "rejected", reason: "invalid_candidate" };

    const identityKey = `${safeConnection.connectionId}\u0000${normalized.identity.modelId}`;
    if (identities.has(identityKey)) return { kind: "rejected", reason: "duplicate_identity" };
    identities.add(identityKey);
    records.push(normalized);
  }

  records.sort(compareCatalogModels);
  return { kind: "success", models: records };
}

/** Runtime guard for the closed persisted model record shape. */
export function isCatalogModelRecord(value: unknown): value is CatalogModelRecord {
  if (!isRecord(value) || value.schemaVersion !== MODEL_CATALOG_SCHEMA_VERSION || value.availability !== "available") {
    return false;
  }
  if (!isRecord(value.identity) || !isNonEmptyBoundedString(value.identity.connectionId, MAX_CATALOG_TEXT_LENGTH)
    || !isNonEmptyBoundedString(value.identity.modelId, MAX_CATALOG_MODEL_ID_LENGTH)) return false;
  if (!isProviderConnectionKind(value.providerKind) || !isNonEmptyBoundedString(value.providerLabel, MAX_CATALOG_TEXT_LENGTH)) return false;
  if (!isNullableBoundedString(value.displayName) || !isNullableBoundedString(value.description)) return false;
  if (!isNullableLimit(value.contextWindowTokens) || !isNullableLimit(value.maxOutputTokens)) return false;
  if (!Array.isArray(value.inputModalities) || !value.inputModalities.every(isCatalogInputModality)) return false;
  if (new Set(value.inputModalities).size !== value.inputModalities.length) return false;
  if (!isCapabilities(value.capabilities) || !isPricing(value.pricing) || !isCanonicalIsoTimestamp(value.lastSuccessfulScanAt)) return false;
  return true;
}

/** Runtime guard for the closed persisted safe diagnostic shape. */
export function isCatalogScanDiagnostic(value: unknown): value is CatalogScanDiagnostic {
  return isRecord(value)
    && value.schemaVersion === MODEL_CATALOG_SCHEMA_VERSION
    && isNonEmptyBoundedString(value.diagnosticId, MAX_CATALOG_TEXT_LENGTH)
    && isNonEmptyBoundedString(value.connectionId, MAX_CATALOG_TEXT_LENGTH)
    && isNonEmptyBoundedString(value.scanCorrelationId, MAX_CATALOG_TEXT_LENGTH)
    && isCatalogScanOutcome(value.outcome)
    && isNonEmptyBoundedString(value.safeMessage, MAX_CATALOG_TEXT_LENGTH)
    && isNullableHttpStatusCode(value.httpStatusCode)
    && isCanonicalIsoTimestamp(value.occurredAt);
}

/** Runtime guard for a complete store mutation before it can begin a transaction. */
export function isCatalogStoreScanOutcome(value: unknown): value is CatalogStoreScanOutcome {
  if (!isRecord(value) || !isNonEmptyBoundedString(value.connectionId, MAX_CATALOG_TEXT_LENGTH)
    || !Array.isArray(value.models) || !isCatalogScanDiagnostic(value.diagnostic)) return false;
  if (value.diagnostic.connectionId !== value.connectionId) return false;
  if (!value.models.every(isCatalogModelRecord)) return false;
  if (!value.models.every((model) => model.identity.connectionId === value.connectionId)) return false;
  for (let index = 1; index < value.models.length; index++) {
    const previous = value.models[index - 1]!;
    const current = value.models[index]!;
    if (compareCatalogModels(previous, current) >= 0) return false;
  }
  if (value.diagnostic.outcome === "success") return true;
  return value.models.length === 0;
}

function normalizeConnection(connection: unknown): { connectionId: ProviderConnectionId; kind: ProviderConnectionKind; label: string } | null {
  if (!isRecord(connection) || !isNonEmptyBoundedString(connection.connectionId, MAX_CATALOG_TEXT_LENGTH)
    || !isProviderConnectionKind(connection.kind)) return null;
  const label = normalizeRequiredString(connection.label, MAX_CATALOG_TEXT_LENGTH);
  return label ? { connectionId: connection.connectionId as ProviderConnectionId, kind: connection.kind, label } : null;
}

function normalizeCandidate(
  connection: { connectionId: ProviderConnectionId; kind: ProviderConnectionKind; label: string },
  candidate: unknown,
  scanAt: string,
): CatalogModelRecord | null {
  if (!isRecord(candidate)) return null;
  const modelId = normalizeRequiredString(candidate.modelId, MAX_CATALOG_MODEL_ID_LENGTH);
  if (!modelId || !isAvailableOrAbsent(candidate.availability)) return null;

  const displayName = normalizeOptionalString(candidate.displayName);
  const description = normalizeOptionalString(candidate.description);
  const contextWindowTokens = normalizeOptionalLimit(candidate.contextWindowTokens);
  const maxOutputTokens = normalizeOptionalLimit(candidate.maxOutputTokens);
  const inputModalities = normalizeModalities(candidate.inputModalities);
  const capabilities = normalizeCapabilities(candidate.capabilities);
  const pricing = normalizePricing(candidate.pricing);
  if (displayName === undefined || description === undefined || contextWindowTokens === undefined
    || maxOutputTokens === undefined || inputModalities === undefined || capabilities === undefined || pricing === undefined) {
    return null;
  }

  return {
    schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
    identity: { connectionId: connection.connectionId, modelId },
    providerKind: connection.kind,
    providerLabel: connection.label,
    displayName,
    description,
    contextWindowTokens,
    maxOutputTokens,
    inputModalities,
    capabilities,
    pricing,
    availability: "available",
    lastSuccessfulScanAt: scanAt,
  };
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return normalizeRequiredString(value, MAX_CATALOG_TEXT_LENGTH) ?? undefined;
}

function normalizeOptionalLimit(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return isFiniteNonNegative(value, MAX_CATALOG_TOKEN_LIMIT) ? value : undefined;
}

function normalizeModalities(value: unknown): readonly CatalogInputModality[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every(isCatalogInputModality)) return undefined;
  return [...new Set(value)].sort((left, right) => left.localeCompare(right));
}

function normalizeCapabilities(value: unknown): CatalogModelCapabilities | undefined {
  if (value === undefined || value === null) return { reasoning: null, tools: null, api: null };
  if (!isRecord(value)) return undefined;
  const reasoning = normalizeCapability(value.reasoning);
  const tools = normalizeCapability(value.tools);
  const api = normalizeCapability(value.api);
  if (reasoning === undefined || tools === undefined || api === undefined) return undefined;
  return { reasoning, tools, api };
}

function normalizeCapability(value: unknown): boolean | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "boolean" ? value : undefined;
}

function normalizePricing(value: unknown): CatalogModelPricing | null | undefined {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return undefined;
  const input = normalizePrice(value.inputPerMillionUsd);
  const output = normalizePrice(value.outputPerMillionUsd);
  const currency = value.currency === null ? null : value.currency === "USD" ? "USD" : undefined;
  if (input === undefined || output === undefined || currency === undefined) return undefined;
  return { inputPerMillionUsd: input, outputPerMillionUsd: output, currency };
}

function normalizePrice(value: unknown): number | null | undefined {
  if (value === null) return null;
  return isFiniteNonNegative(value, MAX_CATALOG_PRICE_PER_MILLION_USD) ? value : undefined;
}

function compareCatalogModels(left: CatalogModelRecord, right: CatalogModelRecord): number {
  return left.identity.connectionId.localeCompare(right.identity.connectionId)
    || left.identity.modelId.localeCompare(right.identity.modelId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderConnectionKind(value: unknown): value is ProviderConnectionKind {
  return typeof value === "string" && providerKinds.includes(value as ProviderConnectionKind);
}

function isCatalogInputModality(value: unknown): value is CatalogInputModality {
  return typeof value === "string" && modalities.includes(value as CatalogInputModality);
}

function isCatalogScanOutcome(value: unknown): value is CatalogScanOutcome {
  return typeof value === "string" && outcomes.includes(value as CatalogScanOutcome);
}

function isAvailableOrAbsent(value: unknown): boolean {
  return value === undefined || value === "available";
}

function normalizeRequiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return isNonEmptyBoundedString(normalized, maxLength) ? normalized : null;
}

function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNullableBoundedString(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= MAX_CATALOG_TEXT_LENGTH);
}

function isFiniteNonNegative(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
}

function isNullableLimit(value: unknown): boolean {
  return value === null || isFiniteNonNegative(value, MAX_CATALOG_TOKEN_LIMIT);
}

function isNullableHttpStatusCode(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599);
}

function isCapabilities(value: unknown): value is CatalogModelCapabilities {
  return isRecord(value)
    && (value.reasoning === null || typeof value.reasoning === "boolean")
    && (value.tools === null || typeof value.tools === "boolean")
    && (value.api === null || typeof value.api === "boolean");
}

function isPricing(value: unknown): value is CatalogModelPricing | null {
  return value === null || (isRecord(value)
    && (value.inputPerMillionUsd === null || isFiniteNonNegative(value.inputPerMillionUsd, MAX_CATALOG_PRICE_PER_MILLION_USD))
    && (value.outputPerMillionUsd === null || isFiniteNonNegative(value.outputPerMillionUsd, MAX_CATALOG_PRICE_PER_MILLION_USD))
    && (value.currency === null || value.currency === "USD"));
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
