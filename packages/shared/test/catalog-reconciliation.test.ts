import { describe, expect, it } from "vitest";
import {
  CATALOG_RECONCILIATION_SCHEMA_VERSION,
  CATALOG_RECONCILIATION_TARGET_VERSION,
  isActiveCatalogConnectionState,
  isAdoptCatalogLegacyEvidenceInput,
  isCatalogConnectionStateResponse,
  isCatalogConnectionStatesResponse,
  isCatalogReconciliationRecord,
  isClaimCatalogScanAttemptInput,
  isInitializeCatalogReconciliationInput,
  isSettleCatalogScanAttemptInput,
  type ActiveCatalogConnectionState,
  type CatalogReconciliationRecord,
  type ProviderConnectionId,
} from "../src/index.js";

const connectionId = "connection-a" as ProviderConnectionId;
const claimedAt = "2026-07-24T10:00:00.000Z";
const settledAt = "2026-07-24T10:01:00.000Z";

function record(overrides: Partial<CatalogReconciliationRecord> = {}): CatalogReconciliationRecord {
  return {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId,
    reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
    scanState: "available",
    trigger: "individual_retry",
    attemptId: "attempt-a",
    claimedAt,
    settledAt,
    settledOutcome: "available",
    modelCount: 2,
    outcomeCode: "success",
    safeOutcomeMessage: "Catalog scan succeeded.",
    diagnosticId: "diagnostic-a",
    ...overrides,
  };
}

function state(overrides: Partial<ActiveCatalogConnectionState> = {}): ActiveCatalogConnectionState {
  return {
    schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
    connectionId,
    label: "Connection A",
    providerKind: "known",
    lifecycleActive: true,
    scanState: "available",
    trigger: "individual_retry",
    attemptId: "attempt-a",
    modelCount: 2,
    claimedAt,
    settledAt,
    outcomeCode: "success",
    safeMessage: "Catalog scan succeeded.",
    diagnosticId: "diagnostic-a",
    diagnosticOccurredAt: settledAt,
    guidanceCode: "models_available",
    ...overrides,
  };
}

