/**
 * FEAT-064: Versioned Review Contract Runtime Types and Canonical Identity.
 *
 * Defines all v1 structured review contract shapes: manifest, finding/surface,
 * rule snapshot, remediation response, verification receipt, replan plan,
 * and debt observation. Provides deterministic canonical JSON serialization
 * and SHA-256 identity with fixed equivalence/change vectors.
 *
 * This module is additive and backward-compatible. Existing Safety Kernel
 * types (SafetyKernelManifest, SafetyKernelFinding, etc.) remain unchanged.
 * New review-contract validators are separate exports; no legacy type is
 * reinterpreted or backfilled.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Limits (from planning report §5.2 T1.3 frozen constraints)
// ---------------------------------------------------------------------------

/** Maximum UTF-8 payload bytes for a review artifact. */
export const REVIEW_ARTIFACT_MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KiB

/** Maximum object/array nesting depth for a review artifact. */
export const REVIEW_ARTIFACT_MAX_DEPTH = 16;

/** Maximum characters for an ordinary textual field. */
export const REVIEW_ARTIFACT_MAX_STRING_LENGTH = 4_096;

/** Maximum characters for an identifier field. */
export const REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH = 128;

/** Maximum entries in a collection (findings, surface entries, etc.). */
export const REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES = 128;

/** Maximum findings in a manifest. */
export const REVIEW_ARTIFACT_MAX_FINDINGS = 64;

/** Maximum remediation/test items per finding. */
export const REVIEW_ARTIFACT_MAX_ITEMS_PER_FINDING = 64;

/** Maximum characters for a project-relative path. */
export const REVIEW_ARTIFACT_MAX_PATH_LENGTH = 512;

/** Maximum feature-relative path length (feature root relative, includes path within feature). */
export const REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH = 1024;

/** Maximum predecessor references in one lineage. */
export const REVIEW_ARTIFACT_MAX_PREDECESSORS = 64;

/** Maximum characters for a SHA-256 hex hash. */
export const SHA256_HEX_LENGTH = 64;

// ---------------------------------------------------------------------------
// Identifiers and path validation
// ---------------------------------------------------------------------------

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const RULE_REF_RE = /^rule:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const AC_REF_RE = /^ac:[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-zA-Z0-9_-]+$/;

export function isValidKebabCaseIdentifier(value: string, maxLength = REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH): boolean {
  return value.length > 0 && value.length <= maxLength && KEBAB_CASE_RE.test(value);
}

export function isValidSemVer(value: string): boolean {
  return value.length > 0 && value.length <= 32 && SEMVER_RE.test(value);
}

export function isValidSha256Hex(value: string): boolean {
  return value.length === SHA256_HEX_LENGTH && SHA256_HEX_RE.test(value);
}

export function isValidRuleReference(value: string): boolean {
  return value.length > 0 && value.length <= 132 && RULE_REF_RE.test(value);
}

export function isValidAcceptanceCriterionReference(value: string): boolean {
  return value.length > 0 && value.length <= 256 && AC_REF_RE.test(value);
}

/**
 * Validate a project-relative POSIX path.
 * Accepts relative paths; rejects absolute paths, Windows drive letters,
 * backslashes, NUL bytes, empty segments, '.'/'..' segments.
 */
