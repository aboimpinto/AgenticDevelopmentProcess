import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPhaseCodeReviewFindingContractRules } from "../src/workflows/prompts/phase-code-review-finding-contract-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-code-review-finding-contract-prompt.feature", import.meta.url));

describe("generic review-finding contract prompt Gherkin integration", () => {
  it("documents complete generic findings without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: An actionable finding changes a field contract");
    expect(specification).toContain("Scenario: A finding covers a cross-field matrix");
    expect(specification).toContain("Scenario: A rerun discovers an omitted baseline condition");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps compatibility, evidence, and rerun immutability in one contract", () => {
    const rules = renderPhaseCodeReviewFindingContractRules().join("\n");
    expect(rules).toContain("compatibilityDecision");
    expect(rules).toContain("Acceptance evidence required");
    expect(rules).toContain("Do not reveal another condition");
  });
});
