import { describe, expect, it } from "vitest";
import {
  buildStrictRuleSnapshot,
  type StrictActiveRuleCatalog,
  type StrictCatalogRule,
} from "../src/review-contract-catalog.js";
import {
  resolveFindingAuthority,
  validateRuleSnapshot,
} from "../src/review-contract-policy/authority-validation.js";
import { buildValidFinding } from "../src/review-contract-types.js";

const rule: StrictCatalogRule = {
  id: "bounded-review-evidence",
  version: "1.0.0",
  status: "active",
  category: "architecture",
  scope: "review",
  title: "Bounded Review Evidence",
  description: "Review evidence remains bounded to its declared authority.",
  source: { document: "docs/review-policy.md", section: "Evidence" },
};
const sourceHash = "a".repeat(64);
const snapshot = buildStrictRuleSnapshot(rule, sourceHash);
const catalog: StrictActiveRuleCatalog = {
  catalogId: "review-rules",
  schemaVersion: 1,
  rules: [rule],
  catalogSourceHash: sourceHash,
};

describe("review contract authority validation", () => {
  it("validates the exact immutable active-rule snapshot shape", () => {
    expect(validateRuleSnapshot(snapshot)).toBeUndefined();
    expect(validateRuleSnapshot({ ...snapshot, ruleHash: "short" })?.code).toBe("invalid_shape");
    expect(validateRuleSnapshot({ ...snapshot, unexpected: true })?.code).toBe("invalid_shape");
  });

  it("resolves an active rule only when the supplied snapshot matches the catalog", () => {
    const finding = buildValidFinding({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    });
    expect(resolveFindingAuthority(finding, catalog)).toEqual({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    });
    expect(resolveFindingAuthority(buildValidFinding({
      authority: {
        kind: "active_rule",
        reference: `rule:${rule.id}`,
        snapshot: { ...snapshot, title: "Changed" },
      },
    }), catalog)).toMatchObject({ valid: false, code: "invalid_rule_snapshot" });
  });

  it("distinguishes unknown and inactive catalog rules", () => {
    expect(resolveFindingAuthority(buildValidFinding({
      authority: { kind: "active_rule", reference: "rule:missing-rule", snapshot },
    }), catalog)).toMatchObject({ valid: false, code: "unknown_rule" });

    const inactiveCatalog: StrictActiveRuleCatalog = {
      ...catalog,
      rules: [{ ...rule, status: "retired" }],
    };
    expect(resolveFindingAuthority(buildValidFinding({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    }), inactiveCatalog)).toMatchObject({ valid: false, code: "inactive_rule" });
  });

  it("binds acceptance criteria only to matching feature-correctness scope", () => {
    const finding = buildValidFinding({
      claimType: "feature_correctness",
      authority: {
        kind: "acceptance_criterion",
        reference: "ac:work-item-alpha:criterion-one",
        source: { relativePath: "requirements/work-item.md", section: "Acceptance" },
      },
    });
    expect(resolveFindingAuthority(finding, catalog, "work-item-alpha")).toHaveProperty("authority");
    expect(resolveFindingAuthority(finding, catalog, "work-item-beta")).toMatchObject({
      valid: false,
      code: "ambiguous_rule_reference",
    });
  });
});
