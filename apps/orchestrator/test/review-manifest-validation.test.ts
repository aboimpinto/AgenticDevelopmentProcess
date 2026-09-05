import { describe, expect, it } from "vitest";
import { buildStrictRuleSnapshot, type StrictActiveRuleCatalog, type StrictCatalogRule } from "../src/review-contract-catalog.js";
import { validateBlockerExpansionObligations, validateDispositionFieldMatrix } from "../src/review-contract-policy/finding-obligations.js";
import { validateReviewManifest } from "../src/review-contract-policy/manifest-validation.js";
import { validateSurface } from "../src/review-contract-policy/surface-validation.js";
import { buildValidFinding, buildValidManifest } from "../src/review-contract-types.js";

const rule: StrictCatalogRule = {
  id: "bounded-manifest-authority",
  version: "1.0.0",
  status: "active",
  category: "quality",
  scope: "review",
  title: "Bounded Manifest Authority",
  description: "Review findings use complete evidence.",
  source: { document: "docs/review.md", section: "Manifest" },
};
const sourceHash = "c".repeat(64);
const snapshot = buildStrictRuleSnapshot(rule, sourceHash);
const catalog: StrictActiveRuleCatalog = {
  catalogId: "manifest-catalog",
  schemaVersion: 1,
  rules: [rule],
  catalogSourceHash: sourceHash,
};
const finding = buildValidFinding({
  authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
});

describe("review manifest validation", () => {
  it("accepts a complete manifest and projects catalog-owned snapshots", () => {
    const manifest = buildValidManifest({ ruleSnapshots: [snapshot], findings: [finding] });
    const result = validateReviewManifest({ value: manifest, catalog });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.manifest).toBe(manifest);
      expect(result.value.resolvedRuleSnapshots).toEqual([snapshot]);
      expect(result.projection.resolvedRuleSnapshots).toEqual([snapshot]);
    }
  });

  it("rejects a manifest whose result and finding obligations disagree", () => {
    const manifest = buildValidManifest({
      result: "APPROVED",
      ruleSnapshots: [snapshot],
      findings: [finding],
    });
    expect(validateReviewManifest({ value: manifest, catalog })).toMatchObject({
      valid: false,
      code: "invalid_shape",
    });
  });

  it("validates surface collections and overlap independently", () => {
    expect(validateSurface(finding.surface)).toBeUndefined();
    expect(validateSurface({
      inspected: [],
      affected: [{ surfaceId: "same", relativePath: "src/a.ts" }],
      confirmedUnaffected: [{ surfaceId: "same", relativePath: "src/a.ts" }],
    })?.code).toBe("invalid_shape");
  });

  it("enforces blocker and disposition field obligations", () => {
    expect(validateBlockerExpansionObligations(finding)).toBeUndefined();
    expect(validateDispositionFieldMatrix(finding)).toBeUndefined();
    expect(validateBlockerExpansionObligations({ ...finding, remediationItems: [] })?.code).toBe("invalid_shape");
    expect(validateDispositionFieldMatrix({
      ...finding,
      disposition: "OBSERVATION",
      rootCause: undefined,
      remediationItems: undefined,
      testMatrix: undefined,
      exhaustivenessDecision: undefined,
      compatibilityDecision: undefined,
    })).toBeUndefined();
  });
});
