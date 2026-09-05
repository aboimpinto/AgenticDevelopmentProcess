import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import type {
  AuthorizedCatalogTransport,
  AuthorizedCatalogTransportResult,
  PiCatalogProcess,
} from "../src/model-catalog/catalog-ports.js";
import { CatalogConnectionStateProjector } from "../src/model-catalog/catalog-connection-state-projector.js";
import { CatalogConnectionStateService } from "../src/model-catalog/catalog-connection-state-service.js";
import { CatalogDiscoveryService } from "../src/model-catalog/catalog-discovery-service.js";
import { CatalogFailClosedOutcomeWriter } from "../src/model-catalog/catalog-fail-closed-outcome-writer.js";
import { OpenAiCompatibleCatalogScanner } from "../src/model-catalog/openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import { CatalogScanCoordinator } from "../src/model-catalog/catalog-scan-coordinator.js";
import { ScanCredentialBroker } from "../src/model-catalog/scan-credential-broker.js";
import { CatalogStartupReconciler } from "../src/model-catalog/catalog-startup-reconciler.js";
import { FakeEndpointTransport } from "../src/provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../src/provider-connections/service.js";
import { InMemorySecretVault } from "../src/provider-connections/secret-vault.js";
import { handleModelCatalogRoutes } from "../src/transport/http/routes/model-catalog-routes.js";

const featurePath = fileURLToPath(new URL("./feat-069-catalog-reconciliation.feature", import.meta.url));
const DISTINCTIVE_SECRET = "feat-069-backend-secret-never-publish";
const evidenceAt = "2026-07-24T10:00:00.000Z";
const scanAt = "2026-07-24T10:01:00.000Z";
const settledAt = "2026-07-24T10:02:00.000Z";
const id = (value: string) => value as ProviderConnectionId;

function piConnection(connectionId: string, label: string, endpointUrl: string): ProviderConnectionRecord {
  return {
    connectionId: id(connectionId),
    kind: "pi_session",
    label,
    provider: { kind: "pi_session" },
    endpointUrl,
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: null,
    secretVersion: null,
    createdAt: evidenceAt,
    updatedAt: evidenceAt,
  };
}

function successDiagnostic(connectionId: ProviderConnectionId): CatalogScanDiagnostic {
  return {
    schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
    diagnosticId: `diagnostic-${connectionId}`,
    connectionId,
    scanCorrelationId: `legacy-${connectionId}`,
    outcome: "success",
    safeMessage: "Model catalog scan completed.",
    httpStatusCode: null,
    occurredAt: evidenceAt,
  };
}