export function isValidProjectRelativePath(value: string): boolean {
  if (value.length === 0 || value.length > REVIEW_ARTIFACT_MAX_PATH_LENGTH) return false;
  if (value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:[/\\]/.test(value)) return false;
  // Reject URI scheme prefixes (file:, http:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.includes("//")) return false;
  // Reject trailing slash (empty trailing segment)
  if (value.endsWith("/")) return false;
  const segments = value.split("/");
  if (segments.some((s) => s === "." || s === "..")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Allowed predecessor artifact kinds for each artifact kind
// (from planning report §5.1 lineage table)
// ---------------------------------------------------------------------------

export const ALLOWED_PREDECESSOR_KINDS: Record<ArtifactKind, readonly ArtifactKind[]> = {
  // Each artifact kind permits only itself in lineage.
  // Cross-artifact relations (e.g., manifestReference, responseReference)
  // use dedicated reference fields, not lineage predecessors.
  review_manifest: ["review_manifest"],
  remediation_response: ["remediation_response"],
  verification_receipt: ["verification_receipt"],
  replan_plan: ["replan_plan"],
  debt_observation: ["debt_observation"],
} as const;

export function isValidArtifactReference(ref: unknown): ref is ArtifactReference {
  if (typeof ref !== "object" || ref === null) return false;
  const r = ref as Record<string, unknown>;
  if (!r.artifactKind || !r.artifactId || !r.contentHash || !r.relativePath) return false;
  if (!ARTIFACT_KINDS.includes(r.artifactKind as ArtifactKind)) return false;
  // Runtime type checks before string validation — malformed truthy values
  // (e.g., an object as relativePath) must return false without throwing.
  if (typeof r.artifactId !== "string" || !isValidKebabCaseIdentifier(r.artifactId)) return false;
  if (typeof r.contentHash !== "string" || !isValidSha256Hex(r.contentHash)) return false;
  if (typeof r.relativePath !== "string" || !isValidProjectRelativePath(r.relativePath)) return false;
  // Reject unknown keys
  const allowed = new Set(["artifactKind", "artifactId", "contentHash", "relativePath"]);
  if (Object.keys(r).some((k) => !allowed.has(k))) return false;
  return true;
}

/**
 * Validate that lineage references are well-formed:
 * - No self-reference (lineage must not reference the current artifactId)
 * - Every predecessor matches the allowed kinds for this artifactKind
 * - No duplicate predecessor artifactId
 * - Supersedes reference is well-formed (when present)
 * - Supersedes reference must not be the current artifact
 *
 * Does NOT perform persisted-graph cycle detection (FEAT-065 owns that).
 */
export function isValidArtifactLineage(
  lineage: unknown,
  currentArtifactId: string,
  currentArtifactKind: ArtifactKind,
  currentScope: ArtifactScope,
): boolean {
  if (typeof lineage !== "object" || lineage === null) return false;
  const l = lineage as Record<string, unknown>;

  // Reject unknown keys
  const allowed = new Set(["predecessors", "supersedes"]);
  if (Object.keys(l).some((k) => !allowed.has(k))) return false;

  // Validate predecessors
  if (l.predecessors !== undefined) {
    if (!Array.isArray(l.predecessors)) return false;
    if (l.predecessors.length === 0 || l.predecessors.length > REVIEW_ARTIFACT_MAX_PREDECESSORS) return false;

    const allowedKinds = ALLOWED_PREDECESSOR_KINDS[currentArtifactKind];
    const seenIds = new Set<string>();

    for (const pred of l.predecessors) {
      if (!isValidArtifactReference(pred)) return false;
      // No self-reference
      if (pred.artifactId === currentArtifactId) return false;
      // Check kind compatibility
      if (!allowedKinds.includes(pred.artifactKind)) return false;
      // No duplicate predecessor IDs
      if (seenIds.has(pred.artifactId)) return false;
      seenIds.add(pred.artifactId);
    }
  }

  // Validate supersedes (optional single reference)
  if (l.supersedes !== undefined) {
    if (typeof l.supersedes !== "object" || l.supersedes === null) return false;
    if (!isValidArtifactReference(l.supersedes)) return false;
    // No self-reference
    if ((l.supersedes as ArtifactReference).artifactId === currentArtifactId) return false;
    // Supersedes must match the current artifact kind
    if ((l.supersedes as ArtifactReference).artifactKind !== currentArtifactKind) return false;
  }

  return true;
}

/**
 * Validate that a path stays within a feature directory boundary.
 * The feature path is a project-relative prefix (e.g., "MemoryBank/Features/03_IN_PROGRESS/FEAT-064").
 * The candidate path must be a valid project-relative path that is
 * inside or equal to the feature path prefix.
 */
export function isFeatureBoundPath(
  path: string,
  featurePath: string,
): boolean {
  if (path.length === 0 || path.length > REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH) return false;
  if (!isValidProjectRelativePath(path)) return false;
  if (!isValidProjectRelativePath(featurePath)) return false;

  // The path must start with the feature path as a directory prefix
  // (feature path itself, or feature path + "/" + more segments)
  if (path === featurePath) return true;
  if (path.startsWith(featurePath + "/")) return true;
  return false;
}

/**
 * Combined validator: project-relative path + feature-bound check.
 * Returns a ReviewContractRejectionCode for the specific failure or undefined when valid.
 */
export function validateReviewContractPath(
  path: string,
  featurePath: string | undefined,
): ReviewContractRejectionCode | undefined {
  if (!isValidProjectRelativePath(path)) return "invalid_project_path";
  if (featurePath !== undefined && !isFeatureBoundPath(path, featurePath)) return "invalid_feature_path";
  return undefined;
}

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

export type ArtifactKind =
  | "review_manifest"
  | "remediation_response"
  | "verification_receipt"
  | "replan_plan"
  | "debt_observation";

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "review_manifest",
  "remediation_response",
  "verification_receipt",
  "replan_plan",
  "debt_observation",
] as const;

export interface ArtifactScope {
  readonly projectId: string;
  readonly featureId: string;
  readonly phaseNumber: number;
  readonly reviewGateId: string;
}

export interface ArtifactReference {
  readonly artifactKind: ArtifactKind;
  readonly artifactId: string;
  readonly contentHash: string;
  readonly relativePath: string;
}

export interface ArtifactLineage {
  readonly predecessors?: readonly ArtifactReference[];
  readonly supersedes?: ArtifactReference;
}

// ---------------------------------------------------------------------------
// Surface types
// ---------------------------------------------------------------------------

export interface SurfaceEntry {
  readonly surfaceId: string;
  readonly relativePath: string;
  readonly symbol?: string;
  readonly endpoint?: string;
  readonly rationale?: string;
}

export interface Surface {
  readonly inspected: readonly SurfaceEntry[];
  readonly affected: readonly SurfaceEntry[];
  readonly confirmedUnaffected: readonly SurfaceEntry[];
}

// ---------------------------------------------------------------------------
// Finding types
// ---------------------------------------------------------------------------

export type Disposition = "IN_SCOPE_BLOCKER" | "SCOPE_EXPANSION" | "ARCHITECTURE_DEBT" | "OBSERVATION";
export type Severity = "blocker" | "required" | "note" | "info";
export type ClaimType = "architecture" | "security" | "policy" | "quality" | "feature_correctness";
export type ExhaustivenessDecision = "local_only" | "cross_cutting_complete" | "replan_required";
export type CompatibilityDecision = "breaking_change_permitted" | "backward_compatibility_required";

export const VALID_DISPOSITIONS: readonly Disposition[] = [
  "IN_SCOPE_BLOCKER", "SCOPE_EXPANSION", "ARCHITECTURE_DEBT", "OBSERVATION",
] as const;

export const VALID_SEVERITIES: readonly Severity[] = [
  "blocker", "required", "note", "info",
] as const;

export const VALID_CLAIM_TYPES: readonly ClaimType[] = [
  "architecture", "security", "policy", "quality", "feature_correctness",
] as const;

export interface ActiveRuleAuthority {
  readonly kind: "active_rule";
  readonly reference: string;
  readonly snapshot: ActiveRuleSnapshotV1;
}

export interface AcceptanceCriterionAuthority {
  readonly kind: "acceptance_criterion";
  readonly reference: string;
  readonly source: {
    readonly relativePath: string;
    readonly section: string;
  };
}

export type Authority = ActiveRuleAuthority | AcceptanceCriterionAuthority;

export interface RemediationItem {
  readonly remediationItemId: string;
  readonly instruction: string;
  readonly targetSurfaceIds: readonly string[];
}

export interface TestMatrixItem {
  readonly testId: string;
  readonly requirement: string;
  readonly targetSurfaceIds: readonly string[];
}

export interface ReviewFinding {
  readonly findingId: string;
  readonly disposition: Disposition;
  readonly claimType: ClaimType;
  readonly authority: Authority;
  readonly defectClass: string;
  readonly severity: Severity;
  readonly summary: string;
  readonly surface: Surface;
  readonly rootCause?: string;
  readonly scopeExpansionRationale?: string;
  readonly remediationItems?: readonly RemediationItem[];
  readonly testMatrix?: readonly TestMatrixItem[];
  readonly exhaustivenessDecision?: ExhaustivenessDecision;
  /** Required for blocker and scope-expansion findings. */
  readonly compatibilityDecision?: CompatibilityDecision;
  /** Required only when compatibilityDecision is backward_compatibility_required. */
  readonly compatibilityApprovalSource?: string;
  /** Required only when compatibilityDecision is backward_compatibility_required. */
  readonly compatibilityJustification?: string;
  readonly debtImpact?: "untouched_non_blocking";
  readonly debtObservationReference?: ArtifactReference;
}

// ---------------------------------------------------------------------------
// Active rule snapshot (v1)
// ---------------------------------------------------------------------------

export interface ActiveRuleSnapshotV1 {
  readonly schemaVersion: 1;
  readonly catalogSchemaVersion: 1;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly category: "architecture" | "security" | "policy" | "quality";
  readonly scope: string;
  readonly title: string;
  readonly source: {
    readonly document: string;
    readonly section: string;
  };
  readonly catalogPath: ".hepha/architecture-rules.yaml";
  readonly catalogSourceHash: string;
  readonly ruleHash: string;
}

// ---------------------------------------------------------------------------
// Common envelope
// ---------------------------------------------------------------------------

export interface ReviewContractEnvelope {
  readonly schemaVersion: 1;
  readonly artifactKind: ArtifactKind;
  readonly artifactId: string;
  readonly scope: ArtifactScope;
  readonly lineage?: ArtifactLineage;
}

// ---------------------------------------------------------------------------
// Review manifest
// ---------------------------------------------------------------------------

export type ManifestResult = "APPROVED" | "NEEDS_CHANGES" | "BLOCKED";

export interface ReviewManifest extends ReviewContractEnvelope {
  readonly artifactKind: "review_manifest";
  readonly result: ManifestResult;
  readonly blockerReason?: string;
  readonly ruleSnapshots: readonly ActiveRuleSnapshotV1[];
  readonly findings: readonly ReviewFinding[];
}

// ---------------------------------------------------------------------------
// Remediation response
// ---------------------------------------------------------------------------

export type RemediationDecision = "APPLIED" | "NOT_APPLIED" | "NOT_APPLICABLE";

export interface RemediationItemResponse {
  readonly remediationItemId: string;
  readonly decision: RemediationDecision;
  readonly changedSurfaceIds: readonly string[];
  readonly rationale: string;
}

export interface FindingResponse {
  readonly findingId: string;
  readonly items: readonly RemediationItemResponse[];
}

export interface SuspectedOutOfScopeObservation {
  readonly relativePath: string;
  readonly rationale: string;
}

export interface RemediationResponse extends ReviewContractEnvelope {
  readonly artifactKind: "remediation_response";
  readonly manifestReference: ArtifactReference;
  readonly findingResponses: readonly FindingResponse[];
  readonly suspectedOutOfScopeObservations?: readonly SuspectedOutOfScopeObservation[];
}

// ---------------------------------------------------------------------------
// Verification receipt
// ---------------------------------------------------------------------------

export type ItemOutcome = "VERIFIED" | "FAILED" | "NOT_VERIFIABLE";
export type TestOutcome = "PASSED" | "FAILED" | "NOT_RUN" | "NOT_VERIFIABLE";

export interface ItemReceipt {
  readonly findingId: string;
  readonly remediationItemId: string;
  readonly outcome: ItemOutcome;
  readonly evidence: string;
}

export interface TestReceipt {
  readonly findingId: string;
  readonly testId: string;
  readonly outcome: TestOutcome;
  readonly evidence: string;
}

export interface VerificationReceipt extends ReviewContractEnvelope {
  readonly artifactKind: "verification_receipt";
  readonly manifestReference: ArtifactReference;
  readonly responseReference: ArtifactReference;
  readonly itemReceipts: readonly ItemReceipt[];
  readonly testReceipts: readonly TestReceipt[];
}

// ---------------------------------------------------------------------------
// Replan plan
// ---------------------------------------------------------------------------

export type ReplanReason = "finding_exhaustiveness" | "recurrence_signal";

export interface ExclusionEntry {
  readonly relativePath: string;
  readonly rationale: string;
}

export interface ReplanPlan extends ReviewContractEnvelope {
  readonly artifactKind: "replan_plan";
  readonly manifestReference: ArtifactReference;
  readonly findingIds: readonly string[];
  readonly defectClass: string;
  readonly replanReason: ReplanReason;
  readonly rootCause: string;
  readonly surface: Surface;
  readonly explicitExclusions: readonly ExclusionEntry[];
  readonly remediationItems: readonly RemediationItem[];
  readonly testMatrix: readonly TestMatrixItem[];
  readonly verificationPlan: string;
  readonly closureCriteria: string;
}

// ---------------------------------------------------------------------------
// Debt observation
// ---------------------------------------------------------------------------

export interface DebtObservation extends ReviewContractEnvelope {
  readonly artifactKind: "debt_observation";
  readonly manifestReference: ArtifactReference;
  readonly findingId: string;
  readonly authority: ActiveRuleAuthority;
  readonly historicalSurface: readonly SurfaceEntry[];
  readonly evidence: string;
  readonly riskRationale: string;
  readonly currentFeatureImpact: "untouched_non_blocking";
}

// ---------------------------------------------------------------------------
// Union type for any validated review artifact
// ---------------------------------------------------------------------------

export type ReviewArtifact =
  | ReviewManifest
  | RemediationResponse
  | VerificationReceipt
  | ReplanPlan
  | DebtObservation;

// ---------------------------------------------------------------------------
// Canonical JSON serialization and SHA-256 identity
// ---------------------------------------------------------------------------
//
// Rules (from planning report §5.1):
// 1. Input is a fully validated JSON value. Reject duplicate member names,
//    undefined, functions, symbols, bigint, non-finite numbers.
// 2. Object keys sorted by UTF-16 code-unit ascending order.
// 3. Array order is semantic and preserved exactly.
// 4. Canonical bytes are UTF-8 encoding of JSON text.
// 5. Identity is lowercase hex SHA-256(canonicalUtf8Bytes).
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/**
 * Canonical JSON of a validated review artifact value.
 * Object keys sorted; array order preserved; no whitespace.
 * Throws on non-JSON-safe values (undefined, function, symbol, bigint, NaN, Infinity).
 */
export function canonicalizeReviewArtifact(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in review artifact");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeReviewArtifact).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeReviewArtifact(value[k])}`).join(",")}}`;
  }
  throw new Error(`Non-JSON-safe value in review artifact: ${typeof value}`);
}

