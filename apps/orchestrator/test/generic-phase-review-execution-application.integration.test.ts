import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseReviewExecutionApplication } from "../src/workflows/reviews/phase-review-execution-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-execution-application.feature", import.meta.url));

describe("generic phase review execution Gherkin integration", () => {
  it("specifies baseline, rerun, unavailable-lineage, and completed execution without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Baseline review executes");
    expect(specification).toContain("Scenario: Remediation review executes");
    expect(specification).toContain("Scenario: Rerun lineage is unavailable");
    expect(specification).toContain("Scenario: Reviewer execution completes");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseReviewExecutionApplication).toBe("function");
  });
});
