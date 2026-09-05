import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CatalogReconciliationStore, ModelCatalogStore } from "@hepha/db";
import {
  CATALOG_RECONCILIATION_TARGET_VERSION,
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  MAX_CATALOG_RECONCILIATION_TEXT_LENGTH,
  MODEL_CATALOG_SCHEMA_VERSION,
  normalizeDiscoveredCatalog,
  type CatalogScanResult,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import { CatalogFailClosedOutcomeWriter } from "../src/model-catalog/catalog-fail-closed-outcome-writer.js";
import {
  CATALOG_COORDINATOR_FAILURE_MESSAGE,
  CatalogScanCoordinator,
} from "../src/model-catalog/catalog-scan-coordinator.js";

const claimedAt = "2026-07-24T12:00:00.000Z";
const settledAt = "2026-07-24T12:01:00.000Z";
const id = (value: string) => value as ProviderConnectionId;

function connection(
  connectionId = "connection-a",
  overrides: Partial<ProviderConnectionRecord> = {},
): ProviderConnectionRecord {
  return {
    connectionId: id(connectionId),
    kind: "pi_session",
    label: connectionId,
    provider: { kind: "pi_session" },
    endpointUrl: "https://api.openai.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: null,
    secretVersion: null,
    createdAt: claimedAt,
    updatedAt: claimedAt,
    ...overrides,
  };
}

function result(
  connectionId: ProviderConnectionId,
  attemptId: string,
  outcome: CatalogScanResult["outcome"] = "success",
  modelCount = 1,
): CatalogScanResult {
  return {
    connectionId,
    scanCorrelationId: attemptId,
    outcome,
    modelCount,
    diagnostic: {
      schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
      diagnosticId: `diagnostic-${attemptId}`,
      connectionId,
      scanCorrelationId: attemptId,
      outcome,
      safeMessage: outcome === "success" ? "Model catalog scan completed." : "Provider catalog scan failed.",
      httpStatusCode: null,
      occurredAt: settledAt,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

const validTriggerModePairs = [
  { trigger: "startup_reconciliation", mode: "eligible_only" },
  { trigger: "connection_created", mode: "force_settled" },
  { trigger: "material_connection_change", mode: "force_settled" },
  { trigger: "connection_reactivated", mode: "force_settled" },
  { trigger: "credential_changed", mode: "force_settled" },
  { trigger: "individual_retry", mode: "force_settled" },
  { trigger: "scan_active", mode: "force_settled" },
] as const;

const forbiddenTriggerModePairs = [
  { trigger: "startup_reconciliation", mode: "force_settled" },
  { trigger: "connection_created", mode: "eligible_only" },
  { trigger: "material_connection_change", mode: "eligible_only" },
  { trigger: "connection_reactivated", mode: "eligible_only" },
  { trigger: "credential_changed", mode: "eligible_only" },
  { trigger: "individual_retry", mode: "eligible_only" },
  { trigger: "scan_active", mode: "eligible_only" },
] as const;

function coordinatorFixture(input: {
  databasePath?: string;
  connection?: ProviderConnectionRecord;
  discovery: { scanConnection(request: { connectionId: string; scanCorrelationId: string }): Promise<CatalogScanResult> };
  attemptId?: string;
}) {
  const reconciliationStore = input.databasePath
    ? new CatalogReconciliationStore(input.databasePath)
    : CatalogReconciliationStore.createInMemory();
  const catalogStore = input.databasePath
    ? new ModelCatalogStore(input.databasePath)
    : ModelCatalogStore.createInMemory();
  const record = input.connection ?? connection();
  const failureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
  const coordinator = new CatalogScanCoordinator({
    connections: { getConnection: (connectionId) => connectionId === record.connectionId ? record : null },
    reconciliationStore,
    discovery: input.discovery as never,
    failureWriter,
    clock: { now: () => settledAt },
    createAttemptId: () => input.attemptId ?? "attempt-a",
  });
  return { catalogStore, coordinator, reconciliationStore, record };
}

function measuredCoordinatorFixture() {
  const reconciliationStore = CatalogReconciliationStore.createInMemory();
  const catalogStore = ModelCatalogStore.createInMemory();
  const record = connection();
  const actualFailureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
  const effects = {
    connectionLookups: 0,
    attemptIds: 0,
    claims: [] as Array<{ trigger: string; mode: string }>,
    discoveryRequests: [] as Array<{ connectionId: string; scanCorrelationId: string }>,
    failureWrites: 0,
    settlements: 0,
  };
  const coordinator = new CatalogScanCoordinator({
    connections: {
      getConnection: (connectionId) => {
        effects.connectionLookups += 1;
        return connectionId === record.connectionId ? record : null;
      },
    },
    reconciliationStore: {
      claimAttempt: (request) => {
        effects.claims.push({ trigger: request.trigger, mode: request.mode });
        return reconciliationStore.claimAttempt(request);
      },
      settleAttempt: (request) => {
        effects.settlements += 1;
        return reconciliationStore.settleAttempt(request);
      },
    },
    discovery: {
      scanConnection: async (request) => {
        effects.discoveryRequests.push(request);
        return result(id(request.connectionId), request.scanCorrelationId);
      },
    } as never,
    failureWriter: {
      apply: (request: Parameters<CatalogFailClosedOutcomeWriter["apply"]>[0]) => {
        effects.failureWrites += 1;
        return actualFailureWriter.apply(request);
      },
    } as CatalogFailClosedOutcomeWriter,
    clock: { now: () => settledAt },
    createAttemptId: () => {
      effects.attemptIds += 1;
      return "attempt-matrix";
    },
  });
  return {
    catalogStore,
    coordinator,
    effects,
    reconciliationStore,
    record,
    close: () => {
      reconciliationStore.close();
      catalogStore.close();
    },
  };
}

describe("CatalogScanCoordinator", () => {
  it("claims before provider I/O and returns the exact same Promise for same-process overlap", async () => {
    const pending = deferred<CatalogScanResult>();
    let providerCalls = 0;
    let fixture!: ReturnType<typeof coordinatorFixture>;
    fixture = coordinatorFixture({
      discovery: {
        scanConnection: async ({ connectionId, scanCorrelationId }) => {
          providerCalls += 1;
          expect(fixture.reconciliationStore.read(id(connectionId))).toMatchObject({
            scanState: "scanning",
            attemptId: scanCorrelationId,
          });
          return pending.promise;
        },
      },
    });
    try {
      const first = fixture.coordinator.scanConnection({
        connectionId: fixture.record.connectionId,
        trigger: "startup_reconciliation",
        mode: "eligible_only",
      });
      const overlap = fixture.coordinator.scanConnection({
        connectionId: fixture.record.connectionId,
        trigger: "individual_retry",
        mode: "force_settled",
      });
      expect(overlap).toBe(first);
      expect(providerCalls).toBe(1);
      pending.resolve(result(fixture.record.connectionId, "attempt-a"));
      await expect(first).resolves.toMatchObject({ scanState: "available", modelCount: 1 });
    } finally {
      fixture.reconciliationStore.close();
      fixture.catalogStore.close();
    }
  });

  it("refuses a second-store claimant without provider I/O", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-coordinator-cross-store-"));
    const path = join(directory, "catalog.sqlite");
    const pending = deferred<CatalogScanResult>();
    let firstCalls = 0;
    let secondCalls = 0;
    const first = coordinatorFixture({
      databasePath: path,
      attemptId: "winner",
      discovery: { scanConnection: async ({ connectionId }) => {
        firstCalls += 1;
        return pending.promise.then(() => result(id(connectionId), "winner"));
      } },
    });
    const second = coordinatorFixture({
      databasePath: path,
      attemptId: "loser",
      discovery: { scanConnection: async ({ connectionId }) => {
        secondCalls += 1;
        return result(id(connectionId), "loser");
      } },
    });
    try {
      const winning = first.coordinator.scanConnection({ connectionId: id("connection-a"), trigger: "startup_reconciliation", mode: "eligible_only" });
      await expect(second.coordinator.scanConnection({ connectionId: id("connection-a"), trigger: "individual_retry", mode: "force_settled" }))
        .resolves.toMatchObject({ scanState: "scanning", attemptId: "winner" });
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(0);
      pending.resolve(result(id("connection-a"), "winner"));
      await winning;
    } finally {
      first.reconciliationStore.close();
      first.catalogStore.close();
      second.reconciliationStore.close();
      second.catalogStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["success", 2, "available"],
    ["success", 0, "empty"],
    ["timeout", 0, "failed"],
  ] as const)("settles %s with %i models as %s", async (outcome, modelCount, scanState) => {
    const fixture = coordinatorFixture({
      discovery: { scanConnection: async ({ connectionId, scanCorrelationId }) => result(id(connectionId), scanCorrelationId, outcome, modelCount) },
    });
    try {
      await expect(fixture.coordinator.scanConnection({
        connectionId: fixture.record.connectionId,
        trigger: "startup_reconciliation",
        mode: "eligible_only",
      })).resolves.toMatchObject({ scanState, modelCount, outcomeCode: outcome });
    } finally {
      fixture.reconciliationStore.close();
      fixture.catalogStore.close();
    }
  });

  it("fails closed when discovery throws, clears stale rows, and settles a deterministic safe outcome", async () => {
    const fixture = coordinatorFixture({
      discovery: { scanConnection: async () => { throw new Error("secret-bearing provider detail"); } },
    });
    const normalized = normalizeDiscoveredCatalog(fixture.record, { models: [{ modelId: "stale" }] }, claimedAt);
    if (normalized.kind !== "success") throw new Error("fixture normalization failed");
    fixture.catalogStore.applyScanOutcome({
      connectionId: fixture.record.connectionId,
      models: normalized.models,
      diagnostic: result(fixture.record.connectionId, "old-attempt").diagnostic,
    });
    try {
      await expect(fixture.coordinator.scanConnection({
        connectionId: fixture.record.connectionId,
        trigger: "startup_reconciliation",
        mode: "eligible_only",
      })).resolves.toMatchObject({
        scanState: "failed",
        outcomeCode: "coordinator_failure",
        safeOutcomeMessage: CATALOG_COORDINATOR_FAILURE_MESSAGE,
      });
      expect(fixture.catalogStore.listModelsForConnection(fixture.record.connectionId)).toEqual([]);
      expect(JSON.stringify(fixture.catalogStore.listDiagnostics(fixture.record.connectionId))).not.toContain("secret-bearing");
    } finally {
      fixture.reconciliationStore.close();
      fixture.catalogStore.close();
    }
  });

  it.each([
    undefined,
    null,
    true,
    42,
    "request",
    [],
    {},
    { connectionId: "connection-a", trigger: "startup_reconciliation" },
    { connectionId: "connection-a", mode: "eligible_only" },
    { trigger: "startup_reconciliation", mode: "eligible_only" },
    { connectionId: "connection-a", trigger: "startup_reconciliation", mode: "eligible_only", extra: true },
    { connectionId: null, trigger: "startup_reconciliation", mode: "eligible_only" },
    { connectionId: "", trigger: "startup_reconciliation", mode: "eligible_only" },
    {
      connectionId: "x".repeat(MAX_CATALOG_RECONCILIATION_TEXT_LENGTH + 1),
      trigger: "startup_reconciliation",
      mode: "eligible_only",
    },
    { connectionId: "connection-a", trigger: null, mode: "eligible_only" },
    { connectionId: "connection-a", trigger: "", mode: "eligible_only" },
    { connectionId: "connection-a", trigger: 42, mode: "eligible_only" },
    { connectionId: "connection-a", trigger: "unknown", mode: "eligible_only" },
    { connectionId: "connection-a", trigger: "startup_reconciliation", mode: null },
    { connectionId: "connection-a", trigger: "startup_reconciliation", mode: "" },
    { connectionId: "connection-a", trigger: "startup_reconciliation", mode: 42 },
    { connectionId: "connection-a", trigger: "startup_reconciliation", mode: "unknown" },
  ])("rejects malformed exact-shape request %# before every measured side effect", async (request) => {
    const fixture = measuredCoordinatorFixture();
    try {
      await expect(fixture.coordinator.scanConnection(request)).rejects.toThrow(
        INVALID_CATALOG_RECONCILIATION_CONTRACT,
      );
      expect(fixture.effects).toEqual({
        connectionLookups: 0,
        attemptIds: 0,
        claims: [],
        discoveryRequests: [],
        failureWrites: 0,
        settlements: 0,
      });
      expect(fixture.reconciliationStore.list()).toEqual([]);
      expect(fixture.catalogStore.listModels()).toEqual([]);
      expect(fixture.catalogStore.listDiagnostics(fixture.record.connectionId)).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it.each(forbiddenTriggerModePairs)(
    "rejects forbidden trigger/mode pair $trigger + $mode before every measured side effect",
    async (request) => {
      const fixture = measuredCoordinatorFixture();
      try {
        await expect(fixture.coordinator.scanConnection({
          connectionId: fixture.record.connectionId,
          ...request,
        })).rejects.toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
        expect(fixture.effects).toEqual({
          connectionLookups: 0,
          attemptIds: 0,
          claims: [],
          discoveryRequests: [],
          failureWrites: 0,
          settlements: 0,
        });
        expect(fixture.reconciliationStore.list()).toEqual([]);
        expect(fixture.catalogStore.listModels()).toEqual([]);
        expect(fixture.catalogStore.listDiagnostics(fixture.record.connectionId)).toEqual([]);
      } finally {
        fixture.close();
      }
    },
  );

  it.each(validTriggerModePairs)(
    "passes valid trigger/mode pair $trigger + $mode through a winning claim",
    async (request) => {
      const fixture = measuredCoordinatorFixture();
      try {
        await expect(fixture.coordinator.scanConnection({
          connectionId: fixture.record.connectionId,
          ...request,
        })).resolves.toMatchObject({
          connectionId: fixture.record.connectionId,
          attemptId: "attempt-matrix",
          trigger: request.trigger,
          scanState: "available",
        });
        expect(fixture.effects).toEqual({
          connectionLookups: 1,
          attemptIds: 1,
          claims: [{ trigger: request.trigger, mode: request.mode }],
          discoveryRequests: [{
            connectionId: fixture.record.connectionId,
            scanCorrelationId: "attempt-matrix",
          }],
          failureWrites: 0,
          settlements: 1,
        });
      } finally {
        fixture.close();
      }
    },
  );

  it.each(validTriggerModePairs)(
    "passes valid trigger/mode pair $trigger + $mode through an already-scanning claim",
    async (request) => {
      const fixture = measuredCoordinatorFixture();
      fixture.reconciliationStore.claimAttempt({
        connectionId: fixture.record.connectionId,
        reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
        trigger: "startup_reconciliation",
        attemptId: "existing-attempt",
        claimedAt,
        mode: "eligible_only",
      });
      try {
        await expect(fixture.coordinator.scanConnection({
          connectionId: fixture.record.connectionId,
          ...request,
        })).resolves.toMatchObject({
          connectionId: fixture.record.connectionId,
          attemptId: "existing-attempt",
          scanState: "scanning",
        });
        expect(fixture.effects).toEqual({
          connectionLookups: 1,
          attemptIds: 1,
          claims: [{ trigger: request.trigger, mode: request.mode }],
          discoveryRequests: [],
          failureWrites: 0,
          settlements: 0,
        });
      } finally {
        fixture.close();
      }
    },
  );

  it("rejects malformed or inactive requests before claim and provider I/O", async () => {
    let calls = 0;
    const fixture = coordinatorFixture({
      connection: connection("connection-a", { lifecycleState: "revoked" }),
      discovery: { scanConnection: async ({ connectionId, scanCorrelationId }) => {
        calls += 1;
        return result(id(connectionId), scanCorrelationId);
      } },
    });
    try {
      await expect(fixture.coordinator.scanConnection(null)).rejects.toThrow("Invalid catalog reconciliation contract.");
      await expect(fixture.coordinator.scanConnection({
        connectionId: fixture.record.connectionId,
        trigger: "startup_reconciliation",
        mode: "eligible_only",
      })).rejects.toThrow("Catalog connection is not eligible for scanning.");
      expect(calls).toBe(0);
      expect(fixture.reconciliationStore.list()).toEqual([]);
    } finally {
      fixture.reconciliationStore.close();
      fixture.catalogStore.close();
    }
  });
});
