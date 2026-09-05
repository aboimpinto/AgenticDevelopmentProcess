import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CATALOG_RECONCILIATION_SCHEMA_VERSION,
  CATALOG_RECONCILIATION_TARGET_VERSION,
  INVALID_CATALOG_RECONCILIATION_CONTRACT,
  type CatalogReconciliationRecord,
  type ClaimCatalogScanAttemptInput,
  type ProviderConnectionId,
  type SettleCatalogScanAttemptInput,
} from "@hepha/shared";
import { CatalogReconciliationStore } from "../src/catalog-reconciliation-store.js";

const claimedAt = "2026-07-24T10:00:00.000Z";
const settledAt = "2026-07-24T10:01:00.000Z";
const id = (value: string) => value as ProviderConnectionId;

function initialize(store: CatalogReconciliationStore, connectionId = id("connection-a")) {
  return store.initializeNeverScanned({
    connectionId,
    reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
  });
}

function claim(
  store: CatalogReconciliationStore,
  connectionId = id("connection-a"),
  overrides: Partial<ClaimCatalogScanAttemptInput> = {},
) {
  const input: ClaimCatalogScanAttemptInput = {
    connectionId,
    reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
    trigger: "startup_reconciliation",
    attemptId: `attempt-${connectionId}`,
    claimedAt,
    mode: "eligible_only",
    ...overrides,
  };
  return store.claimAttempt(input);
}

function settle(
  store: CatalogReconciliationStore,
  connectionId = id("connection-a"),
  overrides: Partial<SettleCatalogScanAttemptInput> = {},
) {
  const input: SettleCatalogScanAttemptInput = {
    connectionId,
    reconciliationVersion: CATALOG_RECONCILIATION_TARGET_VERSION,
    attemptId: `attempt-${connectionId}`,
    settledAt,
    settledOutcome: "available",
    modelCount: 2,
    outcomeCode: "success",
    safeOutcomeMessage: "Catalog scan succeeded.",
    diagnosticId: `diagnostic-${connectionId}`,
    ...overrides,
  };
  return store.settleAttempt(input);
}

