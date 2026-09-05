import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildStrictRuleSnapshot, type StrictActiveRuleCatalog, type StrictCatalogRule } from "../src/review-contract-catalog.js";
import { resolveFindingAuthority, validateRuleSnapshot } from "../src/review-contract-policy/authority-validation.js";
import { buildValidFinding } from "../src/review-contract-types.js";

const featurePath = fileURLToPath(new URL("./review-contract-authority-validation.feature", import.meta.url));
const facadePath = fileURLToPath(new URL("../src/review-contract-policy.ts", import.meta.url));

describe("generic review contract authority Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");
  const rule: StrictCatalogRule = {
    id: "verified-review-source",
    version: "2.1.0",
    status: "active",
    category: "quality",
    scope: "review",
    title: "Verified Review Source",
    description: "Findings bind to exact active evidence.",
    source: { document: "docs/quality.md", section: "Review" },
  };
  const snapshot = buildStrictRuleSnapshot(rule, "b".repeat(64));
  const catalog: StrictActiveRuleCatalog = {
    catalogId: "quality-catalog",
    schemaVersion: 1,
    rules: [rule],
    catalogSourceHash: "b".repeat(64),
  };

  it("keeps product-blind scenarios connected to the compatibility facade", () => {
    expect(feature.match(/Scenario:/g)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|task \d+/i);
    expect(readFileSync(facadePath, "utf8")).toContain(
      'from "./review-contract-policy/authority-validation.js"',
    );
  });

  it("executes active, inactive, criterion, and mismatch decisions", () => {
    expect(validateRuleSnapshot(snapshot)).toBeUndefined();
    expect(resolveFindingAuthority(buildValidFinding({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    }), catalog)).toHaveProperty("authority");
    expect(resolveFindingAuthority(buildValidFinding({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    }), { ...catalog, rules: [{ ...rule, status: "retired" }] })).toMatchObject({ code: "inactive_rule" });
    expect(resolveFindingAuthority(buildValidFinding({
      claimType: "feature_correctness",
      authority: {
        kind: "acceptance_criterion",
        reference: "ac:work-item-alpha:criterion-one",
        source: { relativePath: "requirements/item.md", section: "Acceptance" },
      },
    }), catalog, "work-item-alpha")).toHaveProperty("authority");
    expect(resolveFindingAuthority(buildValidFinding({
      authority: {
        kind: "active_rule",
        reference: `rule:${rule.id}`,
        snapshot: { ...snapshot, source: { ...snapshot.source, section: "Changed" } },
      },
    }), catalog)).toMatchObject({ code: "invalid_rule_snapshot" });
  });
});
