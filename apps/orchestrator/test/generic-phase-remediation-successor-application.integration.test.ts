import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseRemediationSuccessorApplication } from "../src/workflows/reviews/phase-remediation-successor-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-remediation-successor-application.feature", import.meta.url));

describe("generic remediation successor Gherkin integration", () => {
  it("specifies allocation, bypass, and missing-lineage failure without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Fixer cycle has an authoritative predecessor");
    expect(specification).toContain("Scenario: Current task is not an authoritative fixer cycle");
    expect(specification).toContain("Scenario: Required predecessor is unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseRemediationSuccessorApplication).toBe("function");
  });
});
