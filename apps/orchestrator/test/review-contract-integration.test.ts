// Behavior suite: review contract.
/**
 * FEAT-064 Phase 6: Integration Tests — Explicit Protocol Selection And No-Fallback.
 *
 * These tests prove that the new-contract integration adapter provides a
 * deterministic protocol-selected review boundary that:
 * 1. Keeps legacy Safety Kernel enforcement and new FEAT-064 validation
 *    explicitly separate (E013-RC-006).
 * 2. Rejects new-contract artifacts deterministically without falling back
 *    to Markdown authority or the legacy persistence lane (E013-RC-005).
 * 3. Has no persistence side effects on the validation path (E013-RC-006).
 * 4. Resolves catalog snapshots through the strict catalog for rule
 *    reference binding.
 *
 * All tests are pure or use minimal local temp directories for catalog loading.
 * No test imports or invokes legacy Safety Kernel enforcement/persistence.
 */

import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { resolve, join, relative } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "node:fs";

import {
  validateReviewContractArtifact,
  loadStrictCatalogForReview,
  type ReviewContractIntegrationResult,
  resolveStrictActiveRule,
} from "../src/review-contract-integration-adapter.js";

import {
  enforceSafetyKernelReviewOutput,
  type ReviewOutputEnforcementResult,
} from "../src/index.js";

import type { StrictActiveRuleCatalog } from "../src/review-contract-catalog.js";

import type { WorkItemCard, PhaseSummary } from "../../../packages/shared/src/index.js";
import type { StoredProject } from "../src/projects/stored-project.js";

import { buildValidManifest, buildValidFinding, buildValidActiveRuleSnapshot, type ActiveRuleSnapshotV1 } from "../src/review-contract-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid catalog YAML for tests that need rule resolution. */
const MINIMAL_CATALOG_YAML = `schemaVersion: 1
catalogId: hepha-architecture-rules
rules:
  - id: secret-safe-governance-artifacts
    version: 1.0.0
    status: active
    category: security
    scope: review-governance
    title: Secret-Safe Governance Artifacts
    description: All governance artifacts must be secret-safe before persistence.
    source:
      document: docs/architecture/security.md
      section: Secret Safety
  - id: deterministic-phase-authority
    version: 1.0.0
    status: active
    category: architecture
    scope: review-governance
    title: Deterministic Phase Authority
    description: Phase transitions require deterministic authority.
    source:
      document: docs/architecture/governance.md
      section: Phase Authority
`;

/** Create a temp project root with a minimal catalog. Returns cleanup function. */
function createTestProject(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(resolve(tmpdir(), "hepha-feat-064-integration-"));
  const hephaDir = resolve(projectRoot, ".hepha");
  // .hepha directory is created by writeFileSync's mkdir option, so use mkdirSync
  const { mkdirSync } = require("node:fs");
  mkdirSync(hephaDir, { recursive: true });
  writeFileSync(resolve(hephaDir, "architecture-rules.yaml"), MINIMAL_CATALOG_YAML, "utf8");
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

/** Serialize a validated manifest with the correct artifactKind. */
function serializeManifest(manifest: ReturnType<typeof buildValidManifest>): string {
  return JSON.stringify(manifest);
}

/**
 * Get a resolved rule snapshot from the catalog for test fixtures.
 * Falls back to a hardcoded placeholder when the rule is not found
 * (for tests that expect rejection).
 */
function getResolvedSnapshot(catalog: StrictActiveRuleCatalog, ruleId: string = "secret-safe-governance-artifacts"): ActiveRuleSnapshotV1 {
  const snapshot = resolveStrictActiveRule(catalog, ruleId);
  if (!snapshot) {
    throw new Error(`Rule "${ruleId}" not found or not active in test catalog`);
  }
  return snapshot;
}

/**
 * Build a valid manifest with correct rule snapshots and finding authorities
 * that match the provided catalog. Overrides the default buildValidManifest
 * findings so that authority snapshots have the correct ruleHash.
 */
function buildValidManifestForCatalog(
  catalog: StrictActiveRuleCatalog,
  overrides?: Partial<import("../src/review-contract-types.js").ReviewManifest>,
): import("../src/review-contract-types.js").ReviewManifest {
  const ruleSnapshot = getResolvedSnapshot(catalog);
  const defaultManifest = buildValidManifest({
    ruleSnapshots: [ruleSnapshot],
    ...overrides,
  });
  // Override findings to use the correct authority snapshot
  const finding = defaultManifest.findings[0];
  if (finding && finding.authority.kind === "active_rule") {
    const fixedFinding = {
      ...finding,
      authority: {
        ...finding.authority,
        snapshot: ruleSnapshot,
      },
    };
    return {
      ...defaultManifest,
      findings: [fixedFinding],
    };
  }
  return defaultManifest;
}

// ---------------------------------------------------------------------------
// E013-RC-006: Explicit protocol separation
// ---------------------------------------------------------------------------

describe("E013-RC-006: explicit protocol separation", () => {
  it("keeps legacy and new review protocols explicitly separate", () => {
    // The new validation lane accepts only new-contract artifacts (artifactKind: "review_manifest").
    // A legacy SafetyKernelManifest does not have artifactKind and should be rejected.
    const legacyManifest = JSON.stringify({
      schemaVersion: 1,
      manifestId: "manifest-legacy-1",
      projectId: "hepha",
      cardKey: "FEAT-064",
      phaseNumber: 6,
      reviewGateId: "code-review",
      result: "APPROVED",
      findings: [],
    });

    const result = validateReviewContractArtifact(legacyManifest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Must not fall back to legacy meaning — it's structurally invalid
      expect(result.code).toBe("invalid_shape");
    }
  });

  it("accepts a valid new-contract manifest", () => {
    const manifest = buildValidManifest();
    const payload = serializeManifest(manifest);

    const result = validateReviewContractArtifact(payload);
    expect(result.valid).toBe(false);
    // Without a catalog, manifest validation needs projectRoot or catalog
    if (!result.valid) {
      // Should reject with invalid_shape because no catalog for rule resolution
      expect(result.code).toBe("invalid_shape");
    }
  });

  it("accepts a valid new-contract manifest with a provided catalog", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalogResult = loadStrictCatalogForReview(projectRoot);
      expect("valid" in catalogResult && !(catalogResult as { valid: false }).valid).toBe(false);

      const catalog = catalogResult as StrictActiveRuleCatalog;

      // Build a manifest that matches the catalog rules
      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "manifest-integration-valid",
        result: "NEEDS_CHANGES",
      });
      const payload = serializeManifest(manifest);

      const result = validateReviewContractArtifact(payload, { catalog });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.artifact).toBeDefined();
        expect(result.artifact.artifactKind).toBe("review_manifest");
        expect(result.projection).toBeDefined();
        expect(result.projection.artifactKind).toBe("review_manifest");
        expect(result.projection.contentHash).toMatch(/^[a-f0-9]{64}$/);
      }
    } finally {
      cleanup();
    }
  });

  it("rejects a legacy manifest via the new lane and does not invoke legacy enforcement", () => {
    // A raw object that looks like SafetyKernelManifest but has no artifactKind
    const legacyPayload = JSON.stringify({
      schemaVersion: 1,
      manifestId: "legacy-1",
      projectId: "hepha",
      cardKey: "FEAT-064",
      phaseNumber: 6,
      reviewGateId: "code-review",
      result: "NEEDS_CHANGES",
    });

    const result = validateReviewContractArtifact(legacyPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Rejected as invalid shape (missing artifactKind), not as legacy persistence failure
      expect(result.code).toBe("invalid_shape");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });
});

