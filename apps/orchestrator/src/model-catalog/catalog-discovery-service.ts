import {
  MAX_CATALOG_TEXT_LENGTH,
  normalizeDiscoveredCatalog,
  type CatalogNormalizationConnection,
  type CatalogScanResult,
  type CatalogStoreScanOutcome,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import type { ModelCatalogStore } from "@hepha/db";
import type { ProviderConnectionService } from "../provider-connections/service.js";
import { createCatalogScanDiagnostic } from "./catalog-scan-diagnostics.js";
import type { CatalogConnectionDescriptor, CatalogScannerResult } from "./catalog-ports.js";
import { OpenAiCompatibleCatalogScanner } from "./openai-compatible-catalog-scanner.js";
import { PiModelCatalogScanner } from "./pi-model-catalog-scanner.js";
import { ScanCredentialBroker } from "./scan-credential-broker.js";
import { connectionProviderIds } from "../runtime/pi/pi-installation-default.js";

interface Clock {
  now(): string;
}

interface CatalogStore {
  applyScanOutcome(outcome: CatalogStoreScanOutcome): void;
  listModelsForConnection(connectionId: ProviderConnectionId): ReadonlyArray<{ readonly identity: { readonly connectionId: ProviderConnectionId; readonly modelId: string } }>;
}

export interface CatalogDiscoveryScanRequest {
  readonly connectionId: string;
  readonly scanCorrelationId: string;
}

export interface CatalogDiscoveryServiceOptions {
  readonly connections: Pick<ProviderConnectionService, "getConnection" | "listConnections">;
  readonly store: Pick<ModelCatalogStore, "applyScanOutcome" | "listModelsForConnection">;
  readonly piScanner: PiModelCatalogScanner;
  readonly openAiScanner: OpenAiCompatibleCatalogScanner;
  readonly credentialBroker: ScanCredentialBroker;
  readonly clock?: Clock;
  /** Receives only removed route identities and safe scan facts after catalog persistence. */
  readonly onCatalogFailure?: (input: { readonly routes: readonly { readonly connectionId: ProviderConnectionId; readonly modelId: string }[]; readonly reasonCode: string; readonly occurredAt: string; readonly correlationId: string }) => void;
}

/** Coordinates one read-only provider scan and its atomic safe catalog outcome. */
export class CatalogDiscoveryService {
  private readonly clock: Clock;

  constructor(private readonly options: CatalogDiscoveryServiceOptions) {
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
  }

  async scanConnection(request: CatalogDiscoveryScanRequest): Promise<CatalogScanResult> {
    if (!isDiscoveryScanRequest(request)) {
      throw new Error("Invalid catalog discovery scan request.");
    }
    const connection = this.options.connections.getConnection(request.connectionId as ProviderConnectionId);
    if (!connection || connection.lifecycleState !== "active") {
      return this.refusedScan(request.connectionId, request.scanCorrelationId, "not_scannable");
    }

    const scanAt = this.clock.now();
    const scanResult = await this.scanActiveConnection(connection);
    if (scanResult.kind === "success") {
      const normalized = normalizeDiscoveredCatalog(safeConnectionForNormalizer(connection), scanResult.payload, scanAt);
      if (normalized.kind === "success") {
        return this.persistResult(connection.connectionId, request.scanCorrelationId, scanAt, "success", null, normalized.models.length, normalized.models);
      }
      return this.persistResult(connection.connectionId, request.scanCorrelationId, scanAt, "normalization_failed", null, 0, []);
    }
    return this.persistResult(
      connection.connectionId,
      request.scanCorrelationId,
      scanAt,
      scanResult.outcome,
      scanResult.httpStatusCode,
      0,
      [],
    );
  }


  private async scanActiveConnection(connection: ProviderConnectionRecord): Promise<CatalogScannerResult> {
    if (connection.kind === "pi_session") {
      return this.options.piScanner.scan({ providerIds: connectionProviderIds(connection) });
    }
    const brokerResult = await this.options.credentialBroker.requestModels(connection);
    if (brokerResult.kind === "not_scannable" || brokerResult.kind === "vault_unavailable") {
      return { kind: "failure", outcome: brokerResult.kind, httpStatusCode: null };
    }
    return this.options.openAiScanner.scan(toDescriptor(connection), brokerResult);
  }

  private persistResult(
    connectionId: ProviderConnectionId,
    scanCorrelationId: string,
    occurredAt: string,
    outcome: CatalogScanResult["outcome"],
    httpStatusCode: number | null,
    modelCount: number,
    models: CatalogStoreScanOutcome["models"],
  ): CatalogScanResult {
    const removedRoutes = outcome === "success" ? [] : this.options.store.listModelsForConnection(connectionId).map((model) => model.identity);
    const diagnostic = createCatalogScanDiagnostic({
      connectionId,
      scanCorrelationId,
      outcome,
      httpStatusCode,
      occurredAt,
    });
    this.options.store.applyScanOutcome({ connectionId, models, diagnostic });
    if (removedRoutes.length > 0) this.options.onCatalogFailure?.({
      routes: removedRoutes,
      reasonCode: outcome,
      occurredAt,
      correlationId: scanCorrelationId,
    });
    return { connectionId, scanCorrelationId, outcome, modelCount, diagnostic };
  }

  private refusedScan(
    connectionId: string,
    scanCorrelationId: string,
    outcome: "not_scannable",
  ): CatalogScanResult {
    const safeConnectionId = connectionId as ProviderConnectionId;
    const occurredAt = this.clock.now();
    const diagnostic = createCatalogScanDiagnostic({
      connectionId: safeConnectionId,
      scanCorrelationId,
      outcome,
      httpStatusCode: null,
      occurredAt,
    });
    return { connectionId: safeConnectionId, scanCorrelationId, outcome, modelCount: 0, diagnostic };
  }
}

function toDescriptor(connection: ProviderConnectionRecord): CatalogConnectionDescriptor {
  return {
    connectionId: connection.connectionId,
    kind: connection.kind,
    providerKind: connection.kind,
    providerLabel: connection.label,
    endpointUrl: connection.endpointUrl,
    endpointLocal: connection.endpointLocal,
  };
}

/** Supplies the Phase 2 normalizer only the three facts it actually consumes. */
function safeConnectionForNormalizer(connection: ProviderConnectionRecord): CatalogNormalizationConnection {
  return {
    connectionId: connection.connectionId,
    kind: connection.kind,
    label: connection.label,
  };
}

function isDiscoveryScanRequest(value: unknown): value is CatalogDiscoveryScanRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("connectionId") || !keys.includes("scanCorrelationId")) return false;
  const request = value as Record<string, unknown>;
  return isBoundedString(request.connectionId) && isBoundedString(request.scanCorrelationId);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CATALOG_TEXT_LENGTH;
}
