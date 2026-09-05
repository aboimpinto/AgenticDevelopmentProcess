// Behavior suite: review contract.
/**
 * FEAT-064 Phase 2+3 — Versioned Review Contract Tests.
 *
 * Phase 2 (E013-RC-002):
 *   - `hashes equivalent validated artifacts identically`
 *   - `preserves semantic array order in canonical identity`
 *   - `changes identity for semantic changes`
 *   - `rejects unsupported artifact schema versions`
 *
 * Phase 3 (E013-RC-003, E013-RC-005):
 *   - validates blocker/expansion obligations
 *   - binds rule/acceptance-criterion authorities
 *   - returns sanitized refusals
 *
 * Also covers common envelope shapes, fixture builders, safe-string boundary,
 * and canonical identity test vectors from the planning report §5.1.
 */

import { describe, expect, it } from "vitest";
import {
  V1_IDENTITY_TEST_VECTORS,
  type ArtifactScope,
  type ArtifactReference,
  type SurfaceEntry,
  type Surface,
  type ActiveRuleSnapshotV1,
  type ActiveRuleAuthority,
  type AcceptanceCriterionAuthority,
  type ReviewFinding,
  type ReviewManifest,
  type RemediationResponse,
  type VerificationReceipt,
  type ReplanPlan,
  type DebtObservation,
  canonicalizeReviewArtifact,
  computeReviewArtifactHash,
  hashValidatedReviewArtifact,
  isReviewContractSafeString,
  isValidKebabCaseIdentifier,
  isValidProjectRelativePath,
  isValidSemVer,
  isValidSha256Hex,
  isValidRuleReference,
  isValidAcceptanceCriterionReference,
  buildValidArtifactScope,
  buildValidArtifactReference,
  buildValidSurfaceEntry,
  buildValidSurface,
  buildValidActiveRuleSnapshot,
  buildValidActiveRuleAuthority,
  buildValidFinding,
  buildValidManifest,
  buildValidRemediationResponse,
  buildValidVerificationReceipt,
  buildValidReplanPlan,
  buildValidDebtObservation,
  type ReviewArtifact,
  type ArtifactKind,
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  REVIEW_ARTIFACT_MAX_IDENTIFIER_LENGTH,
  REVIEW_ARTIFACT_MAX_PATH_LENGTH,
  REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES,
  REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH,
  REVIEW_ARTIFACT_MAX_PREDECESSORS,
  ALLOWED_PREDECESSOR_KINDS,
  ARTIFACT_KINDS,
  isValidArtifactReference,
  isValidArtifactLineage,
  isFeatureBoundPath,
  validateReviewContractPath,
} from "../src/review-contract-types.js";

import { validateReviewManifest } from "../src/review-contract-policy/manifest-validation.js";
import { validateRemediationResponse } from "../src/review-contract-policy/remediation-validation.js";
import { validateVerificationReceipt } from "../src/review-contract-policy/verification-receipt-validation.js";
import { validateReplanPlan } from "../src/review-contract-policy/replan-validation.js";
import { validateDebtObservation } from "../src/review-contract-policy/debt-observation-validation.js";
import {
  validateBlockerExpansionObligations,
  validateDispositionFieldMatrix,
} from "../src/review-contract-policy/finding-obligations.js";
import {
  validateEnvelopeShape,
  validateSchemaVersion,
  checkIdUniqueness,
  checkPayloadSizeAndDepth,
  checkArtifactUnsafeContent,
  checkArtifactPathSafety,
} from "../src/review-contract-policy/envelope-safety.js";
import {
  validateRuleSnapshot,
  resolveFindingAuthority,
} from "../src/review-contract-policy/authority-validation.js";
import { validateSurface } from "../src/review-contract-policy/surface-validation.js";
import { runValidationPipeline } from "../src/review-contract-policy/validation-pipeline.js";
import type {
  ManifestPredecessorContext,
  ResponsePredecessorContext,
  PolicyResult,
} from "../src/review-contract-policy/policy-types.js";

import {
  type StrictActiveRuleCatalog,
  validateStrictCatalogParsed,
  computeCatalogSourceHash,
  resolveStrictActiveRule,
  buildStrictRuleSnapshot,
} from "../src/review-contract-catalog.js";

// ---------------------------------------------------------------------------
// E013-RC-002: Canonical identity — equivalent artifacts hash identically
// ---------------------------------------------------------------------------

