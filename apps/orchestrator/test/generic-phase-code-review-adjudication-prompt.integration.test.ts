import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPhaseCodeReviewAdjudicationRules } from "../src/workflows/prompts/phase-code-review-adjudication-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-code-review-adjudication-prompt.feature", import.meta.url));

describe("generic reviewer adjudication Gherkin integration", () => {
  it("documents generic terminal decisions without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A fixer proposes a rebuttal");
    expect(specification).toContain("Scenario: A fixer rejects one scope reframe");
    expect(specification).toContain("Scenario: A settled finding identity is encountered later");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps decision, arbitration, and identity rules together", () => {
    const rules = renderPhaseCodeReviewAdjudicationRules().join("\n");
    expect(rules).toContain("Reviewer Decision");
    expect(rules).toContain("terminal developer scope decision");
    expect(rules).toContain("finding ID is settled");
  });
});
