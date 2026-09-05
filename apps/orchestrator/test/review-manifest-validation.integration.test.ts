import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildStrictRuleSnapshot, type StrictActiveRuleCatalog, type StrictCatalogRule } from "../src/review-contract-catalog.js";
import { validateDispositionFieldMatrix } from "../src/review-contract-policy/finding-obligations.js";
import { validateReviewManifest } from "../src/review-contract-policy/manifest-validation.js";
import { validateSurface } from "../src/review-contract-policy/surface-validation.js";
import { buildValidFinding, buildValidManifest } from "../src/review-contract-types.js";

const featurePath = fileURLToPath(new URL("./review-manifest-validation.feature", import.meta.url));
const facadePath = fileURLToPath(new URL("../src/review-contract-policy.ts", import.meta.url));

describe("generic review manifest validation Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps product-blind scenarios connected to all production policies", () => {
    expect(feature.match(/Scenario:/g)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|task \d+/i);
    const facade = readFileSync(facadePath, "utf8");
    expect(facade).toContain('from "./review-contract-policy/manifest-validation.js"');
    expect(facade).toContain('from "./review-contract-policy/surface-validation.js"');
    expect(facade).toContain('from "./review-contract-policy/finding-obligations.js"');
  });

  it("executes complete, contradictory, and inconsistent manifest decisions", () => {
    const rule: StrictCatalogRule = {
      id: "manifest-review-source",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review",
      title: "Manifest Review Source",
      description: "Findings remain bound to reviewed evidence.",
      source: { document: "docs/review.md", section: "Authority" },
    };
    const snapshot = buildStrictRuleSnapshot(rule, "d".repeat(64));
    const catalog: StrictActiveRuleCatalog = {
      catalogId: "review-catalog",
      schemaVersion: 1,
      rules: [rule],
      catalogSourceHash: "d".repeat(64),
    };
    const finding = buildValidFinding({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    });

    expect(validateReviewManifest({
      value: buildValidManifest({ ruleSnapshots: [snapshot], findings: [finding] }),
      catalog,
    }).valid).toBe(true);
    expect(validateSurface({
      inspected: [],
      affected: [{ surfaceId: "same", relativePath: "src/a.ts" }],
      confirmedUnaffected: [{ surfaceId: "same", relativePath: "src/a.ts" }],
    })?.code).toBe("invalid_shape");
    expect(validateDispositionFieldMatrix(finding)).toBeUndefined();
    expect(validateReviewManifest({
      value: buildValidManifest({ result: "APPROVED", ruleSnapshots: [snapshot], findings: [finding] }),
      catalog,
    })).toMatchObject({ valid: false, code: "invalid_shape" });
  });
});