/**
 * Compute SHA-256 identity of a validated artifact value.
 * The artifact MUST NOT contain its own content hash, storage path,
 * persistence timestamp, database key, transport ID, or rendered Markdown
 * (doing so would create a circular identity).
 */
export function computeReviewArtifactHash(value: unknown): string {
  const canonical = canonicalizeReviewArtifact(value);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Compute canonical identity for an artifact that has been validated.
 * Returns the lowercase SHA-256 hex digest.
 */
export function hashValidatedReviewArtifact(artifact: ReviewArtifact): string {
  return computeReviewArtifactHash(artifact);
}

// ---------------------------------------------------------------------------
// Fixed identity test vectors (from planning report §5.1)
// ---------------------------------------------------------------------------

export const V1_IDENTITY_TEST_VECTORS = {
  objectOrderEquivalence: {
    a: { b: 2, a: 1 },
    b: { a: 1, b: 2 },
    expectedCanonical: '{"a":1,"b":2}',
    expectedHash: "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
  },
  nestedAndArrayPreservation: {
    value: { z: [2, 1], a: { y: null, x: true } },
    expectedCanonical: '{"a":{"x":true,"y":null},"z":[2,1]}',
    expectedHash: "5971062a9aceb3baccf0aa18dba119fcd585ad505f50d2b2537d8e7b33dcd53e",
  },
  semanticArrayOrder: {
    value: { items: ["first", "second"] },
    expectedCanonical: '{"items":["first","second"]}',
    expectedHash: "6495b0561e8bffbb852cb2ac5e97a2b80a6766a0a9a21f891a0ef274bf6a8068",
  },
  semanticChange: {
    value: { items: ["second", "first"] },
    expectedCanonical: '{"items":["second","first"]}',
    expectedHash: "ee7ef66469ac5ddc91ecfdfbb04230c14c3c1f033731a0a409a3630f54e159fd",
  },
} as const;

// ---------------------------------------------------------------------------
// Rejection types (shared with catalog)
// ---------------------------------------------------------------------------

export type ReviewContractRejectionCode =
  | "invalid_shape"
  | "unsupported_schema_version"
  | "unknown_rule"
  | "inactive_rule"
  | "ambiguous_rule_reference"
  | "invalid_rule_snapshot"
  | "invalid_canonical_value"
  | "hash_mismatch"
  | "duplicate_id"
  | "invalid_predecessor_reference"
  | "invalid_self_reference"
  | "invalid_artifact_reference"
  | "unsafe_content"
  | "size_limit_exceeded"
  | "depth_limit_exceeded"
  | "invalid_project_path"
  | "invalid_feature_path";

export interface ReviewContractRejection {
  readonly valid: false;
  readonly code: ReviewContractRejectionCode;
  /** Safe, generic message — never contains rejected content. */
  readonly message: string;
}

export type ReviewContractResult<T> = T | ReviewContractRejection;

export function isRejection<T extends object>(result: ReviewContractResult<T>): result is ReviewContractRejection {
  return (result as ReviewContractRejection).valid === false;
}

// ---------------------------------------------------------------------------
// Safe string / secret detection (shared with safety-kernel-contract)
// ---------------------------------------------------------------------------

const secretPatterns = [
  /(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*[^\s]+/i,
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{12,}/,
];

export function isReviewContractSafeString(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= REVIEW_ARTIFACT_MAX_STRING_LENGTH
    && !secretPatterns.some((pattern) => pattern.test(value));
}

// ---------------------------------------------------------------------------
// Fixture builders for testing
// ---------------------------------------------------------------------------

export function buildValidArtifactScope(overrides?: Partial<ArtifactScope>): ArtifactScope {
  return {
    projectId: "hepha",
    featureId: "feat-064",
    phaseNumber: 2,
    reviewGateId: "code-review",
    ...overrides,
  };
}

export function buildValidArtifactReference(overrides?: Partial<ArtifactReference>): ArtifactReference {
  return {
    artifactKind: "review_manifest",
    artifactId: "manifest-001",
    contentHash: "a".repeat(64),
    relativePath: "reviews/manifest-001.json",
    ...overrides,
  };
}

export function buildValidSurfaceEntry(overrides?: Partial<SurfaceEntry>): SurfaceEntry {
  return {
    surfaceId: "src-lib-core-a",
    relativePath: "src/lib/core.ts",
    ...overrides,
  };
}

export function buildValidSurface(overrides?: Partial<Surface>): Surface {
  return {
    inspected: [buildValidSurfaceEntry({ surfaceId: "inspected-1", relativePath: "src/lib/core.ts" })],
    affected: [buildValidSurfaceEntry({ surfaceId: "affected-1", relativePath: "src/lib/core.ts" })],
    confirmedUnaffected: [buildValidSurfaceEntry({ surfaceId: "unaffected-1", relativePath: "src/lib/utils.ts" })],
    ...overrides,
  };
}

export function buildValidActiveRuleSnapshot(overrides?: Partial<ActiveRuleSnapshotV1>): ActiveRuleSnapshotV1 {
  return {
    schemaVersion: 1,
    catalogSchemaVersion: 1,
    ruleId: "secret-safe-governance-artifacts",
    ruleVersion: "1.0.0",
    category: "security",
    scope: "review-governance",
    title: "Secret-Safe Governance Artifacts",
    source: {
      document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md",
      section: "Secret Safety",
    },
    catalogPath: ".hepha/architecture-rules.yaml",
    catalogSourceHash: "a".repeat(64),
    ruleHash: "b".repeat(64),
    ...overrides,
  };
}

export function buildValidActiveRuleAuthority(overrides?: Partial<ActiveRuleAuthority>): ActiveRuleAuthority {
  return {
    kind: "active_rule",
    reference: "rule:secret-safe-governance-artifacts",
    snapshot: buildValidActiveRuleSnapshot(),
    ...overrides,
  };
}

export function buildValidFinding(overrides?: Partial<ReviewFinding>): ReviewFinding {
  return {
    findingId: "finding-001",
    disposition: "IN_SCOPE_BLOCKER",
    claimType: "security",
    authority: buildValidActiveRuleAuthority(),
    defectClass: "secret-exposure",
    severity: "blocker",
    summary: "Secret-like content detected in governance artifacts.",
    surface: buildValidSurface(),
    rootCause: "No pre-persistence secret validation.",
    remediationItems: [
      {
        remediationItemId: "fix-001",
        instruction: "Add secret validation before persistence.",
        targetSurfaceIds: ["affected-1"],
      },
    ],
    testMatrix: [
      {
        testId: "test-001",
        requirement: "Secret validation rejects known secret patterns.",
        targetSurfaceIds: ["affected-1"],
      },
    ],
    exhaustivenessDecision: "local_only",
    compatibilityDecision: "breaking_change_permitted",
    ...overrides,
  };
}

export function buildValidManifest(overrides?: Partial<ReviewManifest>): ReviewManifest {
  return {
    schemaVersion: 1,
    artifactKind: "review_manifest",
    artifactId: "manifest-001",
    scope: buildValidArtifactScope(),
    result: "NEEDS_CHANGES",
    ruleSnapshots: [buildValidActiveRuleSnapshot()],
    findings: [buildValidFinding()],
    ...overrides,
  };
}

export function buildValidRemediationResponse(overrides?: Partial<RemediationResponse>): RemediationResponse {
  return {
    schemaVersion: 1,
    artifactKind: "remediation_response",
    artifactId: "response-001",
    scope: buildValidArtifactScope(),
    manifestReference: buildValidArtifactReference(),
    findingResponses: [
      {
        findingId: "finding-001",
        items: [
          {
            remediationItemId: "fix-001",
            decision: "APPLIED",
            changedSurfaceIds: ["affected-1"],
            rationale: "Added pre-persistence secret validation.",
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function buildValidVerificationReceipt(overrides?: Partial<VerificationReceipt>): VerificationReceipt {
  return {
    schemaVersion: 1,
    artifactKind: "verification_receipt",
    artifactId: "receipt-001",
    scope: buildValidArtifactScope(),
    manifestReference: buildValidArtifactReference(),
    responseReference: buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-001" }),
    itemReceipts: [
      {
        findingId: "finding-001",
        remediationItemId: "fix-001",
        outcome: "VERIFIED",
        evidence: "Unit test passes for secret validation.",
      },
    ],
    testReceipts: [
      {
        findingId: "finding-001",
        testId: "test-001",
        outcome: "PASSED",
        evidence: "Unit test passes for secret pattern detection.",
      },
    ],
    ...overrides,
  };
}

export function buildValidReplanPlan(overrides?: Partial<ReplanPlan>): ReplanPlan {
  return {
    schemaVersion: 1,
    artifactKind: "replan_plan",
    artifactId: "replan-001",
    scope: buildValidArtifactScope(),
    manifestReference: buildValidArtifactReference(),
    findingIds: ["finding-001"],
    defectClass: "secret-exposure",
    replanReason: "finding_exhaustiveness",
    rootCause: "Systematic lack of secret validation across multiple surfaces.",
    surface: buildValidSurface(),
    explicitExclusions: [],
    remediationItems: [
      {
        remediationItemId: "replan-fix-001",
        instruction: "Add secret validation across all governance artifact entry points.",
        targetSurfaceIds: ["affected-1"],
      },
    ],
    testMatrix: [
      {
        testId: "replan-test-001",
        requirement: "All governance artifact entry points reject secrets.",
        targetSurfaceIds: ["affected-1"],
      },
    ],
    verificationPlan: "Run unit test suite and manual review of all touched surfaces.",
    closureCriteria: "No secret patterns detected in governance artifact pipeline.",
    ...overrides,
  };
}

export function buildValidDebtObservation(overrides?: Partial<DebtObservation>): DebtObservation {
  return {
    schemaVersion: 1,
    artifactKind: "debt_observation",
    artifactId: "debt-001",
    scope: buildValidArtifactScope(),
    manifestReference: buildValidArtifactReference(),
    findingId: "finding-arch-debt-001",
    authority: buildValidActiveRuleAuthority(),
    historicalSurface: [buildValidSurfaceEntry()],
    evidence: "Historical code lacks secret validation.",
    riskRationale: "Untouched historical noncompliance; not blocking current feature scope.",
    currentFeatureImpact: "untouched_non_blocking",
    ...overrides,
  };
}
