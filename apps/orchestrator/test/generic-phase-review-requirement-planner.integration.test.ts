import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planPhaseReviewRequirement } from "../src/workflows/phases/phase-review-requirement-planner.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-requirement-planner.feature", import.meta.url));

describe("generic phase review requirement planner Gherkin integration", () => {
  it("specifies current, later, skipped, and compatibility decisions without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Unconditional review becomes current");
    expect(specification).toContain("Scenario: Conditional review has no applicable changes");
    expect(specification).toContain("Scenario: Review is declared later in the queue");
    expect(specification).toContain("Scenario: A contract-free phase changes production source");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production planner", () => {
    expect(typeof planPhaseReviewRequirement).toBe("function");
  });
});
