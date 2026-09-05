import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CatalogReconciliationStore,
  ModelCatalogStore,
  ProviderConnectionStore,
} from "@hepha/db";
import {
  MODEL_CATALOG_SCHEMA_VERSION,
  normalizeDiscoveredCatalog,
  type CatalogModelRecord,
  type CatalogScanDiagnostic,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { CatalogDiscoveryService } from "../src/model-catalog/catalog-discovery-service.js";
import { CatalogFailClosedOutcomeWriter } from "../src/model-catalog/catalog-fail-closed-outcome-writer.js";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";
import type {
  AuthorizedCatalogTransport,
  PiCatalogProcess,
} from "../src/model-catalog/catalog-ports.js";
import {
  CatalogScanCoordinator,
  deterministicDiagnosticId,
} from "../src/model-catalog/catalog-scan-coordinator.js";
import {
  INTERRUPTED_SCAN_MESSAGE,
  CatalogStartupReconciler,
} from "../src/model-catalog/catalog-startup-reconciler.js";

const specification = readFileSync(
  fileURLToPath(new URL("./catalog-startup-reconciliation.feature", import.meta.url)),
  "utf8",
);
const initialAt = "2026-07-24T10:00:00.000Z";
const scanAt = "2026-07-24T10:01:00.000Z";
const settledAt = "2026-07-24T10:02:00.000Z";
const startupAt = "2026-07-24T10:03:00.000Z";
const id = (value: string) => value as ProviderConnectionId;

function connection(connectionId: string, endpointUrl: string): ProviderConnectionRecord {
  return {
    connectionId: id(connectionId),
    kind: "pi_session",
    label: connectionId === "openai" ? "OpenAI" : "DeepSeek",
    provider: { kind: "pi_session" },
    endpointUrl,
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: null,
    secretVersion: null,
    createdAt: initialAt,
    updatedAt: initialAt,
  };
}

function successDiagnostic(
  connectionId: ProviderConnectionId,
  correlation = `legacy-${connectionId}`,
  occurredAt = initialAt,
): CatalogScanDiagnostic {
  return {
    schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
    diagnosticId: `diagnostic-${correlation}`,
    connectionId,
    scanCorrelationId: correlation,
    outcome: "success",
    safeMessage: "Model catalog scan completed.",
    httpStatusCode: null,
    occurredAt,
  };
}

function model(record: ProviderConnectionRecord, modelId: string, at = initialAt): CatalogModelRecord {
  const normalized = normalizeDiscoveredCatalog(record, { models: [{ modelId }] }, at);
  if (normalized.kind !== "success") throw new Error("fixture normalization failed");
  return normalized.models[0]!;
}

class ProviderQualifiedPiProcess implements PiCatalogProcess {
  calls = 0;
  async listModels() {
    this.calls += 1;
    return {
      kind: "success" as const,
      stdout: [
        "provider model context max-out thinking images",
        "openai gpt-fixture 128K 32K yes yes",
        "deepseek deepseek-fixture 128K 16K yes no",
      ].join("\n"),
    };
  }
}

const noCompatibleTransport: AuthorizedCatalogTransport = {
  requestModels: async () => { throw new Error("compatible transport must not be called"); },
};

describe("CatalogStartupReconciler", () => {
  it("binds every generic startup scenario to public reconciler behavior", () => {
    expect(specification.match(/^  Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("adopts existing OpenAI evidence, scans only DeepSeek once through the provider-qualified Pi parser, and is restart-idempotent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-startup-migration-"));
    const providerPath = join(directory, "providers.sqlite");
    const catalogPath = join(directory, "catalog.sqlite");
    const providerStore = new ProviderConnectionStore(providerPath);
    const catalogStore = new ModelCatalogStore(catalogPath);
    const reconciliationStore = new CatalogReconciliationStore(catalogPath);
    const openai = connection("openai", "https://api.openai.com/v1");
    const deepseek = connection("deepseek", "https://api.deepseek.com");
    providerStore.insertConnection(openai);
    providerStore.insertConnection(deepseek);
    catalogStore.applyScanOutcome({
      connectionId: openai.connectionId,
      models: [model(openai, "gpt-fixture")],
      diagnostic: successDiagnostic(openai.connectionId),
    });

    const connections = new ProviderConnectionService({
      store: providerStore,
      vault: new InMemorySecretVault(),
      transport: new FakeEndpointTransport(),
    });
    const process = new ProviderQualifiedPiProcess();
    const discovery = new CatalogDiscoveryService({
      connections,
      store: catalogStore,
      piScanner: new PiModelCatalogScanner(process),
      openAiScanner: new OpenAiCompatibleCatalogScanner(),
      credentialBroker: new ScanCredentialBroker(new InMemorySecretVault(), noCompatibleTransport),
      clock: { now: () => scanAt },
    });
    const failureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
    let attempt = 0;
    const coordinator = new CatalogScanCoordinator({
      connections,
      reconciliationStore,
      discovery,
      failureWriter,
      clock: { now: () => settledAt },
      createAttemptId: () => `startup-attempt-${++attempt}`,
    });
    const reconciler = new CatalogStartupReconciler({
      connections,
      reconciliationStore,
      catalogStore,
      coordinator,
      failureWriter,
      clock: { now: () => startupAt },
    });

    try {
      await reconciler.reconcileAtStartup();
      expect(process.calls).toBe(1);
      expect(reconciliationStore.read(openai.connectionId)).toMatchObject({
        scanState: "available",
        outcomeCode: "legacy_evidence_adopted",
      });
      expect(reconciliationStore.read(deepseek.connectionId)).toMatchObject({
        scanState: "available",
        outcomeCode: "success",
        modelCount: 1,
      });
      expect(catalogStore.listModels().map((entry) => `${entry.providerLabel}/${entry.identity.modelId}`))
        .toEqual(["DeepSeek/deepseek-fixture", "OpenAI/gpt-fixture"]);

      await reconciler.reconcileAtStartup();
      expect(process.calls).toBe(1);
      expect(attempt).toBe(1);
    } finally {
      reconciliationStore.close();
      catalogStore.close();
      providerStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("replays interrupted recovery without duplicate diagnostics or provider contact", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-startup-interrupted-"));
    const catalogPath = join(directory, "catalog.sqlite");
    const catalogStore = new ModelCatalogStore(catalogPath);
    const reconciliationStore = new CatalogReconciliationStore(catalogPath);
    const record = connection("openai", "https://api.openai.com/v1");
    const afterCatalogMutation = connection("deepseek", "https://api.deepseek.com");
    for (const current of [record, afterCatalogMutation]) {
      catalogStore.applyScanOutcome({
        connectionId: current.connectionId,
        models: [model(current, "stale")],
        diagnostic: successDiagnostic(current.connectionId),
      });
      reconciliationStore.claimAttempt({
        connectionId: current.connectionId,
        reconciliationVersion: 2,
        trigger: "individual_retry",
        attemptId: `interrupted-${current.connectionId}`,
        claimedAt: initialAt,
        mode: "force_settled",
      });
    }
    let providerCalls = 0;
    const failureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
    failureWriter.apply({
      connectionId: afterCatalogMutation.connectionId,
      attemptId: `interrupted-${afterCatalogMutation.connectionId}`,
      diagnosticId: deterministicDiagnosticId(
        "interrupted",
        afterCatalogMutation.connectionId,
        `interrupted-${afterCatalogMutation.connectionId}`,
      ),
      occurredAt: initialAt,
      safeMessage: INTERRUPTED_SCAN_MESSAGE,
    });
    const reconciler = new CatalogStartupReconciler({
      connections: { listConnections: () => [record, afterCatalogMutation] },
      reconciliationStore,
      catalogStore,
      coordinator: { scanConnection: async () => { providerCalls += 1; throw new Error("must not contact provider"); } },
      failureWriter,
      clock: { now: () => startupAt },
    });
    try {
      await reconciler.reconcileAtStartup();
      await reconciler.reconcileAtStartup();
      expect(providerCalls).toBe(0);
      for (const current of [record, afterCatalogMutation]) {
        expect(reconciliationStore.read(current.connectionId)).toMatchObject({
          scanState: "failed",
          outcomeCode: "interrupted_scan",
          safeOutcomeMessage: INTERRUPTED_SCAN_MESSAGE,
        });
        expect(catalogStore.listModelsForConnection(current.connectionId)).toEqual([]);
        expect(catalogStore.listDiagnostics(current.connectionId)
          .filter((entry) => entry.safeMessage === INTERRUPTED_SCAN_MESSAGE)).toHaveLength(1);
      }
    } finally {
      reconciliationStore.close();
      catalogStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("isolates one coordinator failure and still attempts later active connections in stable order", async () => {
    const catalogStore = ModelCatalogStore.createInMemory();
    const reconciliationStore = CatalogReconciliationStore.createInMemory();
    const failed = connection("a-failed", "https://api.openai.com/v1");
    const successful = connection("b-success", "https://api.deepseek.com");
    const calls: string[] = [];
    const failureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
    const reconciler = new CatalogStartupReconciler({
      connections: { listConnections: () => [successful, failed] },
      reconciliationStore,
      catalogStore,
      coordinator: { scanConnection: async (request: unknown) => {
        const connectionId = (request as { connectionId: string }).connectionId;
        calls.push(connectionId);
        if (connectionId === failed.connectionId) throw new Error("isolated provider failure");
        return reconciliationStore.read(successful.connectionId)!;
      } },
      failureWriter,
      clock: { now: () => startupAt },
    });
    try {
      await reconciler.reconcileAtStartup();
      expect(calls).toEqual(["a-failed", "b-success"]);
    } finally {
      reconciliationStore.close();
      catalogStore.close();
    }
  });

  it("selects one older-version active record while suppressing current-version and inactive records", async () => {
    const catalogStore = ModelCatalogStore.createInMemory();
    const reconciliationStore = CatalogReconciliationStore.createInMemory();
    const older = connection("older", "https://api.openai.com/v1");
    const current = connection("current", "https://api.deepseek.com");
    const inactive = { ...connection("inactive", "https://api.openai.com/v1"), lifecycleState: "revoked" as const };
    for (const [record, version] of [[older, 1], [current, 2], [inactive, 1]] as const) {
      reconciliationStore.claimAttempt({
        connectionId: record.connectionId,
        reconciliationVersion: version,
        trigger: "startup_reconciliation",
        attemptId: `settled-${record.connectionId}`,
        claimedAt: initialAt,
        mode: "eligible_only",
      });
      reconciliationStore.settleAttempt({
        connectionId: record.connectionId,
        reconciliationVersion: version,
        attemptId: `settled-${record.connectionId}`,
        settledAt,
        settledOutcome: "failed",
        modelCount: 0,
        outcomeCode: "timeout",
        safeOutcomeMessage: "Prior scan failed.",
        diagnosticId: `diagnostic-${record.connectionId}`,
      });
    }
    const calls: string[] = [];
    const failureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
    const reconciler = new CatalogStartupReconciler({
      connections: { listConnections: () => [inactive, current, older] },
      reconciliationStore,
      catalogStore,
      coordinator: { scanConnection: async (request: unknown) => {
        calls.push((request as { connectionId: string }).connectionId);
        return reconciliationStore.read(older.connectionId)!;
      } },
      failureWriter,
      clock: { now: () => startupAt },
    });
    try {
      await reconciler.reconcileAtStartup();
      expect(calls).toEqual(["older"]);
    } finally {
      reconciliationStore.close();
      catalogStore.close();
    }
  });

  it("fails contradictory legacy rows closed locally and leaves future-version state untouched", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-startup-contradiction-"));
    const catalogPath = join(directory, "catalog.sqlite");
    const catalogStore = new ModelCatalogStore(catalogPath);
    const reconciliationStore = new CatalogReconciliationStore(catalogPath);
    const contradiction = connection("contradiction", "https://api.openai.com/v1");
    const future = connection("future", "https://api.deepseek.com");
    catalogStore.applyScanOutcome({
      connectionId: contradiction.connectionId,
      models: [model(contradiction, "stale")],
      diagnostic: successDiagnostic(contradiction.connectionId, "legacy-success"),
    });
    const legacyWriter = new DatabaseSync(catalogPath);
    try {
      legacyWriter.prepare(`
        insert into catalog_scan_diagnostics (
          diagnostic_id, connection_id, scan_correlation_id, outcome, safe_message, http_status_code, occurred_at
        ) values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        "diagnostic-legacy-failed",
        contradiction.connectionId,
        "legacy-failed",
        "timeout",
        "Provider catalog scan timed out.",
        null,
        scanAt,
      );
    } finally {
      legacyWriter.close();
    }
    reconciliationStore.claimAttempt({
      connectionId: future.connectionId,
      reconciliationVersion: 3,
      trigger: "startup_reconciliation",
      attemptId: "future-attempt",
      claimedAt: initialAt,
      mode: "eligible_only",
    });
    reconciliationStore.settleAttempt({
      connectionId: future.connectionId,
      reconciliationVersion: 3,
      attemptId: "future-attempt",
      settledAt,
      settledOutcome: "failed",
      modelCount: 0,
      outcomeCode: "timeout",
      safeOutcomeMessage: "Future reconciliation failed.",
      diagnosticId: "future-diagnostic",
    });
    let providerCalls = 0;
    const failureWriter = new CatalogFailClosedOutcomeWriter({ store: catalogStore });
    const reconciler = new CatalogStartupReconciler({
      connections: { listConnections: () => [future, contradiction] },
      reconciliationStore,
      catalogStore,
      coordinator: { scanConnection: async () => { providerCalls += 1; throw new Error("unexpected provider call"); } },
      failureWriter,
      clock: { now: () => startupAt },
    });
    try {
      await reconciler.reconcileAtStartup();
      expect(providerCalls).toBe(0);
      expect(catalogStore.listModelsForConnection(contradiction.connectionId)).toEqual([]);
      expect(reconciliationStore.read(contradiction.connectionId)).toMatchObject({
        scanState: "failed",
        outcomeCode: "legacy_evidence_adopted",
      });
      expect(reconciliationStore.read(future.connectionId)).toMatchObject({
        reconciliationVersion: 3,
        attemptId: "future-attempt",
      });
    } finally {
      reconciliationStore.close();
      catalogStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
