import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-preparation-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/feature-preparation-applications.ts", import.meta.url)), "utf8");

describe("generic feature preparation application composition Gherkin integration", () => {
  it("specifies identity-blind classification, refinement, and finding paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds preparation constructors to one cohesive root factory call", () => {
    expect(root).toContain("createFeaturePreparationApplications({");
    expect(root).not.toContain("new DesignFeatureExecutionApplication");
    expect(root).not.toContain("new RefineFeatureExecutionApplication");
    expect(root).not.toContain("new FeatureFindingApplication");
    expect(composition).toContain("new DesignFeatureExecutionApplication");
    expect(composition).toContain("new RefineFeatureExecutionApplication");
    expect(composition).toContain("new FeatureFindingExecutionApplication");
    expect(composition).toContain("new FeaturePreparationApplication");
  });
});