describe("CatalogReconciliationStore", () => {
  it("initializes one target-version never-scanned row and returns it idempotently", () => {
    const store = CatalogReconciliationStore.createInMemory();
    try {
      const expected: CatalogReconciliationRecord = {
        schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
        connectionId: id("connection-a"),
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
      expect(initialize(store)).toEqual(expected);
      expect(initialize(store)).toEqual(expected);
      expect(store.list()).toEqual([expected]);
    } finally {
      store.close();
    }
  });

  it("adopts absent or target-version never-scanned legacy evidence only", () => {
    const store = CatalogReconciliationStore.createInMemory();
    try {
      const adoption = {
        connectionId: id("connection-a"), reconciliationVersion: 2, attemptId: "legacy-a", claimedAt,
        settledAt: claimedAt, settledOutcome: "available" as const, modelCount: 3,
        safeOutcomeMessage: "Legacy catalog evidence adopted.", diagnosticId: null,
      };
      expect(store.adoptLegacyEvidence(adoption)).toMatchObject({
        scanState: "available", trigger: "startup_reconciliation", outcomeCode: "legacy_evidence_adopted",
        modelCount: 3, diagnosticId: null,
      });
      expect(() => store.adoptLegacyEvidence(adoption)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);

      initialize(store, id("connection-b"));
      expect(store.adoptLegacyEvidence({
        ...adoption,
        connectionId: id("connection-b"),
        settledOutcome: "empty",
        modelCount: 0,
        diagnosticId: "legacy-diagnostic-b",
      })).toMatchObject({ scanState: "empty", modelCount: 0, diagnosticId: "legacy-diagnostic-b" });
    } finally {
      store.close();
    }
  });

  it("rejects unequal legacy evidence times atomically and reopens an equal-time adoption losslessly", () => {
    const absentStore = CatalogReconciliationStore.createInMemory();
    try {
      const unequalAdoption = {
        connectionId: id("connection-absent"), reconciliationVersion: 2, attemptId: "legacy-absent",
        claimedAt, settledAt, settledOutcome: "available" as const, modelCount: 1,
        safeOutcomeMessage: "Legacy catalog evidence adopted.", diagnosticId: null,
      };
      expect(() => absentStore.adoptLegacyEvidence(unequalAdoption))
        .toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      expect(absentStore.read(id("connection-absent"))).toBeNull();

      const initialized = initialize(absentStore, id("connection-initialized"));
      expect(() => absentStore.adoptLegacyEvidence({
        ...unequalAdoption,
        connectionId: id("connection-initialized"),
      })).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      expect(absentStore.read(id("connection-initialized"))).toEqual(initialized);
    } finally {
      absentStore.close();
    }

    const directory = mkdtempSync(join(tmpdir(), "hepha-reconciliation-adoption-reopen-"));
    const path = join(directory, "catalog.sqlite");
    const original = new CatalogReconciliationStore(path);
    const expected: CatalogReconciliationRecord = {
      schemaVersion: CATALOG_RECONCILIATION_SCHEMA_VERSION,
      connectionId: id("connection-adopted"),
      reconciliationVersion: 2,
      scanState: "available",
      trigger: "startup_reconciliation",
      attemptId: "legacy-adopted",
      claimedAt,
      settledAt: claimedAt,
      settledOutcome: "available",
      modelCount: 4,
      outcomeCode: "legacy_evidence_adopted",
      safeOutcomeMessage: "Legacy catalog rows adopted.",
      diagnosticId: null,
    };
    try {
      expect(original.adoptLegacyEvidence({
        connectionId: id("connection-adopted"), reconciliationVersion: 2, attemptId: "legacy-adopted",
        claimedAt, settledAt: claimedAt, settledOutcome: "available", modelCount: 4,
        safeOutcomeMessage: "Legacy catalog rows adopted.", diagnosticId: null,
      })).toEqual(expected);
    } finally {
      original.close();
    }
    const reopened = new CatalogReconciliationStore(path);
    try {
      expect(reopened.read(id("connection-adopted"))).toEqual(expected);
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("claims, settles, and suppresses a repeated eligible-only current-version attempt", () => {
    const store = CatalogReconciliationStore.createInMemory();
    try {
      initialize(store);
      expect(claim(store)).toMatchObject({ kind: "claimed", record: { scanState: "scanning" } });
      expect(settle(store)).toMatchObject({ scanState: "available", modelCount: 2 });
      expect(claim(store, id("connection-a"), { attemptId: "second-attempt" }))
        .toMatchObject({ kind: "settled_for_version", record: { attemptId: "attempt-connection-a" } });
      expect(store.read(id("connection-a"))).toMatchObject({ attemptId: "attempt-connection-a" });
    } finally {
      store.close();
    }
  });

  it("allows a forced claim over settled state and an eligible claim over older settled state", () => {
    const store = CatalogReconciliationStore.createInMemory();
    try {
      initialize(store);
      claim(store);
      settle(store);
      expect(claim(store, id("connection-a"), {
        attemptId: "forced-attempt", trigger: "individual_retry", mode: "force_settled",
      })).toMatchObject({ kind: "claimed", record: { attemptId: "forced-attempt", trigger: "individual_retry" } });
    } finally {
      store.close();
    }

    const directory = mkdtempSync(join(tmpdir(), "hepha-reconciliation-old-version-"));
    const path = join(directory, "catalog.sqlite");
    const database = new DatabaseSync(path);
    try {
      database.exec(`
        create table catalog_reconciliation_ledger (
          connection_id text primary key, reconciliation_version integer not null, scan_state text not null,
          trigger text, attempt_id text, claimed_at text, settled_at text, settled_outcome text,
          model_count integer, outcome_code text, safe_outcome_message text, diagnostic_id text
        );
        insert into catalog_reconciliation_ledger values (
          'connection-old', 1, 'failed', 'startup_reconciliation', 'old-attempt', '${claimedAt}',
          '${settledAt}', 'failed', 0, 'timeout', 'Old scan failed.', 'old-diagnostic'
        );
      `);
    } finally {
      database.close();
    }
    const upgraded = new CatalogReconciliationStore(path);
    try {
      expect(claim(upgraded, id("connection-old"), { attemptId: "version-two-attempt" }))
        .toMatchObject({ kind: "claimed", record: { reconciliationVersion: 2, attemptId: "version-two-attempt" } });
    } finally {
      upgraded.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("deduplicates concurrent handles at the atomic SQLite claim", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-reconciliation-concurrent-"));
    const path = join(directory, "catalog.sqlite");
    const first = new CatalogReconciliationStore(path);
    const second = new CatalogReconciliationStore(path);
    try {
      initialize(first);
      const winner = claim(first);
      const refused = claim(second, id("connection-a"), { attemptId: "competing-attempt" });
      expect(winner).toMatchObject({ kind: "claimed", record: { attemptId: "attempt-connection-a" } });
      expect(refused).toMatchObject({ kind: "already_scanning", record: { attemptId: "attempt-connection-a" } });
      expect(second.listInterruptedClaims()).toMatchObject([{ connectionId: "connection-a", scanState: "scanning" }]);
    } finally {
      first.close();
      second.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects foreign, wrong-version, early, duplicate, and malformed settlement without mutation", () => {
    const store = CatalogReconciliationStore.createInMemory();
    try {
      initialize(store);
      const initial = store.read(id("connection-a"));
      expect(() => settle(store)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      expect(store.read(id("connection-a"))).toEqual(initial);

      claim(store);
      const scanning = store.read(id("connection-a"));
      for (const overrides of [
        { attemptId: "foreign-attempt" },
        { reconciliationVersion: 3 },
        { settledAt: "2026-07-24T09:59:00.000Z" },
      ]) {
        expect(() => settle(store, id("connection-a"), overrides)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
        expect(store.read(id("connection-a"))).toEqual(scanning);
      }
      settle(store);
      const settled = store.read(id("connection-a"));
      expect(() => settle(store)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      expect(store.read(id("connection-a"))).toEqual(settled);
    } finally {
      store.close();
    }
  });

  it("survives close/reopen and lists records and interrupted claims in code-unit order", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-reconciliation-reopen-"));
    const path = join(directory, "catalog.sqlite");
    const original = new CatalogReconciliationStore(path);
    try {
      initialize(original, id("connection-z"));
      initialize(original, id("connection-a"));
      claim(original, id("connection-z"));
    } finally {
      original.close();
    }
    const reopened = new CatalogReconciliationStore(path);
    try {
      expect(reopened.list().map((entry) => entry.connectionId)).toEqual(["connection-a", "connection-z"]);
      expect(reopened.listInterruptedClaims().map((entry) => entry.connectionId)).toEqual(["connection-z"]);
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed public inputs and malformed persisted rows with the fixed safe error", () => {
    const store = CatalogReconciliationStore.createInMemory();
    try {
      expect(() => store.initializeNeverScanned(null as never)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      expect(() => store.claimAttempt({ connectionId: "connection-a" } as never)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
      expect(() => store.read("" as ProviderConnectionId)).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    } finally {
      store.close();
    }

    const directory = mkdtempSync(join(tmpdir(), "hepha-reconciliation-malformed-"));
    const path = join(directory, "catalog.sqlite");
    const writer = new CatalogReconciliationStore(path);
    try {
      initialize(writer);
    } finally {
      writer.close();
    }
    const database = new DatabaseSync(path);
    try {
      database.prepare("update catalog_reconciliation_ledger set scan_state = 'available'").run();
    } finally {
      database.close();
    }
    const reader = new CatalogReconciliationStore(path);
    try {
      expect(() => reader.list()).toThrow(INVALID_CATALOG_RECONCILIATION_CONTRACT);
    } finally {
      reader.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
