import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  renderPhaseCodeReviewExecutionRules,
  renderPhaseCodeReviewResultRules,
} from "../src/workflows/prompts/phase-code-review-execution-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-code-review-execution-prompt.feature", import.meta.url));

describe("generic review execution Gherkin integration", () => {
  it("documents generic reviewer behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A documented verification command uses runner flags");
    expect(specification).toContain("Scenario: Only advisory findings remain");
    expect(specification).toContain("Scenario: Optional inspection evidence is unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps tooling and terminal review results independently composable", () => {
    expect(renderPhaseCodeReviewExecutionRules().join("\n")).toContain("reviewer-tooling error");
    expect(renderPhaseCodeReviewResultRules().join("\n")).toContain("Do not make code changes");
  });
});
