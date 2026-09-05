import { createHash } from "node:crypto";
import {
  type ActiveRuleSnapshotV1, type ActiveRuleAuthority, type AcceptanceCriterionAuthority,
  type ArtifactKind, type ArtifactScope, type Authority, type DebtObservation,
  type Disposition, type ManifestResult, type RemediationResponse, type ReplanPlan,
  type ReviewArtifact, type ReviewContractEnvelope, type ReviewContractRejection,
  type ReviewFinding, type ReviewManifest, type Severity, type VerificationReceipt,
  ARTIFACT_KINDS, REVIEW_ARTIFACT_MAX_FINDINGS, REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES,
  REVIEW_ARTIFACT_MAX_DEPTH, REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES, REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING,
  REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH, SHA256_HEX_LENGTH,
  REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH, VALID_DISPOSITIONS, VALID_SEVERITIES,
  VALID_CLAIM_TYPES, type ClaimType, type SurfaceEntry, type Surface,
  type RemediationItem, type TestMatrixItem, type ExhaustivenessDecision,
  type ReviewContractRejectionCode, type ArtifactReference, type ArtifactLineage,
  isValidKebabCaseIdentifier, isValidSemVer, isValidSha256Hex, isValidRuleReference,
  isValidAcceptanceCriterionReference, isValidProjectRelativePath, isFeatureBoundPath,
  isValidArtifactReference, isValidArtifactLineage, isReviewContractSafeString,
  computeReviewArtifactHash,
} from "../review-contract-types.js";
import { type StrictActiveRuleCatalog, resolveStrictActiveRule } from "../review-contract-catalog.js";
import { isRemediationLifecycleDisposition } from "../review-remediation-lifecycle-policy.js";
import {
  checkArtifactPathSafety, checkArtifactUnsafeContent, checkDepth, checkIdUniqueness,
  checkPayloadSizeAndDepth, isPlainObject, reject, requireValidPredecessorContext,
  validateEnvelopeShape,
} from "./envelope-safety.js";
import type {
  ManifestPredecessorContext, PolicyProjection, PolicyRejection, PolicyResult,
  ResponsePredecessorContext,
} from "./policy-types.js";

