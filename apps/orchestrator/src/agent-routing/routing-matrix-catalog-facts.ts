import {
  isActiveCatalogConnectionState,
  isCatalogModelRecord,
  isRoutingCatalogRouteFactV1,
  isRoutingMatrixConnectionStateV1,
  routeIdentityKey,
  type ActiveCatalogConnectionState,
  type CatalogModelRecord,
  type ProviderConnectionKind,
  type ProviderConnectionRecord,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
  type RoutingMatrixConnectionStateV1,
} from "@hepha/shared";
import type { ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import type { CatalogConnectionStateService } from "../model-catalog/catalog-connection-state-service.js";
import { readRoutingCatalogFacts } from "./routing-catalog-facts.js";

export interface RoutingMatrixCatalogIdentityFact {
  readonly route: RouteIdentityV1;
  readonly connectionLabel: string;
  readonly modelDisplayLabel: string | null;
}

export interface RoutingMatrixCatalogFacts {
  /** Complete resolver-safe facts, including valid orphaned catalog history as unavailable. */
  readonly routes: readonly RoutingCatalogRouteFactV1[];
  /** Current provider-membership choices only, joined after every authority is validated. */
  readonly identities: readonly RoutingMatrixCatalogIdentityFact[];
  readonly connectionStates: readonly RoutingMatrixConnectionStateV1[];
}

/** Reads and validates catalog, provider, and active scan-state authorities before their matrix join. */
export function readRoutingMatrixCatalogFacts(
  catalogStore: Pick<ModelCatalogStore, "listModels">,
  connectionStore: Pick<ProviderConnectionStore, "listConnections">,
  connectionStateService: Pick<CatalogConnectionStateService, "listActiveConnectionStates">,
): RoutingMatrixCatalogFacts {
  const models: unknown = catalogStore.listModels();
  const connections: unknown = connectionStore.listConnections();
  const activeStates: unknown = connectionStateService.listActiveConnectionStates();
  const routes: unknown = readRoutingCatalogFacts(catalogStore, connectionStore);

  if (!isCatalogModelCollection(models) || !isProviderConnectionCollection(connections)
    || !isActiveStateCollection(activeStates) || !isRouteFactCollection(routes)) throwContractError();
  validateRouteBindings(models, connections, routes);

  const connectionsById = new Map(connections.map((connection) => [connection.connectionId, connection]));
  const activeConnections = new Map(connections
    .filter((connection) => connection.lifecycleState === "active")
    .map((connection) => [connection.connectionId, connection]));
  const activeStatesById = new Map(activeStates.map((state) => [state.connectionId, state]));

  if (activeStatesById.size !== activeConnections.size) throwContractError();
  for (const [connectionId, state] of activeStatesById) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.label !== state.label || connection.kind !== state.providerKind) throwContractError();
  }

  const identities = models.flatMap((model): RoutingMatrixCatalogIdentityFact[] => {
    const connection = connectionsById.get(model.identity.connectionId);
    if (!connection || connection.lifecycleState === "deleted") return [];
    return [{
      route: model.identity,
      connectionLabel: connection.label,
      modelDisplayLabel: model.displayName,
    }];
  }).sort(compareIdentity);

  const connectionStates = activeStates.map((state): RoutingMatrixConnectionStateV1 => ({
    connectionId: state.connectionId,
    label: state.label,
    providerKind: state.providerKind,
    scanState: state.scanState,
    guidanceCode: state.guidanceCode,
    claimedAt: state.claimedAt,
    settledAt: state.settledAt,
    diagnosticOccurredAt: state.diagnosticOccurredAt,
    safeMessage: state.safeMessage,
  }));
  const result: RoutingMatrixCatalogFacts = { routes, identities, connectionStates };
  if (!isRoutingMatrixCatalogFacts(result)) throwContractError();
  return result;
}

export function isRoutingMatrixCatalogFacts(value: unknown): value is RoutingMatrixCatalogFacts {
  if (!exact(value, ["routes", "identities", "connectionStates"])
    || !isRouteFactCollection(value.routes)
    || !Array.isArray(value.identities) || !value.identities.every(isIdentityFact)
    || !Array.isArray(value.connectionStates) || !value.connectionStates.every(isRoutingMatrixConnectionStateV1)) return false;
  const routeKeys = new Set(value.routes.map((route) => routeIdentityKey(route.route)));
  return unique(value.identities.map((identity) => routeIdentityKey(identity.route)))
    && strictlyOrdered(value.identities.map((identity) => routeIdentityKey(identity.route)))
    && value.identities.every((identity) => routeKeys.has(routeIdentityKey(identity.route)))
    && unique(value.connectionStates.map((state) => state.connectionId))
    && strictlyOrdered(value.connectionStates.map((state) => state.connectionId));
}

function isCatalogModelCollection(value: unknown): value is readonly CatalogModelRecord[] {
  return Array.isArray(value) && value.every(isExactCatalogModelRecord)
    && unique(value.map((model) => routeIdentityKey(model.identity)));
}

