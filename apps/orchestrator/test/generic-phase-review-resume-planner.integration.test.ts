import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planPhaseReviewResume } from "../src/workflows/phases/phase-review-resume-planner.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-resume-planner.feature", import.meta.url));

describe("generic phase review-resume planner Gherkin integration", () => {
  it("specifies baseline, fixer, rerun, and durable decisions without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Work first reaches its declared review task");
    expect(specification).toContain("Scenario: A reviewer requests changes");
    expect(specification).toContain("Scenario: Fixer evidence requests an independent rerun");
    expect(specification).toContain("Scenario: A newer reviewer decision is durable");
    expect(specification).toContain("Scenario: A phase whose next ordered task is code-review does not also await a rerun");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production planner", () => {
    expect(typeof planPhaseReviewResume).toBe("function");
  });
});
