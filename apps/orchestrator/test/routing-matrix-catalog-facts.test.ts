import { describe, expect, it } from "vitest";
import type { ActiveCatalogConnectionState, CatalogModelRecord, ProviderConnectionRecord } from "@hepha/shared";
import { isRoutingMatrixCatalogFacts, readRoutingMatrixCatalogFacts } from "../src/agent-routing/routing-matrix-catalog-facts.js";
import { globalRoute, matrixNow } from "./support/routing-matrix-fixture.js";

const connection: ProviderConnectionRecord = {
  connectionId: globalRoute.connectionId,
  kind: "pi_session",
  label: "Pi Session",
  provider: { kind: "pi_session" },
  endpointUrl: "https://api.openai.com/v1",
  endpointLocal: false,
  lifecycleState: "active",
  secretRef: null,
  secretVersion: null,
  createdAt: matrixNow,
  updatedAt: matrixNow,
};
const model: CatalogModelRecord = {
  schemaVersion: "model-catalog/v1",
  identity: globalRoute,
  providerKind: "pi_session",
  providerLabel: "Historical label",
  displayName: "Friendly model",
  description: null,
  contextWindowTokens: 128_000,
  maxOutputTokens: 16_000,
  inputModalities: ["text"],
  capabilities: { reasoning: true, tools: true, api: true },
  pricing: null,
  availability: "available",
  lastSuccessfulScanAt: matrixNow,
};
const state: ActiveCatalogConnectionState = {
  schemaVersion: "catalog-reconciliation/v1",
  connectionId: connection.connectionId,
  label: connection.label,
  providerKind: connection.kind,
  lifecycleActive: true,
  scanState: "available",
  trigger: "individual_retry",
  attemptId: "attempt-1",
  modelCount: 1,
  claimedAt: matrixNow,
  settledAt: matrixNow,
  outcomeCode: "success",
  safeMessage: "Models are available.",
  diagnosticId: "diagnostic-1",
  diagnosticOccurredAt: matrixNow,
  guidanceCode: "models_available",
};

function subject(overrides: { models?: unknown; connections?: unknown; states?: unknown } = {}) {
  return readRoutingMatrixCatalogFacts(
    { listModels: () => (overrides.models ?? [model]) as CatalogModelRecord[] },
    { listConnections: () => (overrides.connections ?? [connection]) as ProviderConnectionRecord[] },
    { listActiveConnectionStates: () => (overrides.states ?? [state]) as ActiveCatalogConnectionState[] },
  );
}

describe("readRoutingMatrixCatalogFacts", () => {
  it("joins friendly current labels to immutable identities after validating each complete authority", () => {
    const result = subject();
    expect(isRoutingMatrixCatalogFacts(result)).toBe(true);
    expect(isRoutingMatrixCatalogFacts({ ...result, identities: [...result.identities, result.identities[0]] })).toBe(false);
    expect(result).toEqual({
      routes: [expect.objectContaining({ route: globalRoute, connectionActive: true, available: true })],
      identities: [{ route: globalRoute, connectionLabel: "Pi Session", modelDisplayLabel: "Friendly model" }],
      connectionStates: [{
        connectionId: connection.connectionId,
        label: connection.label,
        providerKind: "pi_session",
        scanState: "available",
        guidanceCode: "models_available",
        claimedAt: matrixNow,
        settledAt: matrixNow,
        diagnosticOccurredAt: matrixNow,
        safeMessage: "Models are available.",
      }],
    });
  });

  it("validates orphaned model history but excludes it from current matrix choices", () => {
    const orphan = { ...model, identity: { connectionId: "deleted-connection", modelId: "orphan-model" } };
    const result = subject({ models: [model, orphan] });
    expect(result.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ route: orphan.identity, connectionActive: false }),
    ]));
    expect(result.identities).toEqual([{ route: globalRoute, connectionLabel: "Pi Session", modelDisplayLabel: "Friendly model" }]);
  });

  it.each([
    ["catalog", { models: [{ ...model, unexpected: true }] }],
    ["provider", { connections: [{ ...connection, label: "" }] }],
    ["state", { states: [{ ...state, guidanceCode: "scan_failed" }] }],
    ["state membership", { states: [] }],
  ])("fails closed for malformed %s authority before projection", (_name, overrides) => {
    expect(() => subject(overrides)).toThrow("Routing matrix catalog facts are invalid.");
  });
});
