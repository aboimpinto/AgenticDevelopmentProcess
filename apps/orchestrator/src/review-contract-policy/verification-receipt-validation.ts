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

/** Validate verification receipts against immutable manifest and response evidence. */
export function validateVerificationReceipt(
  value: unknown,
  manifestContext: ManifestPredecessorContext,
  responseContext: ResponsePredecessorContext,
  rawPayload?: string,
  featurePath?: string,
): PolicyResult<ReviewArtifact> {
  const envResult = validateEnvelopeShape(value);
  if (envResult) return envResult;

  const obj = value as Record<string, unknown>;
  if (obj.artifactKind !== "verification_receipt") return reject("invalid_shape");

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
      "verification_receipt",
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

  // --- T3.1: Always validate required references as complete ArtifactReference (F4 fix) ---
  if (!isPlainObject(obj.manifestReference)) return reject("invalid_shape");
  if (!isValidArtifactReference(obj.manifestReference)) return reject("invalid_artifact_reference");
  const manifestRef = obj.manifestReference as unknown as ArtifactReference;
  if (manifestRef.artifactKind !== "review_manifest") return reject("invalid_artifact_reference");
  // F2: Check feature-bound path for manifest reference when featurePath is provided
  if (featurePath !== undefined && !isFeatureBoundPath(manifestRef.relativePath, featurePath)) {
    return reject("invalid_feature_path");
  }

  if (!isPlainObject(obj.responseReference)) return reject("invalid_shape");
  if (!isValidArtifactReference(obj.responseReference)) return reject("invalid_artifact_reference");
  const respRef = obj.responseReference as unknown as ArtifactReference;
  if (respRef.artifactKind !== "remediation_response") return reject("invalid_artifact_reference");
  // F2: Check feature-bound path for response reference when featurePath is provided
  if (featurePath !== undefined && !isFeatureBoundPath(respRef.relativePath, featurePath)) {
    return reject("invalid_feature_path");
  }

  // F1 (required): Predecessor context validation — bind receipt to manifest and response
  // Both manifestContext and responseContext are REQUIRED per review F1.
  // Runtime context validation before any nested dereference.
  {
    const ctxResult = requireValidPredecessorContext(manifestContext, ["manifest"])
      || requireValidPredecessorContext(responseContext, ["response"]);
    if (ctxResult) return ctxResult;
    // F1: Validate manifest findings and response findingResponses arrays before iteration
    if (!Array.isArray(manifestContext.manifest.findings)) return reject("invalid_artifact_reference");
    if (!Array.isArray(responseContext.response.findingResponses)) return reject("invalid_artifact_reference");
    const artScope = obj.scope as Record<string, unknown>;
    // Exact manifest reference (all 4 fields including relativePath)
    if (manifestRef.contentHash !== manifestContext.reference.contentHash
      || manifestRef.artifactId !== manifestContext.reference.artifactId
      || manifestRef.artifactKind !== manifestContext.reference.artifactKind
      || manifestRef.relativePath !== manifestContext.reference.relativePath) {
      return reject("invalid_artifact_reference");
    }
    // Exact response reference (all 4 fields including relativePath)
    if (respRef.contentHash !== responseContext.reference.contentHash
      || respRef.artifactId !== responseContext.reference.artifactId
      || respRef.artifactKind !== responseContext.reference.artifactKind
      || respRef.relativePath !== responseContext.reference.relativePath) {
      return reject("invalid_artifact_reference");
    }
    // Identical scope across all three artifacts
    if (artScope.projectId !== manifestContext.scope.projectId
      || artScope.featureId !== manifestContext.scope.featureId
      || artScope.phaseNumber !== manifestContext.scope.phaseNumber
      || artScope.reviewGateId !== manifestContext.scope.reviewGateId
      || artScope.projectId !== responseContext.scope.projectId
      || artScope.featureId !== responseContext.scope.featureId
      || artScope.phaseNumber !== responseContext.scope.phaseNumber
      || artScope.reviewGateId !== responseContext.scope.reviewGateId) {
      return reject("invalid_artifact_reference");
    }

    // F2: Validate collection shapes before iterating
    if (!Array.isArray(obj.itemReceipts)) return reject("invalid_shape");
    if (!Array.isArray(obj.testReceipts)) return reject("invalid_shape");

    // Item receipts exactly cover response items once (F3: one-to-one, no duplicates)
    const responseFindings = responseContext.response.findingResponses;
    const responseItemMap = new Map<string, string[]>();
    for (const rf of responseFindings) {
      // F1: Guard null/non-object entry and missing/non-array items
      if (!isPlainObject(rf)) return reject("invalid_artifact_reference");
      const rfObj = rf as Record<string, unknown>;
      if (typeof rfObj.findingId !== "string") return reject("invalid_artifact_reference");
      if (!Array.isArray(rfObj.items)) return reject("invalid_artifact_reference");
      const itemIds: string[] = [];
      for (const item of rfObj.items as unknown[]) {
        if (!isPlainObject(item)) return reject("invalid_artifact_reference");
        const i = item as Record<string, unknown>;
        if (typeof i.remediationItemId !== "string") return reject("invalid_artifact_reference");
        itemIds.push(i.remediationItemId as string);
      }
      responseItemMap.set(rfObj.findingId as string, itemIds);
    }
    // Use Map<string, Map<string, number>> for exact count tracking
    const receiptItemCounts = new Map<string, Map<string, number>>();
    for (const receipt of obj.itemReceipts as unknown[]) {
      if (!isPlainObject(receipt)) return reject("invalid_shape");
      const r = receipt as Record<string, unknown>;
      if (typeof r.findingId !== "string" || typeof r.remediationItemId !== "string") return reject("invalid_shape");
      // F1: Reject item receipt for unknown finding ID not in the response
      if (!responseItemMap.has(r.findingId as string)) return reject("invalid_artifact_reference");
      if (!receiptItemCounts.has(r.findingId as string)) {
        receiptItemCounts.set(r.findingId as string, new Map());
      }
      const itemCounts = receiptItemCounts.get(r.findingId as string)!;
      const prev = itemCounts.get(r.remediationItemId as string) ?? 0;
      if (prev >= 1) return reject("duplicate_id"); // F3: reject duplicate pairs
      itemCounts.set(r.remediationItemId as string, prev + 1);
    }
    // Every response finding's items must be covered exactly once
    for (const [findingId, expectedItemIds] of responseItemMap) {
      const receiptItemMap = receiptItemCounts.get(findingId);
      if (!receiptItemMap) return reject("invalid_artifact_reference");
      for (const itemId of expectedItemIds) {
        if (!receiptItemMap.has(itemId)) return reject("invalid_artifact_reference");
      }
      // Reject extra receipt entries for unknown items in this finding
      if (receiptItemMap.size > expectedItemIds.length) return reject("invalid_artifact_reference");
    }

    // Test receipts exactly cover manifest test-matrix items for responded findings
    const manifestFindings = manifestContext.manifest.findings;
    // F1: Pre-check all test receipt finding IDs exist in the response
    for (const test of obj.testReceipts as unknown[]) {
      if (!isPlainObject(test)) return reject("invalid_shape");
      const t = test as Record<string, unknown>;
      if (typeof t.findingId !== "string") return reject("invalid_shape");
      if (!responseItemMap.has(t.findingId as string)) return reject("invalid_artifact_reference");
    }
    for (const [findingId] of responseItemMap) {
      const mf = manifestFindings.find((f) => isPlainObject(f) && (f as Record<string, unknown>).findingId === findingId);
      if (!mf || !Array.isArray(mf.testMatrix)) return reject("invalid_artifact_reference");
      // Predecessor collection guard: validate testMatrix members before .map()
      for (const t of mf.testMatrix as unknown[]) {
        if (!isPlainObject(t)) return reject("invalid_artifact_reference");
      }
      const expectedTestIds = new Set((mf.testMatrix as unknown[]).map((t: unknown) => (t as Record<string, unknown>).testId as string));
      // Use exact count map for test receipts (F3)
      const receiptTestCounts = new Map<string, number>();
      for (const test of obj.testReceipts as unknown[]) {
        if (!isPlainObject(test)) return reject("invalid_shape");
        const t = test as Record<string, unknown>;
        if (t.findingId === findingId && typeof t.testId === "string") {
          const prev = receiptTestCounts.get(t.testId as string) ?? 0;
          if (prev >= 1) return reject("duplicate_id"); // F3: reject duplicate test receipts
          receiptTestCounts.set(t.testId as string, prev + 1);
        }
      }
      // Every test in the manifest must have a receipt entry
      for (const testId of expectedTestIds) {
        if (!receiptTestCounts.has(testId)) return reject("invalid_artifact_reference");
      }
      // Reject extra receipt entries for unknown tests
      if (receiptTestCounts.size > expectedTestIds.size) return reject("invalid_artifact_reference");
    }
  }

  // Validate receipts
  if (!Array.isArray(obj.itemReceipts)) return reject("invalid_shape");
  if (!Array.isArray(obj.testReceipts)) return reject("invalid_shape");

  const maxItems = REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING * REVIEW_ARTIFACT_MAX_FINDINGS;
  if (obj.itemReceipts.length > maxItems) return reject("invalid_shape");
  if (obj.testReceipts.length > maxItems) return reject("invalid_shape");

  for (const receipt of obj.itemReceipts as unknown[]) {
    if (!isPlainObject(receipt)) return reject("invalid_shape");
    const r = receipt as Record<string, unknown>;
    // F5: Reject unknown item receipt keys
    const allowedItemReceiptKeys = new Set(["findingId", "remediationItemId", "outcome", "evidence"]);
    if (Object.keys(r).some((k) => !allowedItemReceiptKeys.has(k))) return reject("invalid_shape");
    if (typeof r.findingId !== "string") return reject("invalid_shape");
    if (typeof r.remediationItemId !== "string") return reject("invalid_shape");
    if (typeof r.outcome !== "string" || !["VERIFIED", "FAILED", "NOT_VERIFIABLE"].includes(r.outcome as string)) return reject("invalid_shape");
    // F5: evidence must be non-empty (required receipt evidence) and bounded
    if (typeof r.evidence !== "string" || r.evidence.length === 0 || r.evidence.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
  }

  for (const receipt of obj.testReceipts as unknown[]) {
    if (!isPlainObject(receipt)) return reject("invalid_shape");
    const r = receipt as Record<string, unknown>;
    // F5: Reject unknown test receipt keys
    const allowedTestReceiptKeys = new Set(["findingId", "testId", "outcome", "evidence"]);
    if (Object.keys(r).some((k) => !allowedTestReceiptKeys.has(k))) return reject("invalid_shape");
    if (typeof r.findingId !== "string") return reject("invalid_shape");
    if (typeof r.testId !== "string") return reject("invalid_shape");
    if (typeof r.outcome !== "string" || !["PASSED", "FAILED", "NOT_RUN", "NOT_VERIFIABLE"].includes(r.outcome as string)) return reject("invalid_shape");
    // F5: test receipt evidence must be non-empty and bounded
    if (typeof r.evidence !== "string" || r.evidence.length === 0 || r.evidence.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) return reject("invalid_shape");
  }

  // Reject unknown keys
  const allowedKeys = new Set([
    "schemaVersion", "artifactKind", "artifactId", "scope", "lineage",
    "manifestReference", "responseReference", "itemReceipts", "testReceipts",
  ]);
  if (Object.keys(obj).some((k) => !allowedKeys.has(k))) return reject("invalid_shape");

  const artifact: ReviewArtifact = value as ReviewArtifact;
  const contentHash = computeReviewArtifactHash(artifact);

  return {
    valid: true,
    value: artifact,
    projection: {
      artifactKind: "verification_receipt",
      artifactId: (artifact as VerificationReceipt).artifactId,
      scope: (artifact as VerificationReceipt).scope,
      schemaVersion: 1,
      contentHash,
    },
  };
}

