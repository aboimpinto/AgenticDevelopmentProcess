// ---------------------------------------------------------------------------
// FEAT-052: Skill Version Resolver — Pure Compatibility Resolution
//
// Determines how a workflow-node skill reference resolves to a published
// skill version. Pure functions with no filesystem I/O, no side effects.
//
// Supported reference forms:
//   "review-phase@1.2.0"  → explicit versioned reference
//   "review-phase"        → legacy unversioned reference (resolves via default policy)
//
// The resolver receives a snapshot of available versions and returns a
// deterministic resolution result without reading disk or writing state.
// ---------------------------------------------------------------------------

import type { SkillContract } from "./skill-contract-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolutionKind = "versioned" | "legacy-unversioned";

export interface VersionedSkillEntry {
  /** Published semantic version string (e.g., "1.2.0"). */
  readonly procedureVersion: string;
  /** Immutable content identity (e.g., "sha256:<64hex>"). */
  readonly versionId: string;
  /** Parsed contract for this version. */
  readonly contract: SkillContract;
  /** Project-relative path to migration notes, if any. */
  readonly migrationNotesRef?: string;
}

export interface VersionInventory {
  /** Skill name (kebab-case). */
  readonly name: string;
  /** Available published versions, sorted descending (newest first). */
  readonly versions: readonly VersionedSkillEntry[];
  /** Whether a legacy flat skill file also exists. */
  readonly hasLegacyFlatSkill: boolean;
}

export type ResolverErrorCode =
  | "UNKNOWN_SKILL"
  | "VERSION_NOT_FOUND"
  | "INVALID_REFERENCE"
  | "IDENTITY_MISMATCH"
  | "DUPLICATE_VERSION"
  | "NO_VERSION_AVAILABLE"
  | "UNSUPPORTED_FEATURE";

export interface ResolverSuccess {
  readonly status: "resolved";
  readonly resolutionKind: ResolutionKind;
  readonly resolvedVersion: VersionedSkillEntry | null;
  readonly resolvedReference: string;
}

export interface ResolverFailure {
  readonly status: "failed";
  readonly errorCode: ResolverErrorCode;
  readonly message: string;
}

export type ResolutionResult = ResolverSuccess | ResolverFailure;

// ---------------------------------------------------------------------------
// Reference parsing
// ---------------------------------------------------------------------------

interface ParsedReference {
  readonly skillName: string;
  readonly explicitVersion: string | null;
}

const REFERENCE_PATTERN = /^([a-z][a-z0-9-]*)(?:@(\d+\.\d+\.\d+))?$/;

/**
 * Parse a workflow-node skill reference into its components.
 *
 * Accepted forms:
 *   "review-phase"         → { skillName: "review-phase", explicitVersion: null }
 *   "review-phase@1.2.0"  → { skillName: "review-phase", explicitVersion: "1.2.0" }
 *
 * @param reference - The raw reference string from the workflow node.
 * @returns Parsed components, or null if the reference is malformed.
 */
export function parseSkillReference(reference: string): ParsedReference | null {
  if (!reference || !reference.trim()) {
    return null;
  }

  const match = REFERENCE_PATTERN.exec(reference.trim());

  if (!match) {
    return null;
  }

  return {
    skillName: match[1],
    explicitVersion: match[2] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a workflow-node skill reference against a version inventory.
 *
 * Resolution rules (per planning-analysis-report.md §4):
 * - "name@x.y.z" resolves only to exactly that published version.
 * - "name" resolves to the legacy flat skill when available (retained
 *   unversioned policy).
 * - Explicit version not found → failure.
 * - Unknown skill name → failure.
 * - Version identity mismatch (declared id ≠ computed hash) → failure.
 *
 * @param reference - The raw reference string (e.g., "review-phase" or "review-phase@1.2.0").
 * @param inventory - The available version inventory for this skill.
 * @returns A deterministic resolution result.
 */
export function resolveSkillReference(
  reference: string,
  inventory: VersionInventory,
): ResolutionResult {
  const parsed = parseSkillReference(reference);

  if (!parsed) {
    return {
      status: "failed",
      errorCode: "INVALID_REFERENCE",
      message: `Cannot parse skill reference "${reference}". Expected "name" or "name@X.Y.Z".`,
    };
  }

  if (parsed.skillName !== inventory.name) {
    return {
      status: "failed",
      errorCode: "UNKNOWN_SKILL",
      message: `Skill "${parsed.skillName}" not found in inventory for "${inventory.name}".`,
    };
  }

  // Explicit versioned reference
  if (parsed.explicitVersion) {
    const versionEntry = inventory.versions.find(
      (v) => v.procedureVersion === parsed.explicitVersion,
    );

    if (!versionEntry) {
      return {
        status: "failed",
        errorCode: "VERSION_NOT_FOUND",
        message: `Version "${parsed.explicitVersion}" not found for skill "${inventory.name}". Available: ${inventory.versions.map((v) => v.procedureVersion).join(", ") || "none"}.`,
      };
    }

    return {
      status: "resolved",
      resolutionKind: "versioned",
      resolvedVersion: versionEntry,
      resolvedReference: `${inventory.name}@${parsed.explicitVersion}`,
    };
  }

  // Legacy unversioned reference — resolve through default policy
  // During initial rollout, unversioned references resolve to the legacy flat skill only
  if (inventory.hasLegacyFlatSkill) {
    return {
      status: "resolved",
      resolutionKind: "legacy-unversioned",
      resolvedVersion: null,
      resolvedReference: inventory.name,
    };
  }

  // No legacy flat skill and no explicit version requested: use latest published version
  if (inventory.versions.length > 0) {
    return {
      status: "resolved",
      resolutionKind: "legacy-unversioned",
      resolvedVersion: inventory.versions[0],
      resolvedReference: inventory.name,
    };
  }

  return {
    status: "failed",
    errorCode: "NO_VERSION_AVAILABLE",
    message: `No version available for skill "${inventory.name}". No legacy flat skill and no published versions found.`,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Sort version entries in descending order (newest semantic version first).
 * Uses simple numeric comparison of major.minor.patch components.
 *
 * @param versions - Unsorted array of version entries.
 * @returns Sorted array (newest first). Does not mutate the input.
 */
export function sortVersionsDescending(
  versions: readonly VersionedSkillEntry[],
): VersionedSkillEntry[] {
  return [...versions].sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.procedureVersion.split(".").map(Number);
    const [bMajor, bMinor, bPatch] = b.procedureVersion.split(".").map(Number);

    // Compare major
    if (bMajor !== aMajor) return bMajor - aMajor;
    // Compare minor
    if (bMinor !== aMinor) return bMinor - aMinor;
    // Compare patch
    return bPatch - aPatch;
  });
}