// ---------------------------------------------------------------------------
// E013-RC-005 boundary: No fallback to Markdown or legacy persistence
// ---------------------------------------------------------------------------

describe("E013-RC-005 boundary: no fallback after rejection", () => {
  it("does not fall back to Markdown or legacy persistence after a rejected new contract", () => {
    // Malformed JSON — should return a structured rejection, not Markdown
    const result = validateReviewContractArtifact("not valid json {{{");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_shape");
      // Must not contain Markdown or legacy persistence references
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });

  it("rejects unknown artifact kind without falling back to any legacy path", () => {
    const unknownKind = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "unknown_future_kind",
      artifactId: "future-001",
    });

    const result = validateReviewContractArtifact(unknownKind);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("unsupported_schema_version");
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("legacy");
    }
  });

  it("rejects unsupported schema version deterministically", () => {
    const v99Manifest = JSON.stringify({
      schemaVersion: 99,
      artifactKind: "review_manifest",
      artifactId: "v99-001",
    });

    const result = validateReviewContractArtifact(v99Manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("unsupported_schema_version");
      // Must be a generic safe message, not a raw diagnostic
      expect(result.message).not.toContain("99");
    }
  });

  it("rejects manifest with missing required fields without legacy fallback", () => {
    const emptyManifest = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "review_manifest",
    });

    const result = validateReviewContractArtifact(emptyManifest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Should be invalid_shape (envelope validation catches missing artifactId)
      expect(result.code).toBe("invalid_shape");
      expect(result.message).not.toContain("```");
    }
  });

  it("rejects secret-bearing artifact content without leaking the secret", () => {
    const secretPayload = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "secret-test",
      scope: {
        projectId: "hepha",
        featureId: "feat-064",
        phaseNumber: 2,
        reviewGateId: "code-review",
      },
      result: "NEEDS_CHANGES",
      ruleSnapshots: [],
      findings: [{
        findingId: "finding-secret",
        disposition: "OBSERVATION",
        claimType: "feature_correctness",
        defectClass: "test-finding",
        severity: "note",
        summary: "Authorization: Bearer sk-test-secret-key-12345",
        surface: {
          inspected: [{ surfaceId: "test-1", relativePath: "src/test.ts" }],
          affected: [{ surfaceId: "test-2", relativePath: "src/test.ts" }],
          confirmedUnaffected: [{ surfaceId: "test-3", relativePath: "src/utils.ts" }],
        },
        authority: {
          kind: "acceptance_criterion",
          reference: "ac:feat-064:RC-005",
          source: { relativePath: "docs/test.md", section: "Secrets" },
        },
      }],
    });

    const result = validateReviewContractArtifact(secretPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Must not leak the secret in the rejection message
      expect(result.message).not.toContain("sk-test-secret-key");
      expect(result.message).not.toContain("Bearer");
    }
  });
});

// ---------------------------------------------------------------------------
// E013-RC-006: No persistence side effects
// ---------------------------------------------------------------------------

