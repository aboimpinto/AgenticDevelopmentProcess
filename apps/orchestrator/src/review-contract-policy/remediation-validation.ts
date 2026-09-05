import { createHash } from "node:crypto";
import {
  type ActiveRuleSnapshotV1,
  type ActiveRuleAuthority,
  type AcceptanceCriterionAuthority,
  type ArtifactKind,
  type ArtifactScope,
  type Authority,
  type DebtObservation,
  type Disposition,
  type ManifestResult,
  type RemediationResponse,
  type ReplanPlan,
  type ReviewArtifact,
  type ReviewContractEnvelope,
  type ReviewContractRejection,
  type ReviewFinding,
  type ReviewManifest,
  type Severity,
  type VerificationReceipt,
  ARTIFACT_KINDS,
  REVIEW_ARTIFACT_MAX_FINDINGS,
  REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES,
  REVIEW_ARTIFACT_MAX_DEPTH,
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES,
  REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING,
  REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH,
  SHA256_HEX_LENGTH,
  REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH,
  VALID_DISPOSITIONS,
  VALID_SEVERITIES,
  VALID_CLAIM_TYPES,
  type ClaimType,
  type SurfaceEntry,
  type Surface,
  type RemediationItem,
  type TestMatrixItem,
  type ExhaustivenessDecision,
  type ReviewContractRejectionCode,
  type ArtifactReference,
  type ArtifactLineage,
  isValidKebabCaseIdentifier,
  isValidSemVer,
  isValidSha256Hex,
  isValidRuleReference,
  isValidAcceptanceCriterionReference,
  isValidProjectRelativePath,
  isFeatureBoundPath,
  isValidArtifactReference,
  isValidArtifactLineage,
  isReviewContractSafeString,
  computeReviewArtifactHash,
} from "../review-contract-types.js";
import { type StrictActiveRuleCatalog, resolveStrictActiveRule } from "../review-contract-catalog.js";
import { isRemediationLifecycleDisposition } from "../review-remediation-lifecycle-policy.js";
import {
  checkArtifactPathSafety,
  checkArtifactUnsafeContent,
  checkDepth,
  checkIdUniqueness,
  checkPayloadSizeAndDepth,
  isPlainObject,
  reject,
  requireValidPredecessorContext,
  validateEnvelopeShape,
} from "./envelope-safety.js";
import type {
  ManifestPredecessorContext,
  PolicyProjection,
  PolicyRejection,
  PolicyResult,
  ResponsePredecessorContext,
} from "./policy-types.js";