/** Validate architecture-debt observations against manifest and catalog authority. */
export function validateDebtObservation(
  value: unknown,
  manifestContext: ManifestPredecessorContext,
  rawPayload?: string,
  featurePath?: string,
  catalog?: StrictActiveRuleCatalog,
): PolicyResult<ReviewArtifact> {
  const envResult = validateEnvelopeShape(value);
  if (envResult) return envResult;

  const obj = value as Record<string, unknown>;
  if (obj.artifactKind !== "debt_observation") return reject("invalid_shape");

  // --- T3.4: Safety guards (F2 fix + mandatory size) ---
  if (rawPayload !== undefined) {
    const sizeResult = checkPayloadSizeAndDepth(rawPayload, value);
    if (sizeResult) return sizeResult;
  } else {
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
  const pathResult = checkArtifactPathSafety(value, undefined);
  if (pathResult) return pathResult;

  // --- T3.4/F3: Validate lineage when present (F3 fix) ---
  if (obj.lineage !== undefined) {
    if (!isPlainObject(obj.lineage)) return reject("invalid_shape");
    if (!isValidArtifactLineage(
      obj.lineage,
      obj.artifactId as string,
      "debt_observation",
      obj.scope as ArtifactScope,
    )) {
      return reject("invalid_predecessor_reference");
    }
    // F2: Check feature-bound path for lineage references when featurePath is provided
    if (featurePath !== undefined) {
      const lineage = obj.lineage as Record<string, unknown>;
      if (Array.isArray(lineage.predecessors)) {
        for (const pred of lineage.predecessors as ArtifactReference[]) {
          if (isPlainObject(pred) && !isFeatureBoundPath(pred.relativePath, featurePath)) {
            return reject("invalid_feature_path");
          }
        }
      }
      if (isPlainObject(lineage.supersedes)) {
        const sup = lineage.supersedes as unknown as ArtifactReference;
        if (!isFeatureBoundPath(sup.relativePath, featurePath)) {
          return reject("invalid_feature_path");
        }
      }
    }
  }

  // --- T3.1: Always validate manifestReference as complete ArtifactReference (F4 fix) ---
  if (!isPlainObject(obj.manifestReference)) return reject("invalid_shape");
  if (!isValidArtifactReference(obj.manifestReference)) return reject("invalid_artifact_reference");
  const manifestRef = obj.manifestReference as unknown as ArtifactReference;
  if (manifestRef.artifactKind !== "review_manifest") return reject("invalid_artifact_reference");
  // F2: Check feature-bound path for manifest reference when featurePath is provided
  if (featurePath !== undefined && !isFeatureBoundPath(manifestRef.relativePath, featurePath)) {
    return reject("invalid_feature_path");
  }

  // F1 (required): Predecessor context validation — bind debt observation to manifest
  // manifestContext is REQUIRED per review F1.
  // Runtime context validation before any nested dereference.
  {
    const ctxResult = requireValidPredecessorContext(manifestContext, ["manifest"]);
    if (ctxResult) return ctxResult;
    const artScope = obj.scope as Record<string, unknown>;
    // Exact manifest reference (all 4 fields including relativePath)
    if (manifestRef.contentHash !== manifestContext.reference.contentHash
      || manifestRef.artifactId !== manifestContext.reference.artifactId
      || manifestRef.artifactKind !== manifestContext.reference.artifactKind
      || manifestRef.relativePath !== manifestContext.reference.relativePath) {
      return reject("invalid_artifact_reference");
    }
    // Identical scope
    if (artScope.projectId !== manifestContext.scope.projectId
      || artScope.featureId !== manifestContext.scope.featureId
      || artScope.phaseNumber !== manifestContext.scope.phaseNumber
      || artScope.reviewGateId !== manifestContext.scope.reviewGateId) {
      return reject("invalid_artifact_reference");
    }

    // F1: Validate manifest findings array before iteration
    if (!Array.isArray(manifestContext.manifest.findings)) return reject("invalid_artifact_reference");

    // Referenced finding exists in manifest and is ARCHITECTURE_DEBT
    const manifestFindings = manifestContext.manifest.findings;
    const manifestFinding = manifestFindings.find((f) => isPlainObject(f) && (f as Record<string, unknown>).findingId === obj.findingId);
    if (!manifestFinding) return reject("invalid_artifact_reference");
    if (manifestFinding.disposition !== "ARCHITECTURE_DEBT") return reject("invalid_artifact_reference");

    // F1: Guard finding authority and surface before property access
    if (!isPlainObject(manifestFinding.authority)) return reject("invalid_artifact_reference");
    if (!isPlainObject(manifestFinding.surface)) return reject("invalid_artifact_reference");

    // Authority snapshot exactly equals that finding's authority
    if (manifestFinding.authority.kind === "active_rule") {
      // F1: Guard snapshot object before property access
      if (!isPlainObject(manifestFinding.authority.snapshot)) return reject("invalid_artifact_reference");
      const mfSnap = manifestFinding.authority.snapshot as Record<string, unknown>;
      const mfSnapSource = mfSnap.source as Record<string, unknown> | undefined;
      if (isPlainObject(obj.authority) && isPlainObject((obj.authority as Record<string, unknown>).snapshot)) {
        const suppliedSnap = (obj.authority as Record<string, unknown>).snapshot as Record<string, unknown>;
        if (suppliedSnap.ruleId !== mfSnap.ruleId
          || suppliedSnap.ruleHash !== mfSnap.ruleHash
          || suppliedSnap.catalogSourceHash !== mfSnap.catalogSourceHash
          || suppliedSnap.ruleVersion !== mfSnap.ruleVersion
          || (suppliedSnap.source as Record<string, unknown>)?.document !== mfSnapSource?.document
          || (suppliedSnap.source as Record<string, unknown>)?.section !== mfSnapSource?.section) {
          return reject("invalid_rule_snapshot");
        }
      } else {
        return reject("invalid_rule_snapshot");
      }
    }

    // Historical surface is a bounded subset of its affected surface
    // Predecessor collection guard: validate surface is record before surface.affected access
    if (!isPlainObject(manifestFinding.surface)) return reject("invalid_artifact_reference");
    if (manifestFinding.surface.affected !== undefined && !Array.isArray(manifestFinding.surface.affected)) return reject("invalid_artifact_reference");
    for (const se of (manifestFinding.surface.affected ?? []) as unknown[]) {
      if (!isPlainObject(se)) return reject("invalid_artifact_reference");
    }
    const affectedSurfaceIds = new Set(
      ((manifestFinding.surface.affected ?? []) as unknown[]).map((se: unknown) => (se as Record<string, unknown>).surfaceId as string),
    );
    if (Array.isArray(obj.historicalSurface)) {
      for (const entry of obj.historicalSurface as unknown[]) {
        if (isPlainObject(entry)) {
          const e = entry as Record<string, unknown>;
          if (typeof e.surfaceId === "string" && !affectedSurfaceIds.has(e.surfaceId as string)) {
            return reject("invalid_artifact_reference");
          }
        }
      }
    }
  }

  if (typeof obj.findingId !== "string" || !isValidKebabCaseIdentifier(obj.findingId)) return reject("invalid_shape");

  // F5: historicalSurface must be non-empty and bounded
  if (!Array.isArray(obj.historicalSurface)) return reject("invalid_shape");
  if (obj.historicalSurface.length === 0 || obj.historicalSurface.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
  // F4: Track duplicate surfaceIds in historicalSurface
  const historicalSurfaceIds = new Set<string>();
  for (const entry of obj.historicalSurface as unknown[]) {
    if (!isPlainObject(entry)) return reject("invalid_shape");
    const e = entry as Record<string, unknown>;
    // F5: Reject unknown historical surface entry keys
    const allowedHistKeys = new Set(["surfaceId", "relativePath", "symbol", "endpoint", "rationale"]);
    if (Object.keys(e).some((k) => !allowedHistKeys.has(k))) return reject("invalid_shape");
    // F4: surfaceId must be valid kebab-case
    if (typeof e.surfaceId !== "string" || !isValidKebabCaseIdentifier(e.surfaceId)) return reject("invalid_shape");
    // F4: Reject duplicate historical surface IDs
    if (historicalSurfaceIds.has(e.surfaceId as string)) return reject("duplicate_id");
    historicalSurfaceIds.add(e.surfaceId as string);
    if (typeof e.relativePath !== "string" || !isValidProjectRelativePath(e.relativePath)) return reject("invalid_shape");
    // F5: optional fields bounded
    if (e.symbol !== undefined && (typeof e.symbol !== "string" || e.symbol.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) return reject("invalid_shape");
    if (e.endpoint !== undefined && (typeof e.endpoint !== "string" || e.endpoint.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) return reject("invalid_shape");
    if (e.rationale !== undefined && (typeof e.rationale !== "string" || e.rationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) return reject("invalid_shape");
  }

  // F5: evidence and riskRationale must be non-empty and bounded
  if (typeof obj.evidence !== "string" || obj.evidence.length === 0 || obj.evidence.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
  if (typeof obj.riskRationale !== "string" || obj.riskRationale.length === 0 || obj.riskRationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
  if (obj.currentFeatureImpact !== "untouched_non_blocking") return reject("invalid_shape");

  // --- NEW-F5c: Validate debt observation authority via catalog (mandatory) ---
  // Catalog-backed debt authority resolution is mandatory. Reject a missing catalog
  // and require a complete active-rule authority matching the resolved active snapshot.
  if (catalog === undefined) return reject("ambiguous_rule_reference");
  if (!isPlainObject(obj.authority)) return reject("invalid_shape");
  const debtAuth = obj.authority as Record<string, unknown>;

  // F3: Reject unknown keys on debt observation authority object
  const debtAuthAllowedKeys = new Set(["kind", "reference", "snapshot"]);
  if (Object.keys(debtAuth).some((k) => !debtAuthAllowedKeys.has(k))) {
    return reject("ambiguous_rule_reference");
  }

  if (debtAuth.kind !== "active_rule") return reject("ambiguous_rule_reference");
  if (typeof debtAuth.reference !== "string" || !isValidRuleReference(debtAuth.reference)) {
    return reject("ambiguous_rule_reference");
  }
  const ruleId = debtAuth.reference.replace("rule:", "");
  const resolvedSnapshot = resolveStrictActiveRule(catalog, ruleId);
  if (!resolvedSnapshot) {
    const ruleExists = catalog.rules.some((r) => r.id === ruleId);
    return reject(ruleExists ? "inactive_rule" : "unknown_rule");
  }
  // Validate the complete snapshot against the resolved snapshot
  if (isPlainObject(debtAuth.snapshot)) {
    const supplied = debtAuth.snapshot as Record<string, unknown>;

    // F3: Reject unknown keys on debt snapshot object
    const debtSnapAllowedKeys = new Set([
      "schemaVersion", "catalogSchemaVersion", "ruleId", "ruleVersion",
      "category", "scope", "title", "source", "catalogPath",
      "catalogSourceHash", "ruleHash",
    ]);
    if (Object.keys(supplied).some((k) => !debtSnapAllowedKeys.has(k))) {
      return reject("invalid_rule_snapshot");
    }

    // F3: Reject unknown keys on debt snapshot source
    if (isPlainObject(supplied.source)) {
      const debtSourceAllowedKeys = new Set(["document", "section"]);
      if (Object.keys(supplied.source as Record<string, unknown>).some((k) => !debtSourceAllowedKeys.has(k))) {
        return reject("invalid_rule_snapshot");
      }
    }

    if (supplied.schemaVersion !== resolvedSnapshot.schemaVersion
      || supplied.catalogSchemaVersion !== resolvedSnapshot.catalogSchemaVersion
      || supplied.ruleId !== resolvedSnapshot.ruleId
      || supplied.ruleVersion !== resolvedSnapshot.ruleVersion
      || supplied.category !== resolvedSnapshot.category
      || supplied.scope !== resolvedSnapshot.scope
      || supplied.title !== resolvedSnapshot.title
      || supplied.catalogPath !== resolvedSnapshot.catalogPath
      || supplied.catalogSourceHash !== resolvedSnapshot.catalogSourceHash
      || supplied.ruleHash !== resolvedSnapshot.ruleHash
      || !isPlainObject(supplied.source)
      || (supplied.source as Record<string, unknown>).document !== resolvedSnapshot.source.document
      || (supplied.source as Record<string, unknown>).section !== resolvedSnapshot.source.section) {
      return reject("invalid_rule_snapshot");
    }
  } else {
    return reject("invalid_rule_snapshot");
  }

  // Reject unknown keys
  const allowedKeys = new Set([
    "schemaVersion", "artifactKind", "artifactId", "scope", "lineage",
    "manifestReference", "findingId", "authority", "historicalSurface",
    "evidence", "riskRationale", "currentFeatureImpact",
  ]);
  if (Object.keys(obj).some((k) => !allowedKeys.has(k))) return reject("invalid_shape");

  const artifact: ReviewArtifact = value as ReviewArtifact;
  const contentHash = computeReviewArtifactHash(artifact);

  return {
    valid: true,
    value: artifact,
    projection: {
      artifactKind: "debt_observation",
      artifactId: (artifact as DebtObservation).artifactId,
      scope: (artifact as DebtObservation).scope,
      schemaVersion: 1,
      contentHash,
    },
  };
}

