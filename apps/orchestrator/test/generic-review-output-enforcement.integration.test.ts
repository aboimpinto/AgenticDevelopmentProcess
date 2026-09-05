import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deriveReviewContractFeatureId,
  enforceSafetyKernelReviewOutput,
} from "../src/workflows/reviews/review-output-enforcement.js";

const featurePath = fileURLToPath(new URL("./generic-review-output-enforcement.feature", import.meta.url));

describe("generic review-output enforcement Gherkin integration", () => {
  it("specifies valid, canonical-identity, and scope failures without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A valid scoped review manifest is returned");
    expect(specification).toContain("Scenario: The canonical feature folder identity is invalid");
    expect(specification).toContain("Scenario: The manifest scope or feature path is invalid");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production identity and enforcement boundaries", () => {
    expect(typeof deriveReviewContractFeatureId).toBe("function");
    expect(typeof enforceSafetyKernelReviewOutput).toBe("function");
  });
});
