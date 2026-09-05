import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPhaseCodeReviewPrompt } from "../src/workflows/prompts/phase-code-review-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-code-review-prompt.feature", import.meta.url));

describe("generic phase code-review prompt Gherkin integration", () => {
  it("documents generic composition without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A baseline phase review is composed");
    expect(specification).toContain("Scenario: A repeated stable finding needs a bounded plan");
    expect(specification).toContain("Scenario: Previous review context is available");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer", () => {
    expect(typeof buildPhaseCodeReviewPrompt).toBe("function");
  });
});
