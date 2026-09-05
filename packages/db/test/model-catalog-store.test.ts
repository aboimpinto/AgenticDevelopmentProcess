import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ModelCatalogStore } from "../src/model-catalog-store.js";
import {
  normalizeDiscoveredCatalog,
  type CatalogModelPricing,
  type CatalogModelRecord,
  type CatalogScanDiagnostic,
  type CatalogStoreScanOutcome,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";

const scanAt = "2026-07-22T13:00:00.000Z";

function connection(connectionId: string): ProviderConnectionRecord {
  return {
    connectionId: connectionId as ProviderConnectionId,
    kind: "known",
    label: `Connection ${connectionId}`,
    provider: { kind: "known", providerId: "openai" },
    endpointUrl: "https://api.openai.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: "opaque-reference",
    secretVersion: 1,
    createdAt: scanAt,
    updatedAt: scanAt,
  };
}

function model(
  connectionRecord: ProviderConnectionRecord,
  modelId: string,
  pricing: CatalogModelPricing | null = { inputPerMillionUsd: 1, outputPerMillionUsd: 2, currency: "USD" },
): CatalogModelRecord {
  const normalized = normalizeDiscoveredCatalog(connectionRecord, {
    models: [{
      modelId,
      inputModalities: ["text"],
      capabilities: { reasoning: true, tools: true, api: true },
      pricing,
    }],
  }, scanAt);
  if (normalized.kind !== "success") throw new Error("Fixture normalization failed.");
  return normalized.models[0]!;
}

function models(connectionRecord: ProviderConnectionRecord, ids: string[]) {
  return ids.map((modelId) => model(connectionRecord, modelId))
    .sort((left, right) => left.identity.modelId.localeCompare(right.identity.modelId));
}

function diagnostic(
  connectionId: ProviderConnectionId,
  overrides: Partial<CatalogScanDiagnostic> = {},
): CatalogScanDiagnostic {
  return {
    schemaVersion: "model-catalog/v1",
    diagnosticId: `diagnostic-${overrides.diagnosticId ?? "one"}`,
    connectionId,
    scanCorrelationId: "scan-correlation",
    outcome: "success",
    safeMessage: "Catalog scan succeeded.",
    httpStatusCode: 200,
    occurredAt: scanAt,
    ...overrides,
  };
}

function outcome(
  connectionRecord: ProviderConnectionRecord,
  ids: string[],
  diagnosticOverrides: Partial<CatalogScanDiagnostic> = {},
): CatalogStoreScanOutcome {
  return {
    connectionId: connectionRecord.connectionId,
    models: models(connectionRecord, ids),
    diagnostic: diagnostic(connectionRecord.connectionId, diagnosticOverrides),
  };
}

describe("ModelCatalogStore", () => {
  it("persists and reads snapshots in lexical connection-plus-model identity order", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      const connectionB = connection("connection-b");
      store.applyScanOutcome(outcome(connectionB, ["z", "a"], { diagnosticId: "b" }));
      store.applyScanOutcome(outcome(connectionA, ["b"], { diagnosticId: "a" }));

      expect(store.listModels().map((model) => `${model.identity.connectionId}/${model.identity.modelId}`)).toEqual([
        "connection-a/b",
        "connection-b/a",
        "connection-b/z",
      ]);
      expect(store.listModelsForConnection(connectionB.connectionId).map((model) => model.identity.modelId)).toEqual(["a", "z"]);
    } finally {
      store.close();
    }
  });

  it("atomically replaces one connection snapshot without affecting another", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      const connectionB = connection("connection-b");
      store.applyScanOutcome(outcome(connectionA, ["stale-a"], { diagnosticId: "a-first" }));
      store.applyScanOutcome(outcome(connectionB, ["model-b"], { diagnosticId: "b-first" }));
      store.applyScanOutcome(outcome(connectionA, ["fresh-a"], { diagnosticId: "a-second" }));

      expect(store.listModelsForConnection(connectionA.connectionId).map((model) => model.identity.modelId)).toEqual(["fresh-a"]);
      expect(store.listModelsForConnection(connectionB.connectionId).map((model) => model.identity.modelId)).toEqual(["model-b"]);
    } finally {
      store.close();
    }
  });

  it("clears only the failed connection snapshot while preserving the other snapshot and diagnostics", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      const connectionB = connection("connection-b");
      store.applyScanOutcome(outcome(connectionA, ["model-a"], { diagnosticId: "a-success" }));
      store.applyScanOutcome(outcome(connectionB, ["model-b"], { diagnosticId: "b-success" }));
      store.applyScanOutcome({
        connectionId: connectionA.connectionId,
        models: [],
        diagnostic: diagnostic(connectionA.connectionId, {
          diagnosticId: "a-failed",
          outcome: "timeout",
          safeMessage: "Catalog scan timed out.",
          httpStatusCode: null,
          occurredAt: "2026-07-22T13:01:00.000Z",
        }),
      });

      expect(store.listModelsForConnection(connectionA.connectionId)).toEqual([]);
      expect(store.listModelsForConnection(connectionB.connectionId).map((model) => model.identity.modelId)).toEqual(["model-b"]);
      expect(store.listDiagnostics(connectionA.connectionId).map((entry) => entry.diagnosticId)).toEqual(["a-failed", "a-success"]);
      expect(store.listDiagnostics(connectionB.connectionId).map((entry) => entry.diagnosticId)).toEqual(["b-success"]);
    } finally {
      store.close();
    }
  });

  it("applies one deterministic failure idempotently and rejects diagnostic identity collisions", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      store.applyScanOutcome(outcome(connectionA, ["stale-model"], { diagnosticId: "initial" }));
      const failure: CatalogStoreScanOutcome = {
        connectionId: connectionA.connectionId,
        models: [],
        diagnostic: diagnostic(connectionA.connectionId, {
          diagnosticId: "deterministic-failure",
          scanCorrelationId: "attempt-a",
          outcome: "process_failed",
          safeMessage: "Catalog scan failed safely.",
          httpStatusCode: null,
        }),
      };

      store.applyIdempotentFailureOutcome(failure);
      store.applyIdempotentFailureOutcome(failure);
      expect(store.listModelsForConnection(connectionA.connectionId)).toEqual([]);
      expect(store.listDiagnostics(connectionA.connectionId).filter((entry) => entry.diagnosticId === "deterministic-failure"))
        .toHaveLength(1);

      expect(() => store.applyIdempotentFailureOutcome({
        ...failure,
        diagnostic: { ...failure.diagnostic, safeMessage: "Different safe fields." },
      })).toThrow("Catalog diagnostic identity collision.");
      expect(() => store.applyIdempotentFailureOutcome({
        ...failure,
        diagnostic: { ...failure.diagnostic, diagnosticId: "success-not-allowed", outcome: "success" },
      })).toThrow("Invalid idempotent catalog failure outcome.");
    } finally {
      store.close();
    }
  });

  it("accepts a successful empty snapshot and records its diagnostic", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      store.applyScanOutcome({
        connectionId: connectionA.connectionId,
        models: [],
        diagnostic: diagnostic(connectionA.connectionId),
      });

      expect(store.listModelsForConnection(connectionA.connectionId)).toEqual([]);
      expect(store.listDiagnostics(connectionA.connectionId)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("rejects an invalid mutation before clearing the existing snapshot", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      store.applyScanOutcome(outcome(connectionA, ["safe-model"]));

      expect(() => store.applyScanOutcome({
        connectionId: connectionA.connectionId,
        models: [{ identity: { connectionId: connectionA.connectionId, modelId: "unsafe" } }],
        diagnostic: diagnostic(connectionA.connectionId, { diagnosticId: "invalid" }),
      } as unknown as CatalogStoreScanOutcome)).toThrow("Invalid catalog scan outcome.");
      expect(store.listModelsForConnection(connectionA.connectionId).map((model) => model.identity.modelId)).toEqual(["safe-model"]);
    } finally {
      store.close();
    }
  });

  it("rejects an unsorted snapshot before changing the existing connection state", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      store.applyScanOutcome(outcome(connectionA, ["safe-model"]));
      const unsorted = outcome(connectionA, ["a", "z"], { diagnosticId: "unsorted" });

      expect(() => store.applyScanOutcome({ ...unsorted, models: [...unsorted.models].reverse() })).toThrow("Invalid catalog scan outcome.");
      expect(store.listModelsForConnection(connectionA.connectionId).map((model) => model.identity.modelId)).toEqual(["safe-model"]);
    } finally {
      store.close();
    }
  });

  it("creates the disk schema and reads the V1 snapshot back after reopening", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-model-catalog-"));
    const databasePath = join(directory, "catalog.sqlite");
    const connectionA = connection("connection-a");
    const original = new ModelCatalogStore(databasePath);
    try {
      original.applyScanOutcome(outcome(connectionA, ["persisted-model"], { diagnosticId: "persisted" }));
    } finally {
      original.close();
    }

    const reopened = new ModelCatalogStore(databasePath);
    try {
      expect(reopened.listModelsForConnection(connectionA.connectionId).map((model) => model.identity.modelId))
        .toEqual(["persisted-model"]);
      expect(reopened.listDiagnostics(connectionA.connectionId).map((entry) => entry.diagnosticId))
        .toEqual(["persisted"]);
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("round trips null, numeric USD, and present all-null pricing without collapsing pricing presence", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-model-catalog-pricing-"));
    const databasePath = join(directory, "catalog.sqlite");
    const connectionA = connection("connection-a");
    const expectedModels = [
      model(connectionA, "no-pricing", null),
      model(connectionA, "usd-pricing", { inputPerMillionUsd: 1, outputPerMillionUsd: 2, currency: "USD" }),
      model(connectionA, "unknown-pricing", { inputPerMillionUsd: null, outputPerMillionUsd: null, currency: null }),
    ].sort((left, right) => left.identity.modelId.localeCompare(right.identity.modelId));
    const original = new ModelCatalogStore(databasePath);
    try {
      original.applyScanOutcome({
        connectionId: connectionA.connectionId,
        models: expectedModels,
        diagnostic: diagnostic(connectionA.connectionId, { diagnosticId: "pricing-matrix" }),
      });
    } finally {
      original.close();
    }

    const reopened = new ModelCatalogStore(databasePath);
    try {
      expect(reopened.listModelsForConnection(connectionA.connectionId)).toEqual(expectedModels);
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed persisted model and diagnostic values without coercion", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-model-catalog-invalid-"));
    const connectionA = connection("connection-a");
    const mutations: readonly {
      readonly name: string;
      readonly table: "catalog_models" | "catalog_scan_diagnostics";
      readonly column: string;
      readonly value: unknown;
      readonly read: (store: ModelCatalogStore) => unknown;
    }[] = [
      { name: "capability 2", table: "catalog_models", column: "reasoning", value: 2, read: (store) => store.listModels() },
      { name: "non-string nullable text", table: "catalog_models", column: "display_name", value: new Uint8Array([7]), read: (store) => store.listModels() },
      { name: "negative numeric limit", table: "catalog_models", column: "context_window_tokens", value: -1, read: (store) => store.listModels() },
      { name: "non-finite numeric limit", table: "catalog_models", column: "max_output_tokens", value: Number.POSITIVE_INFINITY, read: (store) => store.listModels() },
      { name: "out-of-range price", table: "catalog_models", column: "input_per_million_usd", value: 1_000_001, read: (store) => store.listModels() },
      { name: "non-USD currency", table: "catalog_models", column: "pricing_currency", value: "EUR", read: (store) => store.listModels() },
      { name: "malformed modalities JSON", table: "catalog_models", column: "input_modalities_json", value: "[", read: (store) => store.listModels() },
      { name: "invalid provider kind", table: "catalog_models", column: "provider_kind", value: "legacy", read: (store) => store.listModels() },
      { name: "invalid diagnostic outcome", table: "catalog_scan_diagnostics", column: "outcome", value: "unknown", read: (store) => store.listDiagnostics(connectionA.connectionId) },
      { name: "non-integer HTTP status", table: "catalog_scan_diagnostics", column: "http_status_code", value: 200.5, read: (store) => store.listDiagnostics(connectionA.connectionId) },
    ];

    try {
      for (const [index, mutation] of mutations.entries()) {
        const databasePath = join(directory, `${index}.sqlite`);
        const writer = new ModelCatalogStore(databasePath);
        try {
          writer.applyScanOutcome(outcome(connectionA, ["valid-model"], { diagnosticId: `valid-${index}` }));
        } finally {
          writer.close();
        }
        const control = new ModelCatalogStore(databasePath);
        try {
          expect(control.listModels()).toHaveLength(1);
          expect(control.listDiagnostics(connectionA.connectionId)).toHaveLength(1);
        } finally {
          control.close();
        }
        const database = new DatabaseSync(databasePath);
        try {
          database.prepare(`update ${mutation.table} set ${mutation.column} = ?`).run(mutation.value);
        } finally {
          database.close();
        }

        const reader = new ModelCatalogStore(databasePath);
        try {
          expect(() => mutation.read(reader), mutation.name).toThrow("Stored catalog contract is invalid.");
        } finally {
          reader.close();
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("recreates a prior catalog-model schema without inferring legacy pricing presence", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-model-catalog-migration-"));
    const databasePath = join(directory, "catalog.sqlite");
    const connectionA = connection("connection-a");
    const legacy = new DatabaseSync(databasePath);
    try {
      legacy.exec(`
        create table catalog_models (
          connection_id text not null,
          model_id text not null,
          provider_kind text not null,
          provider_label text not null,
          display_name text,
          description text,
          context_window_tokens integer,
          max_output_tokens integer,
          input_modalities_json text not null,
          reasoning integer,
          tools integer,
          api integer,
          input_per_million_usd real,
          output_per_million_usd real,
          pricing_currency text,
          last_successful_scan_at text not null,
          primary key (connection_id, model_id)
        );
        insert into catalog_models values (
          'connection-a', 'legacy-model', 'known', 'Connection connection-a', null, null,
          null, null, '["text"]', 1, 1, 1, null, null, null, '${scanAt}'
        );
      `);
    } finally {
      legacy.close();
    }

    const store = new ModelCatalogStore(databasePath);
    try {
      expect(store.listModelsForConnection(connectionA.connectionId)).toEqual([]);
      const current = model(connectionA, "current-model", { inputPerMillionUsd: null, outputPerMillionUsd: null, currency: null });
      store.applyScanOutcome({
        connectionId: connectionA.connectionId,
        models: [current],
        diagnostic: diagnostic(connectionA.connectionId, { diagnosticId: "current" }),
      });
      expect(store.listModelsForConnection(connectionA.connectionId)).toEqual([current]);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("retains the newest 20 connection-scoped diagnostics in deterministic descending order", () => {
    const store = ModelCatalogStore.createInMemory();
    try {
      const connectionA = connection("connection-a");
      for (let sequence = 0; sequence < 21; sequence++) {
        store.applyScanOutcome(outcome(connectionA, [], {
          diagnosticId: String(sequence).padStart(2, "0"),
          occurredAt: `2026-07-22T13:${String(sequence).padStart(2, "0")}:00.000Z`,
        }));
      }

      const entries = store.listDiagnostics(connectionA.connectionId, 20);
      expect(entries).toHaveLength(20);
      expect(entries[0]?.diagnosticId).toBe("20");
      expect(entries[19]?.diagnosticId).toBe("01");
      expect(() => store.listDiagnostics(connectionA.connectionId, 21)).toThrow("Catalog diagnostic limit must be an integer from 1 to 20.");
    } finally {
      store.close();
    }
  });
});