function catalogModel(connection: ProviderConnectionRecord, modelId: string): CatalogModelRecord {
  const normalized = normalizeDiscoveredCatalog(connection, { models: [{ modelId }] }, evidenceAt);
  if (normalized.kind !== "success") throw new Error("Catalog fixture normalization failed.");
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

const rejectCompatibleTransport: AuthorizedCatalogTransport = {
  requestModels: async () => {
    throw new Error("The copied Pi Session migration fixture must not use an HTTP provider transport.");
  },
};

function startupComposition(input: {
  providerStore: ProviderConnectionStore;
  catalogStore: ModelCatalogStore;
  reconciliationStore: CatalogReconciliationStore;
  process: ProviderQualifiedPiProcess;
  attemptIds: { value: number };
}) {
  const vault = new InMemorySecretVault();
  const connections = new ProviderConnectionService({
    store: input.providerStore,
    vault,
    transport: new FakeEndpointTransport(),
  });
  const discovery = new CatalogDiscoveryService({
    connections,
    store: input.catalogStore,
    piScanner: new PiModelCatalogScanner(input.process),
    openAiScanner: new OpenAiCompatibleCatalogScanner(),
    credentialBroker: new ScanCredentialBroker(vault, rejectCompatibleTransport),
    clock: { now: () => scanAt },
  });
  const failureWriter = new CatalogFailClosedOutcomeWriter({ store: input.catalogStore });
  const coordinator = new CatalogScanCoordinator({
    connections,
    reconciliationStore: input.reconciliationStore,
    discovery,
    failureWriter,
    clock: { now: () => scanAt },
    createAttemptId: () => `feat-069-startup-${++input.attemptIds.value}`,
  });
  const reconciler = new CatalogStartupReconciler({
    connections,
    reconciliationStore: input.reconciliationStore,
    catalogStore: input.catalogStore,
    coordinator,
    failureWriter,
    clock: { now: () => settledAt },
  });
  const states = new CatalogConnectionStateService({
    connections,
    reconciliationStore: input.reconciliationStore,
    catalogStore: input.catalogStore,
    projector: new CatalogConnectionStateProjector(),
  });
  return { reconciler, states };
}

class ConnectionOutcomeTransport implements AuthorizedCatalogTransport {
  readonly calls: string[] = [];
  readonly outcomes = new Map<string, AuthorizedCatalogTransportResult>();

  async requestModels(input: { readonly url: string }): Promise<AuthorizedCatalogTransportResult> {
    this.calls.push(input.url);
    const outcome = [...this.outcomes.entries()].find(([endpoint]) => input.url.startsWith(endpoint))?.[1];
    if (!outcome) throw new Error(`No deterministic provider outcome for ${input.url}`);
    return outcome;
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe("FEAT-069 catalog reconciliation acceptance", () => {
  it("binds the two canonical EPIC scenarios without changing their stable IDs", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(2);
    expect(feature.match(/@E011-PROV-006/g)).toHaveLength(1);
    expect(feature.match(/@E011-PROV-007/g)).toHaveLength(1);
    expect(feature).toContain("Scenario: An upgrade reconciles every active connection that was never scanned");
    expect(feature).toContain("Scenario: Active connections without model rows remain visible and actionable");
  });

  it("E011-PROV-006 copies an OpenAI/DeepSeek installation, scans only DeepSeek once, and remains restart-idempotent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-feat-069-upgrade-"));
    const sourceProviderPath = join(directory, "source-providers.sqlite");
    const sourceCatalogPath = join(directory, "source-catalog.sqlite");
    const runtimeProviderPath = join(directory, "runtime-providers.sqlite");
    const runtimeCatalogPath = join(directory, "runtime-catalog.sqlite");
    const openai = piConnection("openai-connection", "OpenAI", "https://api.openai.com/v1");
    const deepseek = piConnection("deepseek-connection", "DeepSeek", "https://api.deepseek.com");

    const sourceProviders = new ProviderConnectionStore(sourceProviderPath);
    const sourceCatalog = new ModelCatalogStore(sourceCatalogPath);
    sourceProviders.insertConnection(openai);
    sourceProviders.insertConnection(deepseek);
    sourceCatalog.applyScanOutcome({
      connectionId: openai.connectionId,
      models: [catalogModel(openai, "gpt-fixture")],
      diagnostic: successDiagnostic(openai.connectionId),
    });
    sourceCatalog.close();
    sourceProviders.close();
    copyFileSync(sourceProviderPath, runtimeProviderPath);
    copyFileSync(sourceCatalogPath, runtimeCatalogPath);

    const process = new ProviderQualifiedPiProcess();
    const attemptIds = { value: 0 };
    let runtimeProviders = new ProviderConnectionStore(runtimeProviderPath);
    let runtimeCatalog = new ModelCatalogStore(runtimeCatalogPath);
    let runtimeReconciliation = new CatalogReconciliationStore(runtimeCatalogPath);

    try {
      const firstStartup = startupComposition({
        providerStore: runtimeProviders,
        catalogStore: runtimeCatalog,
        reconciliationStore: runtimeReconciliation,
        process,
        attemptIds,
      });
      await firstStartup.reconciler.reconcileAtStartup();

      expect(process.calls).toBe(1);
      expect(attemptIds.value).toBe(1);
      expect(firstStartup.states.listActiveConnectionStates()).toEqual([
        expect.objectContaining({ connectionId: deepseek.connectionId, label: "DeepSeek", scanState: "available", modelCount: 1 }),
        expect.objectContaining({ connectionId: openai.connectionId, label: "OpenAI", scanState: "available", outcomeCode: "legacy_evidence_adopted" }),
      ]);
      expect(runtimeCatalog.listModels().map((entry) => `${entry.identity.connectionId}/${entry.identity.modelId}`)).toEqual([
        "deepseek-connection/deepseek-fixture",
        "openai-connection/gpt-fixture",
      ]);

      runtimeReconciliation.close();
      runtimeCatalog.close();
      runtimeProviders.close();
      runtimeProviders = new ProviderConnectionStore(runtimeProviderPath);
      runtimeCatalog = new ModelCatalogStore(runtimeCatalogPath);
      runtimeReconciliation = new CatalogReconciliationStore(runtimeCatalogPath);

      const restarted = startupComposition({
        providerStore: runtimeProviders,
        catalogStore: runtimeCatalog,
        reconciliationStore: runtimeReconciliation,
        process,
        attemptIds,
      });
      await restarted.reconciler.reconcileAtStartup();
      expect(process.calls).toBe(1);
      expect(attemptIds.value).toBe(1);
      expect(JSON.stringify({ states: restarted.states.listActiveConnectionStates(), models: runtimeCatalog.listModels() }))
        .not.toMatch(new RegExp(`${DISTINCTIVE_SECRET}|secretRef|secretVersion|authorizationHeader|apiKey|accessToken`, "i"));
    } finally {
      runtimeReconciliation.close();
      runtimeCatalog.close();
      runtimeProviders.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("E011-PROV-007 exposes Empty, Failed, and Never scanned and retries only the selected connection through HTTP", async () => {
    const providerStore = ProviderConnectionStore.createInMemory();
    const catalogStore = ModelCatalogStore.createInMemory();
    const reconciliationStore = CatalogReconciliationStore.createInMemory();
    const vault = new InMemorySecretVault();
    const connections = new ProviderConnectionService({
      store: providerStore,
      vault,
      transport: new FakeEndpointTransport(),
    });
    const transport = new ConnectionOutcomeTransport();
    const endpoints = {
      empty: "https://provider-empty.test/v1",
      failed: "https://provider-failed.test/v1",
      fresh: "https://provider-new.test/v1",
    };
    transport.outcomes.set(endpoints.empty, { kind: "success", statusCode: 200, body: { data: [] } });
    transport.outcomes.set(endpoints.failed, { kind: "authentication_failed", statusCode: 401 });
    transport.outcomes.set(endpoints.fresh, { kind: "success", statusCode: 200, body: { data: [{ id: "new-model" }] } });

    const created = await Promise.all([
      connections.createConnection({ kind: "custom", label: "provider-empty", provider: { kind: "custom", label: "empty" }, endpointUrl: endpoints.empty, secretValue: DISTINCTIVE_SECRET }),
      connections.createConnection({ kind: "custom", label: "provider-failed", provider: { kind: "custom", label: "failed" }, endpointUrl: endpoints.failed, secretValue: DISTINCTIVE_SECRET }),
      connections.createConnection({ kind: "custom", label: "provider-new", provider: { kind: "custom", label: "new" }, endpointUrl: endpoints.fresh, secretValue: DISTINCTIVE_SECRET }),
    ]);
    expect(created.every((result) => result.success && result.data)).toBe(true);
    const byLabel = new Map(created.map((result) => [result.data!.label, result.data!]));
    const empty = byLabel.get("provider-empty")!;
    const failed = byLabel.get("provider-failed")!;
    const fresh = byLabel.get("provider-new")!;

    const discovery = new CatalogDiscoveryService({
      connections,
      store: catalogStore,
      piScanner: new PiModelCatalogScanner({ listModels: async () => { throw new Error("Pi transport must not run."); } }),
      openAiScanner: new OpenAiCompatibleCatalogScanner(),
      credentialBroker: new ScanCredentialBroker(vault, transport),
      clock: { now: () => scanAt },
    });
    let attempt = 0;
    const coordinator = new CatalogScanCoordinator({
      connections,
      reconciliationStore,
      discovery,
      failureWriter: new CatalogFailClosedOutcomeWriter({ store: catalogStore }),
      clock: { now: () => scanAt },
      createAttemptId: () => `feat-069-retry-${++attempt}`,
    });
    await coordinator.scanConnection({ connectionId: empty.connectionId, trigger: "scan_active", mode: "force_settled" });
    await coordinator.scanConnection({ connectionId: failed.connectionId, trigger: "scan_active", mode: "force_settled" });

    const states = new CatalogConnectionStateService({
      connections,
      reconciliationStore,
      catalogStore,
      projector: new CatalogConnectionStateProjector(),
    });
    const beforeEmpty = reconciliationStore.read(empty.connectionId);
    const beforeFresh = reconciliationStore.read(fresh.connectionId);
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (await handleModelCatalogRoutes(request, response, url, { connections, coordinator, states, store: catalogStore })) return;
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local acceptance fixture port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const initialResponse = await fetch(`${baseUrl}/api/model-catalog/connections`);
      expect(initialResponse.status).toBe(200);
      const initialBody = await initialResponse.json() as { connections: Array<{ connectionId: string; scanState: string }> };
      expect(initialBody.connections.map((entry) => `${entry.connectionId}:${entry.scanState}`)).toEqual([
        `${empty.connectionId}:empty`,
        `${failed.connectionId}:failed`,
        `${fresh.connectionId}:never_scanned`,
      ].sort());

      transport.outcomes.set(endpoints.failed, { kind: "success", statusCode: 200, body: { data: [{ id: "recovered-model" }] } });
      const callsBeforeRetry = transport.calls.length;
      const retryResponse = await fetch(`${baseUrl}/api/model-catalog/connections/${failed.connectionId}/scan`, { method: "POST" });
      expect(retryResponse.status).toBe(200);
      await expect(retryResponse.json()).resolves.toEqual(expect.objectContaining({
        schemaVersion: "catalog-reconciliation/v1",
        connection: expect.objectContaining({ connectionId: failed.connectionId, scanState: "available", modelCount: 1 }),
      }));
      expect(transport.calls).toHaveLength(callsBeforeRetry + 1);
      expect(transport.calls.at(-1)).toMatch(/^https:\/\/provider-failed\.test\/v1\/models$/);
      expect(reconciliationStore.read(empty.connectionId)).toEqual(beforeEmpty);
      expect(reconciliationStore.read(fresh.connectionId)).toEqual(beforeFresh);

      const finalBody = await (await fetch(`${baseUrl}/api/model-catalog/connections`)).json();
      expect(JSON.stringify(finalBody)).not.toMatch(new RegExp(`${DISTINCTIVE_SECRET}|secretRef|secretVersion|authorization|credential`, "i"));
      expect(catalogStore.listModelsForConnection(failed.connectionId).map((entry) => entry.identity))
        .toEqual([{ connectionId: failed.connectionId, modelId: "recovered-model" }]);
    } finally {
      await closeServer(server);
      reconciliationStore.close();
      catalogStore.close();
      providerStore.close();
    }
  });
});