/** Validate fixer-owned responses against an immutable reviewer manifest. */
export function validateRemediationResponse(
  value: unknown,
  manifestContext: ManifestPredecessorContext,
  rawPayload?: string,
  featurePath?: string,
): PolicyResult<ReviewArtifact> {
  const envResult = validateEnvelopeShape(value);
  if (envResult) return envResult;

  const obj = value as Record<string, unknown>;
  if (obj.artifactKind !== "remediation_response") return reject("invalid_shape");

  // Schema version already validated

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
  // Feature-bound check is per-field (surface entry relative paths
  // are project source paths, not feature-bound artifact paths).
  const pathResult = checkArtifactPathSafety(value, undefined);
  if (pathResult) return pathResult;

  // --- T3.4/F3: Validate lineage when present (F3 fix) ---
  if (obj.lineage !== undefined) {
    if (!isPlainObject(obj.lineage)) return reject("invalid_shape");
    if (!isValidArtifactLineage(
      obj.lineage,
      obj.artifactId as string,
      "remediation_response",
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

  // F1 (required): Predecessor context validation — bind response to manifest
  // manifestContext is REQUIRED per review F1. All binding checks run unconditionally.
  // Runtime context validation before any nested dereference.
  {
    const ctxResult = requireValidPredecessorContext(manifestContext, ["manifest"]);
    if (ctxResult) return ctxResult;
    // F1: Validate manifest findings array before iteration
    if (!Array.isArray(manifestContext.manifest.findings)) return reject("invalid_artifact_reference");
    const artScope = obj.scope as Record<string, unknown>;
    // Exact manifest reference (content hash, artifact ID, kind, relativePath)
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

    // F2: Validate collection shape before iterating
    if (!Array.isArray(obj.findingResponses)) return reject("invalid_shape");

    // Every response finding exists in the manifest and owns remediation work.
    const manifestFindings = manifestContext.manifest.findings;
    const seenFindingIds = new Set<string>();
    // F2: Reject unknown keys on each finding response entry
    const allowedFrKeys = new Set(["findingId", "items"]);
    for (const fr of obj.findingResponses) {
      if (!isPlainObject(fr)) return reject("invalid_shape");
      const frObj = fr as Record<string, unknown>;
      // F2: Closed-key validation for finding-response entry
      if (Object.keys(frObj).some((k) => !allowedFrKeys.has(k))) return reject("invalid_shape");
      const findingId = frObj.findingId;
      if (typeof findingId !== "string") return reject("invalid_shape");
      // F3: Reject duplicate response finding IDs
      if (seenFindingIds.has(findingId)) return reject("duplicate_id");
      seenFindingIds.add(findingId);
      const manifestFinding = manifestFindings.find((mf) => isPlainObject(mf) && (mf as Record<string, unknown>).findingId === findingId);
      if (!manifestFinding) return reject("invalid_artifact_reference");
      if (!isRemediationLifecycleDisposition(manifestFinding.disposition)) {
        return reject("invalid_artifact_reference");
      }

      // Each declared finding covers every manifest remediation item exactly once
      // F1: Predecessor collection guard — non-array is invalid_artifact_reference
      if (!Array.isArray(manifestFinding.remediationItems)) return reject("invalid_artifact_reference");
      if (manifestFinding.remediationItems.length === 0) return reject("invalid_shape");
      if (!Array.isArray(frObj.items)) return reject("invalid_shape");
      // Predecessor collection guard: validate remediationItems members before .map()
      for (const ri of manifestFinding.remediationItems as unknown[]) {
        if (!isPlainObject(ri)) return reject("invalid_artifact_reference");
      }
      const manifestItemIds = new Set((manifestFinding.remediationItems as unknown[]).map((ri: unknown) => (ri as Record<string, unknown>).remediationItemId as string));
      const responseItemIds = new Set<string>();
      for (const item of frObj.items) {
        if (!isPlainObject(item)) return reject("invalid_shape");
        const i = item as Record<string, unknown>;
        if (typeof i.remediationItemId !== "string") return reject("invalid_shape");
        if (!manifestItemIds.has(i.remediationItemId as string)) return reject("invalid_artifact_reference");
        if (responseItemIds.has(i.remediationItemId as string)) return reject("duplicate_id");
        responseItemIds.add(i.remediationItemId as string);
      }
      if (responseItemIds.size !== manifestItemIds.size) return reject("invalid_artifact_reference");

      // Changed surface IDs resolve to that finding's affected surface and are bounded
      // Predecessor collection guard: validate surface is record before surface.affected access
      if (!isPlainObject(manifestFinding.surface)) return reject("invalid_artifact_reference");
      if (manifestFinding.surface.affected !== undefined && !Array.isArray(manifestFinding.surface.affected)) return reject("invalid_artifact_reference");
      for (const se of (manifestFinding.surface.affected ?? []) as unknown[]) {
        if (!isPlainObject(se)) return reject("invalid_artifact_reference");
      }
      const affectedSurfaceIds = new Set(
        ((manifestFinding.surface.affected ?? []) as unknown[]).map((se: unknown) => (se as Record<string, unknown>).surfaceId as string),
      );
      for (const item of frObj.items) {
        if (!isPlainObject(item)) return reject("invalid_shape");
        const i = item as Record<string, unknown>;
        if (Array.isArray(i.changedSurfaceIds)) {
          // F2: Bound changedSurfaceIds by REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES
          if (i.changedSurfaceIds.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
          for (const sid of i.changedSurfaceIds as string[]) {
            if (typeof sid !== "string" || !affectedSurfaceIds.has(sid)) {
              return reject("invalid_artifact_reference");
            }
          }
        }
      }
    }
  }

  // Validate findingResponses
  if (!Array.isArray(obj.findingResponses)) return reject("invalid_shape");
  if (obj.findingResponses.length === 0 || obj.findingResponses.length > REVIEW_ARTIFACT_MAX_FINDINGS) return reject("invalid_shape");

  for (const fr of obj.findingResponses as unknown[]) {
    if (!isPlainObject(fr)) return reject("invalid_shape");
    const frObj = fr as Record<string, unknown>;

    if (typeof frObj.findingId !== "string" || !isValidKebabCaseIdentifier(frObj.findingId)) return reject("invalid_shape");
    if (!Array.isArray(frObj.items)) return reject("invalid_shape");
    if (frObj.items.length === 0 || frObj.items.length > REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING) return reject("invalid_shape");

    for (const item of frObj.items as unknown[]) {
      if (!isPlainObject(item)) return reject("invalid_shape");
      const i = item as Record<string, unknown>;
      // F5: Reject unknown response item keys
      const allowedItemKeys = new Set(["remediationItemId", "decision", "changedSurfaceIds", "rationale"]);
      if (Object.keys(i).some((k) => !allowedItemKeys.has(k))) return reject("invalid_shape");
      if (typeof i.remediationItemId !== "string") return reject("invalid_shape");
      if (typeof i.decision !== "string" || !["APPLIED", "NOT_APPLIED", "NOT_APPLICABLE"].includes(i.decision as string)) return reject("invalid_shape");
      if (!Array.isArray(i.changedSurfaceIds)) return reject("invalid_shape");
      // F5: rationale must be non-empty and bounded
      if (typeof i.rationale !== "string" || i.rationale.length === 0 || i.rationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
    }
  }

  // Reject unknown keys
  const allowedKeys = new Set([
    "schemaVersion", "artifactKind", "artifactId", "scope", "lineage",
    "manifestReference", "findingResponses", "suspectedOutOfScopeObservations",
  ]);
  if (Object.keys(obj).some((k) => !allowedKeys.has(k))) return reject("invalid_shape");

  // Validate suspectedOutOfScopeObservations
  if (obj.suspectedOutOfScopeObservations !== undefined) {
    if (!Array.isArray(obj.suspectedOutOfScopeObservations)) return reject("invalid_shape");
    // F2: Bound suspectedOutOfScopeObservations by REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES
    if (obj.suspectedOutOfScopeObservations.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
    for (const obs of obj.suspectedOutOfScopeObservations as unknown[]) {
      if (!isPlainObject(obs)) return reject("invalid_shape");
      const o = obs as Record<string, unknown>;
      // F5: Reject unknown observation keys
      const allowedObsKeys = new Set(["relativePath", "rationale"]);
      if (Object.keys(o).some((k) => !allowedObsKeys.has(k))) return reject("invalid_shape");
      if (typeof o.relativePath !== "string" || !isValidProjectRelativePath(o.relativePath)) return reject("invalid_shape");
      // F5: rationale must be bounded
      if (typeof o.rationale !== "string" || o.rationale.length === 0 || o.rationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
    }
  }

  const artifact: ReviewArtifact = value as ReviewArtifact;
  const contentHash = computeReviewArtifactHash(artifact);

  return {
    valid: true,
    value: artifact,
    projection: {
      artifactKind: "remediation_response",
      artifactId: (artifact as RemediationResponse).artifactId,
      scope: (artifact as RemediationResponse).scope,
      schemaVersion: 1,
      contentHash,
    },
  };
}

