import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseReviewLifecycleApplication } from "../src/workflows/reviews/phase-review-lifecycle-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-lifecycle-application.feature", import.meta.url));

describe("generic phase review lifecycle Gherkin integration", () => {
  it("specifies publication, repair, and rejection without fixed workflow identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Valid review is published");
    expect(specification).toContain("Scenario: Review representation is repaired");
    expect(specification).toContain("Scenario: Review representation remains invalid");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseReviewLifecycleApplication).toBe("function");
  });
});
