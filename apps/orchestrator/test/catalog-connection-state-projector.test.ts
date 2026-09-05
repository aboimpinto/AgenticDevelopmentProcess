import { describe, expect, it } from "vitest";
import {
  CATALOG_RECONCILIATION_SCHEMA_VERSION,
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  type CatalogReconciliationRecord,
  type CatalogScanDiagnostic,
  type ProviderConnectionId,
} from "@hepha/shared";
import {
  CatalogConnectionStateProjector,
  type CatalogConnectionStateProjectionInput,
} from "../src/model-catalog/catalog-connection-state-projector.js";

const claimedAt = "2026-07-24T10:00:00.000Z";
const diagnosticAt = "2026-07-24T10:00:30.000Z";
const settledAt = "2026-07-24T10:01:00.000Z";
const id = (value: string) => value as ProviderConnectionId;

function ledger(
  connectionId: string,
  scanState: "scanning" | "available" | "empty" | "failed",
  overrides: Partial<CatalogReconciliationRecord> = {},
): CatalogReconciliationRecord {
  const settled = scanState !== "scanning";
  return {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId: id(connectionId),
    reconciliationVersion: 2,
    scanState,
    trigger: "individual_retry",
    attemptId: `attempt-${connectionId}`,
    claimedAt,
    settledAt: settled ? settledAt : null,
    settledOutcome: settled ? scanState : null,
    modelCount: scanState === "available" ? 2 : settled ? 0 : null,
    outcomeCode: scanState === "available" || scanState === "empty" ? "success" : scanState === "failed" ? "timeout" : null,
    safeOutcomeMessage: scanState === "available" || scanState === "empty"
      ? "Catalog scan succeeded."
      : scanState === "failed" ? "Catalog scan timed out." : null,
    diagnosticId: settled ? `diagnostic-${connectionId}` : null,
    ...overrides,
  };
}

function diagnostic(
  connectionId: string,
  outcome: CatalogScanDiagnostic["outcome"],
  safeMessage: string,
  overrides: Partial<CatalogScanDiagnostic> = {},
): CatalogScanDiagnostic {
  return {
    schemaVersion: "model-catalog/v1",
    diagnosticId: `diagnostic-${connectionId}`,
    connectionId: id(connectionId),
    scanCorrelationId: `attempt-${connectionId}`,
    outcome,
    safeMessage,
    httpStatusCode: outcome === "success" ? 200 : null,
    occurredAt: diagnosticAt,
    ...overrides,
  };
}

function fullInput(): CatalogConnectionStateProjectionInput {
  return {
    connections: [
      { connectionId: id("connection-scanning"), label: "Scanning", providerKind: "custom", lifecycleState: "active" },
      { connectionId: id("connection-never"), label: "Never", providerKind: "known", lifecycleState: "active" },
      { connectionId: id("connection-failed"), label: "Failed", providerKind: "known", lifecycleState: "active" },
      { connectionId: id("connection-empty"), label: "Empty", providerKind: "pi_session", lifecycleState: "active" },
      { connectionId: id("connection-available"), label: "Available", providerKind: "known", lifecycleState: "active" },
      { connectionId: id("connection-revoked"), label: "Revoked", providerKind: "known", lifecycleState: "revoked" },
    ],
    reconciliationRecords: [
      ledger("connection-scanning", "scanning"),
      ledger("connection-failed", "failed"),
      ledger("connection-empty", "empty"),
      ledger("connection-available", "available"),
    ],
    modelCounts: [
      { connectionId: id("connection-scanning"), modelCount: 1 },
      { connectionId: id("connection-never"), modelCount: 0 },
      { connectionId: id("connection-failed"), modelCount: 0 },
      { connectionId: id("connection-empty"), modelCount: 0 },
      { connectionId: id("connection-available"), modelCount: 2 },
      { connectionId: id("connection-revoked"), modelCount: 0 },
    ],
    settledDiagnostics: [
      diagnostic("connection-failed", "timeout", "Catalog scan timed out."),
      diagnostic("connection-empty", "success", "Catalog scan succeeded."),
      diagnostic("connection-available", "success", "Catalog scan succeeded."),
    ],
  };
}

