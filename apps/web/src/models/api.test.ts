import { afterEach, describe, expect, it, vi } from "vitest";
import { modelCatalogApi, ModelCatalogPresentationError } from "./api.js";

const model = {
  schemaVersion: "model-catalog/v1",
  identity: { connectionId: "connection-a", modelId: "model-a" },
  providerKind: "known",
  providerLabel: "Provider A",
  displayName: "Model A",
  description: null,
  contextWindowTokens: null,
  maxOutputTokens: null,
  inputModalities: ["text"],
  capabilities: { reasoning: null, tools: true, api: true },
  pricing: null,
  availability: "available",
  lastSuccessfulScanAt: "2026-07-22T19:05:00.000Z",
};

const diagnostic = {
  schemaVersion: "model-catalog/v1",
  diagnosticId: "diagnostic-a",
  connectionId: "connection-a",
  scanCorrelationId: "scan-a",
  outcome: "success",
  safeMessage: "Scan completed.",
  httpStatusCode: null,
  occurredAt: "2026-07-22T19:05:00.000Z",
};

function connectionState(connectionId: string, scanState: "never_scanned" | "scanning" | "available" | "empty" | "failed" = "available") {
  const unsettled = scanState === "never_scanned";
  const scanning = scanState === "scanning";
  const failed = scanState === "failed";
  const settled = !unsettled && !scanning;
  return {
    schemaVersion: "catalog-reconciliation/v1" as const,
    connectionId,
    label: `Connection ${connectionId}`,
    providerKind: "known" as const,
    lifecycleActive: true as const,
    scanState,
    trigger: unsettled ? null : "individual_retry" as const,
    attemptId: unsettled ? null : `attempt-${connectionId}`,
    modelCount: settled ? (scanState === "available" ? 1 : 0) : null,
    claimedAt: unsettled ? null : "2026-07-22T19:04:00.000Z",
    settledAt: settled ? "2026-07-22T19:05:00.000Z" : null,
    outcomeCode: settled ? (failed ? "unavailable" : "success") : null,
    safeMessage: settled ? (failed ? "Provider unavailable." : "Scan completed.") : null,
    diagnosticId: settled ? `diagnostic-${connectionId}` : null,
    diagnosticOccurredAt: settled ? "2026-07-22T19:05:00.000Z" : null,
    guidanceCode: scanState === "never_scanned" ? "scan_not_started" as const
      : scanState === "scanning" ? "scan_in_progress" as const
      : scanState === "available" ? "models_available" as const
      : scanState === "empty" ? "no_models_returned" as const
      : "scan_failed" as const,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("modelCatalogApi", () => {
  it("accepts the valid V1 catalog and preserves its server order", async () => {
    const second = { ...model, identity: { connectionId: "connection-b", modelId: "model-b" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ schemaVersion: "model-catalog/v1", models: [model, second] })));

    await expect(modelCatalogApi.readCatalog()).resolves.toEqual([model, second]);
  });

  it.each([
    undefined,
    null,
    { schemaVersion: "model-catalog/v1", models: {} },
    { schemaVersion: "model-catalog/v1", models: [{ ...model, identity: null }] },
  ])("rejects malformed catalog bodies without coercing them to an empty catalog", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(modelCatalogApi.readCatalog()).rejects.toBeInstanceOf(ModelCatalogPresentationError);
  });

  it("rejects malformed scan results before the nested diagnostic is used", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      results: [{ connectionId: "connection-a", scanCorrelationId: "scan-a", outcome: "success", modelCount: 1, diagnostic: { ...diagnostic, connectionId: "other" } }],
    })));
    await expect(modelCatalogApi.scanActive()).rejects.toBeInstanceOf(ModelCatalogPresentationError);
  });

  it("accepts the complete guarded active-state collection for all five states", async () => {
    const states = [
      connectionState("connection-a", "never_scanned"),
      connectionState("connection-b", "scanning"),
      connectionState("connection-c", "available"),
      connectionState("connection-d", "empty"),
      connectionState("connection-e", "failed"),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      schemaVersion: "catalog-reconciliation/v1",
      connections: states,
    })));

    await expect(modelCatalogApi.readConnectionStates()).resolves.toEqual(states);
  });

  it("accepts the guarded all-active scan response without a legacy results lane", async () => {
    const states = [connectionState("connection-a", "empty"), connectionState("connection-b", "failed")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      schemaVersion: "catalog-reconciliation/v1",
      connections: states,
    })));

    await expect(modelCatalogApi.scanActive()).resolves.toEqual(states);
  });

  it.each([
    undefined,
    null,
    { schemaVersion: "catalog-reconciliation/v1", connections: {} },
    { schemaVersion: "catalog-reconciliation/v1", connections: [{ ...connectionState("connection-a"), label: null }] },
    { schemaVersion: "catalog-reconciliation/v1", connections: [connectionState("connection-a"), connectionState("connection-a")] },
    { schemaVersion: "catalog-reconciliation/v1", connections: [connectionState("connection-b"), connectionState("connection-a")] },
    { schemaVersion: "catalog-reconciliation/v1", connections: [], extra: true },
    { results: [] },
  ])("rejects malformed, duplicate, unordered, extra-key, and legacy active-state bodies", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(modelCatalogApi.scanActive()).rejects.toBeInstanceOf(ModelCatalogPresentationError);
  });

  it.each([
    undefined,
    null,
    { schemaVersion: "catalog-reconciliation/v1", connection: null },
    { schemaVersion: "catalog-reconciliation/v1", connection: { ...connectionState("connection-a"), safeMessage: 42 } },
    { schemaVersion: "catalog-reconciliation/v1", connection: connectionState("connection-a"), extra: true },
    connectionState("connection-a"),
  ])("rejects malformed and unwrapped connection-scoped retry bodies", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(modelCatalogApi.scanConnection("connection-a")).rejects.toBeInstanceOf(ModelCatalogPresentationError);
  });

  it("encodes only a validated connection identity for scan and diagnostics requests", async () => {
    const state = connectionState("connection-a");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ schemaVersion: "catalog-reconciliation/v1", connection: state }))
      .mockResolvedValueOnce(response({ schemaVersion: "model-catalog/v1", diagnostics: [diagnostic] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(modelCatalogApi.scanConnection("connection/a")).rejects.toBeInstanceOf(ModelCatalogPresentationError);
    await expect(modelCatalogApi.readDiagnostics("")).rejects.toBeInstanceOf(ModelCatalogPresentationError);
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(modelCatalogApi.scanConnection("connection-a")).resolves.toEqual(state);
    await modelCatalogApi.readDiagnostics("connection-a");

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/model-catalog/connections/connection-a/scan",
      "/api/model-catalog/connections/connection-a/diagnostics",
    ]);
    expect(fetchMock.mock.calls.every(([, options]) => !String(options).includes("secret"))).toBe(true);
  });

  it("maps non-success transport responses to the fixed safe presentation error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(modelCatalogApi.readCatalog()).rejects.toEqual(expect.objectContaining({
      message: "Catalog data is unavailable. Refresh the catalog and try again.",
    }));
  });
});

function response(body: unknown): Response {
  return { ok: true, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}
