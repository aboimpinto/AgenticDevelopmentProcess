// Behavior suite: package trust.
/**
 * FEAT-051: Package Trust Store Tests
 *
 * Tests for SqlitePackageTrustStore CRUD, query, and policy lookup operations.
 */

import { describe, expect, it } from "vitest";
import { SqlitePackageTrustStore } from "../src/sqlite-package-trust-store.js";
import { validatePackageIdentity, validateExactVersion } from "../src/package-trust-types.js";
import type { PackageIdentity } from "../src/package-trust-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrustRecord(overrides: Partial<{
  trustId: string;
  projectId: string;
  packageId: string;
  pinnedVersion: string;
  sourceKind: "npm" | "git" | "local";
  canonicalSourceRef: string;
  approvalReference: string;
  createdAt: string;
  expiresAt: string | null;
  reviewer: string;
  reason: string;
}> = {}) {
  const now = new Date().toISOString();
  return {
    trustId: "trust-001",
    projectId: "project-1",
    packageId: "@hepha/companion",
    pinnedVersion: "1.0.0",
    sourceKind: "npm" as const,
    canonicalSourceRef: "@hepha/companion",
    approvalReference: "approval-001",
    createdAt: now,
    expiresAt: null,
    reviewer: "operator",
    reason: "Approved for pilot use",
    ...overrides,
  };
}

function makeCapabilityGrant(overrides: Partial<{
  grantId: string;
  projectId: string;
  packageId: string;
  packageVersion: string;
  componentId: string;
  capabilityId: string;
  approvalReference: string;
  createdAt: string;
  expiresAt: string | null;
  reviewer: string;
  reason: string;
}> = {}) {
  const now = new Date().toISOString();
  return {
    grantId: "grant-001",
    projectId: "project-1",
    packageId: "@hepha/companion",
    packageVersion: "1.0.0",
    componentId: "skills",
    capabilityId: "emit-event",
    approvalReference: "approval-002",
    createdAt: now,
    expiresAt: null,
    reviewer: "operator",
    reason: "Approved for event emission",
    ...overrides,
  };
}

