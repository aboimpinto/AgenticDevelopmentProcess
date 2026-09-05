import { resolve } from "node:path";
import type { ProviderConnectionId } from "@hepha/shared";
import {
  AgentRoutingStore,
  CatalogReconciliationStore,
  ModelCatalogStore,
  ProviderConnectionStore,
} from "@hepha/db";
import { AgentRegistry } from "../agent-routing/agent-registry.js";
import { readRoutingCatalogFacts } from "../agent-routing/routing-catalog-facts.js";
import { readRoutingMatrixCatalogFacts } from "../agent-routing/routing-matrix-catalog-facts.js";
import { RoutingMatrixProjector } from "../agent-routing/routing-matrix-projector.js";
import { RoutingPolicyService } from "../agent-routing/routing-policy-service.js";
import { CatalogConnectionStateProjector } from "../model-catalog/catalog-connection-state-projector.js";
import { CatalogConnectionStateService } from "../model-catalog/catalog-connection-state-service.js";
import { CatalogDiscoveryService } from "../model-catalog/catalog-discovery-service.js";
import { CatalogFailClosedOutcomeWriter } from "../model-catalog/catalog-fail-closed-outcome-writer.js";
import { CatalogScanCoordinator } from "../model-catalog/catalog-scan-coordinator.js";
import { CatalogStartupReconciler } from "../model-catalog/catalog-startup-reconciler.js";
import { ProviderCatalogScanApplication } from "../model-catalog/provider-catalog-scan-application.js";
import { FetchAuthorizedCatalogTransport } from "../model-catalog/authorized-catalog-transport.js";
import { NodePiCatalogProcess } from "../model-catalog/pi-catalog-process.js";
import { PiModelCatalogScanner } from "../model-catalog/pi-model-catalog-scanner.js";
import { OpenAiCompatibleCatalogScanner } from "../model-catalog/openai-compatible-catalog-scanner.js";
import { ScanCredentialBroker } from "../model-catalog/scan-credential-broker.js";
import { HttpEndpointTransport } from "../provider-connections/endpoint-policy.js";
import { ProviderConnectionService } from "../provider-connections/service.js";
import { HostSecretVault } from "../provider-connections/secret-vault.js";

/** Composes provider, catalog, and non-executing routing policy services. */
export function createProviderRoutingServices(input: {
  localStateDir: string;
  runtimeEnv: NodeJS.ProcessEnv;
}) {
  const vaultDatabasePath = input.runtimeEnv.HEPHA_VAULT_DATABASE_PATH
    ?? resolve(input.localStateDir, "hepha-vault.sqlite");
  const secretVault = new HostSecretVault(vaultDatabasePath, input.runtimeEnv.HEPHA_VAULT_KEY);
  const providerConnectionStore = new ProviderConnectionStore(
    input.runtimeEnv.HEPHA_PROVIDER_CONNECTION_DATABASE_PATH ?? vaultDatabasePath,
  );
  const providerConnectionService = new ProviderConnectionService({
    store: providerConnectionStore,
    vault: secretVault,
    transport: new HttpEndpointTransport(),
  });
  const modelCatalogDatabasePath = input.runtimeEnv.HEPHA_MODEL_CATALOG_DATABASE_PATH ?? vaultDatabasePath;
  const modelCatalogStore = new ModelCatalogStore(modelCatalogDatabasePath);
  const catalogReconciliationStore = new CatalogReconciliationStore(modelCatalogDatabasePath);
  const agentRoutingStore = new AgentRoutingStore(
    input.runtimeEnv.HEPHA_AGENT_ROUTING_DATABASE_PATH ?? vaultDatabasePath,
  );
  const catalogConnectionStateService = new CatalogConnectionStateService({
    connections: providerConnectionService,
    reconciliationStore: catalogReconciliationStore,
    catalogStore: modelCatalogStore,
    projector: new CatalogConnectionStateProjector(),
  });
  const routingPolicyHttpService = new RoutingPolicyService({
    catalogFacts: () => readRoutingCatalogFacts(modelCatalogStore, providerConnectionStore),
    matrixCatalogFacts: () => readRoutingMatrixCatalogFacts(modelCatalogStore, providerConnectionStore, catalogConnectionStateService),
    matrixProjector: new RoutingMatrixProjector(),
    registry: new AgentRegistry(),
    store: agentRoutingStore,
  });
  const onCatalogFailure = ({ routes, reasonCode, occurredAt, correlationId }: {
    routes: readonly { connectionId: ProviderConnectionId; modelId: string }[];
    reasonCode: string;
    occurredAt: string;
    correlationId: string;
  }) => {
    routingPolicyHttpService.resetUnavailableRoutes(routes, reasonCode, occurredAt, correlationId);
  };
  const catalogDiscoveryService = new CatalogDiscoveryService({
    connections: providerConnectionService,
    store: modelCatalogStore,
    piScanner: new PiModelCatalogScanner(new NodePiCatalogProcess()),
    openAiScanner: new OpenAiCompatibleCatalogScanner(),
    credentialBroker: new ScanCredentialBroker(secretVault, new FetchAuthorizedCatalogTransport()),
    onCatalogFailure,
  });
  const catalogFailureWriter = new CatalogFailClosedOutcomeWriter({
    store: modelCatalogStore,
    onCatalogFailure,
  });
  const catalogScanCoordinator = new CatalogScanCoordinator({
    connections: providerConnectionService,
    reconciliationStore: catalogReconciliationStore,
    discovery: catalogDiscoveryService,
    failureWriter: catalogFailureWriter,
  });
  const catalogStartupReconciler = new CatalogStartupReconciler({
    connections: providerConnectionService,
    reconciliationStore: catalogReconciliationStore,
    catalogStore: modelCatalogStore,
    coordinator: catalogScanCoordinator,
    failureWriter: catalogFailureWriter,
  });
  const providerCatalogScanApplication = new ProviderCatalogScanApplication(
    providerConnectionService,
    catalogScanCoordinator,
  );

  return {
    agentRoutingStore,
    catalogConnectionStateService,
    catalogDiscoveryService,
    catalogReconciliationStore,
    catalogScanCoordinator,
    catalogStartupReconciler,
    modelCatalogStore,
    providerCatalogScanApplication,
    providerConnectionService,
    providerConnectionStore,
    routingPolicyHttpService,
    secretVault,
  };
}