describe("CatalogConnectionStateProjector", () => {
  it("projects all five authoritative states in code-unit connection order and excludes inactive records", () => {
    const states = new CatalogConnectionStateProjector().project(fullInput());

    expect(states.map((state) => `${state.connectionId}:${state.scanState}`)).toEqual([
      "connection-available:available",
      "connection-empty:empty",
      "connection-failed:failed",
      "connection-never:never_scanned",
      "connection-scanning:scanning",
    ]);
    expect(states.map((state) => state.guidanceCode)).toEqual([
      "models_available", "no_models_returned", "scan_failed", "scan_not_started", "scan_in_progress",
    ]);
    expect(states.find((state) => state.scanState === "scanning")).toMatchObject({
      modelCount: null,
      diagnosticId: null,
      diagnosticOccurredAt: null,
    });
    expect(JSON.stringify(states)).not.toContain("endpointUrl");
    expect(JSON.stringify(states)).not.toContain("secret");
    expect(JSON.stringify(states)).not.toContain("connection-revoked");
  });

  it("projects row-only available legacy adoption without fabricating a diagnostic", () => {
    const input = fullInput();
    const records = input.reconciliationRecords.map((record) => record.connectionId === "connection-available"
      ? ledger("connection-available", "available", {
        trigger: "startup_reconciliation",
        attemptId: "legacy-row-adoption",
        settledAt: claimedAt,
        outcomeCode: "legacy_evidence_adopted",
        safeOutcomeMessage: "Legacy catalog rows adopted.",
        diagnosticId: null,
      })
      : record);
    const diagnostics = input.settledDiagnostics.filter((entry) => entry.connectionId !== "connection-available");

    expect(new CatalogConnectionStateProjector().project({ ...input, reconciliationRecords: records, settledDiagnostics: diagnostics }))
      .toContainEqual(expect.objectContaining({
        connectionId: "connection-available",
        scanState: "available",
        safeMessage: "Legacy catalog rows adopted.",
        diagnosticId: null,
        diagnosticOccurredAt: null,
      }));
  });

  it("projects diagnostic-backed legacy Available, Empty, and Failed only with exact evidence correlation", () => {
    const input = fullInput();
    const records = input.reconciliationRecords.map((record) => {
      if (record.scanState === "scanning") return record;
      return {
        ...record,
        trigger: "startup_reconciliation" as const,
        settledAt: claimedAt,
        outcomeCode: "legacy_evidence_adopted" as const,
      };
    });
    const diagnostics = input.settledDiagnostics.map((entry) => ({ ...entry, occurredAt: claimedAt }));

    expect(new CatalogConnectionStateProjector().project({
      ...input,
      reconciliationRecords: records,
      settledDiagnostics: diagnostics,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        connectionId: "connection-available", scanState: "available",
        diagnosticId: "diagnostic-connection-available", diagnosticOccurredAt: claimedAt,
      }),
      expect.objectContaining({
        connectionId: "connection-empty", scanState: "empty",
        diagnosticId: "diagnostic-connection-empty", diagnosticOccurredAt: claimedAt,
      }),
      expect.objectContaining({
        connectionId: "connection-failed", scanState: "failed",
        diagnosticId: "diagnostic-connection-failed", diagnosticOccurredAt: claimedAt,
      }),
    ]));
  });

  it("rejects malformed legacy trigger, evidence interval, and diagnostic time through project", () => {
    const projector = new CatalogConnectionStateProjector();
    const input = fullInput();
    const replaceAvailableRecord = (overrides: Partial<CatalogReconciliationRecord>) => ({
      ...input,
      reconciliationRecords: input.reconciliationRecords.map((record) => record.connectionId === "connection-available"
        ? ledger("connection-available", "available", {
          trigger: "startup_reconciliation",
          settledAt: claimedAt,
          outcomeCode: "legacy_evidence_adopted",
          ...overrides,
        })
        : record),
      settledDiagnostics: input.settledDiagnostics.map((entry) => entry.connectionId === "connection-available"
        ? { ...entry, occurredAt: claimedAt }
        : entry),
    });

    expect(() => projector.project(replaceAvailableRecord({ settledAt })))
      .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    expect(() => projector.project(replaceAvailableRecord({ trigger: "individual_retry" })))
      .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);

    const mismatchedDiagnosticTime = replaceAvailableRecord({});
    expect(() => projector.project({
      ...mismatchedDiagnosticTime,
      settledDiagnostics: mismatchedDiagnosticTime.settledDiagnostics.map((entry) =>
        entry.connectionId === "connection-available" ? { ...entry, occurredAt: diagnosticAt } : entry),
    })).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
  });

  it.each([
    ["missing input", undefined],
    ["malformed connections", { ...fullInput(), connections: null }],
    ["malformed ledger collection", { ...fullInput(), reconciliationRecords: {} }],
    ["malformed count entry", { ...fullInput(), modelCounts: [null] }],
    ["malformed diagnostic entry", { ...fullInput(), settledDiagnostics: ["unsafe"] }],
    ["extra outer key", { ...fullInput(), metadata: {} }],
    ["extra connection key", { ...fullInput(), connections: [{ ...fullInput().connections[0], secretRef: "forbidden" }] }],
  ])("rejects malformed outer, nested, entry, and extra-key values: %s", (_name, input) => {
    expect(() => new CatalogConnectionStateProjector().project(input)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
  });

  it("rejects duplicate and foreign identities before projection", () => {
    const projector = new CatalogConnectionStateProjector();
    const input = fullInput();
    expect(() => projector.project({ ...input, connections: [...input.connections, input.connections[0]!] }))
      .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    expect(() => projector.project({ ...input, reconciliationRecords: [...input.reconciliationRecords, input.reconciliationRecords[0]!] }))
      .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    expect(() => projector.project({
      ...input,
      modelCounts: [...input.modelCounts, { connectionId: id("foreign"), modelCount: 0 }],
    })).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    expect(() => projector.project({ ...input, settledDiagnostics: [...input.settledDiagnostics, input.settledDiagnostics[0]!] }))
      .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
  });

  it.each([
    ["available count mismatch", (input: CatalogConnectionStateProjectionInput) => ({
      ...input,
      modelCounts: input.modelCounts.map((entry) => entry.connectionId === "connection-available" ? { ...entry, modelCount: 1 } : entry),
    })],
    ["empty with rows", (input: CatalogConnectionStateProjectionInput) => ({
      ...input,
      modelCounts: input.modelCounts.map((entry) => entry.connectionId === "connection-empty" ? { ...entry, modelCount: 1 } : entry),
    })],
    ["never scanned with rows", (input: CatalogConnectionStateProjectionInput) => ({
      ...input,
      modelCounts: input.modelCounts.map((entry) => entry.connectionId === "connection-never" ? { ...entry, modelCount: 1 } : entry),
    })],
    ["missing model count", (input: CatalogConnectionStateProjectionInput) => ({ ...input, modelCounts: input.modelCounts.slice(1) })],
    ["diagnostic attempt mismatch", (input: CatalogConnectionStateProjectionInput) => ({
      ...input,
      settledDiagnostics: input.settledDiagnostics.map((entry) => entry.connectionId === "connection-failed"
        ? { ...entry, scanCorrelationId: "foreign-attempt" } : entry),
    })],
    ["diagnostic connection mismatch", (input: CatalogConnectionStateProjectionInput) => ({
      ...input,
      settledDiagnostics: input.settledDiagnostics.map((entry) => entry.connectionId === "connection-failed"
        ? { ...entry, connectionId: id("connection-empty") } : entry),
    })],
    ["diagnostic outside attempt boundary", (input: CatalogConnectionStateProjectionInput) => ({
      ...input,
      settledDiagnostics: input.settledDiagnostics.map((entry) => entry.connectionId === "connection-failed"
        ? { ...entry, occurredAt: "2026-07-24T10:02:00.000Z" } : entry),
    })],
  ])("rejects contradictory server facts: %s", (_name, mutate) => {
    expect(() => new CatalogConnectionStateProjector().project(mutate(fullInput())))
      .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
  });
});
