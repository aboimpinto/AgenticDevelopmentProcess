import { describe, expect, it } from "vitest";
import type { CatalogModelRecord, ProviderConnectionRecord } from "@hepha/shared";
import { readRoutingCatalogFacts } from "../src/agent-routing/routing-catalog-facts.js";

function connection(connectionId: string, lifecycleState: ProviderConnectionRecord["lifecycleState"]): ProviderConnectionRecord {
  return {
    connectionId,
    kind: "api",
    label: connectionId,
    provider: { kind: "known", providerId: "openai" },
    endpointUrl: "https://api.openai.com/v1",
    endpointLocal: false,
    lifecycleState,
    secretRef: null,
    secretVersion: null,
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
  } as ProviderConnectionRecord;
}

function model(connectionId: string, modelId: string, availability: CatalogModelRecord["availability"]): CatalogModelRecord {
  return {
    schemaVersion: "model-catalog/v1",
    identity: { connectionId, modelId },
    providerKind: "openai",
    providerLabel: "OpenAI",
    displayName: null,
    description: null,
    contextWindowTokens: 128_000,
    maxOutputTokens: null,
    inputModalities: ["text"],
    capabilities: { tools: true, api: true, reasoning: false },
    pricing: null,
    availability,
    lastSuccessfulScanAt: "2026-07-23T08:00:00.000Z",
  } as CatalogModelRecord;
}

describe("readRoutingCatalogFacts", () => {
  it("projects catalog capabilities and connection state into deterministic resolver facts", () => {
    const facts = readRoutingCatalogFacts(
      {
        listModels: () => [
          model("connection-z", "model-b", "unavailable"),
          model("connection-a", "model-a", "available"),
        ],
      },
      {
        listConnections: () => [
          connection("connection-z", "revoked"),
          connection("connection-a", "active"),
        ],
      },
    );

    expect(facts).toEqual([
      expect.objectContaining({
        route: { connectionId: "connection-a", modelId: "model-a" },
        connectionActive: true,
        available: true,
        contextWindowTokens: 128_000,
        tools: true,
        api: true,
        reasoning: false,
      }),
      expect.objectContaining({
        route: { connectionId: "connection-z", modelId: "model-b" },
        connectionActive: false,
        available: false,
      }),
    ]);
  });
});