function isExactCatalogModelRecord(value: unknown): value is CatalogModelRecord {
  return exact(value, ["schemaVersion", "identity", "providerKind", "providerLabel", "displayName", "description", "contextWindowTokens", "maxOutputTokens", "inputModalities", "capabilities", "pricing", "availability", "lastSuccessfulScanAt"])
    && exact(value.identity, ["connectionId", "modelId"])
    && exact(value.capabilities, ["reasoning", "tools", "api"])
    && (value.pricing === null || exact(value.pricing, ["inputPerMillionUsd", "outputPerMillionUsd", "currency"]))
    && isCatalogModelRecord(value);
}

function validateRouteBindings(
  models: readonly CatalogModelRecord[],
  connections: readonly ProviderConnectionRecord[],
  routes: readonly RoutingCatalogRouteFactV1[],
): void {
  if (models.length !== routes.length) throwContractError();
  const active = new Set(connections.filter((connection) => connection.lifecycleState === "active").map((connection) => connection.connectionId));
  for (const model of models) {
    const fact = routes.find((candidate) => routeIdentityKey(candidate.route) === routeIdentityKey(model.identity));
    if (!fact || fact.connectionActive !== active.has(model.identity.connectionId)
      || fact.available !== (model.availability === "available")
      || fact.contextWindowTokens !== model.contextWindowTokens
      || fact.tools !== model.capabilities.tools || fact.api !== model.capabilities.api
      || fact.reasoning !== model.capabilities.reasoning) throwContractError();
  }
}

function isProviderConnectionCollection(value: unknown): value is readonly ProviderConnectionRecord[] {
  return Array.isArray(value) && value.every(isProviderConnectionRecord)
    && unique(value.map((connection) => connection.connectionId));
}

function isActiveStateCollection(value: unknown): value is readonly ActiveCatalogConnectionState[] {
  return Array.isArray(value) && value.every(isActiveCatalogConnectionState)
    && unique(value.map((state) => state.connectionId));
}

function isRouteFactCollection(value: unknown): value is readonly RoutingCatalogRouteFactV1[] {
  return Array.isArray(value) && value.every(isRoutingCatalogRouteFactV1)
    && unique(value.map((fact) => routeIdentityKey(fact.route)));
}

function isProviderConnectionRecord(value: unknown): value is ProviderConnectionRecord {
  if (!exact(value, ["connectionId", "kind", "label", "provider", "endpointUrl", "endpointLocal", "lifecycleState", "secretRef", "secretVersion", "createdAt", "updatedAt"])
    || !text(value.connectionId, 10_000) || !providerKind(value.kind) || !text(value.label, 10_000)
    || !providerIdentifier(value.provider) || !text(value.endpointUrl, 10_000) || typeof value.endpointLocal !== "boolean"
    || !["active", "revoked", "deleted"].includes(value.lifecycleState)
    || !(value.secretRef === null || text(value.secretRef, 10_000))
    || !(value.secretVersion === null || positive(value.secretVersion)) || !iso(value.createdAt) || !iso(value.updatedAt)) return false;
  return value.kind === value.provider.kind
    && (value.kind === "pi_session"
      ? value.secretRef === null && value.secretVersion === null
      : (value.secretRef === null) === (value.secretVersion === null));
}

function providerIdentifier(value: unknown): boolean {
  return exact(value, ["kind"]) && value.kind === "pi_session"
    || exact(value, ["kind", "providerId"]) && value.kind === "known" && ["openai", "deepseek", "openai-codex"].includes(value.providerId)
    || exact(value, ["kind", "label"]) && value.kind === "custom" && text(value.label, 10_000);
}

function isIdentityFact(value: unknown): value is RoutingMatrixCatalogIdentityFact {
  return exact(value, ["route", "connectionLabel", "modelDisplayLabel"])
    && exact(value.route, ["connectionId", "modelId"])
    && text(value.route.connectionId, 512) && text(value.route.modelId, 512)
    && text(value.connectionLabel, 10_000)
    && (value.modelDisplayLabel === null || text(value.modelDisplayLabel, 10_000));
}

function compareIdentity(left: RoutingMatrixCatalogIdentityFact, right: RoutingMatrixCatalogIdentityFact): number {
  return routeIdentityKey(left.route).localeCompare(routeIdentityKey(right.route));
}
function exact<const T extends readonly string[]>(value: unknown, keys: T): value is Record<T[number], any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function providerKind(value: unknown): value is ProviderConnectionKind { return value === "known" || value === "custom" || value === "pi_session"; }
function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function iso(value: unknown): value is string { if (typeof value !== "string") return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toISOString() === value; }
function unique(values: readonly unknown[]): boolean { return new Set(values).size === values.length; }
function strictlyOrdered(values: readonly string[]): boolean { return values.every((value, index) => index === 0 || values[index - 1]! < value); }
function throwContractError(): never { throw new Error("Routing matrix catalog facts are invalid."); }
