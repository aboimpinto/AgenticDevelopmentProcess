/**
 * FEAT-064 Phase 6: Review Contract Integration Adapter.
 *
 * Explicit protocol-selected review boundary for new FEAT-064 review-contract
 * artifacts. This adapter provides the exclusive entry point for callers that
 * request an FEAT-064 artifact: it validates the version/kind envelope, loads
 * the strict catalog for rule reference resolution, routes to the correct
 * Phase 3 pure validator, and returns either a validated artifact with a safe
 * projection or a deterministic sanitized refusal.
 *
 * This module implements the "explicit protocol selection" from the Phase 1
 * planning report:
 *   1. Callers that invoke the Safety Kernel continue passing `SafetyKernelManifest`
 *      to its existing validator/enforcement flow (unchanged).
 *   2. Callers that request an FEAT-064 artifact invoke this adapter and receive
 *      only its validated artifact or sanitized refusal.
 *   3. No adapter converts legacy Markdown, `SafetyKernelManifest`,
 *      `FixerRemediationResponse`, or `VerificationReceipt` into a review-contract
 *      artifact merely to make it appear authoritative.
 *
 * Key properties:
 * - **No persistence side effects:** This adapter never writes to SQLite or any
 *   other storage. It validates and returns a result for the caller to act on.
 * - **No legacy fallback:** A rejected or invalid new-contract artifact returns a
 *   deterministic safe refusal. It never falls back to Markdown authority, legacy
 *   manifest parsing, or the legacy persistence lane.
 * - **Explicit predecessor context:** Non-manifest artifacts (response, receipt,
 *   replan, debt) require the caller to provide a previously validated manifest
 *   context. The adapter does not re-fetch or re-validate the predecessor (that
 *   is FEAT-065's responsibility for persisted store, or the caller's responsibility
 *   for in-memory validation chains).
 * - **Stateless after load:** After loading the strict catalog, all validation steps
 *   are pure and side-effect free.
 */

import { canonicalizeReviewArtifact, computeReviewArtifactHash, type ArtifactKind, type ArtifactScope, type ReviewArtifact, type ReviewContractRejection, isRejection, isValidProjectRelativePath, REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES } from "./review-contract-types.js";

import {
  type ManifestPredecessorContext,
  type PolicyProjection,
  type PolicyResult,
  type ResponsePredecessorContext,
  validateReviewManifest,
  validateRemediationResponse,
  validateVerificationReceipt,
  validateReplanPlan,
  validateDebtObservation,
  type ManifestValidationInput,
} from "./review-contract-policy.js";
import {
  type CatalogResult,
  type StrictActiveRuleCatalog,
  loadStrictActiveRuleCatalog,
  resolveStrictActiveRule,
} from "./review-contract-catalog.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Integration result for a validated new-contract artifact.
 *
 * `valid: true` carries the validated artifact and a safe projection for
 * rendering/comparison. `valid: false` carries a deterministic sanitized
 * refusal with no raw rejected content.
 */
export type ReviewContractIntegrationResult =
  | { valid: true; artifact: ReviewArtifact; projection: PolicyProjection }
  | ReviewContractRejection;

/**
 * Opaque, module-private provenance for successful adapter results. The
 * ingestion service can verify this capability, but callers cannot create it
 * from a structural `valid: true` wrapper. Capturing both object identities
 * and canonical values also rejects a result whose artifact or projection was
 * changed after validation.
 */
interface TrustedValidationProvenance {
  readonly artifact: ReviewArtifact;
  readonly projection: PolicyProjection;
  readonly canonicalJson: string;
  readonly contentHash: string;
  readonly artifactKind: ArtifactKind;
  readonly artifactId: string;
  readonly schemaVersion: 1;
  readonly scope: ArtifactScope;
}

const trustedValidationSuccesses = new WeakMap<object, TrustedValidationProvenance>();

function trustedValidationSuccess(
  artifact: ReviewArtifact,
  projection: PolicyProjection,
): Extract<ReviewContractIntegrationResult, { valid: true }> {
  const result = { valid: true as const, artifact, projection };
  trustedValidationSuccesses.set(result, {
    artifact,
    projection,
    canonicalJson: canonicalizeReviewArtifact(artifact),
    contentHash: computeReviewArtifactHash(artifact),
    artifactKind: artifact.artifactKind,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    scope: { ...artifact.scope },
  });
  return result;
}

