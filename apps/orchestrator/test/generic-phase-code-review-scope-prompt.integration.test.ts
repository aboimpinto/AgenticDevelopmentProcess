import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  renderPhaseCodeReviewScopeRules,
  renderReviewerRemediationPlanRules,
} from "../src/workflows/prompts/phase-code-review-scope-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-code-review-scope-prompt.feature", import.meta.url));

describe("generic phase code-review scope prompt Gherkin integration", () => {
  it("documents generic review scope without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A concern belongs to a later phase");
    expect(specification).toContain("Scenario: Context material explains a production contract");
    expect(specification).toContain("Scenario: A stable finding remains open repeatedly");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps baseline and repeated-remediation paths distinct", () => {
    expect(renderReviewerRemediationPlanRules(false)).toEqual([]);
    expect(renderReviewerRemediationPlanRules(true).join("\n")).toContain("Acceptance Matrix");
    expect(renderPhaseCodeReviewScopeRules().join("\n")).toContain("Production Code Review Target");
  });
});