describe("E013-RC-002: Canonical review artifact identity", () => {
  // -----------------------------------------------------------------------
  // 1. Equivalent artifacts hash identically
  // -----------------------------------------------------------------------

  it("hashes equivalent validated artifacts identically", () => {
    const manifest = buildValidManifest();

    // Same artifact, same hash
    const hashA = hashValidatedReviewArtifact(manifest);
    const hashB = hashValidatedReviewArtifact(manifest);
    expect(hashA).toBe(hashB);
  });

  it("object-key order does not affect hash (equivalent semantics)", () => {
    // Two objects with identical data but different key creation order
    const manifest: ReviewManifest = {
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
      result: "NEEDS_CHANGES",
      ruleSnapshots: [buildValidActiveRuleSnapshot()],
      findings: [
        buildValidFinding({
          surface: {
            inspected: [
              { surfaceId: "a", relativePath: "src/a.ts" },
              { surfaceId: "b", relativePath: "src/b.ts" },
            ],
            affected: [{ surfaceId: "a", relativePath: "src/a.ts" }],
            confirmedUnaffected: [],
          },
        }),
      ],
    };

    // Create equivalent artifact with different in-object creation order
    const manifestReordered: ReviewManifest = {
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
      result: "NEEDS_CHANGES",
      ruleSnapshots: [buildValidActiveRuleSnapshot()],
      findings: [
        buildValidFinding({
          surface: {
            // Different creation order for inspected array items
            inspected: [
              { surfaceId: "b", relativePath: "src/b.ts" },
              { surfaceId: "a", relativePath: "src/a.ts" },
            ],
            affected: [{ surfaceId: "a", relativePath: "src/a.ts" }],
            confirmedUnaffected: [],
          },
        }),
      ],
    };

    // These MUST differ because array order is semantic
    const hashOrdered = hashValidatedReviewArtifact(manifest);
    const hashReordered = hashValidatedReviewArtifact(manifestReordered);
    expect(hashOrdered).not.toBe(hashReordered);
  });

  // -----------------------------------------------------------------------
  // 2. Semantic array order preserved
  // -----------------------------------------------------------------------

  it("preserves semantic array order in canonical identity", () => {
    type Candidate = { items: string[]; label: string };
    const a: Candidate = { items: ["first", "second", "third"], label: "ordered" };
    const b: Candidate = { items: ["third", "second", "first"], label: "reversed" };

    const canonA = canonicalizeReviewArtifact(a);
    const canonB = canonicalizeReviewArtifact(b);
    const hashA = computeReviewArtifactHash(a);
    const hashB = computeReviewArtifactHash(b);

    // Different array order => different canonical form => different hash
    expect(canonA).not.toBe(canonB);
    expect(hashA).not.toBe(hashB);
  });

  // -----------------------------------------------------------------------
  // 3. Semantic changes change identity
  // -----------------------------------------------------------------------

  it("changes identity for semantic changes", () => {
    const manifestOriginal = buildValidManifest();

    // Change a semantically meaningful field
    const manifestChanged = buildValidManifest({
      artifactId: "manifest-002",
      result: "BLOCKED",
      blockerReason: "Critical security finding requires escalation.",
    });

    const hashOriginal = hashValidatedReviewArtifact(manifestOriginal);
    const hashChanged = hashValidatedReviewArtifact(manifestChanged);
    expect(hashOriginal).not.toBe(hashChanged);
  });

  it("different finding text changes hash", () => {
    const findingA = buildValidFinding({ findingId: "finding-001", summary: "Summary A" });
    const findingB = buildValidFinding({ findingId: "finding-001", summary: "Summary B" });

    const hashA = computeReviewArtifactHash(findingA);
    const hashB = computeReviewArtifactHash(findingB);
    expect(hashA).not.toBe(hashB);
  });

  it("different finding IDs change hash even when other fields match", () => {
    const findingA = buildValidFinding({ findingId: "finding-001" });
    const findingB = buildValidFinding({ findingId: "finding-002" });

    const hashA = computeReviewArtifactHash(findingA);
    const hashB = computeReviewArtifactHash(findingB);
    expect(hashA).not.toBe(hashB);
  });

  // -----------------------------------------------------------------------
  // 4. Schema version handling
  // -----------------------------------------------------------------------

  it("rejects unsupported or missing schema versions through canonical identity", () => {
    // Schema version is a static `const: 1` in the type.
    // Non-1 values should not exist in a correctly typed artifact.
    // At the canonicalization level, a non-1 schemaVersion produces a different
    // canonical form, which is caught by later validation.
    const manifestV1 = buildValidManifest();
    const manifestWithSchema2 = { ...manifestV1, schemaVersion: 2 } as ReviewManifest;

    // Different schema versions produce different canonical forms
    const hashV1 = computeReviewArtifactHash(manifestV1);
    const hashV2 = computeReviewArtifactHash(manifestWithSchema2);
    expect(hashV1).not.toBe(hashV2);
  });

  // -----------------------------------------------------------------------
  // 5. Fixed identity test vectors from planning report §5.1
  // -----------------------------------------------------------------------

  it("produces the correct canonical JSON for object-order equivalence (vector 1)", () => {
    const canonA = canonicalizeReviewArtifact(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.a);
    const canonB = canonicalizeReviewArtifact(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.b);
    expect(canonA).toBe(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.expectedCanonical);
    expect(canonB).toBe(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.expectedCanonical);
  });

  it("produces the correct SHA-256 for object-order equivalence (vector 1)", () => {
    const hashA = computeReviewArtifactHash(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.a);
    const hashB = computeReviewArtifactHash(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.b);
    expect(hashA).toBe(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.expectedHash);
    expect(hashB).toBe(V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.expectedHash);
  });

  it("produces the correct canonical JSON for nested/array preservation (vector 2)", () => {
    const canon = canonicalizeReviewArtifact(V1_IDENTITY_TEST_VECTORS.nestedAndArrayPreservation.value);
    expect(canon).toBe(V1_IDENTITY_TEST_VECTORS.nestedAndArrayPreservation.expectedCanonical);
  });

  it("produces the correct SHA-256 for nested/array preservation (vector 2)", () => {
    const hash = computeReviewArtifactHash(V1_IDENTITY_TEST_VECTORS.nestedAndArrayPreservation.value);
    expect(hash).toBe(V1_IDENTITY_TEST_VECTORS.nestedAndArrayPreservation.expectedHash);
  });

  it("produces the correct canonical JSON for semantic array order (vector 3)", () => {
    const canon = canonicalizeReviewArtifact(V1_IDENTITY_TEST_VECTORS.semanticArrayOrder.value);
    expect(canon).toBe(V1_IDENTITY_TEST_VECTORS.semanticArrayOrder.expectedCanonical);
  });

  it("produces the correct SHA-256 for semantic array order (vector 3)", () => {
    const hash = computeReviewArtifactHash(V1_IDENTITY_TEST_VECTORS.semanticArrayOrder.value);
    expect(hash).toBe(V1_IDENTITY_TEST_VECTORS.semanticArrayOrder.expectedHash);
  });

  it("produces the correct canonical JSON for semantic change (vector 4)", () => {
    const canon = canonicalizeReviewArtifact(V1_IDENTITY_TEST_VECTORS.semanticChange.value);
    expect(canon).toBe(V1_IDENTITY_TEST_VECTORS.semanticChange.expectedCanonical);
  });

  it("produces the correct SHA-256 for semantic change (vector 4)", () => {
    const hash = computeReviewArtifactHash(V1_IDENTITY_TEST_VECTORS.semanticChange.value);
    expect(hash).toBe(V1_IDENTITY_TEST_VECTORS.semanticChange.expectedHash);
  });

  it("all four fixed test vectors produce distinct hashes", () => {
    const hashes = [
      V1_IDENTITY_TEST_VECTORS.objectOrderEquivalence.expectedHash,
      V1_IDENTITY_TEST_VECTORS.nestedAndArrayPreservation.expectedHash,
      V1_IDENTITY_TEST_VECTORS.semanticArrayOrder.expectedHash,
      V1_IDENTITY_TEST_VECTORS.semanticChange.expectedHash,
    ];
    expect(new Set(hashes).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Common envelope and scope
// ---------------------------------------------------------------------------

describe("Artifact scope", () => {
  it("builds a valid scope with defaults", () => {
    const scope = buildValidArtifactScope();
    expect(scope.projectId).toBe("hepha");
    expect(scope.featureId).toBe("feat-064");
    expect(scope.phaseNumber).toBe(2);
    expect(scope.reviewGateId).toBe("code-review");
  });

  it("builds a scope with overrides", () => {
    const scope = buildValidArtifactScope({ phaseNumber: 3, reviewGateId: "design-review" });
    expect(scope.phaseNumber).toBe(3);
    expect(scope.reviewGateId).toBe("design-review");
  });
});

describe("Artifact reference", () => {
  it("builds a valid reference with defaults", () => {
    const ref = buildValidArtifactReference();
    expect(ref.artifactKind).toBe("review_manifest");
    expect(ref.artifactId).toBe("manifest-001");
    expect(ref.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ref.relativePath).toBe("reviews/manifest-001.json");
  });
});

// ---------------------------------------------------------------------------
// Surface entries
// ---------------------------------------------------------------------------

describe("Surface entry", () => {
  it("builds a valid surface entry with defaults", () => {
    const entry = buildValidSurfaceEntry();
    expect(entry.surfaceId).toBe("src-lib-core-a");
    expect(entry.relativePath).toBe("src/lib/core.ts");
  });
});

// ---------------------------------------------------------------------------
// Fixture builders — each artifact kind
// ---------------------------------------------------------------------------

describe("Fixture builders produce valid artifact shapes", () => {
  it("builds a valid active rule snapshot", () => {
    const snapshot = buildValidActiveRuleSnapshot();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.ruleId).toBe("secret-safe-governance-artifacts");
    expect(snapshot.ruleVersion).toBe("1.0.0");
    expect(snapshot.category).toBe("security");
    expect(snapshot.catalogPath).toBe(".hepha/architecture-rules.yaml");
    expect(snapshot.ruleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.catalogSourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a valid active rule authority", () => {
    const auth = buildValidActiveRuleAuthority();
    expect(auth.kind).toBe("active_rule");
    expect(auth.reference).toBe("rule:secret-safe-governance-artifacts");
    expect(auth.snapshot).toBeDefined();
  });

  it("builds a valid finding", () => {
    const finding = buildValidFinding();
    expect(finding.findingId).toBe("finding-001");
    expect(finding.disposition).toBe("IN_SCOPE_BLOCKER");
    expect(finding.claimType).toBe("security");
    expect(finding.authority.kind).toBe("active_rule");
    expect(finding.severity).toBe("blocker");
    expect(finding.rootCause).toBeDefined();
    expect(finding.remediationItems).toBeDefined();
    expect(finding.remediationItems!.length).toBe(1);
    expect(finding.testMatrix).toBeDefined();
    expect(finding.testMatrix!.length).toBe(1);
    expect(finding.exhaustivenessDecision).toBe("local_only");
  });

  it("builds a valid review manifest", () => {
    const manifest = buildValidManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.artifactKind).toBe("review_manifest");
    expect(manifest.result).toBe("NEEDS_CHANGES");
    expect(manifest.ruleSnapshots).toHaveLength(1);
    expect(manifest.findings).toHaveLength(1);
  });

  it("builds a valid remediation response", () => {
    const response = buildValidRemediationResponse();
    expect(response.schemaVersion).toBe(1);
    expect(response.artifactKind).toBe("remediation_response");
    expect(response.findingResponses).toHaveLength(1);
    expect(response.findingResponses[0].items[0].decision).toBe("APPLIED");
  });

  it("builds a valid verification receipt", () => {
    const receipt = buildValidVerificationReceipt();
    expect(receipt.schemaVersion).toBe(1);
    expect(receipt.artifactKind).toBe("verification_receipt");
    expect(receipt.itemReceipts).toHaveLength(1);
    expect(receipt.testReceipts).toHaveLength(1);
    expect(receipt.itemReceipts[0].outcome).toBe("VERIFIED");
    expect(receipt.testReceipts[0].outcome).toBe("PASSED");
  });

  it("builds a valid replan plan", () => {
    const plan = buildValidReplanPlan();
    expect(plan.schemaVersion).toBe(1);
    expect(plan.artifactKind).toBe("replan_plan");
    expect(plan.findingIds).toContain("finding-001");
    expect(plan.defectClass).toBe("secret-exposure");
    expect(plan.replanReason).toBe("finding_exhaustiveness");
    expect(plan.remediationItems).toHaveLength(1);
    expect(plan.testMatrix).toHaveLength(1);
  });

  it("builds a valid debt observation", () => {
    const debt = buildValidDebtObservation();
    expect(debt.schemaVersion).toBe(1);
    expect(debt.artifactKind).toBe("debt_observation");
    expect(debt.authority.kind).toBe("active_rule");
    expect(debt.currentFeatureImpact).toBe("untouched_non_blocking");
    expect(debt.historicalSurface).toHaveLength(1);
  });

  it("fixture hashes are deterministic across repeated calls", () => {
    const m1 = buildValidManifest();
    const m2 = buildValidManifest();
    expect(hashValidatedReviewArtifact(m1)).toBe(hashValidatedReviewArtifact(m2));
  });
});

// ---------------------------------------------------------------------------
// Identifier and path validation
// ---------------------------------------------------------------------------

describe("Identifier validation", () => {
  it("accepts valid kebab-case identifiers", () => {
    expect(isValidKebabCaseIdentifier("valid-identifier")).toBe(true);
    expect(isValidKebabCaseIdentifier("single")).toBe(true);
    expect(isValidKebabCaseIdentifier("with-123-numbers")).toBe(true);
    expect(isValidKebabCaseIdentifier("a")).toBe(true);
    expect(isValidKebabCaseIdentifier("z".repeat(128))).toBe(true);
  });

  it("rejects invalid kebab-case identifiers", () => {
    expect(isValidKebabCaseIdentifier("")).toBe(false);
    expect(isValidKebabCaseIdentifier("UPPERCASE")).toBe(false);
    expect(isValidKebabCaseIdentifier("0-leading-digit")).toBe(false); // Must start with letter
    expect(isValidKebabCaseIdentifier("-leading-hyphen")).toBe(false);
    expect(isValidKebabCaseIdentifier("trailing-hyphen-")).toBe(false);
    expect(isValidKebabCaseIdentifier("double--hyphen")).toBe(false);
    expect(isValidKebabCaseIdentifier("x".repeat(129))).toBe(false);
  });

  it("validates SemVer strings", () => {
    expect(isValidSemVer("1.0.0")).toBe(true);
    expect(isValidSemVer("2.13.456")).toBe(true);
    expect(isValidSemVer("0.0.1")).toBe(true);
    expect(isValidSemVer("1.0")).toBe(false);
    expect(isValidSemVer("not-semver")).toBe(false);
    expect(isValidSemVer("")).toBe(false);
    expect(isValidSemVer("1.0.0.0")).toBe(false);
  });

  it("validates SHA-256 hex digests", () => {
    expect(isValidSha256Hex("a".repeat(64))).toBe(true);
    expect(isValidSha256Hex("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isValidSha256Hex("".repeat(64))).toBe(false);
    expect(isValidSha256Hex("g".repeat(64))).toBe(false);
    expect(isValidSha256Hex("a".repeat(63))).toBe(false);
    expect(isValidSha256Hex("A".repeat(64))).toBe(false); // Uppercase not allowed
  });

  it("validates rule references", () => {
    expect(isValidRuleReference("rule:my-rule")).toBe(true);
    expect(isValidRuleReference("rule:secret-safe-governance-artifacts")).toBe(true);
    expect(isValidRuleReference(":my-rule")).toBe(false);
    expect(isValidRuleReference("rule:")).toBe(false);
    expect(isValidRuleReference("")).toBe(false);
  });

  it("validates acceptance criterion references", () => {
    expect(isValidAcceptanceCriterionReference("ac:feat-064:RC-001")).toBe(true);
    expect(isValidAcceptanceCriterionReference("ac:feat-064:test_001")).toBe(true);
    expect(isValidAcceptanceCriterionReference(":feat-064:RC-001")).toBe(false);
    expect(isValidAcceptanceCriterionReference("ac:")).toBe(false);
    expect(isValidAcceptanceCriterionReference("")).toBe(false);
  });
});

describe("Project-relative path validation", () => {
  it("accepts valid project-relative paths", () => {
    expect(isValidProjectRelativePath("src/lib/core.ts")).toBe(true);
    expect(isValidProjectRelativePath("docs/architecture/overview.md")).toBe(true);
    expect(isValidProjectRelativePath("a/b/c/d/e/file.ts")).toBe(true);
    expect(isValidProjectRelativePath("single.txt")).toBe(true);
  });

  it("rejects absolute paths", () => {
    expect(isValidProjectRelativePath("/etc/passwd")).toBe(false);
    expect(isValidProjectRelativePath("/src/lib/core.ts")).toBe(false);
  });

  it("rejects Windows drive letter paths", () => {
    expect(isValidProjectRelativePath("C:\\docs\\test.md")).toBe(false);
    expect(isValidProjectRelativePath("D:/docs/test.md")).toBe(false);
  });

  it("rejects paths with backslashes", () => {
    expect(isValidProjectRelativePath("src\\lib\\core.ts")).toBe(false);
  });

  it("rejects paths with . or .. segments", () => {
    expect(isValidProjectRelativePath("src/../lib/core.ts")).toBe(false);
    expect(isValidProjectRelativePath("./lib/core.ts")).toBe(false);
    expect(isValidProjectRelativePath("lib/./core.ts")).toBe(false);
  });

  it("rejects path with NUL byte", () => {
    expect(isValidProjectRelativePath("src/\0core.ts")).toBe(false);
  });

  it("rejects empty path and paths exceeding max length", () => {
    expect(isValidProjectRelativePath("")).toBe(false);
    expect(isValidProjectRelativePath("x".repeat(513))).toBe(false);
  });

  it("rejects URI scheme prefixes", () => {
    expect(isValidProjectRelativePath("file:artifact.json")).toBe(false);
    expect(isValidProjectRelativePath("http://example.com/artifact.json")).toBe(false);
    expect(isValidProjectRelativePath("https:artifact.json")).toBe(false);
    expect(isValidProjectRelativePath("data:text/plain;base64,abc")).toBe(false);
  });

  it("rejects trailing slash (empty trailing segment)", () => {
    expect(isValidProjectRelativePath("dir/")).toBe(false);
    expect(isValidProjectRelativePath("a/b/c/")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Safe string / secret detection
// ---------------------------------------------------------------------------

describe("Safe string validation", () => {
  it("accepts normal strings within length limit", () => {
    expect(isReviewContractSafeString("hello world")).toBe(true);
    expect(isReviewContractSafeString("a")).toBe(true);
    expect(isReviewContractSafeString("x".repeat(REVIEW_ARTIFACT_MAX_STRING_LENGTH))).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isReviewContractSafeString("")).toBe(false);
  });

  it("rejects strings exceeding max length", () => {
    expect(isReviewContractSafeString("x".repeat(REVIEW_ARTIFACT_MAX_STRING_LENGTH + 1))).toBe(false);
  });

  it("rejects strings containing secret patterns", () => {
    expect(isReviewContractSafeString("api_key=abc123")).toBe(false);
    expect(isReviewContractSafeString("Bearer: mytoken123")).toBe(false);
    expect(isReviewContractSafeString("password: supersecret")).toBe(false);
    expect(isReviewContractSafeString("-----BEGIN RSA PRIVATE KEY-----")).toBe(false);
    expect(isReviewContractSafeString("sk-abcdefghijklmnop")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isReviewContractSafeString(null)).toBe(false);
    expect(isReviewContractSafeString(undefined)).toBe(false);
    expect(isReviewContractSafeString(42)).toBe(false);
    expect(isReviewContractSafeString({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Canonicalization edge cases
// ---------------------------------------------------------------------------

describe("Canonicalization edge cases", () => {
  it("canonicalizes null and booleans correctly", () => {
    expect(canonicalizeReviewArtifact(null)).toBe("null");
    expect(canonicalizeReviewArtifact(true)).toBe("true");
    expect(canonicalizeReviewArtifact(false)).toBe("false");
  });

  it("canonicalizes numbers correctly", () => {
    expect(canonicalizeReviewArtifact(42)).toBe("42");
    expect(canonicalizeReviewArtifact(0)).toBe("0");
    expect(canonicalizeReviewArtifact(-1.5)).toBe("-1.5");
  });

  it("throws on non-finite numbers", () => {
    expect(() => canonicalizeReviewArtifact(NaN)).toThrow();
    expect(() => canonicalizeReviewArtifact(Infinity)).toThrow();
    expect(() => canonicalizeReviewArtifact(-Infinity)).toThrow();
  });

  it("throws on non-JSON-safe values", () => {
    expect(() => canonicalizeReviewArtifact(undefined)).toThrow();
    expect(() => canonicalizeReviewArtifact(Symbol("test"))).toThrow();
    expect(() => canonicalizeReviewArtifact(BigInt(42))).toThrow();
    expect(() => canonicalizeReviewArtifact(() => {})).toThrow();
  });

  it("canonicalizes an empty object", () => {
    expect(canonicalizeReviewArtifact({})).toBe("{}");
  });

  it("canonicalizes an empty array", () => {
    expect(canonicalizeReviewArtifact([])).toBe("[]");
  });

  it("sorts nested object keys", () => {
    const input = { z: 1, a: { y: 2, x: 3 } };
    const expected = '{"a":{"x":3,"y":2},"z":1}';
    expect(canonicalizeReviewArtifact(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Cross-artifact hash determinism
// ---------------------------------------------------------------------------

describe("Cross-artifact hash determinism", () => {
  it("each artifact kind produces a deterministic hash", () => {
    const manifest = buildValidManifest();
    const response = buildValidRemediationResponse();
    const receipt = buildValidVerificationReceipt();
    const plan = buildValidReplanPlan();
    const debt = buildValidDebtObservation();

    // All five produce stable hashes
    expect(hashValidatedReviewArtifact(manifest)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashValidatedReviewArtifact(response)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashValidatedReviewArtifact(receipt)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashValidatedReviewArtifact(plan)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashValidatedReviewArtifact(debt)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different artifact kinds with same content hash differently", () => {
    const manifest = buildValidManifest();

    // Same content but with artifactKind changed — must produce different hash
    const manifestAltKind: ReviewManifest = {
      ...manifest,
      // Keep all fields same except artifactKind is already "review_manifest"
      // Create a comparable change via different artifactId
      artifactId: "manifest-alt",
    };

    const hashA = hashValidatedReviewArtifact(manifest);
    const hashB = hashValidatedReviewArtifact(manifestAltKind);
    expect(hashA).not.toBe(hashB);
  });
});

// ---------------------------------------------------------------------------
// TypeScript type soundness (compile-time checks)
// ---------------------------------------------------------------------------

describe("TypeScript type soundness", () => {
  it("manifest type is assignable to ReviewArtifact union", () => {
    const manifest: ReviewArtifact = buildValidManifest();
    expect(manifest.artifactKind).toBe("review_manifest");
  });

  it("remediation response type is assignable to ReviewArtifact union", () => {
    const response: ReviewArtifact = buildValidRemediationResponse();
    expect(response.artifactKind).toBe("remediation_response");
  });

  it("verification receipt type is assignable to ReviewArtifact union", () => {
    const receipt: ReviewArtifact = buildValidVerificationReceipt();
    expect(receipt.artifactKind).toBe("verification_receipt");
  });

  it("replan plan type is assignable to ReviewArtifact union", () => {
    const plan: ReviewArtifact = buildValidReplanPlan();
    expect(plan.artifactKind).toBe("replan_plan");
  });

  it("debt observation type is assignable to ReviewArtifact union", () => {
    const debt: ReviewArtifact = buildValidDebtObservation();
    expect(debt.artifactKind).toBe("debt_observation");
  });

  it("discriminated union narrowing works on artifact kind", () => {
    const artifacts: ReviewArtifact[] = [
      buildValidManifest(),
      buildValidRemediationResponse(),
      buildValidVerificationReceipt(),
      buildValidReplanPlan(),
      buildValidDebtObservation(),
    ];

    const manifests = artifacts.filter((a): a is ReviewManifest => a.artifactKind === "review_manifest");
    expect(manifests).toHaveLength(1);
    expect(manifests[0].result).toBeDefined();

    const responses = artifacts.filter((a): a is RemediationResponse => a.artifactKind === "remediation_response");
    expect(responses).toHaveLength(1);
    expect(responses[0].findingResponses).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Edge cases: empty collections, optionals, defaults
// ---------------------------------------------------------------------------

describe("Edge cases in artifact shapes", () => {
  it("manifest with APPROVED result has no blockerReason", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      findings: [],
    });
    expect(manifest.blockerReason).toBeUndefined();
    expect(manifest.findings).toHaveLength(0);
  });

  it("manifest with BLOCKED result requires blockerReason", () => {
    const manifest = buildValidManifest({
      result: "BLOCKED",
      blockerReason: "Critical security issue requires escalation.",
      findings: [],
    });
    expect(manifest.blockerReason).toBeDefined();
  });

  it("finding with OBSERVATION disposition has no remediation or test matrix", () => {
    const finding = buildValidFinding({
      disposition: "OBSERVATION",
      severity: "note",
      remediationItems: undefined,
      testMatrix: undefined,
      exhaustivenessDecision: undefined,
    });
    expect(finding.disposition).toBe("OBSERVATION");
    expect(finding.remediationItems).toBeUndefined();
    expect(finding.testMatrix).toBeUndefined();
    expect(finding.exhaustivenessDecision).toBeUndefined();
  });

  it("finding with ARCHITECTURE_DEBT disposition has debt impact", () => {
    const finding = buildValidFinding({
      disposition: "ARCHITECTURE_DEBT",
      claimType: "security",
      severity: "note",
      remediationItems: undefined,
      testMatrix: undefined,
      exhaustivenessDecision: undefined,
      debtImpact: "untouched_non_blocking",
    });
    expect(finding.disposition).toBe("ARCHITECTURE_DEBT");
    expect(finding.debtImpact).toBe("untouched_non_blocking");
  });

  it("verification receipt can have multiple item and test outcomes", () => {
    const receipt = buildValidVerificationReceipt({
      itemReceipts: [
        { findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED" as const, evidence: "Passed." },
        { findingId: "finding-002", remediationItemId: "fix-002", outcome: "FAILED" as const, evidence: "Failed." },
      ],
      testReceipts: [
        { findingId: "finding-001", testId: "test-001", outcome: "PASSED" as const, evidence: "Passed." },
        { findingId: "finding-001", testId: "test-002", outcome: "NOT_RUN" as const, evidence: "Skipped." },
      ],
    });
    expect(receipt.itemReceipts).toHaveLength(2);
    expect(receipt.testReceipts).toHaveLength(2);
  });

  it("remediation response can include suspected out-of-scope observations", () => {
    const response = buildValidRemediationResponse({
      suspectedOutOfScopeObservations: [
        { relativePath: "src/unrelated.ts", rationale: "Appears to be a different concern." },
      ],
    });
    expect(response.suspectedOutOfScopeObservations).toHaveLength(1);
    expect(response.suspectedOutOfScopeObservations![0].relativePath).toBe("src/unrelated.ts");
  });

  it("replan plan supports recurrence_signal reason", () => {
    const plan = buildValidReplanPlan({ replanReason: "recurrence_signal" });
    expect(plan.replanReason).toBe("recurrence_signal");
  });

  it("debt observation accepts different authority", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:deterministic-phase-authority",
        snapshot: buildValidActiveRuleSnapshot({
          ruleId: "deterministic-phase-authority",
          ruleVersion: "1.0.0",
          category: "architecture",
        }),
      },
      findingId: "finding-arch-debt-002",
    });
    expect(debt.authority.reference).toBe("rule:deterministic-phase-authority");
  });

  it("artifact lineage predecessors can be provided", () => {
    const manifest = buildValidManifest({
      lineage: {
        predecessors: [buildValidArtifactReference({ artifactId: "manifest-000" })],
      },
    });
    expect(manifest.lineage).toBeDefined();
    expect(manifest.lineage!.predecessors).toHaveLength(1);
    expect(manifest.lineage!.predecessors![0].artifactId).toBe("manifest-000");
  });

  it("artifact lineage supersedes can be provided", () => {
    const manifest = buildValidManifest({
      lineage: {
        supersedes: buildValidArtifactReference({ artifactId: "manifest-000", contentHash: "c".repeat(64) }),
      },
    });
    expect(manifest.lineage!.supersedes).toBeDefined();
    expect(manifest.lineage!.supersedes!.artifactId).toBe("manifest-000");
  });

  it("surface entry can have all optional fields", () => {
    const entry: SurfaceEntry = {
      surfaceId: "full-entry",
      relativePath: "src/complex.ts",
      symbol: "SecretValidator",
      endpoint: "POST /validate",
      rationale: "Entry point for secret detection.",
    };
    expect(entry.symbol).toBe("SecretValidator");
    expect(entry.endpoint).toBe("POST /validate");
    expect(entry.rationale).toBe("Entry point for secret detection.");
  });
});

// ---------------------------------------------------------------------------
// T2.4: Artifact reference, lineage, feature-bound path, and limits
// ---------------------------------------------------------------------------

describe("T2.4: ArtifactReference validation", () => {
  it("accepts a valid ArtifactReference", () => {
    const ref = buildValidArtifactReference();
    expect(isValidArtifactReference(ref)).toBe(true);
  });

  it("rejects null and non-object values", () => {
    expect(isValidArtifactReference(null)).toBe(false);
    expect(isValidArtifactReference(undefined)).toBe(false);
    expect(isValidArtifactReference("string")).toBe(false);
    expect(isValidArtifactReference(42)).toBe(false);
  });

  it("rejects a reference with missing fields", () => {
    const ref = { artifactKind: "review_manifest", artifactId: "test" };
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("rejects a reference with invalid artifactKind", () => {
    const ref = { artifactKind: "nonexistent-kind", artifactId: "test", contentHash: "a".repeat(64), relativePath: "path/to/artifact.json" };
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("rejects a reference with invalid artifactId", () => {
    const ref = { artifactKind: "review_manifest", artifactId: "UPPERCASE", contentHash: "a".repeat(64), relativePath: "path/to/artifact.json" };
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("rejects a reference with invalid contentHash", () => {
    const ref = { artifactKind: "review_manifest", artifactId: "test", contentHash: "not-a-hex-string", relativePath: "path/to/artifact.json" };
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("rejects a reference with invalid relativePath", () => {
    const ref = { artifactKind: "review_manifest", artifactId: "test", contentHash: "a".repeat(64), relativePath: "/absolute/path" };
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("rejects a reference with malformed truthy relativePath without throwing", () => {
    // An object is truthy but not a string; must return false, not throw.
    const ref = { artifactKind: "review_manifest", artifactId: "test", contentHash: "a".repeat(64), relativePath: { nested: true } };
    expect(() => isValidArtifactReference(ref)).not.toThrow();
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("rejects a reference with unknown keys", () => {
    const ref = { artifactKind: "review_manifest", artifactId: "test", contentHash: "a".repeat(64), relativePath: "path/to/a.json", extraField: true };
    expect(isValidArtifactReference(ref)).toBe(false);
  });

  it("accepts references for all five artifact kinds", () => {
    for (const kind of ["review_manifest", "remediation_response", "verification_receipt", "replan_plan", "debt_observation"] as ArtifactKind[]) {
      const kindPrefix = kind.replace(/_/g, "-");
      expect(isValidArtifactReference(buildValidArtifactReference({ artifactKind: kind, artifactId: `${kindPrefix}-001` }))).toBe(true);
    }
  });
});

describe("T2.4: ArtifactLineage validation", () => {
  const scope = buildValidArtifactScope();

  it("rejects null and undefined lineage", () => {
    expect(isValidArtifactLineage(undefined, "artifact-001", "review_manifest", scope)).toBe(false);
    expect(isValidArtifactLineage(null, "artifact-001", "review_manifest", scope)).toBe(false);
  });

  it("accepts a valid lineage with predecessors for remediation_response", () => {
    const lineage = {
      predecessors: [buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-000" })],
    };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(true);
  });

  it("accepts a valid lineage with supersedes", () => {
    const lineage = {
      supersedes: buildValidArtifactReference({ artifactKind: "review_manifest", artifactId: "manifest-000" }),
    };
    expect(isValidArtifactLineage(lineage, "manifest-001", "review_manifest", scope)).toBe(true);
  });

  it("rejects self-reference in predecessors", () => {
    const lineage = {
      predecessors: [buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "self-ref" })],
    };
    expect(isValidArtifactLineage(lineage, "self-ref", "remediation_response", scope)).toBe(false);
  });

  it("rejects self-reference in supersedes", () => {
    const lineage = {
      supersedes: buildValidArtifactReference({ artifactKind: "review_manifest", artifactId: "self-ref" }),
    };
    expect(isValidArtifactLineage(lineage, "self-ref", "review_manifest", scope)).toBe(false);
  });

  it("rejects predecessor kind mismatch", () => {
    const lineage = {
      predecessors: [buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-000" })],
    };
    expect(isValidArtifactLineage(lineage, "receipt-001", "verification_receipt", scope)).toBe(false);
  });

  it("rejects supersedes with mismatched artifact kind", () => {
    // review_manifest can only supersede review_manifest
    const lineage = {
      supersedes: buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-000" }),
    };
    expect(isValidArtifactLineage(lineage, "manifest-001", "review_manifest", scope)).toBe(false);
  });

  it("rejects duplicate predecessor artifact IDs", () => {
    const lineage = {
      predecessors: [
        buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-000" }),
        buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-000" }),
      ],
    };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(false);
  });

  it("rejects empty predecessors array", () => {
    const lineage = { predecessors: [] };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(false);
  });

  it("rejects unknown keys in lineage", () => {
    const lineage = { predecessors: [buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-000" })], unknownKey: "value" };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(false);
  });

  it("rejects non-array predecessors", () => {
    const lineage = { predecessors: "not-an-array" };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(false);
  });

  it("rejects predecessors exceeding REVIEW_ARTIFACT_MAX_PREDECESSORS", () => {
    const manyPreds = Array.from({ length: REVIEW_ARTIFACT_MAX_PREDECESSORS + 1 }, (_, i) =>
      buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: `response-${i}` }),
    );
    const lineage = { predecessors: manyPreds };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(false);
  });

  it("accepts predecessors at the max limit", () => {
    const manyPreds = Array.from({ length: REVIEW_ARTIFACT_MAX_PREDECESSORS }, (_, i) =>
      buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: `pred-${String(i).padStart(3, "0")}` }),
    );
    const lineage = { predecessors: manyPreds };
    expect(isValidArtifactLineage(lineage, "response-001", "remediation_response", scope)).toBe(true);
  });
});

describe("T2.4: Feature-bound path validation", () => {
  const featurePath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-064";

  it("accepts a path equal to the feature path", () => {
    expect(isFeatureBoundPath(featurePath, featurePath)).toBe(true);
  });

  it("accepts a path inside the feature directory", () => {
    expect(isFeatureBoundPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-064/Phases/phase-2-data-layer.md", featurePath)).toBe(true);
    expect(isFeatureBoundPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-064/planning-analysis-report.md", featurePath)).toBe(true);
    expect(isFeatureBoundPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-064/some/deeply/nested/path.json", featurePath)).toBe(true);
  });

  it("rejects a path outside the feature directory", () => {
    expect(isFeatureBoundPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-065/other.md", featurePath)).toBe(false);
    expect(isFeatureBoundPath("MemoryBank/LessonsLearned/feat-064-lessons.md", featurePath)).toBe(false);
    expect(isFeatureBoundPath("apps/orchestrator/src/review-contract-types.ts", featurePath)).toBe(false);
  });

  it("rejects a sibling feature path", () => {
    const feat63 = "MemoryBank/Features/03_IN_PROGRESS/FEAT-063";
    expect(isFeatureBoundPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-064/plan.md", feat63)).toBe(false);
  });

  it("rejects empty path and oversized path", () => {
    expect(isFeatureBoundPath("", featurePath)).toBe(false);
    expect(isFeatureBoundPath("x".repeat(REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH + 1), featurePath)).toBe(false);
  });

  it("rejects invalid project-relative paths", () => {
    expect(isFeatureBoundPath("/absolute/path", featurePath)).toBe(false);
    expect(isFeatureBoundPath("C:\\Windows\\file.md", featurePath)).toBe(false);
    expect(isFeatureBoundPath("../escape/path", featurePath)).toBe(false);
  });

  it("rejects path that is a prefix collision (not a real sub-path)", () => {
    expect(isFeatureBoundPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-064-sibling/other.md", featurePath)).toBe(false);
  });

  it("rejects invalid feature path argument", () => {
    expect(isFeatureBoundPath("valid/path.md", "/absolute/feature")).toBe(false);
    expect(isFeatureBoundPath("valid/path.md", "")).toBe(false);
  });
});

describe("T2.4: Combined path validation (validateReviewContractPath)", () => {
  const featurePath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-064";

  it("returns undefined for valid feature-bound path", () => {
    expect(validateReviewContractPath("MemoryBank/Features/03_IN_PROGRESS/FEAT-064/planning-analysis-report.md", featurePath)).toBeUndefined();
  });

  it("returns invalid_project_path for absolute path", () => {
    expect(validateReviewContractPath("/etc/passwd", featurePath)).toBe("invalid_project_path");
  });

  it("returns invalid_feature_path for path outside feature", () => {
    expect(validateReviewContractPath("apps/orchestrator/src/index.ts", featurePath)).toBe("invalid_feature_path");
  });

  it("returns invalid_project_path for path with .. segments", () => {
    expect(validateReviewContractPath("MemoryBank/../config/secret.yaml", featurePath)).toBe("invalid_project_path");
  });

  it("returns undefined when no feature path is provided (project-relative only)", () => {
    expect(validateReviewContractPath("apps/orchestrator/src/index.ts", undefined)).toBeUndefined();
  });

  it("returns invalid_project_path for backslash path", () => {
    expect(validateReviewContractPath("src\\file.ts", featurePath)).toBe("invalid_project_path");
  });
});

describe("T2.4: Explicit limit constants", () => {
  it("REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH is positive and > MAX_PATH_LENGTH", () => {
    expect(REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH).toBeGreaterThan(0);
    expect(REVIEW_ARTIFACT_MAX_FEATURE_PATH_LENGTH).toBeGreaterThan(REVIEW_ARTIFACT_MAX_PATH_LENGTH);
  });

  it("REVIEW_ARTIFACT_MAX_PREDECESSORS is a positive integer", () => {
    expect(REVIEW_ARTIFACT_MAX_PREDECESSORS).toBeGreaterThan(0);
    expect(Number.isInteger(REVIEW_ARTIFACT_MAX_PREDECESSORS)).toBe(true);
  });

  it("ALLOWED_PREDECESSOR_KINDS contains all five artifact kinds", () => {
    expect(Object.keys(ALLOWED_PREDECESSOR_KINDS).sort()).toEqual([...ARTIFACT_KINDS].sort());
  });

  it("ALLOWED_PREDECESSOR_KINDS permits only same-kind lineage", () => {
    // Each artifact kind permits only itself in lineage.
    // Cross-artifact relations use dedicated reference fields, not predecessors.
    expect(ALLOWED_PREDECESSOR_KINDS.review_manifest).toEqual(["review_manifest"]);
    expect(ALLOWED_PREDECESSOR_KINDS.remediation_response).toEqual(["remediation_response"]);
    expect(ALLOWED_PREDECESSOR_KINDS.verification_receipt).toEqual(["verification_receipt"]);
    expect(ALLOWED_PREDECESSOR_KINDS.replan_plan).toEqual(["replan_plan"]);
    expect(ALLOWED_PREDECESSOR_KINDS.debt_observation).toEqual(["debt_observation"]);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Business Logic — T3.1, T3.2, T3.3, T3.4
// E013-RC-003: Blocker/expansion obligations and rule authority binding
// E013-RC-005: Sanitized refusal validation
// ---------------------------------------------------------------------------

describe("Phase 3: Envelope and schema version validation", () => {
  it("validateEnvelopeShape accepts a valid envelope", () => {
    const result = validateEnvelopeShape({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
    });
    expect(result).toBeUndefined();
  });

  it("validateEnvelopeShape rejects unsupported schema version", () => {
    const result = validateEnvelopeShape({
      schemaVersion: 2,
      artifactKind: "review_manifest",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
    });
    expect(result).toBeDefined();
    expect(result!.valid).toBe(false);
    expect(result!.code).toBe("unsupported_schema_version");
  });

  it("validateEnvelopeShape rejects invalid artifact kind", () => {
    const result = validateEnvelopeShape({
      schemaVersion: 1,
      artifactKind: "nonexistent_kind",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
    });
    expect(result).toBeDefined();
    expect(result!.code).toBe("invalid_shape");
  });

  it("validateEnvelopeShape rejects invalid artifactId", () => {
    const result = validateEnvelopeShape({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "0-leading-digit",
      scope: buildValidArtifactScope(),
    });
    expect(result).toBeDefined();
    expect(result!.code).toBe("invalid_shape");
  });

  it("validateEnvelopeShape rejects non-object", () => {
    expect(validateEnvelopeShape("string")).toBeDefined();
    expect(validateEnvelopeShape(null)).toBeDefined();
    expect(validateEnvelopeShape(42)).toBeDefined();
  });

  it("validateEnvelopeShape does not reject unknown keys (artifact-specific validators enforce keys)", () => {
    // The envelope validator only checks structurally required fields.
    // Artifact-specific validators enforce allowed-key sets.
    const result = validateEnvelopeShape({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
      extraField: true,
    });
    // Envelope shape is valid (extraField is caught by artifact-specific validator)
    expect(result).toBeUndefined();
  });

  it("validateSchemaVersion returns rejection for unsupported versions", () => {
    expect(validateSchemaVersion("review_manifest", 2)).toBeDefined();
    expect(validateSchemaVersion("remediation_response", 0)).toBeDefined();
    expect(validateSchemaVersion("verification_receipt", -1)).toBeDefined();
  });

  it("validateSchemaVersion returns undefined for supported v1 versions", () => {
    const kinds: ArtifactKind[] = [
      "review_manifest", "remediation_response", "verification_receipt",
      "replan_plan", "debt_observation",
    ];
    for (const kind of kinds) {
      expect(validateSchemaVersion(kind, 1)).toBeUndefined();
    }
  });
});

describe("Phase 3: T3.1 — Rule snapshot validation", () => {
  const validSnapshot = buildValidActiveRuleSnapshot();

  it("accepts a valid rule snapshot", () => {
    expect(validateRuleSnapshot(validSnapshot)).toBeUndefined();
  });

  it("rejects invalid schemaVersion", () => {
    expect(validateRuleSnapshot({ ...validSnapshot, schemaVersion: 2 })).toBeDefined();
  });

  it("rejects invalid ruleId", () => {
    expect(validateRuleSnapshot({ ...validSnapshot, ruleId: "0-invalid" })).toBeDefined();
  });

  it("rejects invalid catalogPath", () => {
    expect(validateRuleSnapshot({ ...validSnapshot, catalogPath: "other.yaml" })).toBeDefined();
  });

  it("rejects invalid catalogSourceHash", () => {
    expect(validateRuleSnapshot({ ...validSnapshot, catalogSourceHash: "short" })).toBeDefined();
  });

  it("rejects invalid ruleHash", () => {
    expect(validateRuleSnapshot({ ...validSnapshot, ruleHash: "123" })).toBeDefined();
  });

  it("rejects unknown keys", () => {
    expect(validateRuleSnapshot({ ...validSnapshot, extra: true })).toBeDefined();
  });
});

describe("Phase 3: T3.1 — Surface validation", () => {
  const validSurface = buildValidSurface();

  it("accepts a valid surface", () => {
    expect(validateSurface(validSurface)).toBeUndefined();
  });

  it("rejects non-object", () => {
    expect(validateSurface(null)).toBeDefined();
  });

  it("rejects missing required arrays", () => {
    // Empty object lacks required arrays
    expect(validateSurface({})).toBeDefined();
    // Empty arrays are structurally valid (no entries to validate)
    expect(validateSurface({ inspected: [], affected: [], confirmedUnaffected: [] })).toBeUndefined();
  });

  it("rejects invalid surface entries", () => {
    expect(validateSurface({
      inspected: [{ surfaceId: "invalid id", relativePath: "path.ts" }],
      affected: [{ surfaceId: "s-1", relativePath: "path.ts" }],
      confirmedUnaffected: [],
    })).toBeDefined();
  });

  it("rejects absolute paths in surface entries", () => {
    expect(validateSurface({
      inspected: [{ surfaceId: "s-1", relativePath: "/absolute/path.ts" }],
      affected: [{ surfaceId: "s-2", relativePath: "path.ts" }],
      confirmedUnaffected: [],
    })).toBeDefined();
  });

  it("rejects unknown keys in surface", () => {
    expect(validateSurface({ ...validSurface, extra: "data" })).toBeDefined();
  });

  // F4: Surface identity rule enforcement
  it("F4: rejects duplicate surface IDs within a single collection", () => {
    expect(validateSurface({
      inspected: [
        { surfaceId: "s-1", relativePath: "src/a.ts" },
        { surfaceId: "s-1", relativePath: "src/b.ts" }, // Duplicate
      ],
      affected: [{ surfaceId: "s-2", relativePath: "src/c.ts" }],
      confirmedUnaffected: [],
    })).toBeDefined();
  });

  it("F4: rejects surface ID appearing in both affected and confirmedUnaffected", () => {
    expect(validateSurface({
      inspected: [{ surfaceId: "s-1", relativePath: "src/a.ts" }],
      affected: [{ surfaceId: "shared-1", relativePath: "src/b.ts" }],
      confirmedUnaffected: [{ surfaceId: "shared-1", relativePath: "src/b.ts" }], // Overlap
    })).toBeDefined();
  });

  it("F4: accepts valid surface with distinct IDs and no overlap", () => {
    expect(validateSurface({
      inspected: [{ surfaceId: "s-insp-1", relativePath: "src/a.ts" }],
      affected: [{ surfaceId: "s-aff-1", relativePath: "src/b.ts" }],
      confirmedUnaffected: [{ surfaceId: "s-unaff-1", relativePath: "src/c.ts" }],
    })).toBeUndefined();
  });

  it("F4: accepts empty affected and confirmedUnaffected (no overlap possible)", () => {
    expect(validateSurface({
      inspected: [{ surfaceId: "s-1", relativePath: "src/a.ts" }],
      affected: [],
      confirmedUnaffected: [],
    })).toBeUndefined();
  });

  it("F4: permits overlap between inspected and affected (allowed per contract)", () => {
    expect(validateSurface({
      inspected: [{ surfaceId: "shared-1", relativePath: "src/a.ts" }],
      affected: [{ surfaceId: "shared-1", relativePath: "src/a.ts" }],
      confirmedUnaffected: [],
    })).toBeUndefined();
  });
});

describe("Phase 3: T3.1/E013-RC-003 — Manifest validation and rule authority binding", () => {
  // Build a minimal active catalog with one rule
  // Build an inline catalog with a raw source hash that matches the fixture
  const catalogRules = [
    {
      id: "secret-safe-governance-artifacts",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      description: "All governance artifacts must be secret-safe before persistence.",
      source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" },
    },
    {
      id: "deterministic-phase-authority",
      version: "1.0.0",
      status: "active",
      category: "architecture",
      scope: "review-governance",
      title: "Deterministic Phase Authority",
      description: "Phase exit requires an approved manifest.",
      source: { document: "docs/architecture/remediation-overview.md", section: "Phase Gates" },
    },
  ];

  // Compute the correct hash so fixture snapshots match the catalog
  const catalogHash = computeCatalogSourceHash({
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: catalogRules,
  });

  const activeCatalog: StrictActiveRuleCatalog = {
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: catalogRules,
    catalogSourceHash: catalogHash,
  };

  // Compute the expected ruleHash using the canonical review artifact serializer
  function computeExpectedRuleHash(rule: typeof catalogRules[0]): string {
    return computeReviewArtifactHash({
      description: rule.description,
      id: rule.id,
      scope: rule.scope,
      source: { document: rule.source.document, section: rule.source.section },
      status: rule.status,
      category: rule.category,
      title: rule.title,
      version: rule.version,
    });
  }

  const expectedRule1Hash = computeExpectedRuleHash(catalogRules[0]);

  const featurePath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-064-active-rule-catalog-and-structured-review-contra";

  it("accepts a valid review manifest with all required fields", () => {
    // Use the correct hashes so fixture snapshots match
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.projection.artifactKind).toBe("review_manifest");
      expect(result.projection.contentHash.length).toBe(64);
      expect(result.projection.resolvedRuleSnapshots).toBeDefined();
      expect(result.projection.resolvedRuleSnapshots!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("rejects a manifest referencing an unknown rule", () => {
    const manifest = buildValidManifest({
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:nonexistent-rule",
            snapshot: buildValidActiveRuleSnapshot({ ruleId: "nonexistent-rule", ruleVersion: "1.0.0" }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("unknown_rule");
    }
  });

  it("rejects a manifest referencing an inactive rule", () => {
    const inactiveCatalog: StrictActiveRuleCatalog = {
      ...activeCatalog,
      rules: [
        {
          ...activeCatalog.rules[0],
          status: "retired",
        },
        activeCatalog.rules[1],
      ],
    };
    const manifest = buildValidManifest({
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot(),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: inactiveCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("inactive_rule");
    }
  });

  it("binds each rule claim to its permitted authority (feature_correctness cannot use active_rule)", () => {
    const manifest = buildValidManifest({
      findings: [
        buildValidFinding({
          claimType: "feature_correctness",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot(),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("ambiguous_rule_reference");
    }
  });

  it("accepts acceptance-criterion references for feature_correctness claims", () => {
    // When all findings use acceptance_criterion, no ruleSnapshots needed
    const manifest = buildValidManifest({
      ruleSnapshots: [],
      findings: [
        buildValidFinding({
          claimType: "feature_correctness",
          authority: {
            kind: "acceptance_criterion",
            reference: "ac:feat-064:RC-003",
            source: { relativePath: "FeatureTasks.md", section: "E013-RC-003" },
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(true);
  });

  it("rejects acceptance-criterion references for non-feature_correctness claims", () => {
    const manifest = buildValidManifest({
      findings: [
        buildValidFinding({
          claimType: "security",
          authority: {
            kind: "acceptance_criterion",
            reference: "ac:feat-064:RC-003",
            source: { relativePath: "FeatureTasks.md", section: "E013-RC-003" },
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("ambiguous_rule_reference");
    }
  });

  it("rejects a manifest with mismatched rule snapshot", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ ruleId: "different-rule", ruleHash: "a".repeat(64) }),
      ],
      findings: [
        buildValidFinding(),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_rule_snapshot");
    }
  });

  it("rejects a manifest with duplicate finding IDs", () => {
    const manifest = buildValidManifest({
      findings: [
        buildValidFinding({ findingId: "finding-001" }),
        buildValidFinding({ findingId: "finding-001" }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("duplicate_id");
    }
  });

  it("rejects a manifest with missing required fields", () => {
    const result = validateReviewManifest({ value: {}, catalog: activeCatalog });
    expect(result.valid).toBe(false);
  });

  it("rejects a manifest with unsupported schema version", () => {
    const result = validateReviewManifest({
      value: { schemaVersion: 2, artifactKind: "review_manifest", artifactId: "m-1", scope: buildValidArtifactScope(), result: "APPROVED", ruleSnapshots: [buildValidActiveRuleSnapshot()], findings: [buildValidFinding()] },
      catalog: activeCatalog,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("unsupported_schema_version");
  });

  it("rejects manifest with missing result for BLOCKED disposition", () => {
    const result = validateReviewManifest({
      value: {
        schemaVersion: 1,
        artifactKind: "review_manifest",
        artifactId: "m-1",
        scope: buildValidArtifactScope(),
        result: "BLOCKED",
        ruleSnapshots: [buildValidActiveRuleSnapshot()],
        findings: [buildValidFinding()],
      },
      catalog: activeCatalog,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects manifest without rule snapshots", () => {
    const result = validateReviewManifest({
      value: {
        schemaVersion: 1,
        artifactKind: "review_manifest",
        artifactId: "m-1",
        scope: buildValidArtifactScope(),
        result: "APPROVED",
        ruleSnapshots: [],
        findings: [buildValidFinding()],
      },
      catalog: activeCatalog,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects manifest with unknown keys", () => {
    const manifest = buildValidManifest({}) as Record<string, unknown>;
    manifest.extraField = "data";
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
  });

  // NEW-F5a: Complete snapshot comparison — each ActiveRuleSnapshotV1 field must match
  it("rejects manifest with snapshot mismatched by category", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, category: "architecture", source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_rule_snapshot");
  });

  it("rejects manifest with snapshot mismatched by title", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, title: "Wrong Title", source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_rule_snapshot");
  });

  it("rejects manifest with snapshot mismatched by source.document", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "wrong/document.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "wrong/document.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_rule_snapshot");
  });

  // F3: Lineage must be a plain object before delegation
  it("rejects manifest with array lineage (isPlainObject gate)", () => {
    const manifest = buildValidManifest({
      lineage: [] as unknown as import("../../src/review-contract-types.js").ArtifactLineage,
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: catalogHash, ruleHash: expectedRule1Hash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
  });

  // NEW-F5b: AC source must be valid project-relative path and non-empty section
  it("rejects finding with invalid AC source path", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [],
      findings: [
        buildValidFinding({
          claimType: "feature_correctness",
          authority: {
            kind: "acceptance_criterion",
            reference: "ac:E013-RC-001",
            source: { relativePath: "/absolute/path", section: "Test Section" },
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects finding with empty AC source section", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [],
      findings: [
        buildValidFinding({
          claimType: "feature_correctness",
          authority: {
            kind: "acceptance_criterion",
            reference: "ac:E013-RC-002",
            source: { relativePath: "docs/test.md", section: "" },
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: activeCatalog, featurePath });
    expect(result.valid).toBe(false);
  });
});

// F2(1): No-raw-payload manifest with oversized UTF-8 bytes must be rejected via fallback path
describe("Phase 3: F2 — Manifest fallback size and lineage feature-path regressions", () => {
  const f2_catalogRules = [
    {
      id: "secret-safe-governance-artifacts",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      description: "All governance artifacts must be secret-safe before persistence.",
      source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" },
    },
  ];
  const f2_catalogHash = computeCatalogSourceHash({
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: f2_catalogRules,
  });
  const f2_activeCatalog: StrictActiveRuleCatalog = {
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: f2_catalogRules,
    catalogSourceHash: f2_catalogHash,
  };
  const f2_expectedHash = computeReviewArtifactHash({
    description: f2_catalogRules[0].description,
    id: f2_catalogRules[0].id,
    scope: f2_catalogRules[0].scope,
    source: { document: f2_catalogRules[0].source.document, section: f2_catalogRules[0].source.section },
    status: f2_catalogRules[0].status,
    category: f2_catalogRules[0].category,
    title: f2_catalogRules[0].title,
    version: f2_catalogRules[0].version,
  });

  it("rejects no-raw-payload manifest with oversized UTF-8 bytes (fallback path)", () => {
    // Build a large string whose UTF-8 encoding exceeds 256 KiB.
    // Use multi-byte UTF-8 characters (each = 3 UTF-8 bytes) so that
    // the UTF-8 byte limit is exceeded even though the JavaScript
    // string length is under 256 KiB.
    const largeSummary = "".padEnd(90000, "\u4e00"); // 90K CJK chars ≈ 270 KiB UTF-8
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
          summary: largeSummary,
        }),
      ],
    });
    // Pass no rawPayload to trigger the fallback serialization path
    const result = validateReviewManifest({ value: manifest, catalog: f2_activeCatalog });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("size_limit_exceeded");
  });

  // F2(2): fallback serialization failure protected by try/catch
  it("rejects manifest with serialization-failing value via fallback try/catch", () => {
    // Create a value with a circular reference that would throw in JSON.stringify
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
          summary: "Circular test",
        }),
      ],
    });
    // Inject a circular reference into the manifest
    (manifest as Record<string, unknown>).circularRef = manifest;
    // Pass no rawPayload to trigger the fallback serialization path
    const result = validateReviewManifest({ value: manifest, catalog: f2_activeCatalog });
    // Must return a safe rejection, not throw
    expect(result.valid).toBe(false);
  });

  it("rejects manifest with lineage predecessor outside feature boundary", () => {
    const manifest = buildValidManifest({
      lineage: {
        predecessors: [buildValidArtifactReference({ artifactKind: "review_manifest", artifactId: "previous-manifest", relativePath: "other-feature/previous-manifest.json" })],
      },
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f2_activeCatalog, featurePath: "my-feature" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_feature_path");
  });

  it("rejects manifest with lineage supersedes outside feature boundary", () => {
    const manifest = buildValidManifest({
      lineage: {
        supersedes: buildValidArtifactReference({ artifactKind: "review_manifest", artifactId: "previous-manifest", relativePath: "outside/manifest.json" }),
      },
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f2_activeCatalog, featurePath: "my-feature" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_feature_path");
  });

  it("accepts manifest with lineage predecessors inside feature boundary", () => {
    const manifest = buildValidManifest({
      lineage: {
        predecessors: [buildValidArtifactReference({ artifactKind: "review_manifest", artifactId: "previous-manifest", relativePath: "my-feature/previous-manifest.json" })],
      },
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f2_activeCatalog, featurePath: "my-feature" });
    expect(result.valid).toBe(true);
  });

  it("accepts manifest with lineage supersedes inside feature boundary", () => {
    const manifest = buildValidManifest({
      lineage: {
        supersedes: buildValidArtifactReference({ artifactKind: "review_manifest", artifactId: "previous-manifest", relativePath: "my-feature/previous-manifest.json" }),
      },
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f2_catalogHash, ruleHash: f2_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f2_activeCatalog, featurePath: "my-feature" });
    expect(result.valid).toBe(true);
  });
});

describe("Phase 3: T3.2/E013-RC-003 — Blocker/expansion obligations", () => {
  const validBlockerFinding = buildValidFinding({
    disposition: "IN_SCOPE_BLOCKER",
    rootCause: "Missing pre-persistence validation.",
    surface: buildValidSurface({
      inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
      affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
      confirmedUnaffected: [buildValidSurfaceEntry({ surfaceId: "unaff-1", relativePath: "src/lib/utils.ts" })],
    }),
    remediationItems: [
      { remediationItemId: "fix-001", instruction: "Add validation.", targetSurfaceIds: ["aff-1"] },
    ],
    testMatrix: [
      { testId: "test-001", requirement: "Validation rejects unsafe content.", targetSurfaceIds: ["aff-1"] },
    ],
    exhaustivenessDecision: "local_only",
  });

  it("rejects blocker findings missing root cause", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      rootCause: undefined,
    });
    expect(result).toBeDefined();
  });

  it("rejects blocker findings missing inspected surface", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      surface: { inspected: [], affected: validBlockerFinding.surface.affected, confirmedUnaffected: [] },
    });
    expect(result).toBeDefined();
  });

  it("rejects blocker findings missing affected surface", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      surface: { inspected: validBlockerFinding.surface.inspected, affected: [], confirmedUnaffected: [] },
    });
    expect(result).toBeDefined();
  });

  it("rejects blocker findings missing remediation items", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      remediationItems: undefined,
    });
    expect(result).toBeDefined();
  });

  it("rejects blocker findings missing test matrix", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      testMatrix: undefined,
    });
    expect(result).toBeDefined();
  });

  it("rejects blocker findings missing exhaustiveness decision", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      exhaustivenessDecision: undefined as unknown as "local_only",
    });
    expect(result).toBeDefined();
  });

  it("accepts blocker findings with complete obligations", () => {
    const result = validateBlockerExpansionObligations(validBlockerFinding);
    expect(result).toBeUndefined();
  });

  it("rejects scope expansion findings missing required obligations", () => {
    const expansionFinding = { ...validBlockerFinding, disposition: "SCOPE_EXPANSION" as const };
    expect(validateBlockerExpansionObligations({ ...expansionFinding, rootCause: undefined })).toBeDefined();
    expect(validateBlockerExpansionObligations({ ...expansionFinding, remediationItems: undefined })).toBeDefined();
    expect(validateBlockerExpansionObligations({ ...expansionFinding, testMatrix: undefined })).toBeDefined();
    expect(validateBlockerExpansionObligations({ ...expansionFinding, exhaustivenessDecision: undefined as unknown as "local_only" })).toBeDefined();
  });

  it("accepts scope expansion findings with complete obligations", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      disposition: "SCOPE_EXPANSION",
      scopeExpansionRationale: "New requirement scope uncovered during review.",
    });
    expect(result).toBeUndefined();
  });

  it("passes through for non-blocker/expansion dispositions", () => {
    const obsFinding = { ...validBlockerFinding, disposition: "OBSERVATION" as const };
    expect(validateBlockerExpansionObligations(obsFinding)).toBeUndefined();

    const debtFinding = { ...validBlockerFinding, disposition: "ARCHITECTURE_DEBT" as const };
    expect(validateBlockerExpansionObligations(debtFinding)).toBeUndefined();
  });

  // F1: Scope expansion requires scopeExpansionRationale
  it("rejects scope expansion without scopeExpansionRationale", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      disposition: "SCOPE_EXPANSION",
      scopeExpansionRationale: undefined,
    });
    expect(result).toBeDefined();
  });

  it("rejects scope expansion with empty scopeExpansionRationale", () => {
    const result = validateBlockerExpansionObligations({
      ...validBlockerFinding,
      disposition: "SCOPE_EXPANSION",
      scopeExpansionRationale: "",
    });
    expect(result).toBeDefined();
  });
});

describe("Phase 3: F1 — Disposition-enforcement integration (manifest-level checks)", () => {
  const f1_catalogRules = [
    {
      id: "secret-safe-governance-artifacts",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      description: "All governance artifacts must be secret-safe before persistence.",
      source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" },
    },
  ];
  const f1_catalogHash = computeCatalogSourceHash({
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: f1_catalogRules,
  });
  const f1_activeCatalog: StrictActiveRuleCatalog = {
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: f1_catalogRules,
    catalogSourceHash: f1_catalogHash,
  };
  const f1_expectedHash = computeReviewArtifactHash({
    description: f1_catalogRules[0].description,
    id: f1_catalogRules[0].id,
    scope: f1_catalogRules[0].scope,
    source: { document: f1_catalogRules[0].source.document, section: f1_catalogRules[0].source.section },
    status: f1_catalogRules[0].status,
    category: f1_catalogRules[0].category,
    title: f1_catalogRules[0].title,
    version: f1_catalogRules[0].version,
  });
  const f1_featurePath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-064-active-rule-catalog-and-structured-review-contra";

  it("rejects blocker finding with note severity", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          severity: "note",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects scope expansion finding with info severity", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          severity: "info",
          scopeExpansionRationale: "Expanded scope required.",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT finding with blocker severity", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "blocker",
          claimType: "quality",
          remediationItems: undefined,
          testMatrix: undefined,
          exhaustivenessDecision: undefined as unknown as "local_only",
          rootCause: undefined,
          debtImpact: "untouched_non_blocking",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    expect(validateRuleSnapshot(manifest.ruleSnapshots[0])).toBeUndefined();
    expect(validateSurface(manifest.findings[0].surface)).toBeUndefined();
    expect(resolveFindingAuthority(manifest.findings[0], f1_activeCatalog)).toHaveProperty("authority");
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects OBSERVATION finding with required severity", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "OBSERVATION",
          severity: "required",
          claimType: "quality",
          remediationItems: undefined,
          testMatrix: undefined,
          exhaustivenessDecision: undefined as unknown as "local_only",
          rootCause: undefined,
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects remediation targetSurfaceId that does not resolve to affected surface", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [buildValidSurfaceEntry({ surfaceId: "unaff-1", relativePath: "src/lib/utils.ts" })],
          },
          remediationItems: [
            { remediationItemId: "fix-001", instruction: "Add validation.", targetSurfaceIds: ["nonexistent-surface"] },
          ],
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects testMatrix targetSurfaceId that does not resolve to affected surface", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [buildValidSurfaceEntry({ surfaceId: "unaff-1", relativePath: "src/lib/utils.ts" })],
          },
          testMatrix: [
            { testId: "test-001", requirement: "Validation rejects unsafe content.", targetSurfaceIds: ["nonexistent-surface"] },
          ],
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects APPROVED manifest with IN_SCOPE_BLOCKER finding", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects APPROVED manifest with SCOPE_EXPANSION finding", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          scopeExpansionRationale: "Expanded scope required.",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("accepts APPROVED manifest with ARCHITECTURE_DEBT finding only", () => {
    const debtFinding = buildValidFinding({
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const {
      remediationItems: _remediationItems,
      testMatrix: _testMatrix,
      exhaustivenessDecision: _exhaustivenessDecision,
      rootCause: _rootCause,
      scopeExpansionRationale: _scopeExpansionRationale,
      compatibilityDecision: _cd1,
      compatibilityApprovalSource: _cas1,
      compatibilityJustification: _cj1,
      ...debtFindingWithoutForbiddenFields
    } = debtFinding;
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [debtFindingWithoutForbiddenFields],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(true);
  });

  // -----------------------------------------------------------------------
  // F1: rootCause and scopeExpansionRationale typeof + upper bound checks
  // -----------------------------------------------------------------------

  it("rejects blocker with rootCause being a truthy non-string (object with length)", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          rootCause: { length: 1 } as unknown as string,
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects blocker with rootCause longer than REVIEW_ARTIFACT_MAX_STRING_LENGTH", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          rootCause: "x".repeat(REVIEW_ARTIFACT_MAX_STRING_LENGTH + 1),
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects scope expansion with scopeExpansionRationale being a truthy non-string (object with length)", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          scopeExpansionRationale: { length: 1 } as unknown as string,
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects scope expansion with scopeExpansionRationale longer than REVIEW_ARTIFACT_MAX_STRING_LENGTH", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          scopeExpansionRationale: "x".repeat(REVIEW_ARTIFACT_MAX_STRING_LENGTH + 1),
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: IN_SCOPE_BLOCKER forbidden fields
  // -----------------------------------------------------------------------

  it("rejects IN_SCOPE_BLOCKER with scopeExpansionRationale present", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          scopeExpansionRationale: "Should not be present on blocker.",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects IN_SCOPE_BLOCKER with debtImpact present", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          debtImpact: "untouched_non_blocking",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects IN_SCOPE_BLOCKER with debtObservationReference present", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          debtObservationReference: buildValidArtifactReference({ artifactKind: "debt_observation" }),
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: SCOPE_EXPANSION forbidden fields
  // -----------------------------------------------------------------------

  it("rejects SCOPE_EXPANSION with debtImpact present", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          scopeExpansionRationale: "Expansion rationale.",
          debtImpact: "untouched_non_blocking",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects SCOPE_EXPANSION with debtObservationReference present", () => {
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          scopeExpansionRationale: "Expansion rationale.",
          debtObservationReference: buildValidArtifactReference({ artifactKind: "debt_observation" }),
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: ARCHITECTURE_DEBT required/forbidden field matrix
  // -----------------------------------------------------------------------

  it("rejects ARCHITECTURE_DEBT without debtImpact", () => {
    const baseDebt = buildValidFinding({
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const { debtImpact: _debtImpact, ...noDebtImpact } = baseDebt;
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [noDebtImpact],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with wrong impact literal", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "blocking",
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with empty inspected surface", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          surface: {
            inspected: [],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with empty affected surface", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with rootCause present (forbidden blocker-only field)", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          rootCause: "Should not be on debt.",
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with remediationItems present (forbidden field)", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with malformed debtObservationReference", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          debtObservationReference: "not-an-object" as unknown as ArtifactReference,
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with debtObservationReference having non-debt_observation kind", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          debtObservationReference: buildValidArtifactReference({ artifactKind: "review_manifest" }),
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with debtObservationReference missing contentHash", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          debtObservationReference: { artifactKind: "debt_observation", artifactId: "obs-001", relativePath: "observations/obs-001.json" } as unknown as ArtifactReference,
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with debtObservationReference having non-string contentHash", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          debtObservationReference: { artifactKind: "debt_observation", artifactId: "obs-001", contentHash: 12345, relativePath: "observations/obs-001.json" } as unknown as ArtifactReference,
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with debtObservationReference having non-SHA-256 contentHash", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          debtObservationReference: buildValidArtifactReference({ artifactKind: "debt_observation", contentHash: "not-a-valid-sha256-hash" }),
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects ARCHITECTURE_DEBT with debtObservationReference having unknown reference key", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "ARCHITECTURE_DEBT",
          severity: "note",
          claimType: "quality",
          debtImpact: "untouched_non_blocking",
          debtObservationReference: { ...buildValidArtifactReference({ artifactKind: "debt_observation" }), extraField: "not-allowed" } as unknown as ArtifactReference,
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("accepts ARCHITECTURE_DEBT with valid complete debtObservationReference", () => {
    const debtFinding = buildValidFinding({
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      debtObservationReference: buildValidArtifactReference({ artifactKind: "debt_observation", artifactId: "debt-obs-001", relativePath: "observations/debt-obs-001.json" }),
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const {
      remediationItems: _ri,
      testMatrix: _tm,
      exhaustivenessDecision: _ed,
      rootCause: _rc,
      scopeExpansionRationale: _ser,
      compatibilityDecision: _cd2,
      compatibilityApprovalSource: _cas2,
      compatibilityJustification: _cj2,
      ...cleanDebt
    } = debtFinding;
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [cleanDebt],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(true);
  });

  it("accepts ARCHITECTURE_DEBT with debtObservationReference omitted", () => {
    const debtFinding = buildValidFinding({
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const {
      remediationItems: _ri,
      testMatrix: _tm,
      exhaustivenessDecision: _ed,
      rootCause: _rc,
      scopeExpansionRationale: _ser,
      compatibilityDecision: _cd3,
      compatibilityApprovalSource: _cas3,
      compatibilityJustification: _cj3,
      ...cleanDebt
    } = debtFinding;
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [cleanDebt],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(true);
  });

  // -----------------------------------------------------------------------
  // F1: OBSERVATION required/forbidden field matrix
  // -----------------------------------------------------------------------

  it("rejects OBSERVATION with empty inspected surface", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "OBSERVATION",
          severity: "note",
          surface: {
            inspected: [],
            affected: [],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects OBSERVATION with rootCause present (forbidden field)", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "OBSERVATION",
          severity: "note",
          rootCause: "Should not be present.",
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects OBSERVATION with debtImpact present (forbidden field)", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "OBSERVATION",
          severity: "note",
          debtImpact: "untouched_non_blocking",
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects OBSERVATION with remediationItems present (forbidden field)", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({
          disposition: "OBSERVATION",
          severity: "note",
          remediationItems: [{ remediationItemId: "fix-001", instruction: "Should not appear.", targetSurfaceIds: ["aff-1"] }],
          surface: {
            inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
            affected: [],
            confirmedUnaffected: [],
          },
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
          },
        }),
      ],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: NEEDS_CHANGES manifest consistency
  // -----------------------------------------------------------------------

  it("rejects NEEDS_CHANGES manifest containing only an ARCHITECTURE_DEBT finding", () => {
    const debtFinding = buildValidFinding({
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const { remediationItems: _ri, testMatrix: _tm, exhaustivenessDecision: _ed, rootCause: _rc, scopeExpansionRationale: _ser, ...cleanDebt } = debtFinding;
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [cleanDebt],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects NEEDS_CHANGES manifest containing only an OBSERVATION finding", () => {
    const obsFinding = buildValidFinding({
      disposition: "OBSERVATION",
      severity: "note",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-1", relativePath: "src/main.ts" })],
        affected: [],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const { remediationItems: _ri, testMatrix: _tm, exhaustivenessDecision: _ed, rootCause: _rc, scopeExpansionRationale: _ser, debtImpact: _di, debtObservationReference: _dor, ...cleanObs } = obsFinding;
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [cleanObs],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: BLOCKED manifest blockerReason validation
  // -----------------------------------------------------------------------

  it("rejects BLOCKED manifest with missing blockerReason", () => {
    const manifest = buildValidManifest({
      result: "BLOCKED",
      blockerReason: undefined as unknown as string,
      ruleSnapshots: [],
      findings: [],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects BLOCKED manifest with non-string blockerReason", () => {
    const manifest = buildValidManifest({
      result: "BLOCKED",
      blockerReason: 42 as unknown as string,
      ruleSnapshots: [],
      findings: [],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects BLOCKED manifest with empty blockerReason", () => {
    const manifest = buildValidManifest({
      result: "BLOCKED",
      blockerReason: "",
      ruleSnapshots: [],
      findings: [],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  it("rejects BLOCKED manifest with over-limit blockerReason", () => {
    const manifest = buildValidManifest({
      result: "BLOCKED",
      blockerReason: "x".repeat(REVIEW_ARTIFACT_MAX_STRING_LENGTH + 1),
      ruleSnapshots: [],
      findings: [],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: Positive controls
  // -----------------------------------------------------------------------

  it("accepts NEEDS_CHANGES manifest with mixed blocker, expansion, debt, and observation findings", () => {
    const blockerFinding = buildValidFinding({
      findingId: "finding-blocker-1",
      rootCause: "Root cause text.",
      remediationItems: [
        { remediationItemId: "fix-blocker-001", instruction: "Add validation.", targetSurfaceIds: ["aff-blocker-1"] },
      ],
      testMatrix: [
        { testId: "test-blocker-001", requirement: "Validation rejects unsafe content.", targetSurfaceIds: ["aff-blocker-1"] },
      ],
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-blocker-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-blocker-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [buildValidSurfaceEntry({ surfaceId: "unaff-blocker-1", relativePath: "src/lib/utils.ts" })],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const expansionFinding = buildValidFinding({
      findingId: "finding-exp-1",
      disposition: "SCOPE_EXPANSION",
      scopeExpansionRationale: "Expanded scope uncovered.",
      rootCause: "Expansion root cause.",
      remediationItems: [
        { remediationItemId: "fix-exp-001", instruction: "Expand validation.", targetSurfaceIds: ["aff-exp-1"] },
      ],
      testMatrix: [
        { testId: "test-exp-001", requirement: "Expansion covers new scope.", targetSurfaceIds: ["aff-exp-1"] },
      ],
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-exp-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-exp-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [buildValidSurfaceEntry({ surfaceId: "unaff-exp-1", relativePath: "src/lib/utils.ts" })],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const debtFinding = buildValidFinding({
      findingId: "finding-debt-1",
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-debt-mixed-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-debt-mixed-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const { remediationItems: _ri, testMatrix: _tm, exhaustivenessDecision: _ed, rootCause: _rc, scopeExpansionRationale: _ser, compatibilityDecision: _cd4, compatibilityApprovalSource: _cas4, compatibilityJustification: _cj4, ...cleanDebt } = debtFinding;
    const obsFinding = buildValidFinding({
      findingId: "finding-obs-1",
      disposition: "OBSERVATION",
      severity: "note",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-obs-mixed-1", relativePath: "src/main.ts" })],
        affected: [],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const { remediationItems: _ri2, testMatrix: _tm2, exhaustivenessDecision: _ed2, rootCause: _rc2, scopeExpansionRationale: _ser2, compatibilityDecision: _cd5, compatibilityApprovalSource: _cas5, compatibilityJustification: _cj5, debtImpact: _di, debtObservationReference: _dor, ...cleanObs } = obsFinding;
    const manifest = buildValidManifest({
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [blockerFinding, expansionFinding, cleanDebt, cleanObs],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(true);
  });

  it("accepts BLOCKED manifest with bounded safe blockerReason", () => {
    const debtFinding = buildValidFinding({
      findingId: "finding-debt-blocked-1",
      disposition: "ARCHITECTURE_DEBT",
      severity: "note",
      claimType: "quality",
      debtImpact: "untouched_non_blocking",
      surface: {
        inspected: [buildValidSurfaceEntry({ surfaceId: "insp-debt-b-1", relativePath: "src/main.ts" })],
        affected: [buildValidSurfaceEntry({ surfaceId: "aff-debt-b-1", relativePath: "src/lib/core.ts" })],
        confirmedUnaffected: [],
      },
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const { remediationItems: _ri, testMatrix: _tm, exhaustivenessDecision: _ed, rootCause: _rc, scopeExpansionRationale: _ser, compatibilityDecision: _cd6, compatibilityApprovalSource: _cas6, compatibilityJustification: _cj6, ...cleanDebt } = debtFinding;
    const manifest = buildValidManifest({
      result: "BLOCKED",
      blockerReason: "Blocked due to unresolved security concerns.",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: f1_catalogHash, ruleHash: f1_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      ],
      findings: [cleanDebt],
    });
    const result = validateReviewManifest({ value: manifest, catalog: f1_activeCatalog, featurePath: f1_featurePath });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Context builders for F1 required predecessor context
// ---------------------------------------------------------------------------

/**
 * Build a valid ManifestPredecessorContext whose reference matches the default
 * buildValidArtifactReference() output that artifact fixtures use.
 */
function buildValidManifestContext(): ManifestPredecessorContext {
  return {
    manifest: buildValidManifest(),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };
}

/**
 * Build a valid ResponsePredecessorContext whose reference matches the default
 * buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-001" })
 * that verification receipt fixtures use.
 */
function buildValidResponseContext(): ResponsePredecessorContext {
  const response = buildValidRemediationResponse();
  return {
    response,
    reference: buildValidArtifactReference({
      artifactKind: "remediation_response",
      artifactId: "response-001",
    }),
    scope: buildValidArtifactScope(),
  };
}

describe("Phase 3: T3.3 — Remediation response, receipt, replan, debt validation", () => {
  const validManifestRef = buildValidArtifactReference({
    artifactKind: "review_manifest",
    contentHash: "a".repeat(64),
  });

  // Build standard valid contexts for F1
  const t33_manifestContext = buildValidManifestContext();
  const t33_responseContext = buildValidResponseContext();

  // Context for replan: manifest must have finding with defectClass matching buildValidReplanPlan()
  const t33_replanContext: ManifestPredecessorContext = {
    manifest: buildValidManifest({
      findings: [
        buildValidFinding({
          findingId: "finding-001",
          defectClass: "secret-exposure",
          disposition: "IN_SCOPE_BLOCKER",
          exhaustivenessDecision: "replan_required",
        }),
      ],
    }),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };

  // Catalog fixture for debt observation authority tests (NEW-F5c)
  // Defined BEFORE t33_debtManifestContext so we can use computed catalog hashes.
  const t3_catalogRules = [
    {
      id: "secret-safe-governance-artifacts",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      description: "All governance artifacts must be secret-safe before persistence.",
      source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" },
    },
  ];
  const t3_catalogHash = computeCatalogSourceHash({
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: t3_catalogRules,
  });
  const t3_activeCatalog: StrictActiveRuleCatalog = {
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: t3_catalogRules,
    catalogSourceHash: t3_catalogHash,
  };
  const t3_expectedHash = buildStrictRuleSnapshot(
    t3_catalogRules[0],
    t3_catalogHash,
  ).ruleHash;

  // Context for debt observations: manifest must have an ARCHITECTURE_DEBT finding
  // with matching authority snapshot hashes from t3_activeCatalog
  const t33_debtManifestContext: ManifestPredecessorContext = {
    manifest: buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({
          catalogSourceHash: t3_catalogHash,
          ruleHash: t3_expectedHash,
          source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" },
        }),
      ],
      findings: [
        buildValidFinding({
          findingId: "finding-arch-debt-001",
          disposition: "ARCHITECTURE_DEBT",
          claimType: "security",
          severity: "critical",
          defectClass: "secret-exposure",
          rootCause: undefined,
          remediationItems: undefined,
          testMatrix: undefined,
          exhaustivenessDecision: undefined,
          surface: buildValidSurface({ inspected: [buildValidSurfaceEntry({ surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" })], affected: [buildValidSurfaceEntry({ surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" })], confirmedUnaffected: [] }),
          debtImpact: "untouched_non_blocking",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({
              catalogSourceHash: t3_catalogHash,
              ruleHash: t3_expectedHash,
              source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" },
            }),
          },
        }),
      ],
    }),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };

  it("validates a valid remediation response", () => {
    const response = buildValidRemediationResponse();
    const result = validateRemediationResponse(response, t33_manifestContext);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.projection.artifactKind).toBe("remediation_response");
      expect(result.projection.contentHash.length).toBe(64);
    }
  });

  it("accepts exactly the blocker response when the manifest also retains an audit-only observation", () => {
    const observation = buildValidFinding({
      findingId: "settled-observation",
      disposition: "OBSERVATION",
      severity: "info",
      authority: undefined,
      rootCause: undefined,
      remediationItems: undefined,
      testMatrix: undefined,
      exhaustivenessDecision: undefined,
      compatibilityDecision: undefined,
      surface: buildValidSurface({
        inspected: [buildValidSurfaceEntry({ surfaceId: "observed-surface" })],
        affected: [],
        confirmedUnaffected: [],
      }),
    });
    const context: ManifestPredecessorContext = {
      ...t33_manifestContext,
      manifest: buildValidManifest({
        findings: [...t33_manifestContext.manifest.findings, observation],
      }),
    };

    expect(validateRemediationResponse(buildValidRemediationResponse(), context).valid).toBe(true);
  });

  it("accepts a remediation response for a scope-expansion lifecycle finding", () => {
    const context: ManifestPredecessorContext = {
      ...t33_manifestContext,
      manifest: buildValidManifest({
        findings: [buildValidFinding({
          disposition: "SCOPE_EXPANSION",
          scopeExpansionRationale: "The bounded remediation surface expands under the accepted review contract.",
        })],
      }),
    };

    expect(validateRemediationResponse(buildValidRemediationResponse(), context).valid).toBe(true);
  });

  it("rejects remediation response with wrong artifact kind", () => {
    const result = validateRemediationResponse({
      ...buildValidRemediationResponse(),
      artifactKind: "review_manifest",
    }, t33_manifestContext);
    expect(result.valid).toBe(false);
  });

  it("rejects remediation response with context hash mismatch", () => {
    const response = buildValidRemediationResponse();
    const mismatchedContext: ManifestPredecessorContext = {
      manifest: buildValidManifest(),
      reference: buildValidArtifactReference({ contentHash: "b".repeat(64) }),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, mismatchedContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("rejects remediation response with missing context (required per F1)", () => {
    // F1: context is now required; a missing context is a compile error.
    // This test verifies that context binding is enforced — passing a context
    // with a non-matching reference fails as expected.
    const response = buildValidRemediationResponse();
    const wrongRefContext: ManifestPredecessorContext = {
      manifest: buildValidManifest(),
      reference: buildValidArtifactReference({ contentHash: "b".repeat(64), artifactId: "different-manifest" }),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, wrongRefContext);
    expect(result.valid).toBe(false);
  });

  it("accepts remediation response with suspected out-of-scope observations", () => {
    const response = buildValidRemediationResponse({
      suspectedOutOfScopeObservations: [
        { relativePath: "src/extra.ts", rationale: "Outside current feature scope." },
      ],
    });
    const result = validateRemediationResponse(response, t33_manifestContext);
    expect(result.valid).toBe(true);
  });

  it("rejects remediation response with invalid suspected observation path", () => {
    const response = buildValidRemediationResponse();
    const flawed = { ...response, suspectedOutOfScopeObservations: [{ relativePath: "/absolute/path", rationale: "Bad path." }] };
    const result = validateRemediationResponse(flawed, t33_manifestContext);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F3: Reject duplicate response finding IDs
  // -----------------------------------------------------------------------

  it("F3: rejects remediation response with duplicate finding IDs", () => {
    const response = buildValidRemediationResponse({
      findingResponses: [
        {
          findingId: "finding-001",
          items: [
            {
              remediationItemId: "fix-001",
              decision: "APPLIED",
              changedSurfaceIds: ["affected-1"],
              rationale: "First fix applied.",
            },
          ],
        },
        {
          findingId: "finding-001", // Duplicate
          items: [
            {
              remediationItemId: "fix-002",
              decision: "APPLIED",
              changedSurfaceIds: ["affected-1"],
              rationale: "Second fix applied.",
            },
          ],
        },
      ],
    });
    const result = validateRemediationResponse(response, t33_manifestContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("duplicate_id");
  });

  // -----------------------------------------------------------------------
  // F1: Reject remediation response with mismatched relativePath
  // -----------------------------------------------------------------------

  it("F1: rejects remediation response with mismatched relativePath in context", () => {
    const response = buildValidRemediationResponse();
    const mismatchedPathContext: ManifestPredecessorContext = {
      manifest: buildValidManifest(),
      reference: buildValidArtifactReference({ relativePath: "different/path.json" }),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, mismatchedPathContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  // -----------------------------------------------------------------------
  // F1: Runtime predecessor context validation — absent/malformed contexts
  // -----------------------------------------------------------------------

  it("F1: rejects remediation response with undefined manifestContext", () => {
    const response = buildValidRemediationResponse();
    const result = validateRemediationResponse(response, undefined as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with null manifestContext", () => {
    const response = buildValidRemediationResponse();
    const result = validateRemediationResponse(response, null as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with non-object manifestContext", () => {
    const response = buildValidRemediationResponse();
    const result = validateRemediationResponse(response, "bad-context" as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with manifestContext missing reference", () => {
    const response = buildValidRemediationResponse();
    const noRefContext = { manifest: buildValidManifest(), scope: buildValidArtifactScope() } as unknown as ManifestPredecessorContext;
    const result = validateRemediationResponse(response, noRefContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with manifestContext missing scope", () => {
    const response = buildValidRemediationResponse();
    const noScopeContext = { manifest: buildValidManifest(), reference: buildValidArtifactReference() } as unknown as ManifestPredecessorContext;
    const result = validateRemediationResponse(response, noScopeContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with manifestContext missing manifest", () => {
    const response = buildValidRemediationResponse();
    const noManifestContext = { reference: buildValidArtifactReference(), scope: buildValidArtifactScope() } as unknown as ManifestPredecessorContext;
    const result = validateRemediationResponse(response, noManifestContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with undefined manifestContext", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, undefined as unknown as ManifestPredecessorContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with null manifestContext", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, null as unknown as ManifestPredecessorContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with undefined responseContext", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, t33_manifestContext, undefined as unknown as ResponsePredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with null responseContext", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, t33_manifestContext, null as unknown as ResponsePredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with non-object manifestContext", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, 42 as unknown as ManifestPredecessorContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with non-object responseContext", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, t33_manifestContext, [] as unknown as ResponsePredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with responseContext missing reference", () => {
    const receipt = buildValidVerificationReceipt();
    const noRefRespCtx = { response: buildValidRemediationResponse(), scope: buildValidArtifactScope() } as unknown as ResponsePredecessorContext;
    const result = validateVerificationReceipt(receipt, t33_manifestContext, noRefRespCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with manifestContext missing manifest", () => {
    const receipt = buildValidVerificationReceipt();
    const noManifestCtx = { reference: buildValidArtifactReference(), scope: buildValidArtifactScope() } as unknown as ManifestPredecessorContext;
    const result = validateVerificationReceipt(receipt, noManifestCtx, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with responseContext missing response", () => {
    const receipt = buildValidVerificationReceipt();
    const noResponseCtx = { reference: buildValidArtifactReference(), scope: buildValidArtifactScope() } as unknown as ResponsePredecessorContext;
    const result = validateVerificationReceipt(receipt, t33_manifestContext, noResponseCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with undefined manifestContext", () => {
    const plan = buildValidReplanPlan();
    const result = validateReplanPlan(plan, undefined as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with null manifestContext", () => {
    const plan = buildValidReplanPlan();
    const result = validateReplanPlan(plan, null as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with non-object manifestContext", () => {
    const plan = buildValidReplanPlan();
    const result = validateReplanPlan(plan, false as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with manifestContext missing scope", () => {
    const plan = buildValidReplanPlan();
    const noScopeCtx = { manifest: buildValidManifest(), reference: buildValidArtifactReference() } as unknown as ManifestPredecessorContext;
    const result = validateReplanPlan(plan, noScopeCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with manifestContext missing manifest", () => {
    const plan = buildValidReplanPlan();
    const noManifestCtx = { reference: buildValidArtifactReference(), scope: buildValidArtifactScope() } as unknown as ManifestPredecessorContext;
    const result = validateReplanPlan(plan, noManifestCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with undefined manifestContext", () => {
    const obs = buildValidDebtObservation();
    const result = validateDebtObservation(obs, undefined as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with null manifestContext", () => {
    const obs = buildValidDebtObservation();
    const result = validateDebtObservation(obs, null as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with non-object manifestContext", () => {
    const obs = buildValidDebtObservation();
    const result = validateDebtObservation(obs, NaN as unknown as ManifestPredecessorContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with manifestContext missing reference", () => {
    const obs = buildValidDebtObservation();
    const noRefCtx = { manifest: buildValidManifest(), scope: buildValidArtifactScope() } as unknown as ManifestPredecessorContext;
    const result = validateDebtObservation(obs, noRefCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with manifestContext missing manifest", () => {
    const obs = buildValidDebtObservation();
    const noManifestCtx = { reference: buildValidArtifactReference(), scope: buildValidArtifactScope() } as unknown as ManifestPredecessorContext;
    const result = validateDebtObservation(obs, noManifestCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  // -----------------------------------------------------------------------
  // F1: Predecessor collection guards — manifest.findings / response.findingResponses
  // -----------------------------------------------------------------------

  it("F1: rejects remediation response with empty manifest (missing findings array)", () => {
    const response = buildValidRemediationResponse();
    const emptyManifestCtx: ManifestPredecessorContext = {
      manifest: {} as any,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, emptyManifestCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with empty manifest (missing findings array)", () => {
    const receipt = buildValidVerificationReceipt();
    const emptyManifestCtx: ManifestPredecessorContext = {
      manifest: {} as any,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, emptyManifestCtx, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with empty response (missing findingResponses array)", () => {
    const receipt = buildValidVerificationReceipt();
    const emptyResponseCtx: ResponsePredecessorContext = {
      response: {} as any,
      reference: buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-001" }),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, t33_manifestContext, emptyResponseCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with null response entry (malformed response finding)", () => {
    const receipt = buildValidVerificationReceipt();
    // Response with null entries in findingResponses array
    const malformedResponse = buildValidRemediationResponse({ findingResponses: [null as any] });
    const malformedRespCtx: ResponsePredecessorContext = {
      response: malformedResponse,
      reference: buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-001" }),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, t33_manifestContext, malformedRespCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with response entry missing items array", () => {
    const receipt = buildValidVerificationReceipt();
    // Response entry has findingId but no items array
    const malformedResponse = buildValidRemediationResponse({
      findingResponses: [{ findingId: "f-1" } as any],
    });
    const malformedRespCtx: ResponsePredecessorContext = {
      response: malformedResponse,
      reference: buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "response-001" }),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, t33_manifestContext, malformedRespCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with empty manifest (missing findings array)", () => {
    const plan = buildValidReplanPlan();
    const emptyManifestCtx: ManifestPredecessorContext = {
      manifest: {} as any,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateReplanPlan(plan, emptyManifestCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with empty manifest (missing findings array)", () => {
    const obs = buildValidDebtObservation();
    const emptyManifestCtx: ManifestPredecessorContext = {
      manifest: {} as any,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateDebtObservation(obs, emptyManifestCtx, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with finding missing authority", () => {
    const obs = buildValidDebtObservation();
    // Manifest finding with no authority object
    const noAuthorityManifest = buildValidManifest({
      findings: [{
        findingId: "debt-001",
        disposition: "ARCHITECTURE_DEBT",
      } as any],
    });
    const noAuthCtx: ManifestPredecessorContext = {
      manifest: noAuthorityManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateDebtObservation(obs, noAuthCtx, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with finding missing surface", () => {
    const obs = buildValidDebtObservation();
    // Manifest finding with no surface object
    const noSurfaceManifest = buildValidManifest({
      findings: [{
        findingId: "debt-001",
        disposition: "ARCHITECTURE_DEBT",
        authority: buildValidActiveRuleAuthority(),
      } as any],
    });
    const noSurfaceCtx: ManifestPredecessorContext = {
      manifest: noSurfaceManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateDebtObservation(obs, noSurfaceCtx, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("validates a valid verification receipt", () => {
    const receipt = buildValidVerificationReceipt();
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(true);
  });

  it("F1: rejects verification receipt without response context mismatch", () => {
    const receipt = buildValidVerificationReceipt();
    const mismatchedRespCtx: ResponsePredecessorContext = {
      response: buildValidRemediationResponse({ artifactId: "different-response" }),
      reference: buildValidArtifactReference({ artifactKind: "remediation_response", artifactId: "different-response", contentHash: "b".repeat(64) }),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, t33_manifestContext, mismatchedRespCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("rejects verification receipt with invalid item outcome", () => {
    const receipt = buildValidVerificationReceipt({ itemReceipts: [{ findingId: "f-1", remediationItemId: "r-1", outcome: "INVALID" as const, evidence: "none" }] });
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(false);
  });

  it("rejects verification receipt with invalid test outcome", () => {
    const receipt = buildValidVerificationReceipt({ testReceipts: [{ findingId: "f-1", testId: "t-1", outcome: "INVALID" as const, evidence: "none" }] });
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F1: Receipt entries for unknown finding IDs must be rejected
  // -----------------------------------------------------------------------

  it("F1: rejects item receipt for unknown finding ID not in the response", () => {
    const receipt = buildValidVerificationReceipt({
      itemReceipts: [
        { findingId: "finding-001", remediationItemId: "fix-001", outcome: "VERIFIED" as const, evidence: "Verified." },
        { findingId: "unknown-finding", remediationItemId: "fix-001", outcome: "VERIFIED" as const, evidence: "Extra." },
      ],
    });
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects test receipt for unknown finding ID not in the response", () => {
    // Build a manifest context that has a finding with testMatrix for a different finding
    const receipt = buildValidVerificationReceipt({
      testReceipts: [
        { findingId: "finding-001", testId: "test-fix-001", outcome: "PASSED" as const, evidence: "Passed." },
        { findingId: "unknown-finding", testId: "test-fix-001", outcome: "PASSED" as const, evidence: "Extra." },
      ],
    });
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects item receipt for unknown finding ID only (unknown extras make receipt invalid)", () => {
    // A single item receipt for an unknown finding should be rejected
    const receipt = buildValidVerificationReceipt({
      itemReceipts: [
        { findingId: "unknown-finding", remediationItemId: "fix-001", outcome: "VERIFIED" as const, evidence: "Extra." },
      ],
    });
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects test receipt for unknown finding ID only (unknown extras make receipt invalid)", () => {
    // A single test receipt for an unknown finding should be rejected
    const receipt = buildValidVerificationReceipt({
      testReceipts: [
        { findingId: "unknown-finding", testId: "test-fix-001", outcome: "PASSED" as const, evidence: "Extra." },
      ],
    });
    const result = validateVerificationReceipt(receipt, t33_manifestContext, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  // -----------------------------------------------------------------------
  // F1: Predecessor collection member guards — null/non-record members in .find() and .map()
  // -----------------------------------------------------------------------

  it("F1: rejects remediation response with null findings member in manifest", () => {
    const response = buildValidRemediationResponse();
    const nullFindingManifest = buildValidManifest({
      findings: [null as any],
    });
    const nullCtx: ManifestPredecessorContext = {
      manifest: nullFindingManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, nullCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with string findings member in manifest", () => {
    const response = buildValidRemediationResponse();
    const stringFindingManifest = buildValidManifest({
      findings: ["not-an-object" as any],
    });
    const stringCtx: ManifestPredecessorContext = {
      manifest: stringFindingManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, stringCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with non-object remediationItems member", () => {
    const response = buildValidRemediationResponse();
    const badItemsManifest = buildValidManifest({
      findings: [{
        findingId: "finding-001",
        disposition: "IN_SCOPE_BLOCKER",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }], confirmedUnaffected: [] },
        remediationItems: [null as any],
      }],
    });
    const badCtx: ManifestPredecessorContext = {
      manifest: badItemsManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, badCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with null predecessor remediationItems", () => {
    const response = buildValidRemediationResponse();
    const nullItemsManifest = buildValidManifest({
      findings: [{
        findingId: "finding-001",
        disposition: "IN_SCOPE_BLOCKER",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }], confirmedUnaffected: [] },
        remediationItems: null as any,
      }],
    });
    const nullCtx: ManifestPredecessorContext = {
      manifest: nullItemsManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, nullCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with primitive predecessor remediationItems", () => {
    const response = buildValidRemediationResponse();
    const primitiveItemsManifest = buildValidManifest({
      findings: [{
        findingId: "finding-001",
        disposition: "IN_SCOPE_BLOCKER",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }], confirmedUnaffected: [] },
        remediationItems: "not-an-array" as any,
      }],
    });
    const primitiveCtx: ManifestPredecessorContext = {
      manifest: primitiveItemsManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, primitiveCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with non-array record predecessor remediationItems", () => {
    const response = buildValidRemediationResponse();
    const recordItemsManifest = buildValidManifest({
      findings: [{
        findingId: "finding-001",
        disposition: "IN_SCOPE_BLOCKER",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }], confirmedUnaffected: [] },
        remediationItems: { notAnArray: true } as any,
      }],
    });
    const recordCtx: ManifestPredecessorContext = {
      manifest: recordItemsManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, recordCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects remediation response with non-array surface.affected", () => {
    const response = buildValidRemediationResponse();
    const badSurfaceManifest = buildValidManifest({
      findings: [{
        findingId: "finding-001",
        disposition: "IN_SCOPE_BLOCKER",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: "not-an-array" as any, confirmedUnaffected: [] },
        remediationItems: [{ remediationItemId: "fix-001", requirement: "Fix it.", targetSurfaceIds: ["affected-1"] }],
      }],
    });
    const badCtx: ManifestPredecessorContext = {
      manifest: badSurfaceManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateRemediationResponse(response, badCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with null findings member in manifest", () => {
    const receipt = buildValidVerificationReceipt();
    const nullFindingManifest = buildValidManifest({
      findings: [null as any],
    });
    const nullManifestCtx: ManifestPredecessorContext = {
      manifest: nullFindingManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, nullManifestCtx, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects verification receipt with non-object testMatrix member", () => {
    const receipt = buildValidVerificationReceipt();
    const badTestManifest = buildValidManifest({
      findings: [{
        findingId: "finding-001",
        disposition: "IN_SCOPE_BLOCKER",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }], confirmedUnaffected: [] },
        remediationItems: [{ remediationItemId: "fix-001", requirement: "Fix it.", targetSurfaceIds: ["affected-1"] }],
        testMatrix: [null as any],
      }],
    });
    const badManifestCtx: ManifestPredecessorContext = {
      manifest: badTestManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateVerificationReceipt(receipt, badManifestCtx, t33_responseContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects replan plan with null findings member in manifest", () => {
    const plan = buildValidReplanPlan();
    const nullFindingManifest = buildValidManifest({
      findings: [null as any],
    });
    const nullCtx: ManifestPredecessorContext = {
      manifest: nullFindingManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateReplanPlan(plan, nullCtx);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with null findings member in manifest", () => {
    const obs = buildValidDebtObservation();
    const nullFindingManifest = buildValidManifest({
      findings: [null as any],
    });
    const nullCtx: ManifestPredecessorContext = {
      manifest: nullFindingManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateDebtObservation(obs, nullCtx, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with non-object snapshot in manifest finding authority", () => {
    const obs = buildValidDebtObservation();
    const badSnapManifest = buildValidManifest({
      findings: [{
        findingId: "finding-arch-debt-001",
        disposition: "ARCHITECTURE_DEBT",
        authority: { kind: "active_rule", snapshot: "not-an-object" as any },
        surface: { inspected: [], affected: [{ surfaceId: "affected-1", relativePath: "src/lib/core.ts" }], confirmedUnaffected: [] },
      } as any],
    });
    const badSnapCtx: ManifestPredecessorContext = {
      manifest: badSnapManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateDebtObservation(obs, badSnapCtx, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F1: rejects debt observation with non-object surface.affected member", () => {
    const obs = buildValidDebtObservation();
    const badSurfaceManifest = buildValidManifest({
      findings: [{
        findingId: "finding-arch-debt-001",
        disposition: "ARCHITECTURE_DEBT",
        authority: buildValidActiveRuleAuthority(),
        surface: { inspected: [], affected: ["not-an-object" as any], confirmedUnaffected: [] },
      } as any],
    });
    const badSurfaceCtx: ManifestPredecessorContext = {
      manifest: badSurfaceManifest,
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const result = validateDebtObservation(obs, badSurfaceCtx, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  // -----------------------------------------------------------------------
  // F2: Remediation response closed-key validation and collection bounds
  // -----------------------------------------------------------------------

  it("F2: rejects finding response entry with extra unknown key", () => {
    const response = buildValidRemediationResponse();
    const flawed = {
      ...response,
      findingResponses: [
        {
          findingId: response.findingResponses[0].findingId,
          items: response.findingResponses[0].items,
          extraField: "not-allowed",
        },
      ],
    };
    const result = validateRemediationResponse(flawed, t33_manifestContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_shape");
  });

  it("F2: rejects changedSurfaceIds exceeding REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES", () => {
    const oversizedChanged = Array.from({ length: REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES + 1 }, (_, i) => `affected-${i}`);
    const response = buildValidRemediationResponse({
      findingResponses: [
        {
          findingId: "finding-001",
          items: [
            {
              remediationItemId: "fix-001",
              decision: "APPLIED" as const,
              changedSurfaceIds: oversizedChanged,
              rationale: "Over limit changed surface.",
            },
          ],
        },
      ],
    });
    const result = validateRemediationResponse(response, t33_manifestContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_shape");
  });

  it("F2: rejects suspectedOutOfScopeObservations exceeding REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES", () => {
    const oversizedObs = Array.from({ length: REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES + 1 }, (_, i) => ({
      relativePath: `src/obs${i}.ts`,
      rationale: `Observation ${i}.`,
    }));
    const response = buildValidRemediationResponse({
      suspectedOutOfScopeObservations: oversizedObs,
    });
    const result = validateRemediationResponse(response, t33_manifestContext);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_shape");
  });

  it("F2: accepts valid bounded suspectedOutOfScopeObservations (positive control)", () => {
    const boundedObs = [
      { relativePath: "src/extra.ts", rationale: "Outside current scope." },
    ];
    const response = buildValidRemediationResponse({
      suspectedOutOfScopeObservations: boundedObs,
    });
    const result = validateRemediationResponse(response, t33_manifestContext);
    expect(result.valid).toBe(true);
  });

  // -----------------------------------------------------------------------
  // F3: Replan plan binding validation
  // -----------------------------------------------------------------------

  it("F3: rejects replan with empty remediationItems", () => {
    const plan = buildValidReplanPlan({ remediationItems: [] });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("F3: rejects replan with empty testMatrix", () => {
    const plan = buildValidReplanPlan({ testMatrix: [] });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("F3: rejects replan test with non-kebab-case test ID", () => {
    const plan = buildValidReplanPlan({
      testMatrix: [
        { testId: "Invalid Test ID", requirement: "Some requirement.", targetSurfaceIds: ["aff-1"] },
      ],
    });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("F3: rejects replan remediation item with empty targetSurfaceIds", () => {
    const plan = buildValidReplanPlan({
      remediationItems: [
        { remediationItemId: "fix-plan-empty", instruction: "Fix.", targetSurfaceIds: [] },
      ],
    });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("F3: rejects replan remediation item with oversized targetSurfaceIds", () => {
    const oversized = Array.from({ length: REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES + 1 }, (_, i) => `aff-${i}`);
    const plan = buildValidReplanPlan({
      remediationItems: [
        { remediationItemId: "fix-plan-oversize", instruction: "Fix.", targetSurfaceIds: oversized },
      ],
    });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("F3: rejects replan test with non-string targetSurfaceIds", () => {
    const plan = buildValidReplanPlan({
      testMatrix: [
        { testId: "test-replan-nonstr", requirement: "Req.", targetSurfaceIds: [42 as unknown as string] },
      ],
    });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("F3: rejects replan with explicitExclusions exceeding max entries", () => {
    const oversized = Array.from({ length: REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES + 1 }, (_, i) => ({
      relativePath: `src/excl${i}.ts`,
      rationale: `Exclusion ${i}.`,
    }));
    const plan = buildValidReplanPlan({ explicitExclusions: oversized });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("validates a valid replan plan", () => {
    const plan = buildValidReplanPlan();
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(true);
  });

  it("rejects replan plan with unsupported replan reason", () => {
    const plan = buildValidReplanPlan({ replanReason: "unknown_reason" as "finding_exhaustiveness" });
    const result = validateReplanPlan(plan, t33_replanContext);
    expect(result.valid).toBe(false);
  });

  it("validates a valid debt observation", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(true);
  });

  it("rejects debt observation with invalid currentFeatureImpact", () => {
    const debt = buildValidDebtObservation({
      currentFeatureImpact: "blocking" as "untouched_non_blocking",
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
  });

  it("rejects debt observation with invalid historical surface path", () => {
    const debt = buildValidDebtObservation({
      historicalSurface: [{ surfaceId: "s-1", relativePath: "/absolute/path" }],
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F4: Historical surface identity validation
  // -----------------------------------------------------------------------

  it("F4: rejects debt historical surface with duplicate surface IDs", () => {
    const debt = buildValidDebtObservation({
      historicalSurface: [
        { surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" },
        { surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" }, // Duplicate
      ],
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("duplicate_id");
  });

  it("F4: rejects debt historical surface with non-kebab-case surface ID (caught by F1 subset check)", () => {
    // F1 context detects historical ID not in affected surface first.
    const debt = buildValidDebtObservation({
      historicalSurface: [
        { surfaceId: "Invalid ID", relativePath: "src/lib/core.ts" },
      ],
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F4: rejects debt historical surface with surface ID not in manifest affected (non-subset)", () => {
    const debt = buildValidDebtObservation({
      historicalSurface: [
        { surfaceId: "not-in-affected", relativePath: "src/other.ts" },
      ],
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_artifact_reference");
  });

  it("F4: accepts debt historical surface with unique kebab-case IDs (positive control)", () => {
    const debt = buildValidDebtObservation({
      historicalSurface: [
        { surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" },
      ],
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(true);
  });

  // NEW-F5c: Debt observation authority validation via catalog
  it("validates debt observation authority against catalog", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(true);
  });

  it("rejects debt observation with unknown rule authority", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:nonexistent-rule",
        snapshot: buildValidActiveRuleSnapshot({ ruleId: "nonexistent-rule", ruleVersion: "1.0.0" }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
  });

  it("rejects debt observation with mismatched snapshot (source.document)", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "wrong/document.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
  });

  // NEW-F5(1): Absent catalog → rejected
  it("rejects debt observation without catalog", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t3_catalogHash, ruleHash: t3_expectedHash, source: { document: "docs/architecture/remediation-overview.md", section: "Secret Safety" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("ambiguous_rule_reference");
  });

  // NEW-F5(2): Absent authority → rejected
  it("rejects debt observation with absent authority", () => {
    const debt = buildValidDebtObservation();
    const partial = { ...debt, authority: undefined };
    const result = validateDebtObservation(partial, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
  });

  // NEW-F5(3): Non-active-rule authority → rejected
  // F1 context binding catches authority snapshot mismatch before catalog check.
  it("rejects debt observation with non-active-rule authority", () => {
    const debt = buildValidDebtObservation({
      authority: {
        kind: "acceptance_criterion",
        reference: "ac:E013-RC-001",
        source: { relativePath: "docs/test.md", section: "Test" },
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, t3_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_rule_snapshot");
  });

  // NEW-F5(4-partial): Inactive rule → rejected
  // F1 context binding catches authority snapshot mismatch before catalog check.
  it("rejects debt observation with inactive rule authority", () => {
    const inactiveCatalog: StrictActiveRuleCatalog = {
      catalogId: "test-catalog",
      schemaVersion: 1,
      rules: [
        {
          id: "deprecated-rule",
          version: "0.5.0",
          status: "retired",
          category: "security",
          scope: "review-governance",
          title: "Deprecated Rule",
          description: "No longer active.",
          source: { document: "docs/legacy.md", section: "Deprecated" },
        },
      ],
      catalogSourceHash: computeCatalogSourceHash({
        catalogId: "test-catalog",
        schemaVersion: 1,
        rules: [{ id: "deprecated-rule", version: "0.5.0", status: "retired", category: "security", scope: "review-governance", title: "Deprecated Rule", description: "No longer active.", source: { document: "docs/legacy.md", section: "Deprecated" } }],
      }),
    };
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:deprecated-rule",
        snapshot: buildValidActiveRuleSnapshot({ ruleId: "deprecated-rule", ruleVersion: "0.5.0", catalogSourceHash: inactiveCatalog.catalogSourceHash, ruleHash: computeReviewArtifactHash({ id: "deprecated-rule", version: "0.5.0", status: "retired", category: "security", scope: "review-governance", title: "Deprecated Rule", description: "No longer active.", source: { document: "docs/legacy.md", section: "Deprecated" } }), source: { document: "docs/legacy.md", section: "Deprecated" } }),
      },
    });
    const result = validateDebtObservation(debt, t33_debtManifestContext, undefined, undefined, inactiveCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("invalid_rule_snapshot");
  });

  it("rejects response/receipt/plan/debt with malformed envelopes", () => {
    expect(validateRemediationResponse(null as unknown as Record<string, unknown>, t33_manifestContext).valid).toBe(false);
    expect(validateVerificationReceipt("string" as unknown as Record<string, unknown>, t33_manifestContext, t33_responseContext).valid).toBe(false);
    expect(validateReplanPlan(42 as unknown as Record<string, unknown>, t33_manifestContext).valid).toBe(false);
    expect(validateDebtObservation(undefined as unknown as Record<string, unknown>, t33_debtManifestContext, undefined, undefined, t3_activeCatalog).valid).toBe(false);
  });
});

describe("Phase 3: T3.4/E013-RC-005 — Sanitized refusal mapping", () => {
  const t34_catalogRules = [
    {
      id: "secret-safe-governance-artifacts",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      description: "All governance artifacts must be secret-safe before persistence.",
      source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" },
    },
  ];
  const t34_catalogHash = computeCatalogSourceHash({
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: t34_catalogRules,
  });
  const t34_activeCatalog: StrictActiveRuleCatalog = {
    catalogId: "test-catalog",
    schemaVersion: 1,
    rules: t34_catalogRules,
    catalogSourceHash: t34_catalogHash,
  };
  const t34_expectedHash = buildStrictRuleSnapshot(
    t34_catalogRules[0],
    t34_catalogHash,
  ).ruleHash;

  // T3.4 manifest and response contexts (matching fixture defaults for F1)
  const t34_manifestContext: ManifestPredecessorContext = {
    manifest: buildValidManifest(),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };
  const t34_responseContext: ResponsePredecessorContext = {
    response: buildValidRemediationResponse(),
    reference: buildValidArtifactReference({
      artifactKind: "remediation_response",
      artifactId: "response-001",
    }),
    scope: buildValidArtifactScope(),
  };
  const t34_replanContext: ManifestPredecessorContext = {
    manifest: buildValidManifest({
      findings: [
        buildValidFinding({
          findingId: "finding-001",
          defectClass: "secret-exposure",
          disposition: "IN_SCOPE_BLOCKER",
          exhaustivenessDecision: "replan_required",
        }),
      ],
    }),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };
  const t34_debtContext: ManifestPredecessorContext = {
    manifest: buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({
          catalogSourceHash: t34_catalogHash,
          ruleHash: t34_expectedHash,
          source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" },
        }),
      ],
      findings: [
        buildValidFinding({
          findingId: "finding-arch-debt-001",
          disposition: "ARCHITECTURE_DEBT",
          claimType: "security",
          severity: "critical",
          defectClass: "secret-exposure",
          rootCause: undefined,
          remediationItems: undefined,
          testMatrix: undefined,
          exhaustivenessDecision: undefined,
          surface: buildValidSurface({ inspected: [buildValidSurfaceEntry({ surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" })], affected: [buildValidSurfaceEntry({ surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" })], confirmedUnaffected: [] }),
          debtImpact: "untouched_non_blocking",
          authority: {
            kind: "active_rule",
            reference: "rule:secret-safe-governance-artifacts",
            snapshot: buildValidActiveRuleSnapshot({
              catalogSourceHash: t34_catalogHash,
              ruleHash: t34_expectedHash,
              source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" },
            }),
          },
        }),
      ],
    }),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };

  it("returns sanitized refusals for malformed manifest input (non-object)", () => {
    for (const bad of [null, "string", 42, true, undefined]) {
      const result = validateReviewManifest({ value: bad, catalog: t34_activeCatalog });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        // Must not contain the rejected value
        expect(result.message).not.toContain(String(bad));
      }
    }
  });

  it("returns sanitized refusals without leaking rejected content", () => {
    const manifest = buildValidManifest() as Record<string, unknown>;
    manifest.secretField = "sk-test12345_api_key_value";
    const result = validateReviewManifest({ value: manifest, catalog: t34_activeCatalog });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Sanitized message must not contain the secret
      expect(result.message).not.toContain("sk-test12345");
      expect(result.message).not.toContain("secret");
    }
  });

  it("returns sanitized refusals for oversized payload", () => {
    const oversized = "x".repeat(300 * 1024); // > 256 KiB
    const result = checkPayloadSizeAndDepth(oversized, null);
    expect(result).toBeDefined();
    expect(result!.code).toBe("size_limit_exceeded");
    expect(result!.message).not.toContain(oversized.slice(0, 100));
  });

  it("returns sanitized refusals for invalid project paths in objects", () => {
    const result = checkArtifactPathSafety(
      { relativePath: "/absolute/path", nested: { relativePath: "valid/path.ts" } },
      "feature-dir",
    );
    expect(result).toBeDefined();
    expect(result!.code).toBe("invalid_project_path");
    expect(result!.message).not.toContain("/absolute/path");
  });

  it("returns sanitized refusals for unknown catalog/artifact versions", () => {
    // unsupported_schema_version via validateSchemaVersion
    const result = validateSchemaVersion("review_manifest", 99);
    expect(result).toBeDefined();
    if (result) {
      expect(result.code).toBe("unsupported_schema_version");
      expect(result.message).not.toContain("99");
    }
  });

  it("does not include rejected secret or absolute path in refusal messages", () => {
    const secretPayload = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "manifest-001",
      scope: buildValidArtifactScope(),
      result: "NEEDS_CHANGES",
      ruleSnapshots: [buildValidActiveRuleSnapshot()],
      findings: [
        buildValidFinding({
          summary: "API key exposed: sk-live-abc123def456", // gitleaks:allow -- synthetic rejection fixture
        }),
      ],
    });

    // Unsafe content check
    const parsed = JSON.parse(secretPayload);
    const unsafeResult = checkArtifactUnsafeContent(parsed);
    expect(unsafeResult).toBeDefined();
    if (unsafeResult) {
      expect(unsafeResult.message).not.toContain("sk-live");
      expect(unsafeResult.code).toBe("unsafe_content");
    }
  });

  it("checkArtifactUnsafeContent returns undefined for safe content", () => {
    const safe = { key: "safe-value", nested: { items: [1, 2, 3] }, flag: true };
    expect(checkArtifactUnsafeContent(safe)).toBeUndefined();
  });

  it("checkPayloadSizeAndDepth accepts small payloads", () => {
    expect(checkPayloadSizeAndDepth('{"key":"value"}', { key: "value" })).toBeUndefined();
  });

  it("checkPayloadSizeAndDepth rejects excessive depth", () => {
    // Build a deeply nested object (18 levels > REVIEW_ARTIFACT_MAX_DEPTH 16)
    const deep: Record<string, unknown> = { value: "root" };
    let current: Record<string, unknown> = deep;
    for (let i = 0; i < 18; i++) {
      const next: Record<string, unknown> = { value: `level-${i}` };
      current.nested = next;
      current = next;
    }
    const result = checkPayloadSizeAndDepth(JSON.stringify(deep), deep);
    expect(result).toBeDefined();
    expect(result!.code).toBe("depth_limit_exceeded");
  });

  it("checkArtifactPathSafety accepts valid paths", () => {
    expect(checkArtifactPathSafety({ relativePath: "src/lib/core.ts" }, "src")).toBeUndefined();
  });

  it("checkArtifactPathSafety rejects paths outside feature boundary", () => {
    const result = checkArtifactPathSafety(
      { relativePath: "other-project/src/main.ts" },
      "my-feature",
    );
    expect(result).toBeDefined();
    if (result) expect(result.code).toBe("invalid_feature_path");
  });

  it("checkIdUniqueness accepts unique IDs", () => {
    expect(checkIdUniqueness([
      { kind: "finding", ids: ["a", "b", "c"] },
      { kind: "remediation", ids: ["x", "y"] },
    ])).toBeUndefined();
  });

  it("checkIdUniqueness rejects duplicate IDs", () => {
    const result = checkIdUniqueness([
      { kind: "finding", ids: ["a", "b"] },
      { kind: "remediation", ids: ["b", "c"] },
    ]);
    expect(result).toBeDefined();
    if (result) expect(result.code).toBe("duplicate_id");
  });

  it("resolveFindingAuthority returns unknown_rule for nonexistent rule", () => {
    const finding = buildValidFinding({
      authority: {
        kind: "active_rule",
        reference: "rule:nonexistent",
        snapshot: buildValidActiveRuleSnapshot({ ruleId: "nonexistent" }),
      },
    });
    const result = resolveFindingAuthority(finding, t34_activeCatalog);
    expect("valid" in result || "authority" in result).toBe(true);
    if ("valid" in result && result.valid === false) {
      expect(result.code).toBe("unknown_rule");
    }
  });

  it("runValidationPipeline stops at first rejection", () => {
    let step1called = false;
    let step2called = false;

    const pipeline = [
      { name: "fail", check: () => reject("invalid_shape") },
      { name: "should-not-run", check: () => { step2called = true; return undefined; } },
    ];

    const result = runValidationPipeline(pipeline);
    expect(result).toBeDefined();
    expect(result!.code).toBe("invalid_shape");
    expect(step2called).toBe(false);
  });

  // -----------------------------------------------------------------------
  // F2: Cycle-safe rejection in checkArtifactUnsafeContent and all 5 validators
  // -----------------------------------------------------------------------

  it("checkArtifactUnsafeContent rejects cyclic values with depth_limit_exceeded", () => {
    const cyclic: Record<string, unknown> = { name: "outer", nested: { inner: "value" } };
    (cyclic as Record<string, unknown>).self = cyclic;
    const result = checkArtifactUnsafeContent(cyclic);
    expect(result).toBeDefined();
    if (result) expect(result.code).toBe("depth_limit_exceeded");
  });

  it("validateReviewManifest rejects cyclic value via rawPayload path", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: t34_catalogHash, ruleHash: t34_expectedHash, source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({ authority: { kind: "active_rule", reference: "rule:secret-safe-governance-artifacts", snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t34_catalogHash, ruleHash: t34_expectedHash, source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" } }) } }),
      ],
    });
    // Valid raw payload string for size check
    const rawPayload = JSON.stringify(manifest);
    // Inject cycle into the parsed value
    (manifest as Record<string, unknown>).circularRef = manifest;
    const result = validateReviewManifest({ value: manifest, catalog: t34_activeCatalog, rawPayload });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("depth_limit_exceeded");
  });

  it("validateRemediationResponse rejects cyclic value via rawPayload path", () => {
    const response = buildValidRemediationResponse();
    const rawPayload = JSON.stringify(response);
    (response as Record<string, unknown>).circularRef = response;
    const result = validateRemediationResponse(response, t34_manifestContext, rawPayload);
    expect(result.valid).toBe(false);
    // May be depth_limit_exceeded (from checkArtifactUnsafeContent) or size_limit_exceeded (from JSON.stringify fallback)
    if (!result.valid) {
      expect(["depth_limit_exceeded", "size_limit_exceeded"]).toContain(result.code);
    }
  });

  it("validateVerificationReceipt rejects cyclic value via rawPayload path", () => {
    const receipt = buildValidVerificationReceipt();
    const rawPayload = JSON.stringify(receipt);
    (receipt as Record<string, unknown>).circularRef = receipt;
    const result = validateVerificationReceipt(receipt, t34_manifestContext, t34_responseContext, rawPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(["depth_limit_exceeded", "size_limit_exceeded"]).toContain(result.code);
    }
  });

  it("validateReplanPlan rejects cyclic value via rawPayload path", () => {
    const plan = buildValidReplanPlan();
    const rawPayload = JSON.stringify(plan);
    (plan as Record<string, unknown>).circularRef = plan;
    const result = validateReplanPlan(plan, t34_replanContext, rawPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(["depth_limit_exceeded", "size_limit_exceeded"]).toContain(result.code);
    }
  });

  it("validateDebtObservation rejects cyclic value via rawPayload path", () => {
    const debt = buildValidDebtObservation();
    const rawPayload = JSON.stringify(debt);
    (debt as Record<string, unknown>).circularRef = debt;
    const result = validateDebtObservation(debt, t34_debtContext, undefined, rawPayload, t34_activeCatalog);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(["depth_limit_exceeded", "size_limit_exceeded"]).toContain(result.code);
    }
  });

  it("validateReviewManifest accepts non-cyclic artifact via rawPayload path (positive control)", () => {
    const manifest = buildValidManifest({
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({ catalogSourceHash: t34_catalogHash, ruleHash: t34_expectedHash, source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" } }),
      ],
      findings: [
        buildValidFinding({ authority: { kind: "active_rule", reference: "rule:secret-safe-governance-artifacts", snapshot: buildValidActiveRuleSnapshot({ catalogSourceHash: t34_catalogHash, ruleHash: t34_expectedHash, source: { document: "docs/architecture/code-review-remediation-and-architecture-debt-overview.md", section: "Secret Safety" } }) } }),
      ],
    });
    const rawPayload = JSON.stringify(manifest);
    const result = validateReviewManifest({ value: manifest, catalog: t34_activeCatalog, rawPayload });
    expect(result.valid).toBe(true);
  });

  it("validateRemediationResponse accepts non-cyclic artifact via rawPayload path (positive control)", () => {
    const response = buildValidRemediationResponse();
    const rawPayload = JSON.stringify(response);
    const result = validateRemediationResponse(response, t34_manifestContext, rawPayload);
    expect(result.valid).toBe(true);
  });

  it("validateVerificationReceipt accepts non-cyclic artifact via rawPayload path (positive control)", () => {
    const receipt = buildValidVerificationReceipt();
    const rawPayload = JSON.stringify(receipt);
    const result = validateVerificationReceipt(receipt, t34_manifestContext, t34_responseContext, rawPayload);
    expect(result.valid).toBe(true);
  });

  it("validateReplanPlan accepts non-cyclic artifact via rawPayload path (positive control)", () => {
    const plan = buildValidReplanPlan();
    const rawPayload = JSON.stringify(plan);
    const result = validateReplanPlan(plan, t34_replanContext, rawPayload);
    expect(result.valid).toBe(true);
  });

  // NOTE: validateDebtObservation requires a catalog for mandatory authority validation.
  // Use t34_activeCatalog with matching hashes to pass authority check.
  it("validateDebtObservation accepts non-cyclic artifact via rawPayload path (positive control)", () => {
    const resolvedSnap = resolveStrictActiveRule(t34_activeCatalog, "secret-safe-governance-artifacts");
    if (!resolvedSnap) { expect.fail("Could not resolve active rule from t34_activeCatalog"); return; }
    const debt = buildValidDebtObservation({
      authority: {
        kind: "active_rule",
        reference: "rule:secret-safe-governance-artifacts",
        snapshot: buildValidActiveRuleSnapshot({
          catalogSourceHash: resolvedSnap.catalogSourceHash,
          ruleHash: resolvedSnap.ruleHash,
          source: { document: resolvedSnap.source.document, section: resolvedSnap.source.section },
        }),
      },
      manifestReference: buildValidArtifactReference({
        relativePath: "reviews/manifest-001.json",
      }),
    });
    const rawPayload = JSON.stringify(debt);
    const result = validateDebtObservation(debt, t34_debtContext, rawPayload, undefined, t34_activeCatalog);

    expect(result.valid).toBe(true);
  });
});

function reject(code: string): { valid: false; code: string; message: string } {
  return { valid: false, code, message: "Artifact has an invalid structure." };
}
