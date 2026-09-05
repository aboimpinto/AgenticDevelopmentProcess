import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseGateEvidenceApplication } from "../src/workflows/phases/phase-gate-evidence-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-gate-evidence-application.feature", import.meta.url));

describe("generic phase gate evidence Gherkin integration", () => {
  it("specifies pass, repair, and missing-document behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: All declared gate evidence passes");
    expect(specification).toContain("Scenario: A declared gate reports failure");
    expect(specification).toContain("Scenario: Phase document is unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseGateEvidenceApplication).toBe("function");
  });
});
