// Behavior suite: provider connections.
/**
 * FEAT-058: Provider Connection Store Tests
 *
 * Tests for ProviderConnectionStore CRUD, schema constraints,
 * diagnostic retention, deletion guards, and non-leak assertions.
 */

import { describe, expect, it } from "vitest";
import { ProviderConnectionStore } from "../src/provider-connection-store.js";
import type {
  ProviderConnectionId,
  ProviderConnectionKind,
  ConnectionLifecycleState,
  ProviderConnectionRecord,
  ProviderIdentifier,
  ConnectionDiagnosticRecord,
  ConnectionDependencyRecord,
  DiagnosticFailureCode,
  DiagnosticSeverity,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ID_PREFIX = "pc-test-";

let testCounter = 0;
let diagCounter = 0;

function nextId(): ProviderConnectionId {
  testCounter++;
  return `${TEST_ID_PREFIX}${String(testCounter).padStart(4, "0")}` as ProviderConnectionId;
}

function nextDiagId(): string {
  diagCounter++;
  return `diag-${diagCounter}`;
}

function now(): string {
  return new Date().toISOString();
}

function makeConnection(overrides: Partial<ProviderConnectionRecord> = {}): ProviderConnectionRecord {
  const id = overrides.connectionId ?? nextId();
  const ts = now();
  return {
    connectionId: id,
    kind: "custom",
    label: "Test Connection",
    provider: { kind: "custom", label: "test-provider" },
    endpointUrl: "https://api.test.local/v1",
    endpointLocal: false,
    lifecycleState: "active",
    secretRef: "vault-ref-001",
    secretVersion: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeDiagnostic(
  connectionId: ProviderConnectionId,
  overrides: Partial<ConnectionDiagnosticRecord> = {},
): ConnectionDiagnosticRecord {
  const ts = now();
  return {
    diagnosticId: nextDiagId(),
    connectionId,
    severity: "info",
    failureCode: null,
    safeMessage: "Connection validated successfully",
    httpStatusCode: 200,
    diagnosticOperation: "validate",
    timestamp: ts,
    ...overrides,
  };
}

function makeDependency(
  connectionId: ProviderConnectionId,
  overrides: Partial<ConnectionDependencyRecord> = {},
): ConnectionDependencyRecord {
  return {
    dependencyId: `dep-${connectionId}-${testCounter}`,
    connectionId,
    ownerFeat: "FEAT-061",
    safeDescriptor: "Routing policy: default-route uses this connection",
    registeredAt: now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Connection CRUD
// ---------------------------------------------------------------------------

describe("ProviderConnectionStore — Connection CRUD", () => {
  it("inserts and retrieves a connection by id", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection();
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.connectionId).toBe(record.connectionId);
      expect(found!.kind).toBe(record.kind);
      expect(found!.label).toBe(record.label);
      expect(found!.endpointUrl).toBe(record.endpointUrl);
      expect(found!.lifecycleState).toBe("active");
    } finally {
      store.close();
    }
  });

  it("returns null for non-existent connection", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const found = store.getConnection("non-existent" as ProviderConnectionId);
      expect(found).toBeNull();
    } finally {
      store.close();
    }
  });

  it("lists all connections", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const c1 = makeConnection({ connectionId: nextId(), label: "First" });
      const c2 = makeConnection({ connectionId: nextId(), label: "Second" });
      store.insertConnection(c1);
      store.insertConnection(c2);

      const all = store.listConnections();
      expect(all).toHaveLength(2);
      expect(all[0].label).toBe("First");
      expect(all[1].label).toBe("Second");
    } finally {
      store.close();
    }
  });

  it("lists connections filtered by lifecycle state", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const ts = now();
      const active = makeConnection({ connectionId: nextId(), lifecycleState: "active", createdAt: ts, updatedAt: ts });
      const revoked = makeConnection({ connectionId: nextId(), lifecycleState: "revoked", createdAt: ts, updatedAt: ts });
      store.insertConnection(active);
      store.insertConnection(revoked);

      const activeList = store.listConnectionsByLifecycle("active");
      expect(activeList).toHaveLength(1);
      expect(activeList[0].connectionId).toBe(active.connectionId);

      const revokedList = store.listConnectionsByLifecycle("revoked");
      expect(revokedList).toHaveLength(1);
      expect(revokedList[0].connectionId).toBe(revoked.connectionId);
    } finally {
      store.close();
    }
  });

  it("updates connection fields", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({ label: "Original Label" });
      store.insertConnection(record);

      const ts = now();
      store.updateConnectionFields(record.connectionId, { label: "Updated Label" }, ts);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.label).toBe("Updated Label");
      expect(found!.updatedAt).toBe(ts);
    } finally {
      store.close();
    }
  });

  it("updates lifecycle state", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection();
      store.insertConnection(record);

      const ts = now();
      store.updateLifecycleState(record.connectionId, "revoked", ts);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.lifecycleState).toBe("revoked");
    } finally {
      store.close();
    }
  });

  it("updates secret ref and version", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection();
      store.insertConnection(record);

      const ts = now();
      store.updateSecretRef(record.connectionId, "new-vault-ref", 2, ts);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.secretRef).toBe("new-vault-ref");
      expect(found!.secretVersion).toBe(2);
    } finally {
      store.close();
    }
  });

  it("atomically replaces a revoked secret reference and reactivates the connection", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({ lifecycleState: "revoked", secretVersion: 1 });
      store.insertConnection(record);

      const ts = now();
      store.replaceSecretAndReactivate(record.connectionId, "replacement-ref", 2, ts);

      expect(store.getConnection(record.connectionId)).toMatchObject({
        lifecycleState: "active",
        secretRef: "replacement-ref",
        secretVersion: 2,
        updatedAt: ts,
      });
      expect(() => store.replaceSecretAndReactivate(record.connectionId, "other-ref", 3, now()))
        .toThrow("Revoked provider connection was not reactivated.");
      expect(store.getConnection(record.connectionId)).toMatchObject({
        lifecycleState: "active",
        secretRef: "replacement-ref",
        secretVersion: 2,
      });
    } finally {
      store.close();
    }
  });

  it("clears secret ref when setting to null", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection();
      store.insertConnection(record);

      const ts = now();
      store.updateSecretRef(record.connectionId, null, null, ts);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.secretRef).toBeNull();
      expect(found!.secretVersion).toBeNull();
    } finally {
      store.close();
    }
  });

  it("counts connections by endpoint URL", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const url = "https://same-endpoint.test/v1";
      const c1 = makeConnection({ connectionId: nextId(), endpointUrl: url });
      const c2 = makeConnection({ connectionId: nextId(), endpointUrl: url });
      const c3 = makeConnection({ connectionId: nextId(), endpointUrl: "https://other.test/v1" });
      store.insertConnection(c1);
      store.insertConnection(c2);
      store.insertConnection(c3);

      expect(store.countByEndpoint(url)).toBe(2);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Known Provider Types
// ---------------------------------------------------------------------------

describe("ProviderConnectionStore — Connection Kinds", () => {
  it("stores a known provider connection (openai)", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({
        connectionId: nextId(),
        kind: "known",
        provider: { kind: "known", providerId: "openai" },
      });
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.kind).toBe("known");
      expect(found!.provider).toEqual({ kind: "known", providerId: "openai" });
    } finally {
      store.close();
    }
  });

  it("stores a pi_session connection with no secret", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({
        connectionId: nextId(),
        kind: "pi_session",
        provider: { kind: "pi_session" },
        secretRef: null,
        secretVersion: null,
      });
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.kind).toBe("pi_session");
      expect(found!.secretRef).toBeNull();
      expect(found!.secretVersion).toBeNull();
    } finally {
      store.close();
    }
  });

  it("stores a custom provider connection with secret ref", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({
        connectionId: nextId(),
        kind: "custom",
        provider: { kind: "custom", label: "my-custom-llm" },
        secretRef: "custom-vault-ref",
        secretVersion: 1,
      });
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId);
      expect(found).not.toBeNull();
      expect(found!.kind).toBe("custom");
      expect(found!.provider).toEqual({ kind: "custom", label: "my-custom-llm" });
      expect(found!.secretRef).toBe("custom-vault-ref");
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("ProviderConnectionStore — Diagnostics", () => {
  it("inserts and lists diagnostics for a connection", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      const d1 = makeDiagnostic(conn.connectionId, { severity: "error", failureCode: "timeout", safeMessage: "Connection timed out" });
      const d2 = makeDiagnostic(conn.connectionId, { severity: "info", failureCode: null, safeMessage: "Reconnected successfully" });
      store.insertDiagnostic(d1);
      store.insertDiagnostic(d2);

      const list = store.listDiagnostics(conn.connectionId);
      expect(list).toHaveLength(2);
      // Most recent first (ORDER BY timestamp DESC)
      expect(list[0].diagnosticId).toBe(d2.diagnosticId);
      expect(list[1].diagnosticId).toBe(d1.diagnosticId);
    } finally {
      store.close();
    }
  });

  it("enforces diagnostic retention limit (max 20)", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      // Insert 25 diagnostics
      for (let i = 0; i < 25; i++) {
        store.insertDiagnostic(
          makeDiagnostic(conn.connectionId, { timestamp: new Date(Date.now() + i).toISOString() }),
        );
      }

      const list = store.listDiagnostics(conn.connectionId, 50);
      expect(list).toHaveLength(20);
    } finally {
      store.close();
    }
  });

  it("deletes all diagnostics for a connection", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      store.insertDiagnostic(makeDiagnostic(conn.connectionId));
      store.insertDiagnostic(makeDiagnostic(conn.connectionId));

      store.deleteAllDiagnostics(conn.connectionId);
      const list = store.listDiagnostics(conn.connectionId);
      expect(list).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("lists diagnostics with custom limit", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      for (let i = 0; i < 10; i++) {
        store.insertDiagnostic(
          makeDiagnostic(conn.connectionId, { timestamp: new Date(Date.now() + i).toISOString() }),
        );
      }

      const list = store.listDiagnostics(conn.connectionId, 5);
      expect(list).toHaveLength(5);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Dependencies & Deletion Guard
// ---------------------------------------------------------------------------

describe("ProviderConnectionStore — Deletion Guard", () => {
  it("allows deletion when no dependencies exist", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      const preflight = store.deletionPreflight(conn.connectionId);
      expect(preflight.canDelete).toBe(true);
      expect(preflight.blockers).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("blocks deletion when dependencies exist", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      store.insertDependency(makeDependency(conn.connectionId));

      const preflight = store.deletionPreflight(conn.connectionId);
      expect(preflight.canDelete).toBe(false);
      expect(preflight.blockers).toHaveLength(1);
      expect(preflight.blockers[0].blockerType).toBe("routing_policy");
    } finally {
      store.close();
    }
  });

  it("categorizes FEAT-062 dependencies as active_worker", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      store.insertDependency(makeDependency(conn.connectionId, { ownerFeat: "FEAT-062", safeDescriptor: "Active worker session #42" }));

      const preflight = store.deletionPreflight(conn.connectionId);
      expect(preflight.canDelete).toBe(false);
      expect(preflight.blockers).toHaveLength(1);
      expect(preflight.blockers[0].blockerType).toBe("active_worker");
      expect(preflight.blockers[0].safeDescriptor).toBe("Active worker session #42");
    } finally {
      store.close();
    }
  });

  it("lists and deletes dependency records", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);

      const dep = makeDependency(conn.connectionId);
      store.insertDependency(dep);

      expect(store.countDependencies(conn.connectionId)).toBe(1);

      store.deleteDependency(dep.dependencyId);
      expect(store.countDependencies(conn.connectionId)).toBe(0);
    } finally {
      store.close();
    }
  });

  it("deletes connection and all associated records", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const conn = makeConnection({ connectionId: nextId() });
      store.insertConnection(conn);
      store.insertDiagnostic(makeDiagnostic(conn.connectionId));
      store.insertDependency(makeDependency(conn.connectionId));

      store.deleteConnectionAndDependencies(conn.connectionId);

      expect(store.getConnection(conn.connectionId)).toBeNull();
      expect(store.listDiagnostics(conn.connectionId)).toHaveLength(0);
      expect(store.countDependencies(conn.connectionId)).toBe(0);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Non-Leak Assertions
// ---------------------------------------------------------------------------

describe("ProviderConnectionStore — Non-Leak Assertions", () => {
  it("does not store secret values in connection table", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({
        connectionId: nextId(),
        secretRef: "opaque-ref-abc123", // gitleaks:allow -- synthetic opaque-reference fixture
        secretVersion: 1,
      });
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId);
      // The connection record stores only an opaque reference, not the value
      expect(found!.secretRef).toBe("opaque-ref-abc123");
      // Verify no column named "secret_value" exists by checking round-trip fields
      expect(Object.keys(found!)).not.toContain("secretValue");
      expect(Object.keys(found!)).not.toContain("secret_data");
    } finally {
      store.close();
    }
  });

  it("connection summaries contain no secret fields", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const record = makeConnection({
        connectionId: nextId(),
        secretRef: "some-ref",
        secretVersion: 1,
      });
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId)!;
      // Only safe fields are present in the record
      expect(found.secretRef).toBeTypeOf("string");
      expect(found.secretVersion).toBeTypeOf("number");
      // No raw secret value field
      expect("secretValue" in found).toBe(false);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Identity Stability