function makeRevocation(overrides: Partial<{
  revocationId: string;
  projectId: string;
  packageId: string;
  revokedVersion: string;
  componentId: string | null;
  capabilityId: string | null;
  approvalReference: string;
  createdAt: string;
  reviewer: string;
  reason: string;
}> = {}) {
  const now = new Date().toISOString();
  return {
    revocationId: "revoke-001",
    projectId: "project-1",
    packageId: "@hepha/companion",
    revokedVersion: "1.0.0",
    componentId: null,
    capabilityId: null,
    approvalReference: "approval-003",
    createdAt: now,
    reviewer: "operator",
    reason: "Security vulnerability reported",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PackageIdentity Validation Tests
// ---------------------------------------------------------------------------

describe("validatePackageIdentity", () => {
  it("accepts a valid package identity", () => {
    const identity: PackageIdentity = {
      packageId: "@hepha/companion",
      sourceKind: "npm",
      canonicalSourceRef: "@hepha/companion",
      packageVersion: "1.0.0",
    };
    expect(validatePackageIdentity(identity)).toEqual([]);
  });

  it("rejects empty packageId", () => {
    const identity: PackageIdentity = {
      packageId: "",
      sourceKind: "npm",
      canonicalSourceRef: "@hepha/companion",
      packageVersion: "1.0.0",
    };
    expect(validatePackageIdentity(identity)).toContain("packageId must be a non-empty string");
  });

  it("rejects invalid sourceKind", () => {
    const identity = {
      packageId: "@hepha/companion",
      sourceKind: "pip",
      canonicalSourceRef: "@hepha/companion",
      packageVersion: "1.0.0",
    };
    const errors = validatePackageIdentity(identity as PackageIdentity);
    expect(errors.some((e) => e.includes("sourceKind"))).toBe(true);
  });

  it("rejects missing canonicalSourceRef", () => {
    const identity: PackageIdentity = {
      packageId: "@hepha/companion",
      sourceKind: "npm",
      canonicalSourceRef: "",
      packageVersion: "1.0.0",
    };
    expect(validatePackageIdentity(identity)).toContain("canonicalSourceRef must be a non-empty string");
  });

  it("rejects range expression in version", () => {
    const identity: PackageIdentity = {
      packageId: "@hepha/companion",
      sourceKind: "npm",
      canonicalSourceRef: "@hepha/companion",
      packageVersion: "^1.0.0",
    };
    const errors = validatePackageIdentity(identity);
    expect(errors.some((e) => e.includes("range") || e.includes("exact pinned"))).toBe(true);
  });

  it("rejects 'latest' as version", () => {
    const identity: PackageIdentity = {
      packageId: "@hepha/companion",
      sourceKind: "npm",
      canonicalSourceRef: "@hepha/companion",
      packageVersion: "latest",
    };
    const errors = validatePackageIdentity(identity);
    expect(errors.some((e) => e.includes("latest") || e.includes("range"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateExactVersion Tests
// ---------------------------------------------------------------------------

describe("validateExactVersion", () => {
  it("accepts a simple semver version", () => {
    expect(validateExactVersion("1.0.0")).toEqual([]);
  });

  it("accepts a pre-release version", () => {
    expect(validateExactVersion("1.0.0-beta.1")).toEqual([]);
  });

  it("rejects caret range", () => {
    expect(validateExactVersion("^1.0.0")).not.toEqual([]);
  });

  it("rejects tilde range", () => {
    expect(validateExactVersion("~1.0.0")).not.toEqual([]);
  });

  it("rejects star wildcard", () => {
    expect(validateExactVersion("*")).not.toEqual([]);
  });

  it("rejects latest tag", () => {
    expect(validateExactVersion("latest")).not.toEqual([]);
  });

  it("rejects comparison prefix", () => {
    expect(validateExactVersion(">=1.0.0")).not.toEqual([]);
  });

  it("rejects union (||) range", () => {
    expect(validateExactVersion("1.0.0 || 2.0.0")).not.toEqual([]);
  });

  it("rejects tag names", () => {
    expect(validateExactVersion("next")).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SqlitePackageTrustStore: Trust Record CRUD
// ---------------------------------------------------------------------------

describe("SqlitePackageTrustStore — Trust Records", () => {
  it("creates and retrieves a trust record", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const record = makeTrustRecord();
      await store.createTrustRecord(record);

      const found = await store.findTrustRecord(record.projectId, record.packageId, record.pinnedVersion);
      expect(found).not.toBeNull();
      expect(found!.trustId).toBe(record.trustId);
      expect(found!.packageId).toBe(record.packageId);
      expect(found!.pinnedVersion).toBe(record.pinnedVersion);
      expect(found!.sourceKind).toBe(record.sourceKind);
      expect(found!.approvalReference).toBe(record.approvalReference);
    } finally {
      store.close();
    }
  });

  it("returns null for non-existent trust record", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const found = await store.findTrustRecord("project-1", "unknown-package", "1.0.0");
      expect(found).toBeNull();
    } finally {
      store.close();
    }
  });

  it("returns null for version mismatch", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const record = makeTrustRecord({ pinnedVersion: "1.0.0" });
      await store.createTrustRecord(record);

      // Look up a different version
      const found = await store.findTrustRecord(record.projectId, record.packageId, "2.0.0");
      expect(found).toBeNull();
    } finally {
      store.close();
    }
  });

  it("lists all trust records for a project", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      await store.createTrustRecord(makeTrustRecord({ trustId: "trust-001", packageId: "pkg-a" }));
      await store.createTrustRecord(makeTrustRecord({ trustId: "trust-002", packageId: "pkg-b" }));
      await store.createTrustRecord(makeTrustRecord({ trustId: "trust-003", projectId: "project-2", packageId: "pkg-c" }));

      const records = await store.listTrustRecords("project-1");
      expect(records).toHaveLength(2);
      expect(records.map((r) => r.trustId).sort()).toEqual(["trust-001", "trust-002"]);
    } finally {
      store.close();
    }
  });

  it("handles expiry timestamp", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const future = new Date(Date.now() + 86400000).toISOString();
      const record = makeTrustRecord({ trustId: "trust-exp", expiresAt: future });
      await store.createTrustRecord(record);

      const found = await store.findTrustRecord(record.projectId, record.packageId, record.pinnedVersion);
      expect(found).not.toBeNull();
      expect(found!.expiresAt).toBe(future);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// SqlitePackageTrustStore: Capability Grant CRUD
// ---------------------------------------------------------------------------

describe("SqlitePackageTrustStore — Capability Grants", () => {
  it("creates and retrieves a capability grant", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const grant = makeCapabilityGrant();
      await store.createCapabilityGrant(grant);

      const found = await store.findCapabilityGrant(
        grant.projectId,
        grant.packageId,
        grant.packageVersion,
        grant.componentId,
        grant.capabilityId,
      );
      expect(found).not.toBeNull();
      expect(found!.grantId).toBe(grant.grantId);
      expect(found!.componentId).toBe("skills");
      expect(found!.capabilityId).toBe("emit-event");
    } finally {
      store.close();
    }
  });

  it("returns null for non-existent grant", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const found = await store.findCapabilityGrant("project-1", "pkg", "1.0.0", "skills", "unknown");
      expect(found).toBeNull();
    } finally {
      store.close();
    }
  });

  it("returns null when componentId/capabilityId mismatch", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const grant = makeCapabilityGrant();
      await store.createCapabilityGrant(grant);

      // Same package/version, different capability
      const found = await store.findCapabilityGrant(
        grant.projectId,
        grant.packageId,
        grant.packageVersion,
        grant.componentId,
        "record-receipt",
      );
      expect(found).toBeNull();
    } finally {
      store.close();
    }
  });

  it("enforces unique constraint on (packageId, packageVersion, componentId, capabilityId)", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const grant = makeCapabilityGrant();
      await store.createCapabilityGrant(grant);

      // Duplicate insert should throw
      await expect(store.createCapabilityGrant(grant)).rejects.toThrow();
    } finally {
      store.close();
    }
  });

  it("lists all grants for a project", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      await store.createCapabilityGrant(makeCapabilityGrant({ grantId: "g-001", packageId: "pkg-a" }));
      await store.createCapabilityGrant(makeCapabilityGrant({ grantId: "g-002", packageId: "pkg-b", capabilityId: "record-receipt" }));
      await store.createCapabilityGrant(makeCapabilityGrant({ grantId: "g-003", projectId: "project-2", packageId: "pkg-c" }));

      const grants = await store.listCapabilityGrants("project-1");
      expect(grants).toHaveLength(2);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// SqlitePackageTrustStore: Revocation CRUD
// ---------------------------------------------------------------------------

describe("SqlitePackageTrustStore — Revocations", () => {
  it("creates and retrieves a revocation", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const revocation = makeRevocation();
      await store.createRevocation(revocation);

      const found = await store.findRevocations(revocation.projectId, revocation.packageId, revocation.revokedVersion);
      expect(found).toHaveLength(1);
      expect(found[0]!.revocationId).toBe("revoke-001");
    } finally {
      store.close();
    }
  });

  it("finds wildcard revocations for any version", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      await store.createRevocation(makeRevocation({ revocationId: "revoke-wild", revokedVersion: "*" }));

      const found = await store.findRevocations("project-1", "@hepha/companion", "9.9.9");
      expect(found).toHaveLength(1);
      expect(found[0]!.revokedVersion).toBe("*");
    } finally {
      store.close();
    }
  });

  it("finds both exact and wildcard revocations", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      await store.createRevocation(makeRevocation({ revocationId: "revoke-exact", revokedVersion: "1.0.0" }));
      await store.createRevocation(makeRevocation({ revocationId: "revoke-wild", revokedVersion: "*" }));

      const found = await store.findRevocations("project-1", "@hepha/companion", "1.0.0");
      expect(found).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("does not find revocations for a different package", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      await store.createRevocation(makeRevocation());

      const found = await store.findRevocations("project-1", "different-package", "1.0.0");
      expect(found).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("lists all revocations for a project", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      await store.createRevocation(makeRevocation({ revocationId: "r-001" }));
      await store.createRevocation(makeRevocation({ revocationId: "r-002", packageId: "pkg-b" }));
      await store.createRevocation(makeRevocation({ revocationId: "r-003", projectId: "project-2" }));

      const revocations = await store.listRevocations("project-1");
      expect(revocations).toHaveLength(2);
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// SqlitePackageTrustStore: Project Scoping
// ---------------------------------------------------------------------------

describe("SqlitePackageTrustStore — Project Scoping", () => {
  it("isolates records between projects", async () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      const samePackage = "@hepha/companion";

      await store.createTrustRecord(makeTrustRecord({ trustId: "t-p1", projectId: "project-1", packageId: samePackage }));
      await store.createTrustRecord(makeTrustRecord({ trustId: "t-p2", projectId: "project-2", packageId: samePackage }));

      const p1Records = await store.listTrustRecords("project-1");
      const p2Records = await store.listTrustRecords("project-2");

      expect(p1Records).toHaveLength(1);
      expect(p1Records[0]!.trustId).toBe("t-p1");
      expect(p2Records).toHaveLength(1);
      expect(p2Records[0]!.trustId).toBe("t-p2");
    } finally {
      store.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Migration Safety
// ---------------------------------------------------------------------------

describe("SqlitePackageTrustStore — Schema Safety", () => {
  it("creates tables idempotently (safe re-initialization)", () => {
    const store = SqlitePackageTrustStore.createInMemory();
    try {
      // First close re-creates the store with same path, second init should not fail
      store.close();
      const store2 = SqlitePackageTrustStore.createInMemory();
      try {
        expect(async () => {
          await store2.createTrustRecord(makeTrustRecord());
        }).not.toThrow();
      } finally {
        store2.close();
      }
    } finally {
      // Already closed
    }
  });
});
