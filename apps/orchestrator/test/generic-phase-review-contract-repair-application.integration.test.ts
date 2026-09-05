import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseReviewContractRepairApplication } from "../src/workflows/reviews/phase-review-contract-repair-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-contract-repair-application.feature", import.meta.url));

describe("generic phase review contract repair Gherkin integration", () => {
  it("specifies valid, corrected, no-progress, and safety-limit behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: The review contract is already valid");
    expect(specification).toContain("Scenario: The review representation is repairable");
    expect(specification).toContain("Scenario: Repair makes no progress");
    expect(specification).toContain("Scenario: Repair reaches its bounded safety limit");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseReviewContractRepairApplication).toBe("function");
  });
});
