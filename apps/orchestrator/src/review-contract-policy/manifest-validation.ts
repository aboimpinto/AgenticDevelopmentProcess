import {
  REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES,
  REVIEW_ARTIFACT_MAX_FINDINGS,
  REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING,
  REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES,
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  VALID_CLAIM_TYPES,
  VALID_DISPOSITIONS,
  VALID_SEVERITIES,
  computeReviewArtifactHash,
  isFeatureBoundPath,
  isReviewContractSafeString,
  isValidArtifactLineage,
  isValidKebabCaseIdentifier,
  type ActiveRuleSnapshotV1,
  type ArtifactReference,
  type ArtifactScope,
  type Disposition,
  type ReviewFinding,
  type ReviewManifest,
} from "../review-contract-types.js";
import type { StrictActiveRuleCatalog } from "../review-contract-catalog.js";
import { isRemediationLifecycleDisposition } from "../review-remediation-lifecycle-policy.js";
import { resolveFindingAuthority, validateRuleSnapshot } from "./authority-validation.js";
import {
  checkArtifactPathSafety,
  checkArtifactUnsafeContent,
  checkDepth,
  checkIdUniqueness,
  checkPayloadSizeAndDepth,
  isPlainObject,
  reject,
  validateEnvelopeShape,
} from "./envelope-safety.js";
import { validateDispositionFieldMatrix } from "./finding-obligations.js";
import { validateSurface } from "./surface-validation.js";
import type { PolicyProjection, PolicyResult } from "./policy-types.js";

export interface ManifestValidationInput {
  /** The raw parsed manifest value (not yet validated). */
  readonly value: unknown;
  /** The active catalog used to resolve rule references. */
  readonly catalog: StrictActiveRuleCatalog;
  /** Optional feature root path for path-boundary checks. */
  readonly featurePath?: string;
  /** Raw JSON payload for size checks. When absent, size check is skipped. */
  readonly rawPayload?: string;
}

export interface ManifestValidationOutput {
  readonly manifest: ReviewManifest;
  readonly resolvedRuleSnapshots: readonly ActiveRuleSnapshotV1[];
  readonly contentHash: string;
}

/**
 * Validate a review manifest against the active catalog.
 *
 * This is the primary T3.1 entry point. It validates:
 * 1. Envelope shape and schema version
 * 2. Artifact kind matches manifest
 * 3. Result is a valid manifest result
 * 4. Rule snapshots in the manifest match the catalog
 * 5. Each finding has valid authority binding
 * 6. IDs are unique across the manifest
 * 7. Safe content and path constraints
 *
 * Pure function: no I/O, no side effects.
 */
