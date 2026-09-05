import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-command-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-command-applications.ts", import.meta.url)), "utf8");

describe("generic implementation command application composition Gherkin integration", () => {
  it("specifies identity-blind start, continue, and clarification paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds command constructors to one cohesive root factory call", () => {
    expect(root).toContain("createImplementationCommandApplications({");
    expect(root).not.toContain("new StartImplementationApplication");
    expect(root).not.toContain("new ContinueImplementationApplication");
    expect(composition).toContain("new StartImplementationApplication");
    expect(composition).toContain("new ContinueImplementationApplication");
    expect(composition).toContain("evaluateStartImplementing");
    expect(composition).toContain("evaluateContinueImplementing");
  });
});
