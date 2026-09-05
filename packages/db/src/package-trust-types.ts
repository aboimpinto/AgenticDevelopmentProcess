/**
 * FEAT-051: Package Trust Types
 *
 * Pure type definitions for package trust records, capability grants,
 * revocation records, policy decisions, and the PackageTrustStore interface.
 *
 * All types are additive and backward-compatible. No side effects,
 * no I/O, no mutable state.
 */

// ---------------------------------------------------------------------------
// Package Identity
// ---------------------------------------------------------------------------

/**
 * Canonical package identity tuple, orchestrator-derived (never caller-supplied).
 */
export interface PackageIdentity {
  /** Unique package identifier. */
  readonly packageId: string;
  /** Source kind observed by the orchestrator. */
  readonly sourceKind: "npm" | "git" | "local";
  /** Credential-free canonical source reference. */
  readonly canonicalSourceRef: string;
  /** Exact installed package version. */
  readonly packageVersion: string;
}

// ---------------------------------------------------------------------------
// Package Trust Record
// ---------------------------------------------------------------------------

/**
 * A trusted package record with an exactly pinned version.
 *
 * Immutable per (packageId, pinnedVersion) — a different version
 * requires a separate trust record.
 */
export interface PackageTrustRecord {
  /** Unique trust decision identifier (UUID). */
  readonly trustId: string;
  /** Project scope identifier. */
  readonly projectId: string;
  /** Package identity this trust applies to. */
  readonly packageId: string;
  /** Exactly pinned version this trust record covers. */
  readonly pinnedVersion: string;
  /** Source kind observed at trust time. */
  readonly sourceKind: "npm" | "git" | "local";
  /** Human-readable source reference (credential-free). */
  readonly canonicalSourceRef: string;
  /** Reference to the Hepha approval record that authorized this trust. */
  readonly approvalReference: string;
  /** ISO 8601 timestamp of the trust decision. */
  readonly createdAt: string;
  /** Optional ISO 8601 expiry timestamp; null means no expiry. */
  readonly expiresAt: string | null;
  /** Reviewer identifier (operator or system). */
  readonly reviewer: string;
  /** Safe reason string for the trust decision. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Package Capability Grant
// ---------------------------------------------------------------------------

/**
 * An approved capability grant scoped to an exact (packageId, packageVersion,
 * componentId, capabilityId) tuple.
 *
 * A trust record alone authorizes NO capability. Each component+capability
 * requires an explicit grant referencing a human approval record.
 */
export interface PackageCapabilityGrant {
  /** Unique grant identifier (UUID). */
  readonly grantId: string;
  /** Project scope identifier. */
  readonly projectId: string;
  /** Package ID the grant applies to. */
  readonly packageId: string;
  /** Exact package version the grant is scoped to. */
  readonly packageVersion: string;
  /** Component identifier (e.g., "skills", "handlers", "trace-supplier"). */
  readonly componentId: string;
  /** Capability identifier (e.g., "emit-event", "record-receipt"). */
  readonly capabilityId: string;
  /** Reference to the Hepha approval record that authorized this grant. */
  readonly approvalReference: string;
  /** ISO 8601 timestamp of the grant decision. */
  readonly createdAt: string;
  /** Optional expiry timestamp; null means no expiry. */
  readonly expiresAt: string | null;
  /** Reviewer identifier. */
  readonly reviewer: string;
  /** Safe reason string. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Package Revocation Record
// ---------------------------------------------------------------------------

/**
 * A revocation record for a package identity/version or specific
 * component/capability.
 *
 * Revocation is irreversible for the exact pin. Historical records
 * remain readable; revocation changes future admission only.
 */
export interface PackageRevocationRecord {
  /** Unique revocation identifier (UUID). */
  readonly revocationId: string;
  /** Project scope identifier. */
  readonly projectId: string;
  /** Package ID the revocation applies to. */
  readonly packageId: string;
  /** Exact pinned version revoked, or "*" for all versions. */
  readonly revokedVersion: string;
  /** Optional component scope (null means full package revocation). */
  readonly componentId: string | null;
  /** Optional capability scope (null means all capabilities for the component). */
  readonly capabilityId: string | null;
  /** Reference to the Hepha approval record that authorized this revocation. */
  readonly approvalReference: string;
  /** ISO 8601 timestamp of the revocation decision. */
  readonly createdAt: string;
  /** Reviewer identifier. */
  readonly reviewer: string;
  /** Safe reason for revocation. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Policy Decision Types
// ---------------------------------------------------------------------------

/**
 * Stable package policy evaluation statuses.
 */
export type PackagePolicyStatus =
  | "allowed"
  | "revoked"
  | "untrusted"
  | "expired"
  | "version_mismatch"
  | "capability_not_granted"
  | "capability_expired"
  | "identity_invalid";

/**
 * Result of a complete package policy evaluation.
 */
export interface PackagePolicyDecision {
  readonly status: PackagePolicyStatus;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly sourceKind: "npm" | "git" | "local";
  readonly policyEvaluatedAt: string;
  readonly trustRecordId: string | null;
  readonly grantId: string | null;
  readonly revocationId: string | null;
  readonly blockedReason: string | null;
}

// ---------------------------------------------------------------------------
// Package Evidence (Receipt / Trace)
// ---------------------------------------------------------------------------

/**
 * Safe package evidence carried in extension receipt entries and trace projections.
 *
 * Excludes: raw manifests, credentials, absolute paths, filesystem locations,
 * request payloads, prompt bodies, secrets.
 */
export interface PackageEvidence {
  readonly packageId: string;
  readonly packageVersion: string;
  readonly sourceKind: "npm" | "git" | "local";
  readonly componentId: string;
  readonly capabilityId: string;
  readonly policyResult: PackagePolicyStatus;
  readonly trustRecordId: string | null;
  readonly grantId: string | null;
  readonly revocationId: string | null;
}

// ---------------------------------------------------------------------------
// Package Trust Store Interface
// ---------------------------------------------------------------------------

/**
 * Narrow interface for package trust persistence.
 *
 * Policy evaluation queries are read-only. Admin operations (create, list)
 * are for orchestrator management, not available to package code or
 * extension handlers.
 */
export interface PackageTrustStore {
  // --- Policy evaluation queries ---

