import { createHash, randomUUID } from "node:crypto";
import {
  CATALOG_RECONCILIATION_TARGET_VERSION,
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  MAX_CATALOG_RECONCILIATION_TEXT_LENGTH,
  type CatalogReconciliationRecord,
  type CatalogScanResult,
  type CatalogScanTrigger,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import type { CatalogReconciliationStore } from "@hepha/db";
import type { CatalogDiscoveryService } from "./catalog-discovery-service.js";
import { CatalogFailClosedOutcomeWriter } from "./catalog-fail-closed-outcome-writer.js";

export const CATALOG_COORDINATOR_FAILURE_MESSAGE =
  "Catalog scan coordinator failed safely. Retry to scan again.";

type ExplicitCatalogScanTrigger = Exclude<CatalogScanTrigger, "startup_reconciliation">;

export type CatalogScanCoordinatorRequest =
  | {
    readonly connectionId: ProviderConnectionId;
    readonly trigger: "startup_reconciliation";
    readonly mode: "eligible_only";
  }
  | {
    readonly connectionId: ProviderConnectionId;
    readonly trigger: ExplicitCatalogScanTrigger;
    readonly mode: "force_settled";
  };

interface Clock {
  now(): string;
}

export interface CatalogScanCoordinatorOptions {
  readonly connections: {
    getConnection(connectionId: ProviderConnectionId): ProviderConnectionRecord | null;
  };
  readonly reconciliationStore: Pick<CatalogReconciliationStore, "claimAttempt" | "settleAttempt">;
  readonly discovery: Pick<CatalogDiscoveryService, "scanConnection">;
  readonly failureWriter: CatalogFailClosedOutcomeWriter;
  readonly clock?: Clock;
  readonly createAttemptId?: () => string;
}

/** Owns atomic per-connection claims, local Promise reuse, discovery, and ledger settlement. */
export class CatalogScanCoordinator {
  private readonly clock: Clock;
  private readonly createAttemptId: () => string;
  private readonly inFlight = new Map<ProviderConnectionId, Promise<CatalogReconciliationRecord>>();

  constructor(private readonly options: CatalogScanCoordinatorOptions) {
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
    this.createAttemptId = options.createAttemptId ?? randomUUID;
  }

  scanConnection(input: unknown): Promise<CatalogReconciliationRecord> {
    if (!isCatalogScanCoordinatorRequest(input)) {
      return Promise.reject(new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT));
    }
    const existing = this.inFlight.get(input.connectionId);
    if (existing) return existing;

    let task: Promise<CatalogReconciliationRecord>;
    task = this.execute(input).finally(() => {
      if (this.inFlight.get(input.connectionId) === task) this.inFlight.delete(input.connectionId);
    });
    this.inFlight.set(input.connectionId, task);
    return task;
  }

  private async execute(input: CatalogScanCoordinatorRequest): Promise<CatalogReconciliationRecord> {
    const connection = this.options.connections.getConnection(input.connectionId);
    if (!isScannable(connection)) {
      throw new Error("Catalog connection is not eligible for scanning.");
    }

    const attemptId = this.createAttemptId();
    const claimedAt = canonicalTimestamp(this.clock.now());
    const claim = this.options.reconciliationStore.claimAttempt({
      connectionId: input.connectionId,
      reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
      trigger: input.trigger,
      attemptId,
      claimedAt,
      mode: input.mode,
    });
    if (claim.kind !== "claimed") return claim.record;

    try {
      const result = await this.options.discovery.scanConnection({
        connectionId: input.connectionId,
        scanCorrelationId: attemptId,
      });
      return this.settleDiscoveryResult(claim.record, result);
    } catch {
      try {
        const diagnostic = this.options.failureWriter.apply({
          connectionId: input.connectionId,
          attemptId,
          diagnosticId: deterministicDiagnosticId("coordinator", input.connectionId, attemptId),
          occurredAt: claimedAt,
          safeMessage: CATALOG_COORDINATOR_FAILURE_MESSAGE,
        });
        return this.options.reconciliationStore.settleAttempt({
          connectionId: input.connectionId,
          reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
          attemptId,
          settledAt: latestTimestamp(claimedAt, diagnostic.occurredAt, this.clock.now()),
          settledOutcome: "failed",
          modelCount: 0,
          outcomeCode: "coordinator_failure",
          safeOutcomeMessage: diagnostic.safeMessage,
          diagnosticId: diagnostic.diagnosticId,
        });
      } catch {
        throw new Error(CATALOG_COORDINATOR_FAILURE_MESSAGE);
      }
    }
  }

  private settleDiscoveryResult(
    claim: CatalogReconciliationRecord,
    result: CatalogScanResult,
  ): CatalogReconciliationRecord {
    if (claim.attemptId === null
      || result.connectionId !== claim.connectionId
      || result.scanCorrelationId !== claim.attemptId
      || result.diagnostic.connectionId !== claim.connectionId
      || result.diagnostic.scanCorrelationId !== claim.attemptId
      || result.modelCount < 0
      || !Number.isSafeInteger(result.modelCount)) {
      throw new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    }
    const settledOutcome = result.outcome === "success"
      ? result.modelCount > 0 ? "available" : "empty"
      : "failed";
    return this.options.reconciliationStore.settleAttempt({
      connectionId: claim.connectionId,
      reconciliationVersion: claim.reconciliationVersion,
      attemptId: claim.attemptId,
      settledAt: latestTimestamp(claim.claimedAt!, result.diagnostic.occurredAt, this.clock.now()),
      settledOutcome,
      modelCount: result.modelCount,
      outcomeCode: result.outcome,
      safeOutcomeMessage: result.diagnostic.safeMessage,
      diagnosticId: result.diagnostic.diagnosticId,
    });
  }
}

function isCatalogScanCoordinatorRequest(value: unknown): value is CatalogScanCoordinatorRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 3 || !keys.includes("connectionId") || !keys.includes("trigger") || !keys.includes("mode")) {
    return false;
  }
  const request = value as Record<string, unknown>;
  if (!isBoundedString(request.connectionId)) return false;
  if (request.trigger === "startup_reconciliation") return request.mode === "eligible_only";
  return isOneOf(request.trigger, [
    "connection_created", "material_connection_change", "connection_reactivated",
    "credential_changed", "individual_retry", "scan_active",
  ]) && request.mode === "force_settled";
}

function isScannable(connection: ProviderConnectionRecord | null): connection is ProviderConnectionRecord {
  return connection !== null && connection.lifecycleState === "active";
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CATALOG_RECONCILIATION_TEXT_LENGTH;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function canonicalTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error(INVALID_CATALOG_RECONCILIATION_CONTRACT);
  }
  return value;
}

function latestTimestamp(...values: readonly string[]): string {
  return values.map(canonicalTimestamp).sort().at(-1)!;
}

export function deterministicDiagnosticId(
  purpose: "coordinator" | "interrupted" | "legacy-contradiction",
  connectionId: ProviderConnectionId,
  attemptId: string,
): string {
  const digest = createHash("sha256").update(`${connectionId}\u0000${attemptId}`).digest("hex");
  return `catalog-${purpose}-${digest}`;
}