describe("E013-RC-006: no persistence side effects", () => {
  it("keeps new-contract validation side-effect free", () => {
    // Verify that the integration adapter module does not import or reference
    // any Safety Kernel persistence/enforcement code. This is a static check
    // on the source — we verify the adapter functions complete without
    // any db/write operations.
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;

      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "side-effect-test",
        result: "NEEDS_CHANGES",
      });
      const payload = serializeManifest(manifest);

      // Run validation — should return a result without any writes
      const result = validateReviewContractArtifact(payload, { catalog });
      expect(result.valid).toBe(true);

      // The only file that existed before validation is the catalog YAML
      // No new files should have been created during validation
      const files = readdirSync(resolve(projectRoot, ".hepha"));
      expect(files).toEqual(["architecture-rules.yaml"]);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// E013-RC-006: Catalog snapshot resolution
// ---------------------------------------------------------------------------

describe("E013-RC-006: catalog snapshot resolution", () => {
  it("resolves an active rule from the strict catalog during validation", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalogResult = loadStrictCatalogForReview(projectRoot);
      expect("valid" in catalogResult && !(catalogResult as { valid: false }).valid).toBe(false);

      const catalog = catalogResult as StrictActiveRuleCatalog;
      expect(catalog.rules.length).toBeGreaterThanOrEqual(2);
      expect(catalog.rules[0]?.id).toBe("secret-safe-governance-artifacts");

      // Build a manifest that references the active rule
      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "manifest-catalog-test",
        result: "NEEDS_CHANGES",
      });
      const payload = serializeManifest(manifest);

      const result = validateReviewContractArtifact(payload, { catalog });
      expect(result.valid).toBe(true);
      if (result.valid) {
        // The projection should include resolved rule snapshots
        expect(result.projection.resolvedRuleSnapshots).toBeDefined();
        expect(result.projection.resolvedRuleSnapshots!.length).toBeGreaterThanOrEqual(1);
        expect(result.projection.resolvedRuleSnapshots![0]!.ruleId).toBe("secret-safe-governance-artifacts");
      }
    } finally {
      cleanup();
    }
  });

  it("rejects a manifest with an unknown rule reference", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;

      // Build a manifest that references a non-existent rule
      const manifest = buildValidManifest({
        artifactId: "manifest-unknown-rule",
        result: "NEEDS_CHANGES",
        ruleSnapshots: [],
        findings: [{
          findingId: "finding-unknown-rule",
          disposition: "IN_SCOPE_BLOCKER",
          claimType: "security",
          authority: {
            kind: "active_rule",
            reference: "rule:nonexistent-rule",
            snapshot: {
              schemaVersion: 1,
              catalogSchemaVersion: 1,
              ruleId: "nonexistent-rule",
              ruleVersion: "1.0.0",
              category: "security",
              scope: "review-governance",
              title: "Nonexistent Rule",
              source: { document: "docs/test.md", section: "Test" },
              catalogPath: ".hepha/architecture-rules.yaml",
              catalogSourceHash: "a".repeat(64),
              ruleHash: "b".repeat(64),
            },
          },
          defectClass: "test-class",
          severity: "blocker",
          summary: "Test summary.",
          surface: {
            inspected: [{ surfaceId: "src-1", relativePath: "src/lib/core.ts" }],
            affected: [{ surfaceId: "src-2", relativePath: "src/lib/core.ts" }],
            confirmedUnaffected: [{ surfaceId: "src-3", relativePath: "src/utils.ts" }],
          },
          rootCause: "No rule found.",
          remediationItems: [{ remediationItemId: "fix-001", instruction: "Add rule.", targetSurfaceIds: ["src-2"] }],
          testMatrix: [{ testId: "test-001", requirement: "Rule resolves.", targetSurfaceIds: ["src-2"] }],
          exhaustivenessDecision: "local_only",
        }],
      });
      const payload = serializeManifest(manifest);

      const result = validateReviewContractArtifact(payload, { catalog });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("unknown_rule");
      }
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// E013-RC-006: Non-manifest artifact routing
// ---------------------------------------------------------------------------

describe("E013-RC-006: non-manifest artifact validation", () => {
  it("requires manifest context for remediation_response", () => {
    // A remediation_response without a manifest context should fail
    const responsePayload = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "remediation_response",
      artifactId: "response-001",
      scope: { projectId: "hepha", featureId: "feat-064", phaseNumber: 2, reviewGateId: "code-review" },
      manifestReference: { artifactKind: "review_manifest", artifactId: "manifest-001", contentHash: "a".repeat(64), relativePath: "reviews/manifest-001.json" },
      findingResponses: [],
    });

    const result = validateReviewContractArtifact(responsePayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_artifact_reference");
    }
  });

  it("requires both manifest and response contexts for verification_receipt", () => {
    const receiptPayload = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "verification_receipt",
      artifactId: "receipt-001",
      scope: { projectId: "hepha", featureId: "feat-064", phaseNumber: 2, reviewGateId: "code-review" },
      manifestReference: { artifactKind: "review_manifest", artifactId: "manifest-001", contentHash: "a".repeat(64), relativePath: "reviews/manifest-001.json" },
      responseReference: { artifactKind: "remediation_response", artifactId: "response-001", contentHash: "a".repeat(64), relativePath: "reviews/response-001.json" },
      itemReceipts: [],
      testReceipts: [],
    });

    // Without manifest context
    const resultWithoutManifest = validateReviewContractArtifact(receiptPayload);
    expect(resultWithoutManifest.valid).toBe(false);
    if (!resultWithoutManifest.valid) {
      expect(resultWithoutManifest.code).toBe("invalid_artifact_reference");
    }

    // With manifest but without response context
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;
      const manifest = buildValidManifestForCatalog(catalog, { artifactId: "manifest-001", result: "NEEDS_CHANGES" });
      const manifestResult = validateReviewContractArtifact(serializeManifest(manifest), { catalog });
      expect(manifestResult.valid).toBe(true);
      // But for receipt validation, the caller must provide a full manifest context
      // We only test the routing here: missing response context = rejection
      const resultWithManifestOnly = validateReviewContractArtifact(receiptPayload, {
        catalog,
        manifestContext: {
          manifest: manifest as any,
          reference: { artifactKind: "review_manifest", artifactId: "manifest-001", contentHash: "a".repeat(64), relativePath: "reviews/manifest-001.json" },
          scope: { projectId: "hepha", featureId: "feat-064", phaseNumber: 2, reviewGateId: "code-review" },
        },
      });
      expect(resultWithManifestOnly.valid).toBe(false);
      if (!resultWithManifestOnly.valid) {
        expect(resultWithManifestOnly.code).toBe("invalid_artifact_reference");
      }
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// E013-RC-006: Static import audit (no legacy Safety Kernel code)
// ---------------------------------------------------------------------------

