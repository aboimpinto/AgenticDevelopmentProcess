import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseRemediationSuccessorPublicationApplication } from "../src/workflows/reviews/phase-remediation-successor-publication-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-remediation-successor-publication-application.feature", import.meta.url));

describe("generic remediation successor publication Gherkin integration", () => {
  it("specifies ordered publication, repair, and failure without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Response and receipt are valid");
    expect(specification).toContain("Scenario: Worker handoff representation is invalid");
    expect(specification).toContain("Scenario: Durable publication fails");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseRemediationSuccessorPublicationApplication).toBe("function");
  });
});
