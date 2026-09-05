import { describe, expect, it } from "vitest";
import type {
  CatalogReconciliationRecord,
  CatalogScanDiagnostic,
  ProviderConnectionId,
  ProviderConnectionRecord,
} from "@hepha/shared";
import { CatalogConnectionStateProjector } from "../src/model-catalog/catalog-connection-state-projector.js";
import { CatalogConnectionStateService } from "../src/model-catalog/catalog-connection-state-service.js";

function connection(connectionId: string, lifecycleState: ProviderConnectionRecord["lifecycleState"] = "active"): ProviderConnectionRecord {
  return {
    connectionId: connectionId as ProviderConnectionId,
    kind: "pi_session",
    label: connectionId,
    provider: { kind: "pi_session" },
    endpointUrl: "http://localhost:11434",
    endpointLocal: true,
    lifecycleState,
    secretRef: null,
    secretVersion: null,
    createdAt: "2026-07-24T18:00:00.000Z",
    updatedAt: "2026-07-24T18:00:00.000Z",
  };
}

function settledEmptyRecord(connectionId: string): CatalogReconciliationRecord {
  return {
    schemaVersion: "catalog-reconciliation/v1",
    connectionId: connectionId as ProviderConnectionId,
    reconciliationVersion: 2,
    scanState: "empty",
    trigger: "individual_retry",
    attemptId: `attempt-${connectionId}`,
    claimedAt: "2026-07-24T18:00:00.000Z",
    settledAt: "2026-07-24T18:00:01.000Z",
    settledOutcome: "empty",
    modelCount: 0,
    outcomeCode: "success",
    safeOutcomeMessage: "Catalog scan completed successfully.",
    diagnosticId: `diagnostic-${connectionId}`,
  };
}

function diagnostic(connectionId: string): CatalogScanDiagnostic {
  return {
    schemaVersion: "model-catalog/v1",
    diagnosticId: `diagnostic-${connectionId}`,
    connectionId: connectionId as ProviderConnectionId,
    scanCorrelationId: `attempt-${connectionId}`,
    outcome: "success",
    safeMessage: "Catalog scan completed successfully.",
    httpStatusCode: 200,
    occurredAt: "2026-07-24T18:00:01.000Z",
  };
}

function neverScannedRecord(connectionId: string): CatalogReconciliationRecord {
  return {
    schemaVersion: "catalog-reconciliation/v1",
    connectionId: connectionId as ProviderConnectionId,
    reconciliationVersion: 2,
    scanState: "never_scanned",
    trigger: null,
    attemptId: null,
    claimedAt: null,
    settledAt: null,
    settledOutcome: null,
    modelCount: null,
    outcomeCode: null,
    safeOutcomeMessage: null,
    diagnosticId: null,
  };
}

function service(input: {
  connections?: ProviderConnectionRecord[];
  records?: unknown;
  diagnostics?: CatalogScanDiagnostic[];
}) {
  return new CatalogConnectionStateService({
    connections: { listConnections: () => input.connections ?? [connection("connection-b"), connection("connection-a"), connection("inactive", "revoked")] },
    reconciliationStore: { list: () => (input.records ?? []) as CatalogReconciliationRecord[] },
    catalogStore: {
      listDiagnostics: () => input.diagnostics ?? [],
      listModels: () => [],
    },
    projector: new CatalogConnectionStateProjector(),
  });
}

describe("CatalogConnectionStateService", () => {
  it("projects every active zero-row connection in stable order without inventing inactive state", () => {
    expect(service({
      records: [neverScannedRecord("inactive"), neverScannedRecord("deleted-connection")],
    }).listActiveConnectionStates()).toMatchObject([
      { connectionId: "connection-a", scanState: "never_scanned" },
      { connectionId: "connection-b", scanState: "never_scanned" },
    ]);
  });

  it("ignores a fully guarded orphan ledger row while preserving a current settled state", () => {
    const remaining = settledEmptyRecord("connection-a");
    expect(service({
      connections: [connection("connection-a")],
      records: [remaining, neverScannedRecord("deleted-connection")],
      diagnostics: [diagnostic("connection-a")],
    }).listActiveConnectionStates()).toMatchObject([
      { connectionId: "connection-a", scanState: "empty", modelCount: 0 },
    ]);
  });

  it("returns an empty collection when only a fully guarded orphan ledger row remains", () => {
    expect(service({
      connections: [],
      records: [neverScannedRecord("deleted-connection")],
    }).listActiveConnectionStates()).toEqual([]);
  });

  it("rejects a malformed orphan ledger row before identity scoping", () => {
    expect(() => service({
      connections: [],
      records: [{ connectionId: "deleted-connection" }],
    }).listActiveConnectionStates()).toThrow("Invalid catalog reconciliation contract.");
  });

  it("rejects a settled ledger record whose authoritative diagnostic is unavailable", () => {
    const failed: CatalogReconciliationRecord = {
      schemaVersion: "catalog-reconciliation/v1",
      connectionId: "connection-a" as ProviderConnectionId,
      reconciliationVersion: 2,
      scanState: "failed",
      trigger: "individual_retry",
      attemptId: "attempt-a",
      claimedAt: "2026-07-24T18:00:00.000Z",
      settledAt: "2026-07-24T18:00:00.000Z",
      settledOutcome: "failed",
      modelCount: 0,
      outcomeCode: "authentication_failed",
      safeOutcomeMessage: "Provider authentication was rejected.",
      diagnosticId: "diagnostic-a",
    };
    expect(() => service({ connections: [connection("connection-a")], records: [failed] }).listActiveConnectionStates())
      .toThrow("Invalid catalog reconciliation contract.");
  });
});
