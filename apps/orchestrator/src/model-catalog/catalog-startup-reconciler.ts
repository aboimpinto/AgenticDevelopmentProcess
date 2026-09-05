import { createHash } from "node:crypto";
import {
  CATALOG_RECONCILIATION_TARGET_VERSION,
  type CatalogReconciliationRecord,
  type CatalogScanDiagnostic,
  type ProviderConnectionId,
  type ProviderConnectionRecord,
} from "@hepha/shared";
import type {
  CatalogReconciliationStore,
  ModelCatalogStore,
} from "@hepha/db";
import type { CatalogScanCoordinator } from "./catalog-scan-coordinator.js";
import {
  deterministicDiagnosticId,
} from "./catalog-scan-coordinator.js";
import { CatalogFailClosedOutcomeWriter } from "./catalog-fail-closed-outcome-writer.js";

export const INTERRUPTED_SCAN_MESSAGE =
  "Previous catalog scan was interrupted and was settled safely. Retry to scan again.";
const LEGACY_ROWS_ADOPTED_MESSAGE = "Existing model catalog evidence was adopted.";
const LEGACY_CONTRADICTION_MESSAGE =
  "Contradictory legacy catalog evidence was settled safely. Retry to scan again.";

interface Clock {
  now(): string;
}

export interface CatalogStartupReconcilerOptions {
  readonly connections: {
    listConnections(): ProviderConnectionRecord[];
  };
  readonly reconciliationStore: Pick<CatalogReconciliationStore,
    "adoptLegacyEvidence" | "initializeNeverScanned" | "list" | "listInterruptedClaims" | "read" | "settleAttempt">;
  readonly catalogStore: Pick<ModelCatalogStore, "listDiagnostics" | "listModelsForConnection">;
  readonly coordinator: Pick<CatalogScanCoordinator, "scanConnection">;
  readonly failureWriter: CatalogFailClosedOutcomeWriter;
  readonly clock?: Clock;
}

/** Reconciles interrupted claims and one bounded target-version startup attempt per eligible connection. */
export class CatalogStartupReconciler {
  private readonly clock: Clock;

  constructor(private readonly options: CatalogStartupReconcilerOptions) {
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
  }

  async reconcileAtStartup(): Promise<readonly CatalogReconciliationRecord[]> {
    for (const interrupted of this.options.reconciliationStore.listInterruptedClaims()) {
      this.settleInterrupted(interrupted);
    }

    const connections = [...this.options.connections.listConnections()].sort(compareConnections);
    for (const connection of connections) {
      let record = this.options.reconciliationStore.read(connection.connectionId);
      if (record === null) {
        record = this.options.reconciliationStore.initializeNeverScanned({
          connectionId: connection.connectionId,
          reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
        });
      }
      if (record.reconciliationVersion === CATALOG_RECONCILIATION_TARGET_VERSION
        && record.scanState === "never_scanned") {
        record = this.adoptLegacyEvidence(connection.connectionId, record);
      }
      if (isStartupEligible(record) && isScannable(connection)) {
        try {
          await this.options.coordinator.scanConnection({
            connectionId: connection.connectionId,
            trigger: "startup_reconciliation",
            mode: "eligible_only",
          });
        } catch {
          // The coordinator has already failed closed or left a claim for replay-safe recovery.
          // Startup failure isolation deliberately allows later connections and HTTP startup.
        }
      }
    }
    return this.options.reconciliationStore.list();
  }

  private settleInterrupted(record: CatalogReconciliationRecord): void {
    if (record.scanState !== "scanning" || record.attemptId === null || record.claimedAt === null) return;
    const diagnostic = this.options.failureWriter.apply({
      connectionId: record.connectionId,
      attemptId: record.attemptId,
      diagnosticId: deterministicDiagnosticId("interrupted", record.connectionId, record.attemptId),
      occurredAt: record.claimedAt,
      safeMessage: INTERRUPTED_SCAN_MESSAGE,
    });
    this.options.reconciliationStore.settleAttempt({
      connectionId: record.connectionId,
      reconciliationVersion: record.reconciliationVersion,
      attemptId: record.attemptId,
      settledAt: latestTimestamp(record.claimedAt, diagnostic.occurredAt, this.clock.now()),
      settledOutcome: "failed",
      modelCount: 0,
      outcomeCode: "interrupted_scan",
      safeOutcomeMessage: diagnostic.safeMessage,
      diagnosticId: diagnostic.diagnosticId,
    });
  }