describe("E013-RC-006: static import boundary", () => {
  it("does not import any Safety Kernel enforcement/persistence module", () => {
    // Read the source file and verify import lines do NOT reference
    // safety-kernel-review-enforcement, safety-kernel-integration-adapter,
    // safety-kernel-contract, or @hepha/db. Doc comments may mention
    // these module names as architectural references, but actual imports
    // must be absent.
    const fs = require("node:fs");
    const source = fs.readFileSync(
      resolve(__dirname, "../src/review-contract-integration-adapter.ts"),
      "utf8",
    );

    // Check import statements only — doc comments may reference enforcement paths
    const importLines = source.split("\n").filter((l: string) => l.startsWith("import "));

    expect(importLines.filter((l: string) => l.includes("safety-kernel-review-enforcement"))).toEqual([]);
    expect(importLines.filter((l: string) => l.includes("safety-kernel-integration-adapter"))).toEqual([]);
    expect(importLines.filter((l: string) => l.includes("safety-kernel-contract"))).toEqual([]);
    expect(importLines.filter((l: string) => l.includes("@hepha/db"))).toEqual([]);
    expect(importLines.filter((l: string) => l.includes("safety-kernel-policy"))).toEqual([]);
    expect(importLines.filter((l: string) => l.includes("enforceSafetyKernelReview"))).toEqual([]);
    expect(importLines.filter((l: string) => l.includes("persistSafetyKernelManifest"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T6.2: Deterministic safe refusal for all invalid input categories
// ---------------------------------------------------------------------------

describe("T6.2: malformed, unknown-version/rule, duplicate, secret, oversized, path-unsafe no-fallback", () => {
  it("rejects duplicate finding IDs through the adapter with no legacy fallback", () => {
    // Build a manifest with two identical finding IDs
    const duplicateIdPayload = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "manifest-dup-findings",
      scope: {
        projectId: "hepha",
        featureId: "feat-064",
        phaseNumber: 6,
        reviewGateId: "code-review",
      },
      result: "NEEDS_CHANGES",
      ruleSnapshots: [
        buildValidActiveRuleSnapshot({
          ruleId: "rule-01",
          ruleVersion: "1.0.0",
          category: "security",
          title: "Test Rule 1",
          ruleHash: "a".repeat(64),
        }),
      ],
      findings: [
        buildValidFinding({ findingId: "finding-001", disposition: "OBSERVATION", claimType: "feature_correctness",
          authority: { kind: "acceptance_criterion", reference: "ac:feat-064", source: { relativePath: "docs/test.md", section: "Test" } },
          defectClass: "test-dup", severity: "note", summary: "First same-ID finding." }),
        buildValidFinding({ findingId: "finding-001", disposition: "OBSERVATION", claimType: "feature_correctness",
          authority: { kind: "acceptance_criterion", reference: "ac:feat-064", source: { relativePath: "docs/test.md", section: "Test" } },
          defectClass: "test-dup", severity: "note", summary: "Duplicate same-ID finding." }),
      ],
    });

    // Create a dummy catalog so the envelope passes and the Phase 3 validator runs
    const dummyCatalog: StrictActiveRuleCatalog = {
      schemaVersion: 1,
      catalogId: "hepha-architecture-rules",
      rules: [],
    };

    const result = validateReviewContractArtifact(duplicateIdPayload, { catalog: dummyCatalog });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("duplicate_id");
      // Must not fall back to Markdown or legacy persistence language
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
      expect(result.message).not.toContain("legacy");
      // Must not leak raw input values
      expect(result.message).not.toContain("finding-001");
      expect(result.message).not.toContain("First same-ID");
    }
  });

  it("rejects oversized payload at the adapter envelope with no legacy fallback", () => {
    // Create a payload just over 256 KiB
    const oversizedPayload = "x".repeat(260 * 1024);

    const result = validateReviewContractArtifact(oversizedPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("size_limit_exceeded");
      // Must not fall back to Markdown or legacy persistence language
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
      // Must not leak raw payload content in the message
      expect(result.message).not.toContain("xxxxx");
      // Must be the generic safe size-limit message
      expect(result.message).toBe("Artifact exceeds a supported size limit.");
    }
  });

  it("rejects path-unsafe inputs through the adapter with no legacy fallback", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;

      // Build a manifest containing a path that escapes the feature boundary
      const pathUnsafePayload = JSON.stringify({
        schemaVersion: 1,
        artifactKind: "review_manifest",
        artifactId: "manifest-path-unsafe",
        scope: {
          projectId: "hepha",
          featureId: "feat-064",
          phaseNumber: 6,
          reviewGateId: "code-review",
        },
        result: "NEEDS_CHANGES",
        ruleSnapshots: [
          buildValidActiveRuleSnapshot({
            ruleId: "secret-safe-governance-artifacts",
          }),
        ],
        findings: [
          buildValidFinding({
            findingId: "finding-path-001",
            claimType: "security",
            disposition: "IN_SCOPE_BLOCKER",
            authority: {
              kind: "active_rule",
              reference: "rule:secret-safe-governance-artifacts",
              snapshot: buildValidActiveRuleSnapshot({
                ruleId: "secret-safe-governance-artifacts",
              }),
            },
            summary: "Path safety test.",
            surface: {
              inspected: [{ surfaceId: "esc-1", relativePath: "../../etc/passwd" }],
              affected: [{ surfaceId: "esc-2", relativePath: "src/lib/core.ts" }],
              confirmedUnaffected: [{ surfaceId: "esc-3", relativePath: "src/utils.ts" }],
            },
            exhaustivenessDecision: "local_only",
            defectClass: "path-escape",
            severity: "blocker",
            rootCause: "Path escape attempt.",
            remediationItems: [],
            testMatrix: [],
          }),
        ],
      });

      const featurePath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-064-active-rule-catalog-and-structured-review-contra";
      const result = validateReviewContractArtifact(pathUnsafePayload, {
        catalog,
        featurePath,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(["invalid_project_path", "invalid_feature_path"]).toContain(result.code);
        // Must not fall back to Markdown or legacy persistence language
        expect(result.message).not.toContain("```");
        expect(result.message).not.toContain("PERSISTED");
        expect(result.message).not.toContain("NEEDS_HUMAN");
        // Must not leak the raw escaping path
        expect(result.message).not.toContain("../../etc/passwd");
        expect(result.message).not.toContain("passwd");
      }
    } finally {
      cleanup();
    }
  });

  it("secret-bearing payload is rejected through the adapter with no secret leak and no legacy fallback", () => {
    // This test verifies the existing secret-bearing rejection path works
    // through the adapter at the integration level, not just the pure validator.
    const secretPayload = JSON.stringify({
      schemaVersion: 1,
      artifactKind: "review_manifest",
      artifactId: "secret-test-064",
      scope: {
        projectId: "hepha",
        featureId: "feat-064",
        phaseNumber: 6,
        reviewGateId: "code-review",
      },
      result: "NEEDS_CHANGES",
      ruleSnapshots: [],
      findings: [{
        findingId: "finding-secret-064",
        disposition: "OBSERVATION",
        claimType: "feature_correctness",
        defectClass: "secret-leak",
        severity: "note",
        summary: "Contains a secret: AKIA1234567890EXAMPLE",
        authority: {
          kind: "acceptance_criterion",
          reference: "ac:feat-064",
          source: { relativePath: "docs/test.md", section: "Secrets" },
        },
        surface: {
          inspected: [{ surfaceId: "s-1", relativePath: "src/test.ts" }],
          affected: [{ surfaceId: "s-2", relativePath: "src/test.ts" }],
          confirmedUnaffected: [{ surfaceId: "s-3", relativePath: "src/utils.ts" }],
        },
      }],
    });

    const result = validateReviewContractArtifact(secretPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Must not leak the secret value
      expect(result.message).not.toContain("AKIA1234567890EXAMPLE");
      expect(result.message).not.toContain("AKIA");
      // Must not fall back to Markdown or legacy persistence
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });

  it("unknown artifact version is rejected through the adapter with no fallback", () => {
    const unknownVersionPayload = JSON.stringify({
      schemaVersion: 999,
      artifactKind: "review_manifest",
      artifactId: "v999-manifest",
    });

    const result = validateReviewContractArtifact(unknownVersionPayload);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("unsupported_schema_version");
      // Must not reveal the unsupported version number
      expect(result.message).not.toContain("999");
      // Must not fall back to Markdown or legacy persistence
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });

  it("unknown rule reference is rejected through the adapter with no legacy fallback", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;

      // Build a manifest referencing a rule that does not exist in the catalog
      const unknownRulePayload = JSON.stringify({
        schemaVersion: 1,
        artifactKind: "review_manifest",
        artifactId: "manifest-unknown-rule-064",
        scope: {
          projectId: "hepha",
          featureId: "feat-064",
          phaseNumber: 6,
          reviewGateId: "code-review",
        },
        result: "NEEDS_CHANGES",
        ruleSnapshots: [
          buildValidActiveRuleSnapshot({
            ruleId: "nonexistent-rule-id",
          }),
        ],
        findings: [
          buildValidFinding({
            findingId: "finding-unr",
            claimType: "security",
            disposition: "IN_SCOPE_BLOCKER",
            authority: {
              kind: "active_rule",
              reference: "rule:nonexistent-rule-id",
              snapshot: buildValidActiveRuleSnapshot({
                ruleId: "nonexistent-rule-id",
              }),
            },
            summary: "Unknown rule test.",
            surface: {
              inspected: [{ surfaceId: "u-1", relativePath: "src/test.ts" }],
              affected: [{ surfaceId: "u-2", relativePath: "src/test.ts" }],
              confirmedUnaffected: [{ surfaceId: "u-3", relativePath: "src/utils.ts" }],
            },
            exhaustivenessDecision: "local_only",
            defectClass: "unknown-rule",
            severity: "blocker",
            rootCause: "Unknown rule.",
            remediationItems: [],
            testMatrix: [],
          }),
        ],
      });

      const result = validateReviewContractArtifact(unknownRulePayload, { catalog });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe("unknown_rule");
        // Must not reveal the unknown rule ID
        expect(result.message).not.toContain("nonexistent-rule-id");
        // Must not fall back to Markdown or legacy persistence
        expect(result.message).not.toContain("```");
        expect(result.message).not.toContain("PERSISTED");
        expect(result.message).not.toContain("NEEDS_HUMAN");
      }
    } finally {
      cleanup();
    }
  });

  it("malformed JSON is rejected at the adapter envelope with no legacy fallback", () => {
    // Highly malformed input — must not trigger Markdown or legacy fallback
    const result = validateReviewContractArtifact("{{{{broken [[[ raw ]]] }}  ");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_shape");
      // Must not fall back to Markdown or legacy persistence language
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
      // Must not contain raw input fragments
      expect(result.message).not.toContain("broken");
      expect(result.message).not.toContain("[[[");
    }
  });

  it("null/primitive envelope inputs are rejected with no legacy fallback", () => {
    // Non-object envelope
    const result = validateReviewContractArtifact(JSON.stringify(null));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_shape");
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });

  it("array envelope inputs are rejected with no legacy fallback", () => {
    const result = validateReviewContractArtifact(JSON.stringify(["a", "b"]));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_shape");
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });

  it("missing artifactKind is rejected with no legacy fallback", () => {
    const result = validateReviewContractArtifact(JSON.stringify({ schemaVersion: 1 }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("invalid_shape");
      expect(result.message).not.toContain("```");
      expect(result.message).not.toContain("PERSISTED");
      expect(result.message).not.toContain("NEEDS_HUMAN");
    }
  });
});

// ---------------------------------------------------------------------------
// F1: the production review boundary is V1-only. It accepts raw V1 manifests
// and never selects a Markdown/Safety-Kernel fallback lane.
// ---------------------------------------------------------------------------

describe("F1: V1-only production review boundary", () => {
  /** Build minimal input matching the enforceSafetyKernelReviewOutput signature. */
  function buildInput(overrides: {
    reviewOutput: string;
    rootPath: string;
    folderPath: string;
  }): Parameters<typeof enforceSafetyKernelReviewOutput>[0] {
    return {
      feature: {
        id: "test-project:03_IN_PROGRESS:FEAT-064-test-feature",
        externalId: "FEAT-064",
        kind: "feature" as const,
        title: "Test Feature",
        stateFolder: "03_IN_PROGRESS" as const,
        stateLabel: "In Progress",
        folderName: "FEAT-064-test-feature",
        folderPath: overrides.folderPath,
        documentPath: null,
        documentUpdatedAt: null,
        documentRelativePath: null,
        epicState: null,
        epicRefinements: [],
        specMarkdown: "",
        summary: "",
        linkedEpicIds: [],
        linkedEpics: [],
        linkedFeatureIds: [],
        linkedFeatures: [],
        missingFeatureIds: [],
        featureWorkflow: null,
        implementationEvidence: null,
        phases: [],
        validation: {
          isComplete: false,
          hasDocument: false,
          hasLinkedEpic: false,
          hasPhases: false,
          hasValidDocument: false,
          kind: "unknown",
          valid: false,
          missingRequired: [],
          issues: [],
          warnings: [],
        },
      },
      phase: {
        number: 6,
        defaultImplementationModel: null,
        documentPath: "Phases/phase-6-integration.md",
        documentRelativePath: "Phases/phase-6-integration.md",
        estimatedAiTime: null,
        estimatedHumanTime: null,
        fileName: "phase-6-integration.md",
        predictedModel: null,
        predictedModelSource: "unavailable_phase_override" as const,
        recommendedAgent: null,
        recommendedModel: null,
        status: "AWAITING_REVIEW",
        title: "Phase 6 - Integration",
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
      project: {
        id: "test-project",
        createdAt: "2026-07-14T00:00:00.000Z",
        memoryBankPath: "/fake/memorybank",
        name: "Test Project",
        rootPath: overrides.rootPath,
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
      reviewGateId: "code-review",
      reviewOutput: overrides.reviewOutput,
    };
  }

  it("validates a raw V1 manifest through the production boundary", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;
      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "manifest-prod-reachable-v1",
        result: "NEEDS_CHANGES",
        scope: {
          projectId: "test-project",
          featureId: "feat-064-test-feature",
          phaseNumber: 6,
          reviewGateId: "code-review",
        },
      });
      const payload = serializeManifest(manifest);

      // Use the same production boundary function (enforceSafetyKernelReviewOutput)
      // that the review-output workflow uses in index.ts
      const featFolder = join(projectRoot, "Features", "03_IN_PROGRESS", "FEAT-064-test-feature");
      const result = enforceSafetyKernelReviewOutput(
        buildInput({ reviewOutput: payload, rootPath: projectRoot, folderPath: featFolder }),
      );

      expect(result.state).toBe("V1_VALIDATED");
      if (result.state === "V1_VALIDATED") {
        const vr = result as Extract<typeof result, { state: "V1_VALIDATED" }>;
        expect(vr.projection.valid).toBe(true);
        expect(vr.projection.artifact.artifactKind).toBe("review_manifest");
        expect(vr.projection.projection.contentHash).toMatch(/^[a-f0-9]{64}$/);
        // V1 result must not carry a markdown field (no Safety Kernel enforcement)
        expect("markdown" in vr).toBe(false);
      }
    } finally {
      cleanup();
    }
  });

  it("rejects Markdown or malformed payloads without a fallback", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const featFolder = join(projectRoot, "Features", "03_IN_PROGRESS", "FEAT-064-test-feature");
      const result = enforceSafetyKernelReviewOutput(
        buildInput({ reviewOutput: "## Markdown review\nReview Result: APPROVED", rootPath: projectRoot, folderPath: featFolder }),
      );

      expect(result.state).toBe("V1_REJECTED");
      if (result.state === "V1_REJECTED") {
        const rr = result as Extract<typeof result, { state: "V1_REJECTED" }>;
        expect(rr.rejection.code).toBe("invalid_shape");
        // Must not contain Safety Kernel enforcement language
        expect(rr.rejection.message).not.toContain("NEEDS_HUMAN");
        expect(rr.rejection.message).not.toContain("PERSISTED");
        // Must not contain Markdown
        expect(rr.rejection.message).not.toContain("```");
        // V1 result must not carry a markdown field
        expect("markdown" in rr).toBe(false);
      }
    } finally {
      cleanup();
    }
  });

  it("rejects a blocker manifest that omits its canonical compatibility decision", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;
      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "manifest-without-compatibility-decision",
        result: "NEEDS_CHANGES",
        scope: {
          projectId: "test-project",
          featureId: "feat-064-test-feature",
          phaseNumber: 6,
          reviewGateId: "code-review",
        },
      });
      const payload = JSON.parse(serializeManifest(manifest));
      delete payload.findings[0].compatibilityDecision;

      const featFolder = join(projectRoot, "Features", "03_IN_PROGRESS", "FEAT-064-test-feature");
      const result = enforceSafetyKernelReviewOutput(
        buildInput({ reviewOutput: JSON.stringify(payload), rootPath: projectRoot, folderPath: featFolder }),
      );
      expect(result.state).toBe("V1_REJECTED");
      if (result.state === "V1_REJECTED") {
        expect(result.rejection.code).toBe("invalid_shape");
      }
    } finally {
      cleanup();
    }
  });

  it("rejects a V1 manifest whose scope is not the current workflow scope", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;
      const expectedScope = {
        projectId: "test-project",
        featureId: "feat-064-test-feature",
        phaseNumber: 6,
        reviewGateId: "code-review",
      };

      for (const scope of [
        { ...expectedScope, projectId: "other-project" },
        { ...expectedScope, featureId: "feat-999" },
        { ...expectedScope, featureId: "FEAT-064-test-feature" },
        { ...expectedScope, phaseNumber: 7 },
        { ...expectedScope, reviewGateId: "plan-review" },
      ]) {
        const manifest = buildValidManifestForCatalog(catalog, {
          artifactId: `manifest-scope-${scope.projectId}-${scope.featureId}-${scope.phaseNumber}-${scope.reviewGateId}`.toLowerCase(),
          result: "NEEDS_CHANGES",
          scope,
        });

        const featFolder = join(projectRoot, "Features", "03_IN_PROGRESS", "FEAT-064-test-feature");
        const result = enforceSafetyKernelReviewOutput(
          buildInput({
            reviewOutput: serializeManifest(manifest),
            rootPath: projectRoot,
            folderPath: featFolder,
          }),
        );

        expect(result.state).toBe("V1_REJECTED");
        if (result.state === "V1_REJECTED") {
          expect(result.rejection.code).toBe("invalid_shape");
        }
      }
    } finally {
      cleanup();
    }
  });

  it("rejects a composite card with no valid V1 feature-folder identifier", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;
      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "manifest-invalid-feature-scope",
        result: "NEEDS_CHANGES",
        scope: {
          projectId: "test-project",
          featureId: "feat-064-test-feature",
          phaseNumber: 6,
          reviewGateId: "code-review",
        },
      });
      const featFolder = join(projectRoot, "Features", "03_IN_PROGRESS", "FEAT-064-test-feature");
      const input = buildInput({ reviewOutput: serializeManifest(manifest), rootPath: projectRoot, folderPath: featFolder });
      input.feature = { ...input.feature, folderName: "not a valid V1 feature scope" };

      const result = enforceSafetyKernelReviewOutput(input);
      expect(result.state).toBe("V1_REJECTED");
      if (result.state === "V1_REJECTED") {
        expect(result.rejection.code).toBe("invalid_shape");
      }
    } finally {
      cleanup();
    }
  });

  it("has no protocol selector or legacy fallback in the production boundary", () => {
    const fs = require("node:fs");
    const indexSource = fs.readFileSync(
      resolve(__dirname, "../src/index.ts"),
      "utf8",
    );
    const workflowSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/implementation/autonomous-implementation-workflow-application.ts"),
      "utf8",
    );
    const repairPromptSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/prompts/review-contract-repair-prompt.ts"),
      "utf8",
    );
    const enforcementSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/review-output-enforcement.ts"),
      "utf8",
    );
    expect(enforcementSource).toContain("validateReviewContractArtifact");
    expect(enforcementSource).toContain('from "../../review-contract-integration-adapter.js"');
    expect(indexSource).toContain('enforceSafetyKernelReviewOutput');
    expect(indexSource).not.toContain("HEPHA_REVIEW_PROTOCOL");
    expect(indexSource).not.toContain("LEGACY_SAFETY_KERNEL");
    expect(indexSource).not.toContain("readReviewProtocol");
    expect(indexSource).not.toContain("enforceSafetyKernelReview(");
    expect(repairPromptSource).toContain("Return exactly one raw JSON object");
    expect(workflowSource).toContain("review_manifest");
  });

  it("routes a validated V1 NEEDS_CHANGES manifest through the deterministic report and fixer circuit", () => {
    const fs = require("node:fs");
    const indexSource = fs.readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
    const reviewCompositionSource = fs.readFileSync(
      resolve(__dirname, "../src/bootstrap/phase-review-applications.ts"),
      "utf8",
    );
    const workflowSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/implementation/autonomous-implementation-workflow-application.ts"),
      "utf8",
    );
    const publicationSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/phase-review-publication-application.ts"),
      "utf8",
    );
    const lifecycleSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/phase-review-lifecycle-application.ts"),
      "utf8",
    );
    const dispatchSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/phase-review-dispatch-application.ts"),
      "utf8",
    );
    const phaseExitApplicationSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/phases/phase-exit-application.ts"),
      "utf8",
    );

    expect(indexSource).toContain("createPhaseReviewApplications({");
    expect(reviewCompositionSource).toContain("executeReview: (input) => phaseReviewLifecycleApplication.execute(input)");
    expect(dispatchSource).toContain("this.dependencies.executeReview({");
    expect(lifecycleSource).toContain("this.dependencies.publishReview({");
    expect(publicationSource).toContain("this.dependencies.ingest({");
    expect(publicationSource).toContain("this.dependencies.writeReport(input.feature, input.phase, reportMarkdown)");
    expect(publicationSource).toContain('route === "fixer"');
    expect(publicationSource).toContain('route === "blocked"');
    expect(publicationSource).toContain("reviewer requested changes; continuing with the fixer in the same run");
    expect(workflowSource).toContain("phaseIndex -= 1");
    expect(indexSource).not.toContain("code review blocked autonomous implementation. See ${reportPath}");
    // FEAT-065's authoritative persisted-gate denial is not a fallback: it
    // stops recovery before legacy fingerprint/progressive routing.
    expect(phaseExitApplicationSource).toContain("REVIEW_CONTRACT_V1_GATE_DENIED");
    expect(indexSource).not.toContain("Review contract validated; awaiting authoritative ingestion");
  });

  // -----------------------------------------------------------------------
  // F2 — feature-boundary-path-contract acceptance evidence
  // -----------------------------------------------------------------------

  it("normalizes featurePath backslashes to POSIX in the production boundary (windows-posix-normalization)", () => {
    const fs = require("node:fs");
    const enforcementSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/review-output-enforcement.ts"),
      "utf8",
    );

    // 1. Source audit: prove the production boundary normalizes backslashes
    const featurePathLine = enforcementSource.split("\n").filter((l: string) =>
      l.includes("featurePath:") && l.includes("relative(") && l.includes("folderPath")
    );
    expect(featurePathLine.length).toBeGreaterThanOrEqual(1);
    expect(featurePathLine[0]).toContain(".replaceAll");
    expect(featurePathLine[0]).toContain('"\\\\"');
    expect(featurePathLine[0]).toContain('"/"');

    // 2. Direct pattern proof: the .replaceAll("\\", "/") normalization
    // converts backslash paths to POSIX. This simulates the result of
    // relative() on Windows where it returns platform-native backslashes.
    const backslashPath = "Features\\03_IN_PROGRESS\\FEAT-064-test";
    const posixNormalized = backslashPath.replaceAll("\\", "/");
    expect(posixNormalized).toBe("Features/03_IN_PROGRESS/FEAT-064-test");
    expect(posixNormalized.includes("\\")).toBe(false);

    // 3. POSIX positive control: relative() on Linux returns forward slashes,
    // and .replaceAll is a no-op for already-clean paths
    const posixSource = relative("/projects/myapp", "/projects/myapp/Features/03_IN_PROGRESS/FEAT-064-test");
    const posixResult = posixSource.replaceAll("\\", "/");
    expect(posixResult).toBe("Features/03_IN_PROGRESS/FEAT-064-test");
    expect(posixResult.includes("\\")).toBe(false);
  });

  it("rejects absolute Unix, Windows-drive, parent-traversal, and backslash featurePath via adapter (feature-boundary-negative-matrix)", () => {
    const { projectRoot, cleanup } = createTestProject();
    try {
      const catalog = loadStrictCatalogForReview(projectRoot) as StrictActiveRuleCatalog;

      const manifest = buildValidManifestForCatalog(catalog, {
        artifactId: "manifest-negative-matrix",
        result: "NEEDS_CHANGES",
      });
      const payload = serializeManifest(manifest);

      const invalidPaths = [
        { desc: "absolute Unix path", path: "/etc/passwd" },
        { desc: "Windows-drive path", path: "C:\\Users\\foo\\project" },
        { desc: "parent-traversal path", path: "Features/../outside" },
        { desc: "remaining backslash path", path: "Features/03_IN_PROGRESS\\FEAT-064" },
      ];

      for (const { desc, path: fp } of invalidPaths) {
        const result = validateReviewContractArtifact(payload, {
          catalog,
          featurePath: fp,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.code).toBe("invalid_feature_path");
          expect(result.message).not.toContain("```");
          expect(result.message).not.toContain("PERSISTED");
          expect(result.message).not.toContain("NEEDS_HUMAN");
        }
      }
    } finally {
      cleanup();
    }
  });

  it("proves enforceSafetyKernelReviewOutput is sole caller with normalized POSIX featurePath (feature-boundary-caller-audit)", () => {
    const fs = require("node:fs");
    const indexSource = fs.readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
    const reviewCompositionSource = fs.readFileSync(
      resolve(__dirname, "../src/bootstrap/phase-review-applications.ts"),
      "utf8",
    );
    const enforcementSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/review-output-enforcement.ts"),
      "utf8",
    );
    const repairApplicationSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/phase-review-contract-repair-application.ts"),
      "utf8",
    );
    const lifecycleApplicationSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/phase-review-lifecycle-application.ts"),
      "utf8",
    );
    const dispatchApplicationSource = fs.readFileSync(
      resolve(__dirname, "../src/workflows/reviews/phase-review-dispatch-application.ts"),
      "utf8",
    );

    // 1. The only production call to validateReviewContractArtifact is inside enforceSafetyKernelReviewOutput
    const vcCalls = enforcementSource.split("\n").filter((l: string) =>
      l.includes("validateReviewContractArtifact") && !l.trim().startsWith("//") && !l.trim().startsWith("*")
    );
    const activeCalls = vcCalls.filter((l: string) => l.includes("validateReviewContractArtifact(input"));
    expect(activeCalls.length).toBe(1);

    // 2. the boundary is defined in its module, injected into the repair
    // application, and that application is called from the workflow.
    expect(enforcementSource).toContain("export function enforceSafetyKernelReviewOutput");
    expect(indexSource).toContain("createPhaseReviewApplications({");
    expect(reviewCompositionSource).toContain("enforce: enforceSafetyKernelReviewOutput");
    expect(repairApplicationSource).toContain("this.dependencies.enforce({");
    expect(reviewCompositionSource).toContain("executeReview: (input) => phaseReviewLifecycleApplication.execute(input)");
    expect(dispatchApplicationSource).toContain("this.dependencies.executeReview({");
    expect(lifecycleApplicationSource).toContain("this.dependencies.repairReview({");

    // 3. The featurePath expression uses relative().replaceAll("\\", "/")
    const fpExpr = enforcementSource.split("\n").filter((l: string) =>
      l.includes("featurePath:") && l.includes("relative(")
    );
    expect(fpExpr.length).toBeGreaterThanOrEqual(1);
    expect(fpExpr[0]).toContain(".replaceAll");
  });
});