describe("catalog reconciliation shared guards", () => {
  it("accepts the complete legal ledger state matrix", () => {
    expect(isCatalogReconciliationRecord(record({
      scanState: "never_scanned", trigger: null, attemptId: null, claimedAt: null, settledAt: null,
      settledOutcome: null, modelCount: null, outcomeCode: null, safeOutcomeMessage: null, diagnosticId: null,
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      scanState: "scanning", settledAt: null, settledOutcome: null, modelCount: null,
      outcomeCode: null, safeOutcomeMessage: null, diagnosticId: null,
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record())).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      scanState: "empty", settledOutcome: "empty", modelCount: 0,
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      scanState: "failed", settledOutcome: "failed", modelCount: 0, outcomeCode: "timeout",
      safeOutcomeMessage: "Catalog scan timed out.",
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      trigger: "startup_reconciliation", settledAt: claimedAt,
      outcomeCode: "legacy_evidence_adopted", diagnosticId: null,
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      trigger: "startup_reconciliation", settledAt: claimedAt,
      outcomeCode: "legacy_evidence_adopted",
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      scanState: "empty", trigger: "startup_reconciliation", settledAt: claimedAt,
      settledOutcome: "empty", modelCount: 0, outcomeCode: "legacy_evidence_adopted",
    }))).toBe(true);
    expect(isCatalogReconciliationRecord(record({
      scanState: "failed", trigger: "startup_reconciliation", settledAt: claimedAt,
      settledOutcome: "failed", modelCount: 0, outcomeCode: "legacy_evidence_adopted",
    }))).toBe(true);
  });

  it.each([
    undefined,
    null,
    [],
    { ...record(), extra: "forbidden" },
    record({ reconciliationVersion: 0 }),
    record({ scanState: "never_scanned" }),
    record({ scanState: "available", modelCount: 0 }),
    record({ scanState: "empty", settledOutcome: "empty", modelCount: 1 }),
    record({ scanState: "failed", settledOutcome: "failed", modelCount: 0, outcomeCode: "success" }),
    record({ settledAt: "2026-07-24T09:59:00.000Z" }),
    record({ diagnosticId: null }),
  ])("rejects malformed or contradictory ledger values (%#)", (candidate) => {
    expect(isCatalogReconciliationRecord(candidate)).toBe(false);
  });

  it("rejects every malformed legacy-adoption evidence-time and trigger combination", () => {
    const legacy = record({
      trigger: "startup_reconciliation",
      settledAt: claimedAt,
      outcomeCode: "legacy_evidence_adopted",
      diagnosticId: null,
    });
    const { claimedAt: _omittedClaimedAt, ...withoutClaimedAt } = legacy;
    const { settledAt: _omittedSettledAt, ...withoutSettledAt } = legacy;

    for (const candidate of [
      { ...legacy, trigger: "individual_retry" },
      withoutClaimedAt,
      { ...legacy, claimedAt: null },
      { ...legacy, claimedAt: 42 },
      { ...legacy, claimedAt: "2026-07-24T10:00:00Z" },
      withoutSettledAt,
      { ...legacy, settledAt: null },
      { ...legacy, settledAt: 42 },
      { ...legacy, settledAt: "2026-07-24T10:00:00Z" },
      { ...legacy, settledAt },
      { ...legacy, claimedAt: settledAt },
    ]) {
      expect(isCatalogReconciliationRecord(candidate)).toBe(false);
    }

    expect(isCatalogReconciliationRecord({
      ...legacy,
      scanState: "empty",
      settledOutcome: "empty",
      modelCount: 0,
      diagnosticId: null,
    })).toBe(false);
    expect(isCatalogReconciliationRecord({
      ...legacy,
      scanState: "failed",
      settledOutcome: "failed",
      modelCount: 0,
      diagnosticId: null,
    })).toBe(false);
  });

  it("guards exact secret-safe active state DTOs and state guidance", () => {
    expect(isActiveCatalogConnectionState(state())).toBe(true);
    expect(isActiveCatalogConnectionState(state({
      scanState: "never_scanned", trigger: null, attemptId: null, modelCount: null, claimedAt: null,
      settledAt: null, outcomeCode: null, safeMessage: null, diagnosticId: null,
      diagnosticOccurredAt: null, guidanceCode: "scan_not_started",
    }))).toBe(true);
    expect(isActiveCatalogConnectionState({ ...state(), endpointUrl: "https://secret-bearing.example" })).toBe(false);
    expect(isActiveCatalogConnectionState(state({ guidanceCode: "scan_failed" }))).toBe(false);
    expect(isActiveCatalogConnectionState(state({ diagnosticOccurredAt: null }))).toBe(false);
  });

  it("guards exact selected and collection public responses before client dereference", () => {
    const second = state({ connectionId: "connection-b" as ProviderConnectionId, label: "Connection B" });
    expect(isCatalogConnectionStateResponse({
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connection: state(),
    })).toBe(true);
    expect(isCatalogConnectionStatesResponse({
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connections: [state(), second],
    })).toBe(true);

    for (const candidate of [
      undefined,
      null,
      { schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION },
      { schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION, connections: null },
      { schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION, connections: [state(), state()] },
      { schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION, connections: [second, state()] },
      { schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION, connections: [{ ...state(), secretRef: "forbidden" }] },
      { schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION, connections: [], results: [] },
    ]) {
      expect(isCatalogConnectionStatesResponse(candidate)).toBe(false);
    }
    expect(isCatalogConnectionStateResponse({
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connection: { ...state(), endpointUrl: "https://forbidden.test" },
    })).toBe(false);
    expect(isCatalogConnectionStateResponse({
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connection: state(),
      result: state(),
    })).toBe(false);
  });

  it("guards initialize, adoption, claim, and settlement inputs before store use", () => {
    expect(isInitializeCatalogReconciliationInput({ connectionId, reconciliationVersion: 2 })).toBe(true);
    expect(isInitializeCatalogReconciliationInput({ connectionId, reconciliationVersion: 1 })).toBe(false);

    const adoption = {
      connectionId, reconciliationVersion: 2, attemptId: "legacy-a", claimedAt, settledAt: claimedAt,
      settledOutcome: "available", modelCount: 2, safeOutcomeMessage: "Legacy evidence adopted.", diagnosticId: null,
    };
    expect(isAdoptCatalogLegacyEvidenceInput(adoption)).toBe(true);
    expect(isAdoptCatalogLegacyEvidenceInput({ ...adoption, diagnosticId: "diagnostic-available" })).toBe(true);
    expect(isAdoptCatalogLegacyEvidenceInput({
      ...adoption, settledOutcome: "empty", modelCount: 0, diagnosticId: "diagnostic-empty",
    })).toBe(true);
    expect(isAdoptCatalogLegacyEvidenceInput({
      ...adoption, settledOutcome: "failed", modelCount: 0, diagnosticId: "diagnostic-failed",
    })).toBe(true);
    expect(isAdoptCatalogLegacyEvidenceInput({ ...adoption, settledOutcome: "empty" })).toBe(false);

    const { claimedAt: _omittedClaimedAt, ...adoptionWithoutClaimedAt } = adoption;
    const { settledAt: _omittedSettledAt, ...adoptionWithoutSettledAt } = adoption;
    for (const candidate of [
      adoptionWithoutClaimedAt,
      { ...adoption, claimedAt: null },
      { ...adoption, claimedAt: 42 },
      { ...adoption, claimedAt: "2026-07-24T10:00:00Z" },
      adoptionWithoutSettledAt,
      { ...adoption, settledAt: null },
      { ...adoption, settledAt: 42 },
      { ...adoption, settledAt: "2026-07-24T10:00:00Z" },
      { ...adoption, settledAt },
      { ...adoption, claimedAt: settledAt },
    ]) {
      expect(isAdoptCatalogLegacyEvidenceInput(candidate)).toBe(false);
    }

    const claim = {
      connectionId, reconciliationVersion: 2, trigger: "startup_reconciliation", attemptId: "attempt-a",
      claimedAt, mode: "eligible_only",
    };
    expect(isClaimCatalogScanAttemptInput(claim)).toBe(true);
    expect(isClaimCatalogScanAttemptInput({ ...claim, mode: "legacy" })).toBe(false);

    const settlement = {
      connectionId, reconciliationVersion: 2, attemptId: "attempt-a", settledAt,
      settledOutcome: "available", modelCount: 2, outcomeCode: "success",
      safeOutcomeMessage: "Catalog scan succeeded.", diagnosticId: "diagnostic-a",
    };
    expect(isSettleCatalogScanAttemptInput(settlement)).toBe(true);
    expect(isSettleCatalogScanAttemptInput({ ...settlement, extra: true })).toBe(false);
    expect(isSettleCatalogScanAttemptInput({ ...settlement, settledOutcome: "failed", modelCount: 0 })).toBe(false);
    expect(isSettleCatalogScanAttemptInput({ ...settlement, diagnosticId: null })).toBe(false);
  });
});
