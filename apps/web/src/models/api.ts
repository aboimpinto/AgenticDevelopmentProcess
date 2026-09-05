import {
  isCatalogConnectionStateResponse,
  isCatalogConnectionStatesResponse,
  isCatalogModelRecord,
  isCatalogScanDiagnostic,
  type ActiveCatalogConnectionState,
  type CatalogModelRecord,
  type CatalogScanDiagnostic,
  type ProviderConnectionId,
} from "@hepha/shared";

const API_BASE = "/api/model-catalog";
const SCHEMA_VERSION = "model-catalog/v1";

/** A deterministic, secret-safe rejection for every malformed catalog transport response. */
export class ModelCatalogPresentationError extends Error {
  constructor() {
    super("Catalog data is unavailable. Refresh the catalog and try again.");
    this.name = "ModelCatalogPresentationError";
  }
}

/** Closed catalog and reconciliation transport operations available to the Models surfaces. */
export interface ModelCatalogApi {
  readCatalog(): Promise<readonly CatalogModelRecord[]>;
  readConnectionStates(): Promise<readonly ActiveCatalogConnectionState[]>;
  scanActive(): Promise<readonly ActiveCatalogConnectionState[]>;
  scanConnection(connectionId: string): Promise<ActiveCatalogConnectionState>;
  readDiagnostics(connectionId: string): Promise<readonly CatalogScanDiagnostic[]>;
}

/** Calls only the closed FEAT-059 routes and validates their unknown JSON before use. */
export const modelCatalogApi: ModelCatalogApi = {
  async readCatalog() {
    const body = await requestJson(API_BASE);
    if (!isRecord(body) || body.schemaVersion !== SCHEMA_VERSION || !Array.isArray(body.models)
      || !body.models.every(isCatalogModelRecord)) throw new ModelCatalogPresentationError();
    return body.models;
  },

  async readConnectionStates() {
    const body = await requestJson(`${API_BASE}/connections`);
    if (!isCatalogConnectionStatesResponse(body)) throw new ModelCatalogPresentationError();
    return body.connections;
  },

  async scanActive() {
    const body = await requestJson(`${API_BASE}/scan-active`, "POST");
    if (!isCatalogConnectionStatesResponse(body)) throw new ModelCatalogPresentationError();
    return body.connections;
  },

  async scanConnection(connectionId) {
    if (!isConnectionId(connectionId)) throw new ModelCatalogPresentationError();
    const body = await requestJson(`${API_BASE}/connections/${encodeURIComponent(connectionId)}/scan`, "POST");
    if (!isCatalogConnectionStateResponse(body)) throw new ModelCatalogPresentationError();
    return body.connection;
  },

  async readDiagnostics(connectionId) {
    if (!isConnectionId(connectionId)) throw new ModelCatalogPresentationError();
    const body = await requestJson(`${API_BASE}/connections/${encodeURIComponent(connectionId)}/diagnostics`);
    if (!isRecord(body) || body.schemaVersion !== SCHEMA_VERSION || !Array.isArray(body.diagnostics)
      || !body.diagnostics.every(isCatalogScanDiagnostic)) throw new ModelCatalogPresentationError();
    return body.diagnostics;
  },
};

async function requestJson(path: string, method: "GET" | "POST" = "GET"): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { method });
  } catch {
    throw new ModelCatalogPresentationError();
  }
  if (!response.ok) throw new ModelCatalogPresentationError();
  try {
    return await response.json();
  } catch {
    throw new ModelCatalogPresentationError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConnectionId(value: unknown): value is ProviderConnectionId {
  return isNonEmptyString(value) && !value.includes("/");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 10_000;
}