export function validateReviewManifest(
  input: ManifestValidationInput,
): PolicyResult<ManifestValidationOutput> {
  const { value, catalog, featurePath } = input;

  // --- Envelope validation ---
  const envResult = validateEnvelopeShape(value);
  if (envResult) return envResult;

  const obj = value as Record<string, unknown>;

  // Artifact kind must match
  if (obj.artifactKind !== "review_manifest") {
    return reject("invalid_shape");
  }

  // Schema version already validated by envelope check (must be 1)

  // --- T3.4: Safety guards (F2 fix + mandatory size) ---
  if (input.rawPayload !== undefined) {
    const sizeResult = checkPayloadSizeAndDepth(input.rawPayload, value);
    if (sizeResult) return sizeResult;
  } else {
    // Depth check + serialized-size fallback when rawPayload is absent
    if (!checkDepth(value, 0)) return reject("depth_limit_exceeded");
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return reject("size_limit_exceeded");
    }
    const serializedSize = Buffer.byteLength(serialized, "utf8");
    if (serializedSize > REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES) {
      return reject("size_limit_exceeded");
    }
  }
  const unsafeResult = checkArtifactUnsafeContent(value);
  if (unsafeResult) return unsafeResult;
  // Path safety: validate project-relative path integrity.
  // Feature-bound check is per-field in artifact-specific validators,
  // not a blanket sweep (surface entry paths are project source paths).
  const pathResult = checkArtifactPathSafety(value, undefined);
  if (pathResult) return pathResult;

  // --- T3.4/F3: Validate lineage when present (F3 fix) ---
  if (obj.lineage !== undefined) {
    if (!isPlainObject(obj.lineage)) return reject("invalid_shape");
    if (!isValidArtifactLineage(
      obj.lineage,
      obj.artifactId as string,
      "review_manifest",
      obj.scope as ArtifactScope,
    )) {
      return reject("invalid_predecessor_reference");
    }
    // F2: Check feature-bound path for lineage references when featurePath is provided
    if (input.featurePath !== undefined) {
      const lineage = obj.lineage as Record<string, unknown>;
      if (Array.isArray(lineage.predecessors)) {
        for (const pred of lineage.predecessors as ArtifactReference[]) {
          if (isPlainObject(pred) && !isFeatureBoundPath(pred.relativePath, input.featurePath)) {
            return reject("invalid_feature_path");
          }
        }
      }
      if (isPlainObject(lineage.supersedes)) {
        const sup = lineage.supersedes as unknown as ArtifactReference;
        if (!isFeatureBoundPath(sup.relativePath, input.featurePath)) {
          return reject("invalid_feature_path");
        }
      }
    }
  }

  // --- Manifest-specific shape ---
  if (typeof obj.result !== "string" || !["APPROVED", "NEEDS_CHANGES", "BLOCKED"].includes(obj.result as string)) {
    return reject("invalid_shape");
  }

  // result-specific: BLOCKED requires non-empty bounded safe-string blockerReason
  if (obj.result === "BLOCKED" && (typeof obj.blockerReason !== "string" || obj.blockerReason.length === 0 || obj.blockerReason.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) {
    return reject("invalid_shape");
  }

  // Rule snapshots
  if (!Array.isArray(obj.ruleSnapshots)) {
    return reject("invalid_shape");
  }
  if (obj.ruleSnapshots.length > REVIEW_ARTIFACT_MAX_FINDINGS) {
    return reject("invalid_shape");
  }

  // Validate each rule snapshot
  for (const snap of obj.ruleSnapshots as unknown[]) {
    const snapResult = validateRuleSnapshot(snap);
    if (snapResult) return snapResult;
  }

  // Findings
  if (!Array.isArray(obj.findings)) {
    return reject("invalid_shape");
  }
  if (obj.findings.length === 0 || obj.findings.length > REVIEW_ARTIFACT_MAX_FINDINGS) {
    return reject("invalid_shape");
  }

  // --- Reject unknown manifest keys ---
  const allowedManifestKeys = new Set([
    "schemaVersion", "artifactKind", "artifactId", "scope", "lineage",
    "result", "blockerReason", "ruleSnapshots", "findings",
  ]);
  if (Object.keys(obj).some((k) => !allowedManifestKeys.has(k))) {
    return reject("invalid_shape");
  }

  // --- ID uniqueness check (F4 fix: scope per owning finding) ---
  const findingIds: string[] = [];

  for (const finding of obj.findings as unknown[]) {
    if (!isPlainObject(finding)) return reject("invalid_shape");
    const f = finding as Record<string, unknown>;

    if (typeof f.findingId !== "string" || !isValidKebabCaseIdentifier(f.findingId)) return reject("invalid_shape");
    findingIds.push(f.findingId as string);

    // Remediation IDs: unique within each finding (F4 fix)
    if (Array.isArray(f.remediationItems)) {
      const seenRemIds = new Set<string>();
      for (const item of f.remediationItems as unknown[]) {
        if (isPlainObject(item)) {
          const ri = item as Record<string, unknown>;
          if (typeof ri.remediationItemId === "string") {
            if (seenRemIds.has(ri.remediationItemId as string)) return reject("duplicate_id");
            seenRemIds.add(ri.remediationItemId as string);
          }
        }
      }
    }

    // Test IDs: unique within each finding (F4 fix)
    if (Array.isArray(f.testMatrix)) {
      const seenTestIds = new Set<string>();
      for (const item of f.testMatrix as unknown[]) {
        if (isPlainObject(item)) {
          const ti = item as Record<string, unknown>;
          if (typeof ti.testId === "string") {
            if (seenTestIds.has(ti.testId as string)) return reject("duplicate_id");
            seenTestIds.add(ti.testId as string);
          }
        }
      }
    }

    // Surface IDs: unique within each named surface collection within each finding (F4 fix)
    // Also reject affected/confirmedUnaffected overlap (same surfaceId in both)
    if (isPlainObject(f.surface)) {
      const s = f.surface as Record<string, unknown>;
      const affectedIds = new Set<string>();
      const confirmedUnaffectedIds = new Set<string>();
      for (const key of ["inspected", "affected", "confirmedUnaffected"] as const) {
        const seenSurfaceIds = new Set<string>();
        if (Array.isArray(s[key])) {
          for (const entry of s[key] as unknown[]) {
            if (isPlainObject(entry)) {
              const e = entry as Record<string, unknown>;
              if (typeof e.surfaceId === "string") {
                if (seenSurfaceIds.has(e.surfaceId as string)) return reject("duplicate_id");
                seenSurfaceIds.add(e.surfaceId as string);
                if (key === "affected") affectedIds.add(e.surfaceId as string);
                if (key === "confirmedUnaffected") confirmedUnaffectedIds.add(e.surfaceId as string);
              }
            }
          }
        }
      }
      // Reject affected/confirmedUnaffected overlap (F4 fix)
      for (const id of affectedIds) {
        if (confirmedUnaffectedIds.has(id)) return reject("invalid_shape");
      }
    }
  }

  // Finding IDs: unique across the entire manifest (F4 fix: keep cross-manifest scope)
  const findingIdCheck = checkIdUniqueness([
    { kind: "finding", ids: findingIds },
  ]);
  if (findingIdCheck) return findingIdCheck;

  // --- Validate each finding ---
  const findings: ReviewFinding[] = [];
  const resolvedRuleSnapshots: ActiveRuleSnapshotV1[] = [];
  const manifestSnapshots: ActiveRuleSnapshotV1[] = [];

  // Extract rule snapshots from manifest
  for (const snap of obj.ruleSnapshots as unknown[]) {
    manifestSnapshots.push(snap as ActiveRuleSnapshotV1);
  }

  for (const findingVal of obj.findings as unknown[]) {
    const f = findingVal as Record<string, unknown>;

    // Validate disposition
    if (typeof f.disposition !== "string" || !(VALID_DISPOSITIONS as readonly string[]).includes(f.disposition)) {
      return reject("invalid_shape");
    }

    // Validate claim type
    if (typeof f.claimType !== "string" || !(VALID_CLAIM_TYPES as readonly string[]).includes(f.claimType)) {
      return reject("invalid_shape");
    }

    // Validate severity
    if (typeof f.severity !== "string" || !(VALID_SEVERITIES as readonly string[]).includes(f.severity)) {
      return reject("invalid_shape");
    }

    if (f.compatibilityDecision !== undefined
      && f.compatibilityDecision !== "breaking_change_permitted"
      && f.compatibilityDecision !== "backward_compatibility_required") {
      return reject("invalid_shape");
    }
    if (f.compatibilityApprovalSource !== undefined && !isReviewContractSafeString(f.compatibilityApprovalSource)) {
      return reject("invalid_shape");
    }
    if (f.compatibilityJustification !== undefined && !isReviewContractSafeString(f.compatibilityJustification)) {
      return reject("invalid_shape");
    }

    // Validate surface shape
    if (!isPlainObject(f.surface)) return reject("invalid_shape");
    const s = f.surface as Record<string, unknown>;
    const surfaceResult = validateSurface(s);
    if (surfaceResult) return surfaceResult;

    // F2: Disposition-aware authority resolution
    // OBSERVATION may omit authority for non-violation observations.
    // All other dispositions require authority.
    const disposition = f.disposition as Disposition;
    if (disposition !== "OBSERVATION" || f.authority !== undefined) {
      // F3: Pass manifest scope featureId for acceptance-criterion feature-scope validation
      const scopeObj = obj.scope as Record<string, unknown>;
      const featureId = typeof scopeObj.featureId === "string" ? scopeObj.featureId : undefined;
      const authInput: ReviewFinding = findingVal as ReviewFinding;
      const authResult = resolveFindingAuthority(authInput, catalog, featureId);
      if (!("authority" in authResult)) return authResult;

      resolvedRuleSnapshots.push(...(authResult.authority.kind === "active_rule" ? [authResult.authority.snapshot] : []));
    }

    // Validate remediation items
    if (f.remediationItems !== undefined) {
      if (!Array.isArray(f.remediationItems)) return reject("invalid_shape");
      if (f.remediationItems.length > REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING) return reject("invalid_shape");

      for (const item of f.remediationItems as unknown[]) {
        if (!isPlainObject(item)) return reject("invalid_shape");
        const ri = item as Record<string, unknown>;
        if (typeof ri.remediationItemId !== "string" || !isValidKebabCaseIdentifier(ri.remediationItemId)) return reject("invalid_shape");
        if (typeof ri.instruction !== "string" || ri.instruction.length === 0 || ri.instruction.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
        if (!Array.isArray(ri.targetSurfaceIds)) return reject("invalid_shape");
        if (ri.targetSurfaceIds.length === 0 || ri.targetSurfaceIds.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
        if (!ri.targetSurfaceIds.every((id: unknown) => typeof id === "string")) return reject("invalid_shape");
      }
    }

    // Validate test matrix
    if (f.testMatrix !== undefined) {
      if (!Array.isArray(f.testMatrix)) return reject("invalid_shape");
      if (f.testMatrix.length > REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING) return reject("invalid_shape");

      for (const item of f.testMatrix as unknown[]) {
        if (!isPlainObject(item)) return reject("invalid_shape");
        const ti = item as Record<string, unknown>;
        if (typeof ti.testId !== "string" || !isValidKebabCaseIdentifier(ti.testId)) return reject("invalid_shape");
        if (typeof ti.requirement !== "string" || ti.requirement.length === 0 || ti.requirement.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
        if (!Array.isArray(ti.targetSurfaceIds)) return reject("invalid_shape");
        if (ti.targetSurfaceIds.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
        if (!ti.targetSurfaceIds.every((id: unknown) => typeof id === "string")) return reject("invalid_shape");
      }
    }

    // Validate exhaustiveness decision for blocker/expansion dispositions
    if (disposition === "IN_SCOPE_BLOCKER" || disposition === "SCOPE_EXPANSION") {
      if (typeof f.exhaustivenessDecision !== "string"
        || !["local_only", "cross_cutting_complete", "replan_required"].includes(f.exhaustivenessDecision as string)) {
        return reject("invalid_shape");
      }
    }

    // --- F1: Enforce disposition-severity consistency ---
    if ((disposition === "IN_SCOPE_BLOCKER" || disposition === "SCOPE_EXPANSION")
      && (f.severity === "note" || f.severity === "info")) {
      return reject("invalid_shape");
    }
    if ((disposition === "ARCHITECTURE_DEBT" || disposition === "OBSERVATION")
      && (f.severity === "blocker" || f.severity === "required")) {
      return reject("invalid_shape");
    }

    // --- T3.2/F1: Validate complete disposition field matrix (all dispositions) ---
    const dispositionResult = validateDispositionFieldMatrix(findingVal as ReviewFinding);
    if (dispositionResult) return dispositionResult;

    // --- F1/F2: Validate defectClass is a valid kebab-case identifier (F2 fix) ---
    if (typeof f.defectClass !== "string" || !isValidKebabCaseIdentifier(f.defectClass)) {
      return reject("invalid_shape");
    }
    if (typeof f.summary !== "string" || f.summary.length === 0
      || f.summary.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) {
      return reject("invalid_shape");
    }

    // --- F1: Validate target surface IDs resolve to affected surface IDs ---
    const affectedSurfaceIds = new Set(
      (Array.isArray(s.affected) ? s.affected : []).map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        return typeof entry.surfaceId === "string" ? entry.surfaceId : "";
      }),
    );
    affectedSurfaceIds.delete("");
    if (Array.isArray(f.remediationItems)) {
      for (const item of f.remediationItems as unknown[]) {
        if (isPlainObject(item)) {
          const ri = item as Record<string, unknown>;
          if (Array.isArray(ri.targetSurfaceIds)) {
            for (const tid of ri.targetSurfaceIds as string[]) {
              if (typeof tid !== "string" || !affectedSurfaceIds.has(tid)) {
                return reject("invalid_shape");
              }
            }
          }
        }
      }
    }
    if (Array.isArray(f.testMatrix)) {
      for (const item of f.testMatrix as unknown[]) {
        if (isPlainObject(item)) {
          const ti = item as Record<string, unknown>;
          if (Array.isArray(ti.targetSurfaceIds)) {
            for (const tid of ti.targetSurfaceIds as string[]) {
              if (typeof tid !== "string" || !affectedSurfaceIds.has(tid)) {
                return reject("invalid_shape");
              }
            }
          }
        }
      }
    }

    // --- F1: Reject unknown finding keys ---
    const allowedFindingKeys = new Set([
      "findingId", "disposition", "claimType", "authority",
      "defectClass", "severity", "summary", "surface",
      "rootCause", "scopeExpansionRationale",
      "remediationItems", "testMatrix", "exhaustivenessDecision",
      "compatibilityDecision", "compatibilityApprovalSource", "compatibilityJustification",
      "debtImpact", "debtObservationReference",
    ]);
    if (Object.keys(f).some((k) => !allowedFindingKeys.has(k))) {
      return reject("invalid_shape");
    }

    // Build the validated finding
    findings.push(findingVal as ReviewFinding);
  }

  // --- Verify manifest rule snapshots match resolved rule snapshots ---
  // Each manifest-supplied rule snapshot must match the complete resolved snapshot
  // Compare all ActiveRuleSnapshotV1 fields (NEW-F5a fix)
  for (const manifestSnap of manifestSnapshots) {
    const match = resolvedRuleSnapshots.some(
      (rs) => rs.schemaVersion === manifestSnap.schemaVersion
        && rs.catalogSchemaVersion === manifestSnap.catalogSchemaVersion
        && rs.ruleId === manifestSnap.ruleId
        && rs.ruleVersion === manifestSnap.ruleVersion
        && rs.category === manifestSnap.category
        && rs.scope === manifestSnap.scope
        && rs.title === manifestSnap.title
        && rs.catalogPath === manifestSnap.catalogPath
        && rs.catalogSourceHash === manifestSnap.catalogSourceHash
        && rs.ruleHash === manifestSnap.ruleHash
        && rs.source.document === manifestSnap.source.document
        && rs.source.section === manifestSnap.source.section,
    );
    if (!match) return reject("invalid_rule_snapshot");
  }

  // When there are resolved rule snapshots but no manifest snapshots, reject
  if (resolvedRuleSnapshots.length > 0 && manifestSnapshots.length === 0) {
    return reject("invalid_rule_snapshot");
  }

  // --- F1: Check that every distinct resolved snapshot has exactly one matching manifest snapshot ---
  // Multiple findings may reference the same rule; deduplicate resolved snapshots by ruleId.
  // Also reject duplicate manifest snapshots (same complete identity).
  const manifestSnapKeySet = new Set<string>();
  for (const manifestSnap of manifestSnapshots) {
    const snapKey = `${manifestSnap.schemaVersion}|${manifestSnap.catalogSchemaVersion}|${manifestSnap.ruleId}|${manifestSnap.ruleVersion}|${manifestSnap.category}|${manifestSnap.scope}|${manifestSnap.title}|${manifestSnap.catalogPath}|${manifestSnap.catalogSourceHash}|${manifestSnap.ruleHash}|${manifestSnap.source.document}|${manifestSnap.source.section}`;
    if (manifestSnapKeySet.has(snapKey)) return reject("invalid_rule_snapshot");
    manifestSnapKeySet.add(snapKey);
  }

  // Deduplicate resolved snapshots by complete identity (multiple findings may reference the same rule)
  const distinctResolvedSnapshots: ActiveRuleSnapshotV1[] = [];
  const seenResolvedKeys = new Set<string>();
  for (const resolvedSnap of resolvedRuleSnapshots) {
    const resolvedKey = `${resolvedSnap.schemaVersion}|${resolvedSnap.catalogSchemaVersion}|${resolvedSnap.ruleId}|${resolvedSnap.ruleVersion}|${resolvedSnap.category}|${resolvedSnap.scope}|${resolvedSnap.title}|${resolvedSnap.catalogPath}|${resolvedSnap.catalogSourceHash}|${resolvedSnap.ruleHash}|${resolvedSnap.source.document}|${resolvedSnap.source.section}`;
    if (!seenResolvedKeys.has(resolvedKey)) {
      seenResolvedKeys.add(resolvedKey);
      distinctResolvedSnapshots.push(resolvedSnap);
    }
  }

  // Now check bijection: each distinct resolved snapshot must have exactly one manifest matching entry
  const matchedManifestKeys = new Set<string>();
  for (const resolvedSnap of distinctResolvedSnapshots) {
    const resolvedKey = `${resolvedSnap.schemaVersion}|${resolvedSnap.catalogSchemaVersion}|${resolvedSnap.ruleId}|${resolvedSnap.ruleVersion}|${resolvedSnap.category}|${resolvedSnap.scope}|${resolvedSnap.title}|${resolvedSnap.catalogPath}|${resolvedSnap.catalogSourceHash}|${resolvedSnap.ruleHash}|${resolvedSnap.source.document}|${resolvedSnap.source.section}`;
    if (!manifestSnapKeySet.has(resolvedKey)) return reject("invalid_rule_snapshot");
    // Mark as matched; allow matching another distinct resolved snapshot if the same manifest snapshot is used twice
    // (that would indicate duplicate manifest snapshots, already caught above)
    matchedManifestKeys.add(resolvedKey);
    manifestSnapKeySet.delete(resolvedKey);
  }

  // Ensure no manifest snapshots remain unmatched (would mean unreferenced snapshots)
  // But if all manifest snapshots were matched by distinct resolved snapshots, this is fine.
  // If there are more manifest snapshots than distinct resolved snapshots, reject.
  // Actually, the existing manifest→resolved loop already catches unreferenced snapshots.
  // The resolved→manifest loop is the additional bijection direction.
  // After matching all distinct resolved snapshots, any remaining unmatched manifest snapshots
  // are unreferenced and should be rejected.
  const anyUnreferencedManifestSnapshot = manifestSnapshots.length > matchedManifestKeys.size;
  if (anyUnreferencedManifestSnapshot) {
    // A manifest snapshot was not matched by any resolved snapshot — unreferenced
    return reject("invalid_rule_snapshot");
  }

  // --- F1: APPROVED manifest must not have blocker/expansion findings ---
  if (obj.result === "APPROVED") {
    const hasBlockerOrExpansion = findings.some(
      (f) => f.disposition === "IN_SCOPE_BLOCKER" || f.disposition === "SCOPE_EXPANSION",
    );
    if (hasBlockerOrExpansion) {
      return reject("invalid_shape");
    }
  }

  // --- F1: NEEDS_CHANGES manifest must have at least one blocker/expansion finding ---
  if (obj.result === "NEEDS_CHANGES") {
    const hasBlockerOrExpansion = findings.some(
      (f) => f.disposition === "IN_SCOPE_BLOCKER" || f.disposition === "SCOPE_EXPANSION",
    );
    if (!hasBlockerOrExpansion) {
      return reject("invalid_shape");
    }
  }

  // --- Build projection ---
  const manifest: ReviewManifest = value as ReviewManifest;
  const contentHash = computeReviewArtifactHash(manifest);

  const resolvedRuleSnapshotsDeduped = [...new Map(resolvedRuleSnapshots.map((s) => [s.ruleId, s])).values()];

  const projection: PolicyProjection = {
    artifactKind: "review_manifest",
    artifactId: manifest.artifactId,
    scope: manifest.scope,
    schemaVersion: 1,
    contentHash,
    resolvedRuleSnapshots: resolvedRuleSnapshotsDeduped,
  };

  const output: ManifestValidationOutput = {
    manifest,
    resolvedRuleSnapshots: resolvedRuleSnapshotsDeduped,
    contentHash,
  };

  return {
    valid: true,
    value: output,
    projection,
  };
}

