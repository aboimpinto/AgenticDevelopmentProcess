import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG_SCHEMA_VERSION,
  normalizeDiscoveredCatalog,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "../src/index.js";

const scanAt = "2026-07-22T13:00:00.000Z";

function connection(overrides: Partial<ProviderConnectionRecord> = {}): ProviderConnectionRecord {
  return {
    connectionId: "connection-a" as ProviderConnectionId,
    kind: "custom",
    label: " Provider A ",
    provider: { kind: "custom", label: "Provider A" },
    endpointUrl: "https://provider-a.example/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: "opaque-ref",
    secretVersion: 1,
    createdAt: scanAt,
    updatedAt: scanAt,
    ...overrides,
  };
}

function payload(models: unknown[]) {
  return { models };
}

function candidate(modelId: string, overrides: Record<string, unknown> = {}) {
  return {
    modelId,
    displayName: ` ${modelId} display `,
    description: " A safe description ",
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_000,
    inputModalities: ["text", "image", "text"],
    capabilities: { reasoning: true, tools: false, api: true },
    pricing: { inputPerMillionUsd: 1.25, outputPerMillionUsd: 4.5, currency: "USD" },
    availability: "available",
    ...overrides,
  };
}

describe("normalizeDiscoveredCatalog", () => {
  it("normalizes only safe catalog facts in deterministic lexical identity order", () => {
    const result = normalizeDiscoveredCatalog(connection(), payload([
      candidate("z-model", { secretRef: "distinctive-secret-that-must-not-persist", endpointUrl: "https://must-not-persist.example" }),
      candidate("a-model", { inputModalities: ["video", "audio", "video"] }),
    ]), scanAt);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.models.map((model) => model.identity.modelId)).toEqual(["a-model", "z-model"]);
    expect(result.models[0]).toMatchObject({
      schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
      identity: { connectionId: "connection-a", modelId: "a-model" },
      providerKind: "custom",
      providerLabel: "Provider A",
      displayName: "a-model display",
      description: "A safe description",
      inputModalities: ["audio", "video"],
      availability: "available",
      lastSuccessfulScanAt: scanAt,
    });
    expect(Object.keys(result.models[0])).not.toContain("secretRef");
    expect(Object.keys(result.models[0])).not.toContain("endpointUrl");
    expect(JSON.stringify(result.models)).not.toContain("distinctive-secret-that-must-not-persist");
    expect(JSON.stringify(result.models)).not.toContain("https://must-not-persist.example");
  });

  it("produces byte-equivalent records for reordered equivalent payloads", () => {
    const first = normalizeDiscoveredCatalog(connection(), payload([candidate("b"), candidate("a")]), scanAt);
    const second = normalizeDiscoveredCatalog(connection(), payload([candidate("a"), candidate("b")]), scanAt);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it.each([
    [null, "invalid_payload"],
    [{ models: null }, "invalid_payload"],
    [payload([null]), "invalid_candidate"],
    [payload([candidate("")]), "invalid_candidate"],
    [payload([candidate("a", { contextWindowTokens: -1 })]), "invalid_candidate"],
    [payload([candidate("a", { pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: Infinity, currency: "USD" } })]), "invalid_candidate"],
    [payload([candidate("a", { inputModalities: ["text", "unsafe"] })]), "invalid_candidate"],
    [payload([candidate("a", { capabilities: { reasoning: "yes", tools: false, api: true } })]), "invalid_candidate"],
    [payload([candidate("a", { pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 } })]), "invalid_candidate"],
    [payload([candidate("a", { availability: "unavailable" })]), "invalid_candidate"],
  ])("rejects malformed source data without throwing (%#)", (source, reason) => {
    expect(normalizeDiscoveredCatalog(connection(), source, scanAt)).toEqual({ kind: "rejected", reason });
  });

  it("rejects duplicate connection-plus-model identities before yielding a snapshot", () => {
    expect(normalizeDiscoveredCatalog(connection(), payload([candidate("same"), candidate("same")]), scanAt))
      .toEqual({ kind: "rejected", reason: "duplicate_identity" });
  });

  it("rejects malformed connection and scan timestamp boundaries", () => {
    expect(normalizeDiscoveredCatalog({ connectionId: "connection-a" } as ProviderConnectionRecord, payload([]), scanAt))
      .toEqual({ kind: "rejected", reason: "invalid_connection" });
    expect(normalizeDiscoveredCatalog(connection(), payload([]), "not-a-timestamp"))
      .toEqual({ kind: "rejected", reason: "invalid_scan_timestamp" });
  });
});
