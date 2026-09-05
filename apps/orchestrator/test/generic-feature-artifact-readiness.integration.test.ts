import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-feature-artifact-readiness.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const featureProjectionSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/feature-projection-applications.ts"),
  "utf8",
);

describe("generic feature artifact readiness Gherkin integration", () => {
  it("defines four identity-blind readiness outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("composes each extracted artifact policy", () => {
    expect(featureProjectionSource).toContain("new DesignArtifactPolicy");
    expect(featureProjectionSource).toContain("new RefinementArtifactPolicy");
    expect(featureProjectionSource).toContain("new StartFeatureTimingPolicy");
    expect(orchestratorSource).not.toContain("function assertDesignFeatureArtifacts");
    expect(orchestratorSource).not.toContain("function hasCompleteRefinementArtifacts");
    expect(orchestratorSource).not.toContain("function assertStartFeatureTimingEstimates");
  });
});
