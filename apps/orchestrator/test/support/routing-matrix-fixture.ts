import { createServer, type Server } from "node:http";
import { AgentRoutingStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  ROUTING_MATRIX_POLICY_ID,
  ROUTING_MATRIX_SCHEMA_VERSION,
  type AgentRegistryEntryV1,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
  type RoutingMatrixRowDraftV1,
} from "@hepha/shared";
import { AgentRegistry } from "../../src/agent-routing/agent-registry.js";
import type { RoutingMatrixCatalogFacts } from "../../src/agent-routing/routing-matrix-catalog-facts.js";
import { RoutingMatrixProjector } from "../../src/agent-routing/routing-matrix-projector.js";
import { RoutingPolicyService } from "../../src/agent-routing/routing-policy-service.js";
import { handleAgentRoutingRoutes } from "../../src/transport/http/routes/agent-routing-routes.js";

export const matrixNow = "2026-07-25T02:00:00.000Z";
export const globalRoute = { connectionId: "global-connection", modelId: "global-model" } as RouteIdentityV1;
export const reviewRoute = { connectionId: "review-connection", modelId: "review-model" } as RouteIdentityV1;
export const fallbackRoute = { connectionId: "fallback-connection", modelId: "fallback-model" } as RouteIdentityV1;
export const weakRoute = { connectionId: "weak-connection", modelId: "weak-model" } as RouteIdentityV1;

export function routeFact(route: RouteIdentityV1, overrides: Partial<RoutingCatalogRouteFactV1> = {}): RoutingCatalogRouteFactV1 {
  return {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    route,
    connectionActive: true,
    available: true,
    contextWindowTokens: 128_000,
    tools: true,
    api: true,
    reasoning: true,
    ...overrides,
  };
}

export function matrixCatalogFacts(overrides: {
  readonly routes?: readonly RoutingCatalogRouteFactV1[];
  readonly includeFallback?: boolean;
  readonly includeWeak?: boolean;
} = {}): RoutingMatrixCatalogFacts {
  const includeFallback = overrides.includeFallback ?? false;
  const includeWeak = overrides.includeWeak ?? true;
  const routes = overrides.routes ?? [
    ...(includeFallback ? [routeFact(fallbackRoute)] : []),
    routeFact(globalRoute),
    routeFact(reviewRoute),
    ...(includeWeak ? [routeFact(weakRoute, { contextWindowTokens: 16_000, tools: false, api: false })] : []),
  ];
  const identities = [
    ...(includeFallback ? [{ route: fallbackRoute, connectionLabel: "Fallback Team", modelDisplayLabel: "Fallback Model" }] : []),
    { route: globalRoute, connectionLabel: "OpenAI Personal", modelDisplayLabel: "Global Model" },
    { route: reviewRoute, connectionLabel: "OpenAI Work", modelDisplayLabel: "Review Model" },
    ...(includeWeak ? [{ route: weakRoute, connectionLabel: "Small Provider", modelDisplayLabel: null }] : []),
  ];
  const connectionStates = identities.map((identity) => ({
    connectionId: identity.route.connectionId,
    label: identity.connectionLabel,
    providerKind: "known" as const,
    scanState: "available" as const,
    guidanceCode: "models_available" as const,
    claimedAt: matrixNow,
    settledAt: matrixNow,
    diagnosticOccurredAt: matrixNow,
    safeMessage: "Models are available.",
  }));
  return { routes, identities, connectionStates };
}

export function createRoutingMatrixSubject(options: {
  readonly catalog?: RoutingMatrixCatalogFacts;
  readonly entries?: readonly AgentRegistryEntryV1[];
  readonly bootstrap?: boolean;
  readonly matrixCatalogFacts?: () => RoutingMatrixCatalogFacts;
  readonly matrixProjector?: RoutingMatrixProjector;
} = {}) {
  const store = AgentRoutingStore.createInMemory();
  const catalog = options.catalog ?? matrixCatalogFacts();
  const registry = new AgentRegistry(options.entries);
  const service = new RoutingPolicyService({
    catalogFacts: () => catalog.routes,
    matrixCatalogFacts: options.matrixCatalogFacts ?? (() => catalog),
    matrixProjector: options.matrixProjector ?? new RoutingMatrixProjector(),
    now: () => matrixNow,
    registry,
    store,
  });
  if (options.bootstrap !== false) {
    const result = service.resolve({
      actionId: registry.list()[0]!.actionId,
      bootstrap: { route: globalRoute, occurredAt: matrixNow, actor: "fixture", correlationId: "matrix-fixture" },
    });
    if (!result.ok) throw new Error(`Routing matrix fixture bootstrap failed: ${result.code}`);
  }
  return { catalog, registry, service, store };
}

export function rowDraft(
  store: AgentRoutingStore,
  scope: RoutingMatrixRowDraftV1["scope"],
  selection: RoutingMatrixRowDraftV1["selection"],
): RoutingMatrixRowDraftV1 {
  const guard = store.getCurrentRevisionGuard();
  if (!guard) throw new Error("Routing matrix fixture has no revision guard.");
  return {
    schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
    policyId: ROUTING_MATRIX_POLICY_ID,
    scope,
    selection,
    expectedRevision: { revisionId: guard.revisionId, revisionNumber: guard.revisionNumber },
    revisionGuard: guard.revisionGuard,
  };
}

export async function startRoutingMatrixServer(
  subject = createRoutingMatrixSubject(),
  beforeHandle?: (url: URL, method: string | undefined) => Promise<void>,
) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    await beforeHandle?.(url, request.method);
    if (!await handleAgentRoutingRoutes(request, response, url, subject.service)) response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Routing matrix fixture server has no address.");
  return { ...subject, baseUrl: `http://127.0.0.1:${address.port}`, server };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
