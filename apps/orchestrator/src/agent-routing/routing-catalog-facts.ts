import type { ModelCatalogStore, ProviderConnectionStore } from "@hepha/db";
import { AGENT_ROUTING_SCHEMA_VERSION, type RoutingCatalogRouteFactV1 } from "@hepha/shared";

/** Projects active connection and available catalog records into resolver-safe route facts. */
export function readRoutingCatalogFacts(
  catalogStore: Pick<ModelCatalogStore, "listModels">,
  connectionStore: Pick<ProviderConnectionStore, "listConnections">,
): readonly RoutingCatalogRouteFactV1[] {
  const activeConnectionIds = new Set(connectionStore.listConnections()
    .filter((connection) => connection.lifecycleState === "active")
    .map((connection) => connection.connectionId));
  return catalogStore.listModels().map((model) => ({
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    route: model.identity,
    connectionActive: activeConnectionIds.has(model.identity.connectionId),
    available: model.availability === "available",
    contextWindowTokens: model.contextWindowTokens,
    tools: model.capabilities.tools,
    api: model.capabilities.api,
    reasoning: model.capabilities.reasoning,
  })).sort((left, right) => `${left.route.connectionId}\u0000${left.route.modelId}`.localeCompare(`${right.route.connectionId}\u0000${right.route.modelId}`));
}
