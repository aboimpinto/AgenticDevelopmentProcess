import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildHumanReviewFindingsPhasePrompt } from "../src/workflows/prompts/human-review-findings-phase-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-human-review-findings-phase-prompt.feature", import.meta.url));

describe("generic human-review findings phase prompt Gherkin integration", () => {
  it("specifies one-phase continuation and human authority without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Several open findings need work");
    expect(specification).toContain("Scenario: Repairs are ready for human verification");
    expect(specification).toContain("Scenario: Every finding has already been solved by the user");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer", () => {
    expect(typeof buildHumanReviewFindingsPhasePrompt).toBe("function");
  });
});
