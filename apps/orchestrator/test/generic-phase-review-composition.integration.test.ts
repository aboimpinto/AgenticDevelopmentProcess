import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-review-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/phase-review-applications.ts", import.meta.url)), "utf8");

describe("generic phase review composition Gherkin integration", () => {
  it("specifies identity-blind required, skipped, and repaired review paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds independent review constructors to one root factory call", () => {
    expect(root).toContain("createPhaseReviewApplications({");
    expect(root).not.toContain("new PhaseReviewExecutionApplication");
    expect(root).not.toContain("new PhaseReviewPublicationApplication");
    expect(composition).toContain("new PhaseReviewExecutionApplication");
    expect(composition).toContain("new PhaseReviewPublicationApplication");
    expect(composition).toContain("new PhaseReviewContractRepairApplication");
    expect(composition).toContain("new PhaseExecutionPlanningApplication");
  });
});