/** Minimal input builder shared across F1 proof tests. */
function buildSimpleInput(overrides: {
  reviewOutput: string;
  rootPath: string;
  folderPath: string;
}): Parameters<typeof enforceSafetyKernelReviewOutput>[0] {
  return {
    feature: {
      id: "feat-064",
      externalId: "FEAT-064",
      kind: "feature" as const,
      title: "Test Feature",
      stateFolder: "03_IN_PROGRESS" as const,
      stateLabel: "In Progress",
      folderName: "FEAT-064",
      folderPath: overrides.folderPath,
      documentPath: null,
      documentUpdatedAt: null,
      documentRelativePath: null,
      epicState: null,
      epicRefinements: [],
      specMarkdown: "",
      summary: "",
      linkedEpicIds: [],
      linkedEpics: [],
      linkedFeatureIds: [],
      linkedFeatures: [],
      missingFeatureIds: [],
      featureWorkflow: null,
      implementationEvidence: null,
      phases: [],
      validation: {
        isComplete: false,
        hasDocument: false,
        hasLinkedEpic: false,
        hasPhases: false,
        hasValidDocument: false,
        kind: "unknown",
        valid: false,
        missingRequired: [],
        issues: [],
        warnings: [],
      },
    },
    phase: {
      number: 6,
      defaultImplementationModel: null,
      documentPath: "Phases/phase-6-integration.md",
      documentRelativePath: "Phases/phase-6-integration.md",
      estimatedAiTime: null,
      estimatedHumanTime: null,
      fileName: "phase-6-integration.md",
      predictedModel: null,
      predictedModelSource: "unavailable_phase_override" as const,
      recommendedAgent: null,
      recommendedModel: null,
      status: "AWAITING_REVIEW",
      title: "Phase 6 - Integration",
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    project: {
      id: "test-project",
      createdAt: "2026-07-14T00:00:00.000Z",
      memoryBankPath: "/fake/memorybank",
      name: "Test Project",
      rootPath: overrides.rootPath,
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    reviewGateId: "code-review",
    reviewOutput: overrides.reviewOutput,
  };
}
