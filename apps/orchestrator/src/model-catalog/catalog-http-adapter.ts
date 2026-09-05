import type { IncomingMessage, ServerResponse } from "node:http";
import type { ModelCatalogStore } from "@hepha/db";
import {
  CATALOG_RECONCILIATION_SCHEMA_VERSION,
  isCatalogConnectionStateResponse,
  isCatalogConnectionStatesResponse,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import { sendJson } from "../transport/http/send-json.js";
import type { CatalogConnectionStateService } from "./catalog-connection-state-service.js";
import type { CatalogScanCoordinator } from "./catalog-scan-coordinator.js";

interface CatalogReadStore {
  listDiagnostics(connectionId: ProviderConnectionId, limit?: number): ReturnType<ModelCatalogStore["listDiagnostics"]>;
  listModels(): ReturnType<ModelCatalogStore["listModels"]>;
}

interface CatalogConnections {
  getConnection(connectionId: ProviderConnectionId): ProviderConnectionRecord | null;
  listConnections(): ProviderConnectionRecord[];
}

export interface ModelCatalogHttpContext {
  readonly connections: CatalogConnections;
  readonly coordinator: Pick<CatalogScanCoordinator, "scanConnection">;
  readonly states: Pick<CatalogConnectionStateService, "listActiveConnectionStates">;
  readonly store: CatalogReadStore;
}

/** Sends one forced retry result using only the canonical connection-state projection. */
export async function handleScanCatalogConnection(
  request: IncomingMessage,
  response: ServerResponse,
  connectionId: string,
  context: ModelCatalogHttpContext,
): Promise<void> {
  if (!await isEmptyRequest(request) || !isValidConnectionId(connectionId)) {
    invalidRequest(response);
    return;
  }
  const connection = context.connections.getConnection(connectionId as ProviderConnectionId);
  if (!connection) {
    sendError(response, 404, "connection_not_found", "Catalog connection was not found.");
    return;
  }
  if (connection.lifecycleState !== "active") {
    sendError(response, 409, "connection_not_scannable", "Catalog connection is not active.");
    return;
  }

  try {
    await context.coordinator.scanConnection({
      connectionId: connection.connectionId,
      trigger: "individual_retry",
      mode: "force_settled",
    });
  } catch {
    // A claimed local failure remains authoritative as scanning until startup settles it.
  }
  try {
    const state = context.states.listActiveConnectionStates()
      .find((candidate) => candidate.connectionId === connection.connectionId);
    if (!state) throw new Error("Catalog connection state is unavailable.");
    const body = {
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connection: state,
    };
    if (!isCatalogConnectionStateResponse(body)) throw new Error("Catalog connection state is unavailable.");
    sendJson(response, 200, body);
  } catch {
    stateUnavailable(response);
  }
}

/** Forces one isolated coordinated attempt for every active connection in stable identity order. */
export async function handleScanActiveCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  context: ModelCatalogHttpContext,
): Promise<void> {
  if (!await isEmptyRequest(request)) {
    invalidRequest(response);
    return;
  }
  const active = context.connections.listConnections()
    .filter((connection) => connection.lifecycleState === "active")
    .sort(compareConnections);
  for (const connection of active) {
    try {
      await context.coordinator.scanConnection({
        connectionId: connection.connectionId,
        trigger: "scan_active",
        mode: "force_settled",
      });
    } catch {
      // One local coordinator failure must not suppress later connection attempts.
    }
  }
  try {
    const body = {
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connections: context.states.listActiveConnectionStates(),
    };
    if (!isCatalogConnectionStatesResponse(body)) throw new Error("Catalog connection state is unavailable.");
    sendJson(response, 200, body);
  } catch {
    stateUnavailable(response);
  }
}

/** Reads every active connection through the guarded canonical state projector. */
export async function handleListCatalogConnections(
  request: IncomingMessage,
  response: ServerResponse,
  context: ModelCatalogHttpContext,
): Promise<void> {
  if (!await isEmptyRequest(request)) {
    invalidRequest(response);
    return;
  }
  try {
    const body = {
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connections: context.states.listActiveConnectionStates(),
    };
    if (!isCatalogConnectionStatesResponse(body)) throw new Error("Catalog connection state is unavailable.");
    sendJson(response, 200, body);
  } catch {
    stateUnavailable(response);
  }
}

/** Reads the current deterministic catalog without invoking discovery or mutation. */
export async function handleListModelCatalog(
  request: IncomingMessage,
  response: ServerResponse,
  context: ModelCatalogHttpContext,
): Promise<void> {
  if (!await isEmptyRequest(request)) {
    invalidRequest(response);
    return;
  }
  sendJson(response, 200, { schemaVersion: "model-catalog/v1", models: context.store.listModels() });
}

/** Reads one connection's safe scan diagnostics after validating the request shape and identity. */
export async function handleCatalogDiagnostics(
  request: IncomingMessage,
  response: ServerResponse,
  connectionId: string,
  rawLimit: string | null,
  context: ModelCatalogHttpContext,
): Promise<void> {
  const limit = parseDiagnosticLimit(rawLimit);
  if (!await isEmptyRequest(request, true) || !hasOnlyDiagnosticLimit(request) || !isValidConnectionId(connectionId) || limit === null) {
    invalidRequest(response);
    return;
  }
  if (!context.connections.getConnection(connectionId as ProviderConnectionId)) {
    sendError(response, 404, "connection_not_found", "Catalog connection was not found.");
    return;
  }
  sendJson(response, 200, {
    schemaVersion: "model-catalog/v1",
    diagnostics: context.store.listDiagnostics(connectionId as ProviderConnectionId, limit),
  });
}

function invalidRequest(response: ServerResponse): void {
  sendError(response, 400, "invalid_request", "Invalid model catalog request.");
}

function stateUnavailable(response: ServerResponse): void {
  sendError(response, 500, "catalog_state_unavailable", "Catalog connection state is unavailable.");
}

function sendError(response: ServerResponse, statusCode: number, errorCode: string, message: string): void {
  sendJson(response, statusCode, { errorCode, message });
}

async function isEmptyRequest(request: IncomingMessage, allowQuery = false): Promise<boolean> {
  if (!allowQuery && new URL(request.url ?? "/", "http://localhost").search !== "") return false;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).length === 0;
}

function hasOnlyDiagnosticLimit(request: IncomingMessage): boolean {
  const params = new URL(request.url ?? "/", "http://localhost").searchParams;
  return [...params.keys()].every((key) => key === "limit") && params.getAll("limit").length <= 1;
}

function isValidConnectionId(value: string): boolean {
  return value.length > 0 && value === value.trim() && !value.includes("/") && value.length <= 512;
}

function parseDiagnosticLimit(value: string | null): number | null {
  if (value === null) return 20;
  if (!/^(?:[1-9]|1\d|20)$/.test(value)) return null;
  return Number(value);
}

function compareConnections(left: ProviderConnectionRecord, right: ProviderConnectionRecord): number {
  return left.connectionId < right.connectionId ? -1 : left.connectionId > right.connectionId ? 1 : 0;
}