/**
 * Verify the opaque success provenance at the trusted validation/ingestion
 * boundary. This is deliberately not a caller-supplied brand or public data
 * field: only this module can register a direct validator return object.
 */
export function hasTrustedReviewContractValidationProvenance(
  candidate: unknown,
): candidate is Extract<ReviewContractIntegrationResult, { valid: true }> {
  if (typeof candidate !== "object" || candidate === null) return false;
  const provenance = trustedValidationSuccesses.get(candidate);
  if (!provenance) return false;
  const result = candidate as Partial<Extract<ReviewContractIntegrationResult, { valid: true }>>;
  if (result.valid !== true || result.artifact !== provenance.artifact || result.projection !== provenance.projection) return false;
  try {
    const artifact = provenance.artifact;
    const projection = provenance.projection;
    return artifact.artifactKind === provenance.artifactKind
      && artifact.artifactId === provenance.artifactId
      && artifact.schemaVersion === provenance.schemaVersion
      && artifact.scope.projectId === provenance.scope.projectId
      && artifact.scope.featureId === provenance.scope.featureId
      && artifact.scope.phaseNumber === provenance.scope.phaseNumber
      && artifact.scope.reviewGateId === provenance.scope.reviewGateId
      && canonicalizeReviewArtifact(artifact) === provenance.canonicalJson
      && computeReviewArtifactHash(artifact) === provenance.contentHash
      && projection.artifactKind === provenance.artifactKind
      && projection.artifactId === provenance.artifactId
      && projection.schemaVersion === provenance.schemaVersion
      && projection.contentHash === provenance.contentHash
      && projection.scope.projectId === provenance.scope.projectId
      && projection.scope.featureId === provenance.scope.featureId
      && projection.scope.phaseNumber === provenance.scope.phaseNumber
      && projection.scope.reviewGateId === provenance.scope.reviewGateId;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Strict catalog loading
// ---------------------------------------------------------------------------

/**
 * Load and validate the strict active rule catalog from the project root.
 *
 * Returns the validated catalog or a sanitized rejection.
 * For callers that already have a catalog loaded (e.g., from a previous
 * validation or a test fixture), pass it directly via options.catalog
 * instead of calling this function.
 *
 * This is the only I/O operation on the new-contract validation path.
 */
export function loadStrictCatalogForReview(
  projectRoot: string,
): CatalogResult {
  return loadStrictActiveRuleCatalog(projectRoot);
}

// ---------------------------------------------------------------------------
// Envelope pre-validation and routing
// ---------------------------------------------------------------------------

/**
 * Parse the artifact kind and schema version from a raw JSON payload without
 * performing full validation. Used for routing decisions before invoking the
 * artifact-specific validator.
 *
 * Returns the artifact kind on success, or a ReviewContractRejection when the
 * envelope cannot be read (malformed JSON, missing kind, missing/unsupported
 * schema version).
 */
function parseArtifactEnvelope(
  rawPayload: string,
): { kind: ArtifactKind; schemaVersion: number } | ReviewContractRejection {
  // Early size check: reject oversized payloads before expensive JSON parsing
  if (Buffer.byteLength(rawPayload, "utf8") > REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES) {
    return {
      valid: false,
      code: "size_limit_exceeded",
      message: "Artifact exceeds a supported size limit.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return {
      valid: false,
      code: "invalid_shape",
      message: "Artifact has an invalid structure.",
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      code: "invalid_shape",
      message: "Artifact has an invalid structure.",
    };
  }

  const obj = parsed as Record<string, unknown>;

  // Reject missing or non-string artifact kind
  if (typeof obj.artifactKind !== "string") {
    return {
      valid: false,
      code: "invalid_shape",
      message: "Artifact has an invalid structure.",
    };
  }

  const kind = obj.artifactKind;

  // Validate against known kinds before accepting
  const knownKinds: readonly string[] = [
    "review_manifest",
    "remediation_response",
    "verification_receipt",
    "replan_plan",
    "debt_observation",
  ];

  if (!(knownKinds as readonly string[]).includes(kind)) {
    return {
      valid: false,
      code: "unsupported_schema_version",
      message: "Artifact schema version is not supported.",
    };
  }

  // Reject missing or non-number schema version
  if (typeof obj.schemaVersion !== "number") {
    return {
      valid: false,
      code: "unsupported_schema_version",
      message: "Artifact schema version is not supported.",
    };
  }

  // Schema version 1 is the only supported version for all kinds
  if (obj.schemaVersion !== 1) {
    return {
      valid: false,
      code: "unsupported_schema_version",
      message: "Artifact schema version is not supported.",
    };
  }

  return { kind: kind as ArtifactKind, schemaVersion: obj.schemaVersion };
}

// ---------------------------------------------------------------------------
// Main validation entry point
// ---------------------------------------------------------------------------

/**
 * Options for validateReviewContractArtifact.
 */
export interface ReviewContractValidationOptions {
  /**
   * Project root path for loading the strict catalog.
   * Required for artifacts that resolve rule references
   * (manifest, debt observation). Optional when catalog is provided directly.
   */
  readonly projectRoot?: string;

  /**
   * Pre-loaded strict catalog. When provided, the adapter skips catalog loading
   * and uses this catalog directly. Useful for test fixtures or callers that
   * already have the catalog loaded.
   */
  readonly catalog?: StrictActiveRuleCatalog;

  /**
   * Validated manifest predecessor context. Required for non-manifest artifacts
   * (remediation_response, verification_receipt, replan_plan, debt_observation).
   * The caller must pass the context from a previously validated manifest.
   */
  readonly manifestContext?: ManifestPredecessorContext;

  /**
   * Validated response predecessor context. Required only for verification_receipt
   * artifacts. The caller must pass the context from a previously validated
   * remediation_response.
   */
  readonly responseContext?: ResponsePredecessorContext;

  /**
   * Feature root path for feature-bound path validation.
   * When provided, artifact paths must stay within this directory.
   */
  readonly featurePath?: string;

  /**
   * The exact workflow scope a review manifest is allowed to represent.
   *
   * This is deliberately caller-provided rather than inferred from the
   * artifact: a syntactically valid manifest for another project, feature,
   * phase, or gate is not authoritative for the current workflow.
   */
  readonly expectedManifestScope?: ArtifactScope;
}

function rejectInvalidArtifactShape(): ReviewContractRejection {
  return {
    valid: false,
    code: "invalid_shape",
    message: "Artifact has an invalid structure.",
  };
}

function matchesExpectedScope(
  scope: ArtifactScope,
  expectedScope: ArtifactScope,
): boolean {
  return scope.projectId === expectedScope.projectId
    && scope.featureId === expectedScope.featureId
    && scope.phaseNumber === expectedScope.phaseNumber
    && scope.reviewGateId === expectedScope.reviewGateId;
}

/**
 * Validate a new-contract review artifact from a raw JSON payload.
 *
 * This is the exclusive entry point for callers that request FEAT-064 artifact
 * validation. It:
 * 1. Parses the JSON envelope to determine artifact kind and schema version.
 * 2. Loads the strict catalog (when projectRoot is provided and no catalog is
 *    given, and the artifact kind requires rule resolution).
 * 3. Routes to the correct Phase 3 pure validator based on artifact kind.
 * 4. Returns a typed validation result with a safe projection for consumption.
 *
 * The adapter has **no persistence side effects**. It never writes to SQLite,
 * never imports legacy Safety Kernel code, and never falls back to Markdown
 * authority or legacy manifest persistence.
 *
 * @param rawPayload - Raw JSON payload of the artifact.
 * @param options - Validation options.
 * @returns A typed result: valid artifact + projection, or sanitized rejection.
 */
export function validateReviewContractArtifact(
  rawPayload: string,
  options?: ReviewContractValidationOptions,
): ReviewContractIntegrationResult {
  // --- Step 1: Parse envelope for routing ---
  const envelope = parseArtifactEnvelope(rawPayload);
  if (isRejection(envelope)) return envelope;

  const { kind } = envelope;

  // --- Step 1b: Validate featurePath when supplied ---
  if (options?.featurePath !== undefined && !isValidProjectRelativePath(options.featurePath)) {
    return {
      valid: false,
      code: "invalid_feature_path",
      message: "Artifact path is outside the allowed feature boundary.",
    };
  }

  // --- Step 2: Load strict catalog when needed ---
  let catalog: StrictActiveRuleCatalog | undefined = options?.catalog;
  const needsCatalog = kind === "review_manifest" || kind === "debt_observation";

  if (needsCatalog && catalog === undefined) {
    if (!options?.projectRoot) {
      return {
        valid: false,
        code: "invalid_shape",
        message: "Artifact has an invalid structure.",
      };
    }
    const catalogResult = loadStrictActiveRuleCatalog(options.projectRoot);
    if ("valid" in catalogResult && !(catalogResult as { valid: false }).valid) {
      const rejection = catalogResult as { code: string; message: string };
      return {
        valid: false as const,
        code: mapCatalogCode(rejection.code),
        message: rejection.message,
      };
    }
    catalog = catalogResult as StrictActiveRuleCatalog;
  }

  // --- Step 3: Route to kind-specific validator ---

  switch (kind) {
    case "review_manifest": {
      if (!catalog) {
        // Should not happen: needsCatalog ensured catalog is loaded above
        return {
          valid: false,
          code: "invalid_shape",
          message: "Artifact has an invalid structure.",
        };
      }
      const input: ManifestValidationInput = {
        value: JSON.parse(rawPayload),
        catalog,
        featurePath: options?.featurePath,
        rawPayload,
      };
      const manifestResult = validateReviewManifest(input);
      if (!manifestResult.valid) {
        return { valid: false, code: manifestResult.code, message: manifestResult.message };
      }
      if (options?.expectedManifestScope
        && !matchesExpectedScope(manifestResult.value.manifest.scope, options.expectedManifestScope)) {
        return rejectInvalidArtifactShape();
      }
      return trustedValidationSuccess(
        manifestResult.value.manifest,
        manifestResult.projection,
      );
    }

    case "remediation_response": {
      if (!options?.manifestContext) {
        return {
          valid: false,
          code: "invalid_artifact_reference",
          message: "Artifact reference is invalid.",
        };
      }
      const result = validateRemediationResponse(
        JSON.parse(rawPayload),
        options.manifestContext,
        rawPayload,
        options.featurePath,
      );
      return mapPolicyResult(result);
    }

    case "verification_receipt": {
      if (!options?.manifestContext || !options?.responseContext) {
        return {
          valid: false,
          code: "invalid_artifact_reference",
          message: "Artifact reference is invalid.",
        };
      }
      const result = validateVerificationReceipt(
        JSON.parse(rawPayload),
        options.manifestContext,
        options.responseContext,
        rawPayload,
        options.featurePath,
      );
      return mapPolicyResult(result);
    }

    case "replan_plan": {
      if (!options?.manifestContext) {
        return {
          valid: false,
          code: "invalid_artifact_reference",
          message: "Artifact reference is invalid.",
        };
      }
      const result = validateReplanPlan(
        JSON.parse(rawPayload),
        options.manifestContext,
        rawPayload,
        options.featurePath,
      );
      return mapPolicyResult(result);
    }

    case "debt_observation": {
      if (!options?.manifestContext) {
        return {
          valid: false,
          code: "invalid_artifact_reference",
          message: "Artifact reference is invalid.",
        };
      }
      const result = validateDebtObservation(
        JSON.parse(rawPayload),
        options.manifestContext,
        rawPayload,
        options.featurePath,
        catalog,
      );
      return mapPolicyResult(result);
    }

    default: {
      // Unknown kind (defensive — parseArtifactEnvelope should have rejected it)
      return {
        valid: false,
        code: "unsupported_schema_version",
        message: "Artifact schema version is not supported.",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

/**
 * Map a CatalogRejection code to the nearest ReviewContractRejectionCode.
 * Catalog-specific codes are normalized to the closest review-contract equivalent
 * so the integration result type remains consistent.
 */
function mapCatalogCode(code: string): ReviewContractRejection["code"] {
  if (code === "unsupported_catalog_schema_version") return "unsupported_schema_version";
  if (code === "size_limit_exceeded") return "size_limit_exceeded";
  if (code === "depth_limit_exceeded") return "depth_limit_exceeded";
  // invalid_catalog, invalid_rule_lifecycle, and any other code
  return "invalid_shape";
}

/**
 * Map a PolicyResult to the integration result type.
 */
function mapPolicyResult<T extends ReviewArtifact>(
  result: PolicyResult<T>,
): ReviewContractIntegrationResult {
  if (!result.valid) {
    return {
      valid: false,
      code: result.code,
      message: result.message,
    };
  }
  return trustedValidationSuccess(result.value, result.projection);
}

// ---------------------------------------------------------------------------
// Catalog snapshot resolution (re-exported for convenience)
// ---------------------------------------------------------------------------

/**
 * Re-export of resolveStrictActiveRule for integration callers.
 * Pure function: no I/O, no side effects.
 */
export { resolveStrictActiveRule } from "./review-contract-catalog.js";
