import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planPhaseReviewInvocation } from "../src/workflows/reviews/phase-review-invocation-planner.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-invocation-planner.feature", import.meta.url));

describe("generic phase review invocation planner Gherkin integration", () => {
  it("specifies baseline, rerun, terminal, and approved-receipt behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Baseline review is ready");
    expect(specification).toContain("Scenario: Remediation requests a rerun");
    expect(specification).toContain("Scenario: A terminal decision already exists");
    expect(specification).toContain("Scenario: Durable approval can authorize exit");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production planner", () => {
    expect(typeof planPhaseReviewInvocation).toBe("function");
  });
});
