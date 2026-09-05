/**
 * Compatibility facade for pure review-contract validation policies.
 *
 * New production code should import the narrow module that owns the required
 * validation responsibility. Existing callers may continue importing this
 * facade while those call sites migrate.
 */

export {
  checkArtifactPathSafety,
  checkArtifactUnsafeContent,
  checkIdUniqueness,
  checkPayloadSizeAndDepth,
  type IdCollection,
  validateEnvelopeShape,
  validateSchemaVersion,
} from "./review-contract-policy/envelope-safety.js";
export type {
  ArtifactValidationPipeline,
  ManifestPredecessorContext,
  PolicyAccept,
  PolicyProjection,
  PolicyRejection,
  PolicyRejectionCode,
  PolicyResult,
  ResponsePredecessorContext,
} from "./review-contract-policy/policy-types.js";
export {
  resolveFindingAuthority,
  validateRuleSnapshot,
} from "./review-contract-policy/authority-validation.js";
export {
  validateReviewManifest,
  type ManifestValidationInput,
  type ManifestValidationOutput,
} from "./review-contract-policy/manifest-validation.js";
export { validateSurface } from "./review-contract-policy/surface-validation.js";
export {
  validateBlockerExpansionObligations,
  validateDispositionFieldMatrix,
} from "./review-contract-policy/finding-obligations.js";
export { validateRemediationResponse } from "./review-contract-policy/remediation-validation.js";
export { validateVerificationReceipt } from "./review-contract-policy/verification-receipt-validation.js";
export { validateReplanPlan } from "./review-contract-policy/replan-validation.js";
export { validateDebtObservation } from "./review-contract-policy/debt-observation-validation.js";
export { runValidationPipeline } from "./review-contract-policy/validation-pipeline.js";