  /** Find a trust record matching the exact package identity and version. */
  findTrustRecord(
    projectId: string,
    packageId: string,
    version: string,
  ): Promise<PackageTrustRecord | null>;

  /** Find a capability grant for the exact component/capability tuple. */
  findCapabilityGrant(
    projectId: string,
    packageId: string,
    version: string,
    componentId: string,
    capabilityId: string,
  ): Promise<PackageCapabilityGrant | null>;

  /** Find all revocations matching a package identity/version. */
  findRevocations(
    projectId: string,
    packageId: string,
    version: string,
  ): Promise<PackageRevocationRecord[]>;

  // --- Admin operations ---

  /** Create a new trust record. */
  createTrustRecord(record: PackageTrustRecord): Promise<void>;

  /** Create a new capability grant. */
  createCapabilityGrant(grant: PackageCapabilityGrant): Promise<void>;

  /** Create a new revocation record. */
  createRevocation(revocation: PackageRevocationRecord): Promise<void>;

  /** List all trust records for a project. */
  listTrustRecords(projectId: string): Promise<PackageTrustRecord[]>;

  /** List all capability grants for a project. */
  listCapabilityGrants(projectId: string): Promise<PackageCapabilityGrant[]>;

  /** List all revocation records for a project. */
  listRevocations(projectId: string): Promise<PackageRevocationRecord[]>;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a package identity fields are non-empty and correctly formed.
 * Returns an array of validation error messages (empty = valid).
 */
export function validatePackageIdentity(
  identity: PackageIdentity,
): string[] {
  const errors: string[] = [];

  if (!identity.packageId || identity.packageId.trim().length === 0) {
    errors.push("packageId must be a non-empty string");
  }

  if (!["npm", "git", "local"].includes(identity.sourceKind)) {
    errors.push(`sourceKind must be one of: npm, git, local (got: ${identity.sourceKind})`);
  }

  if (!identity.canonicalSourceRef || identity.canonicalSourceRef.trim().length === 0) {
    errors.push("canonicalSourceRef must be a non-empty string");
  }

  if (!identity.packageVersion || identity.packageVersion.trim().length === 0) {
    errors.push("packageVersion must be a non-empty string");
  }

  // Reject range expressions and non-exact versions
  const versionErrors = validateExactVersion(identity.packageVersion);
  for (const ve of versionErrors) {
    errors.push(ve);
  }

  return errors;
}

/**
 * Validate that a package version is an exact pinned version (no range expressions).
 */
export function validateExactVersion(version: string): string[] {
  const errors: string[] = [];

  if (!version || version.trim().length === 0) {
    errors.push("Version must be a non-empty string");
    return errors;
  }

  // Reject npm range expressions
  const rangePatterns = [
    { pattern: /^\*$/, label: "star (*)" },
    { pattern: /^latest$/i, label: "latest" },
    { pattern: /^[><]=?/, label: "comparison prefix" },
    { pattern: /~/, label: "tilde (~)" },
    { pattern: /\^/, label: "caret (^)" },
    { pattern: /\s*\|\|\s*/, label: "union (||)" },
    { pattern: /^[a-z]/, label: "tag name" },
  ];

  for (const { pattern, label } of rangePatterns) {
    if (pattern.test(version)) {
      errors.push(`Version "${version}" contains a range expression (${label}); exact version required`);
    }
  }

  return errors;
}
