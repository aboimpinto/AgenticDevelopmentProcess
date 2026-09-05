import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildReviewContractRepairPrompt } from "../src/workflows/prompts/review-contract-repair-prompt.js";
import { readReviewContractRepairSources } from "../src/workflows/reviews/review-contract-repair-source-repository.js";

const featurePath = fileURLToPath(new URL("./generic-review-contract-repair-prompt.feature", import.meta.url));

describe("generic review-contract repair Gherkin integration", () => {
  it("specifies baseline, rerun, and missing-catalog behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A baseline review draft violates the V1 contract");
    expect(specification).toContain("Scenario: A rerun draft violates the V1 contract");
    expect(specification).toContain("Scenario: The active architecture catalog is unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer and source repository", () => {
    expect(typeof buildReviewContractRepairPrompt).toBe("function");
    expect(typeof readReviewContractRepairSources).toBe("function");
  });
});