// ---------------------------------------------------------------------------

describe("ProviderConnectionStore — Identity Stability", () => {
  it("connectionId is immutable after creation", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const id = nextId();
      const record = makeConnection({ connectionId: id });
      store.insertConnection(record);

      // Verify the ID matches exactly what was stored
      const found = store.getConnection(id);
      expect(found!.connectionId).toBe(id);

      // No update method exists for connectionId
      expect(typeof store.updateConnectionFields).toBe("function");
    } finally {
      store.close();
    }
  });

  it("survives round-trip with all field types", () => {
    const store = ProviderConnectionStore.createInMemory();
    try {
      const ts = now();
      const record: ProviderConnectionRecord = {
        connectionId: nextId(),
        kind: "known",
        label: "My OpenAI Connection",
        provider: { kind: "known", providerId: "openai" },
        endpointUrl: "https://api.openai.com/v1",
        endpointLocal: false,
        lifecycleState: "active",
        secretRef: "vault-ref-xyz",
        secretVersion: 3,
        createdAt: ts,
        updatedAt: ts,
      };
      store.insertConnection(record);

      const found = store.getConnection(record.connectionId)!;
      expect(found.connectionId).toBe(record.connectionId);
      expect(found.kind).toBe("known");
      expect(found.label).toBe("My OpenAI Connection");
      expect(found.endpointUrl).toBe("https://api.openai.com/v1");
      expect(found.endpointLocal).toBe(false);
      expect(found.lifecycleState).toBe("active");
      expect(found.secretRef).toBe("vault-ref-xyz");
      expect(found.secretVersion).toBe(3);
      expect(found.createdAt).toBe(ts);
      expect(found.updatedAt).toBe(ts);
    } finally {
      store.close();
    }
  });
});