  private adoptLegacyEvidence(
    connectionId: ProviderConnectionId,
    initialized: CatalogReconciliationRecord,
  ): CatalogReconciliationRecord {
    const models = this.options.catalogStore.listModelsForConnection(connectionId);
    const latestDiagnostic = this.options.catalogStore.listDiagnostics(connectionId, 1)[0] ?? null;
    if (models.length === 0 && latestDiagnostic === null) return initialized;

    if (models.length > 0 && latestDiagnostic !== null && latestDiagnostic.outcome !== "success") {
      const attemptId = legacyAttemptId(connectionId, latestDiagnostic);
      const diagnostic = this.options.failureWriter.apply({
        connectionId,
        attemptId,
        diagnosticId: deterministicDiagnosticId("legacy-contradiction", connectionId, attemptId),
        occurredAt: latestDiagnostic.occurredAt,
        safeMessage: LEGACY_CONTRADICTION_MESSAGE,
      });
      return this.adopt(connectionId, "failed", 0, diagnostic.safeMessage, diagnostic);
    }

    if (latestDiagnostic !== null) {
      const outcome = latestDiagnostic.outcome === "success"
        ? models.length > 0 ? "available" : "empty"
        : "failed";
      return this.adopt(
        connectionId,
        outcome,
        outcome === "available" ? models.length : 0,
        latestDiagnostic.safeMessage,
        latestDiagnostic,
      );
    }

    const evidenceAt = models.map((model) => model.lastSuccessfulScanAt).sort().at(-1)!;
    return this.options.reconciliationStore.adoptLegacyEvidence({
      connectionId,
      reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
      attemptId: rowOnlyLegacyAttemptId(connectionId, evidenceAt),
      claimedAt: evidenceAt,
      settledAt: evidenceAt,
      settledOutcome: "available",
      modelCount: models.length,
      safeOutcomeMessage: LEGACY_ROWS_ADOPTED_MESSAGE,
      diagnosticId: null,
    });
  }

  private adopt(
    connectionId: ProviderConnectionId,
    settledOutcome: "available" | "empty" | "failed",
    modelCount: number,
    safeOutcomeMessage: string,
    diagnostic: CatalogScanDiagnostic,
  ): CatalogReconciliationRecord {
    return this.options.reconciliationStore.adoptLegacyEvidence({
      connectionId,
      reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
      attemptId: diagnostic.scanCorrelationId,
      claimedAt: diagnostic.occurredAt,
      settledAt: diagnostic.occurredAt,
      settledOutcome,
      modelCount,
      safeOutcomeMessage,
      diagnosticId: diagnostic.diagnosticId,
    });
  }
}

function isStartupEligible(record: CatalogReconciliationRecord): boolean {
  if (record.reconciliationVersion > CATALOG_RECONCILIATION_TARGET_VERSION) return false;
  if (record.reconciliationVersion < CATALOG_RECONCILIATION_TARGET_VERSION) return record.scanState !== "scanning";
  return record.scanState === "never_scanned";
}

function isScannable(connection: ProviderConnectionRecord): boolean {
  return connection.lifecycleState === "active";
}

function legacyAttemptId(connectionId: ProviderConnectionId, diagnostic: CatalogScanDiagnostic): string {
  const digest = createHash("sha256")
    .update(`${connectionId}\u0000${diagnostic.diagnosticId}\u0000${diagnostic.occurredAt}`)
    .digest("hex");
  return `legacy-contradiction-${digest}`;
}

function rowOnlyLegacyAttemptId(connectionId: ProviderConnectionId, evidenceAt: string): string {
  const digest = createHash("sha256").update(`${connectionId}\u0000${evidenceAt}`).digest("hex");
  return `legacy-catalog-adoption-${digest}`;
}

function latestTimestamp(...values: readonly string[]): string {
  return [...values].sort().at(-1)!;
}

function compareConnections(left: ProviderConnectionRecord, right: ProviderConnectionRecord): number {
  return left.connectionId < right.connectionId ? -1 : left.connectionId > right.connectionId ? 1 : 0;
}
