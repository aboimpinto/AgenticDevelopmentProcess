import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCompleteFeaturePrompt } from "../src/workflows/prompts/complete-feature-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-complete-feature-prompt.feature", import.meta.url));

describe("generic complete-feature prompt Gherkin integration", () => {
  it("specifies gates, delivery, learning, and recovery without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: All implementation and human gates are satisfied");
    expect(specification).toContain("Scenario: Completion succeeds across repositories");
    expect(specification).toContain("Scenario: Completion produces reusable learning");
    expect(specification).toContain("Scenario: A recoverable completion operation fails");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer", () => {
    expect(typeof buildCompleteFeaturePrompt).toBe("function");
  });
});
