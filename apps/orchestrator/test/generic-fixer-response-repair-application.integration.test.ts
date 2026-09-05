import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FixerResponseRepairApplication } from "../src/workflows/reviews/fixer-response-repair-application.js";

const featurePath = fileURLToPath(new URL("./generic-fixer-response-repair-application.feature", import.meta.url));

describe("generic Fixer Response repair Gherkin integration", () => {
  it("specifies missing, complete, and non-convergent reports without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Required responses are missing");
    expect(specification).toContain("Scenario: Required responses are complete");
    expect(specification).toContain("Scenario: Repair cannot converge safely");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof FixerResponseRepairApplication).toBe("function");
  });
});
