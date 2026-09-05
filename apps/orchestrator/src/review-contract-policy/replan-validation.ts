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
import { validateSurface } from "./surface-validation.js";

/** Validate bounded replan requests against their reviewer-owned manifest. */
export function validateReplanPlan(
  value: unknown,
  manifestContext: ManifestPredecessorContext,
  rawPayload?: string,
  featurePath?: string,
): PolicyResult<ReviewArtifact> {
  const envResult = validateEnvelopeShape(value);
  if (envResult) return envResult;

  const obj = value as Record<string, unknown>;
  if (obj.artifactKind !== "replan_plan") return reject("invalid_shape");

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
      "replan_plan",
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

  // F1 (required): Predecessor context validation — bind replan plan to manifest
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

    // F2: Validate findingIds collection before iteration
    if (!Array.isArray(obj.findingIds)) return reject("invalid_shape");

    // F1: Validate manifest findings array before iteration
    if (!Array.isArray(manifestContext.manifest.findings)) return reject("invalid_artifact_reference");

    // Finding IDs all exist in manifest and share defectClass
    const manifestFindings = manifestContext.manifest.findings;
    const uniqueFindingIds = new Set<string>();
    const findingIds = obj.findingIds as string[];
    let sharedDefectClass: string | undefined;
    for (const fid of findingIds) {
      if (uniqueFindingIds.has(fid)) return reject("duplicate_id");
      uniqueFindingIds.add(fid);
      const mf = manifestFindings.find((f) => isPlainObject(f) && (f as Record<string, unknown>).findingId === fid);
      if (!mf) return reject("invalid_artifact_reference");
      if (sharedDefectClass === undefined) {
        sharedDefectClass = mf.defectClass;
      } else if (mf.defectClass !== sharedDefectClass) {
        return reject("invalid_artifact_reference");
      }
    }

    // F4: Require obj.defectClass to match the single shared defectClass
    if (sharedDefectClass !== undefined && obj.defectClass !== sharedDefectClass) {
      return reject("invalid_shape");
    }

    // finding_exhaustiveness selects only findings with replan_required
    if (obj.replanReason === "finding_exhaustiveness") {
      for (const fid of findingIds) {
        const mf = manifestFindings.find((f) => isPlainObject(f) && (f as Record<string, unknown>).findingId === fid);
        if (mf && mf.exhaustivenessDecision !== "replan_required") {
          return reject("invalid_artifact_reference");
        }
      }
    }

    // Plan remediation/test IDs must be unique
    const planRemIds = new Set<string>();
    if (Array.isArray(obj.remediationItems)) {
      for (const item of obj.remediationItems as unknown[]) {
        if (isPlainObject(item)) {
          const ri = item as Record<string, unknown>;
          if (typeof ri.remediationItemId === "string") {
            if (planRemIds.has(ri.remediationItemId as string)) return reject("duplicate_id");
            planRemIds.add(ri.remediationItemId as string);
          }
        }
      }
    }
    const planTestIds = new Set<string>();
    if (Array.isArray(obj.testMatrix)) {
      for (const item of obj.testMatrix as unknown[]) {
        if (isPlainObject(item)) {
          const ti = item as Record<string, unknown>;
          if (typeof ti.testId === "string") {
            if (planTestIds.has(ti.testId as string)) return reject("duplicate_id");
            planTestIds.add(ti.testId as string);
          }
        }
      }
    }

    // Exclusions must not overlap affected surface
    const planSurface = obj.surface;
    if (isPlainObject(planSurface)) {
      const ps = planSurface as Record<string, unknown>;
      const affectedPaths = new Set<string>();
      if (Array.isArray(ps.affected)) {
        for (const entry of ps.affected as unknown[]) {
          if (isPlainObject(entry)) {
            const e = entry as Record<string, unknown>;
            if (typeof e.relativePath === "string") affectedPaths.add(e.relativePath as string);
          }
        }
      }
      if (Array.isArray(obj.explicitExclusions)) {
        for (const excl of obj.explicitExclusions as unknown[]) {
          if (isPlainObject(excl)) {
            const e = excl as Record<string, unknown>;
            if (typeof e.relativePath === "string" && affectedPaths.has(e.relativePath as string)) {
              return reject("invalid_shape");
            }
          }
        }
      }
    }

    // Replan remediation/test targets must resolve to plan affected surface
    const planAffectedIds = new Set<string>();
    if (isPlainObject(planSurface)) {
      const ps = planSurface as Record<string, unknown>;
      if (Array.isArray(ps.affected)) {
        for (const entry of ps.affected as unknown[]) {
          if (isPlainObject(entry)) {
            const e = entry as Record<string, unknown>;
            if (typeof e.surfaceId === "string") {
              planAffectedIds.add(e.surfaceId as string);
            }
          }
        }
      }
    }
    if (Array.isArray(obj.remediationItems)) {
      for (const item of obj.remediationItems as unknown[]) {
        if (isPlainObject(item)) {
          const ri = item as Record<string, unknown>;
          if (Array.isArray(ri.targetSurfaceIds)) {
            for (const sid of ri.targetSurfaceIds as string[]) {
              if (typeof sid !== "string" || !planAffectedIds.has(sid)) {
                return reject("invalid_artifact_reference");
              }
            }
          }
        }
      }
    }
    if (Array.isArray(obj.testMatrix)) {
      for (const item of obj.testMatrix as unknown[]) {
        if (isPlainObject(item)) {
          const ti = item as Record<string, unknown>;
          if (Array.isArray(ti.targetSurfaceIds)) {
            for (const sid of ti.targetSurfaceIds as string[]) {
              if (typeof sid !== "string" || !planAffectedIds.has(sid)) {
                return reject("invalid_artifact_reference");
              }
            }
          }
        }
      }
    }
  }

  // findingIds
  if (!Array.isArray(obj.findingIds)) return reject("invalid_shape");
  if (obj.findingIds.length === 0 || obj.findingIds.length > REVIEW_ARTIFACT_MAX_FINDINGS) return reject("invalid_shape");
  if (!obj.findingIds.every((id: unknown) => typeof id === "string" || typeof id === "number")) return reject("invalid_shape");

  // Required string fields
  // defectClass must be a valid kebab-case identifier (F2 fix)
  if (typeof obj.defectClass !== "string" || !isValidKebabCaseIdentifier(obj.defectClass)) return reject("invalid_shape");
  if (typeof obj.replanReason !== "string" || !["finding_exhaustiveness", "recurrence_signal"].includes(obj.replanReason as string)) return reject("invalid_shape");
  if (typeof obj.rootCause !== "string" || obj.rootCause.length === 0 || obj.rootCause.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");

  // Surface
  const surfaceResult = validateSurface(obj.surface);
  if (surfaceResult) return surfaceResult;

  // Exclusions
  if (!Array.isArray(obj.explicitExclusions)) return reject("invalid_shape");
  // F3: Bound explicitExclusions by REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES
  if (obj.explicitExclusions.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
  for (const excl of obj.explicitExclusions as unknown[]) {
    if (!isPlainObject(excl)) return reject("invalid_shape");
    const e = excl as Record<string, unknown>;
    // F5: Reject unknown exclusion keys
    const allowedExclKeys = new Set(["relativePath", "rationale"]);
    if (Object.keys(e).some((k) => !allowedExclKeys.has(k))) return reject("invalid_shape");
    if (typeof e.relativePath !== "string" || !isValidProjectRelativePath(e.relativePath)) return reject("invalid_shape");
    // F5: exclusion rationale must be bounded
    if (typeof e.rationale !== "string" || e.rationale.length === 0 || e.rationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
  }

  // remediationItems
  if (!Array.isArray(obj.remediationItems)) return reject("invalid_shape");
  // F3: Reject empty and oversized remediationItems
  if (obj.remediationItems.length === 0 || obj.remediationItems.length > REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING) return reject("invalid_shape");
  for (const item of obj.remediationItems as unknown[]) {
    if (!isPlainObject(item)) return reject("invalid_shape");
    const ri = item as Record<string, unknown>;
    // F5: Reject unknown replan remediation item keys
    const allowedReplanRemKeys = new Set(["remediationItemId", "instruction", "targetSurfaceIds"]);
    if (Object.keys(ri).some((k) => !allowedReplanRemKeys.has(k))) return reject("invalid_shape");
    if (typeof ri.remediationItemId !== "string" || !isValidKebabCaseIdentifier(ri.remediationItemId)) return reject("invalid_shape");
    // F5: instruction must be bounded
    if (typeof ri.instruction !== "string" || ri.instruction.length === 0 || ri.instruction.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
    // F3: targetSurfaceIds must be non-empty, bounded, and all strings
    if (!Array.isArray(ri.targetSurfaceIds)) return reject("invalid_shape");
    if (ri.targetSurfaceIds.length === 0 || ri.targetSurfaceIds.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
    if (!ri.targetSurfaceIds.every((id: unknown) => typeof id === "string")) return reject("invalid_shape");
  }

  // testMatrix
  if (!Array.isArray(obj.testMatrix)) return reject("invalid_shape");
  // F3: Reject empty and oversized testMatrix
  if (obj.testMatrix.length === 0 || obj.testMatrix.length > REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING) return reject("invalid_shape");
  for (const item of obj.testMatrix as unknown[]) {
    if (!isPlainObject(item)) return reject("invalid_shape");
    const ti = item as Record<string, unknown>;
    // F5: Reject unknown replan test matrix item keys
    const allowedReplanTestKeys = new Set(["testId", "requirement", "targetSurfaceIds"]);
    if (Object.keys(ti).some((k) => !allowedReplanTestKeys.has(k))) return reject("invalid_shape");
    // F3: Test IDs must be valid kebab-case identifiers
    if (typeof ti.testId !== "string" || !isValidKebabCaseIdentifier(ti.testId)) return reject("invalid_shape");
    // F5: requirement must be bounded
    if (typeof ti.requirement !== "string" || ti.requirement.length === 0 || ti.requirement.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
    // F3: targetSurfaceIds must be non-empty, bounded, and all strings
    if (!Array.isArray(ti.targetSurfaceIds)) return reject("invalid_shape");
    if (ti.targetSurfaceIds.length === 0 || ti.targetSurfaceIds.length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");
    if (!ti.targetSurfaceIds.every((id: unknown) => typeof id === "string")) return reject("invalid_shape");
  }

  // verificationPlan, closureCriteria — F5: bounded text
  if (typeof obj.verificationPlan !== "string" || obj.verificationPlan.length === 0 || obj.verificationPlan.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
  if (typeof obj.closureCriteria !== "string" || obj.closureCriteria.length === 0 || obj.closureCriteria.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");

  // Reject unknown keys
  const allowedKeys = new Set([
    "schemaVersion", "artifactKind", "artifactId", "scope", "lineage",
    "manifestReference", "findingIds", "defectClass", "replanReason",
    "rootCause", "surface", "explicitExclusions", "remediationItems",
    "testMatrix", "verificationPlan", "closureCriteria",
  ]);
  if (Object.keys(obj).some((k) => !allowedKeys.has(k))) return reject("invalid_shape");

  const artifact: ReviewArtifact = value as ReviewArtifact;
  const contentHash = computeReviewArtifactHash(artifact);

  return {
    valid: true,
    value: artifact,
    projection: {
      artifactKind: "replan_plan",
      artifactId: (artifact as ReplanPlan).artifactId,
      scope: (artifact as ReplanPlan).scope,
      schemaVersion: 1,
      contentHash,
    },
  };
}
