import {
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  isReviewContractSafeString,
  isValidArtifactReference,
  type ReviewFinding,
} from "../review-contract-types.js";
import { reject } from "./envelope-safety.js";
import type { PolicyRejection } from "./policy-types.js";

/**
 * Validate that blocker (IN_SCOPE_BLOCKER) and scope-expansion (SCOPE_EXPANSION)
 * findings have complete obligations: root cause, inspected/affected/confirmed-unaffected
 * surface, remediation items, test matrix, and exhaustiveness decision.
 */
export function validateBlockerExpansionObligations(
  finding: ReviewFinding,
): PolicyRejection | undefined {
  const {
    disposition,
    rootCause,
    surface,
    remediationItems,
    testMatrix,
    exhaustivenessDecision,
    compatibilityDecision,
    compatibilityApprovalSource,
    compatibilityJustification,
  } = finding;

  if (disposition !== "IN_SCOPE_BLOCKER" && disposition !== "SCOPE_EXPANSION") {
    return undefined;
  }

  // Root cause is required: non-empty bounded safe string
  if (typeof rootCause !== "string" || rootCause.length === 0 || rootCause.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH) {
    return reject("invalid_shape");
  }

  // Surface must have at least inspected and affected entries
  if (!surface || !surface.inspected || surface.inspected.length === 0) {
    return reject("invalid_shape");
  }
  if (!surface.affected || surface.affected.length === 0) {
    return reject("invalid_shape");
  }
  // confirmedUnaffected must be a non-empty array for IN_SCOPE_BLOCKER and SCOPE_EXPANSION
  if (!surface.confirmedUnaffected || !Array.isArray(surface.confirmedUnaffected) || surface.confirmedUnaffected.length === 0) {
    return reject("invalid_shape");
  }

  // Remediation items required
  if (!remediationItems || remediationItems.length === 0) {
    return reject("invalid_shape");
  }

  // Test matrix required
  if (!testMatrix || testMatrix.length === 0) {
    return reject("invalid_shape");
  }

  // Exhaustiveness decision required
  if (!exhaustivenessDecision) {
    return reject("invalid_shape");
  }

  if (compatibilityDecision !== "breaking_change_permitted"
    && compatibilityDecision !== "backward_compatibility_required") {
    return reject("invalid_shape");
  }
  if (compatibilityDecision === "backward_compatibility_required") {
    if (!isReviewContractSafeString(compatibilityApprovalSource)
      || !isReviewContractSafeString(compatibilityJustification)) {
      return reject("invalid_shape");
    }
  } else if (compatibilityApprovalSource !== undefined || compatibilityJustification !== undefined) {
    return reject("invalid_shape");
  }

  // SCOPE_EXPANSION requires scopeExpansionRationale: non-empty bounded safe string
  const scopeRationale = finding.scopeExpansionRationale;
  if (disposition === "SCOPE_EXPANSION" && (typeof scopeRationale !== "string" || scopeRationale.length === 0 || scopeRationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) {
    return reject("invalid_shape");
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// T3.2: Disposition field matrix — required/forbidden fields for all dispositions
// ---------------------------------------------------------------------------

/**
 * Validate the complete required/forbidden field matrix for a finding's disposition.
 *
 * Acceptance matrix per review F1:
 *
 * | Disposition | Required fields | Forbidden fields |
 * |---|---|---|
 * | IN_SCOPE_BLOCKER | Non-empty bounded safe-string rootCause; non-empty surface.inspected, surface.affected, surface.confirmedUnaffected; non-empty valid remediationItems, testMatrix; valid exhaustivenessDecision; compatibilityDecision; every targetSurfaceId resolves to surface.affected. | scopeExpansionRationale, debtImpact, debtObservationReference. |
 * | SCOPE_EXPANSION | All blocker requirements plus non-empty bounded safe-string scopeExpansionRationale. | debtImpact, debtObservationReference. |
 * | ARCHITECTURE_DEBT | Active-rule authority; non-empty surface.inspected, surface.affected; debtImpact: "untouched_non_blocking"; debtObservationReference, if present, is a valid debt_observation artifact reference. | rootCause, scopeExpansionRationale, remediationItems, testMatrix, exhaustivenessDecision, compatibilityDecision, compatibilityApprovalSource, compatibilityJustification. |
 * | OBSERVATION | Non-empty surface.inspected; common bounded summary; structurally valid surface arrays. | rootCause, scopeExpansionRationale, remediationItems, testMatrix, exhaustivenessDecision, compatibilityDecision, compatibilityApprovalSource, compatibilityJustification, debtImpact, debtObservationReference. |
 */
export function validateDispositionFieldMatrix(
  finding: ReviewFinding,
): PolicyRejection | undefined {
  const { disposition } = finding;

  switch (disposition) {
    case "IN_SCOPE_BLOCKER":
    case "SCOPE_EXPANSION": {
      // Blocker/expansion shared checks (via validateBlockerExpansionObligations)
      const blockerResult = validateBlockerExpansionObligations(finding);
      if (blockerResult) return blockerResult;

      // Forbidden: debtImpact and debtObservationReference
      if (checkFieldPresent(finding, "debtImpact")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "debtObservationReference")) return reject("invalid_shape");

      // IN_SCOPE_BLOCKER additionally forbids scopeExpansionRationale
      if (disposition === "IN_SCOPE_BLOCKER" && checkFieldPresent(finding, "scopeExpansionRationale")) {
        return reject("invalid_shape");
      }

      return undefined;
    }

    case "ARCHITECTURE_DEBT": {
      // Required: non-empty surface.inspected
      if (!finding.surface || !finding.surface.inspected || finding.surface.inspected.length === 0) {
        return reject("invalid_shape");
      }
      // Required: non-empty surface.affected
      if (!finding.surface || !finding.surface.affected || finding.surface.affected.length === 0) {
        return reject("invalid_shape");
      }
      // Required: debtImpact must be "untouched_non_blocking"
      if (finding.debtImpact !== "untouched_non_blocking") {
        return reject("invalid_shape");
      }
      // Required: authority must be active_rule (enforced in resolveFindingAuthority)
      // debtObservationReference, if present, must be valid debt_observation artifact reference
      // Use isValidArtifactReference for complete contentHash, unknown-key, and field validation.
      if (finding.debtObservationReference !== undefined) {
        if (!isValidArtifactReference(finding.debtObservationReference)) return reject("invalid_artifact_reference");
        if (finding.debtObservationReference.artifactKind !== "debt_observation") return reject("invalid_artifact_reference");
      }

      // Forbidden fields for ARCHITECTURE_DEBT
      if (checkFieldPresent(finding, "rootCause")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "scopeExpansionRationale")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "remediationItems")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "testMatrix")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "exhaustivenessDecision")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "compatibilityDecision")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "compatibilityApprovalSource")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "compatibilityJustification")) return reject("invalid_shape");

      return undefined;
    }

    case "OBSERVATION": {
      // Required: non-empty surface.inspected
      if (!finding.surface || !finding.surface.inspected || finding.surface.inspected.length === 0) {
        return reject("invalid_shape");
      }
      // Required: summary is a bounded safe string (already validated by finding loop)

      // Forbidden fields for OBSERVATION
      if (checkFieldPresent(finding, "rootCause")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "scopeExpansionRationale")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "remediationItems")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "testMatrix")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "exhaustivenessDecision")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "compatibilityDecision")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "compatibilityApprovalSource")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "compatibilityJustification")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "debtImpact")) return reject("invalid_shape");
      if (checkFieldPresent(finding, "debtObservationReference")) return reject("invalid_shape");

      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Check whether a field is present (not undefined) on an object.
 * Pure helper used by validateDispositionFieldMatrix.
 */
function checkFieldPresent(obj: unknown, field: string): boolean {
  return typeof obj === "object" && obj !== null && (obj as Record<string, unknown>)[field] !== undefined;
}

