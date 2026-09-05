import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPhaseReviewRemediationRules } from "../src/workflows/prompts/phase-review-remediation-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-remediation-prompt.feature", import.meta.url));
describe("generic phase review remediation prompt Gherkin integration", () => {
  it("documents generic remediation without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A required finding receives a fix proposal");
    expect(specification).toContain("Scenario: A request is outside phase scope");
    expect(specification).toContain("Scenario: Recovery changes only documentation");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });
  it("composes arbitrary authoritative successor rules into bounded recovery", () => {
    const rules = renderPhaseReviewRemediationRules(["EXACT SUCCESSOR"]);
    expect(rules).toContain("EXACT SUCCESSOR");
    expect(rules.join("\n")).toContain("solely the next independent reviewer's decision");
  });
});
