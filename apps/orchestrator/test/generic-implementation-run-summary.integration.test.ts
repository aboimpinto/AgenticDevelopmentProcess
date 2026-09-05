import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-implementation-run-summary.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const infrastructureSource = readFileSync(resolve(testRoot, "../src/bootstrap/workflow-infrastructure-applications.ts"), "utf8");
const featureProjectionSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/feature-projection-applications.ts"),
  "utf8",
);

describe("generic implementation run summary Gherkin integration", () => {
  it("defines three identity-blind read-model outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("routes summary mapping through the extracted projector", () => {
    expect(infrastructureSource).toContain("new ImplementationRunSummaryProjector");
    expect(orchestratorSource).toContain("implementationRunSummary: implementationRunSummaryProjector");
    expect(featureProjectionSource).toContain("dependencies.implementationRunSummary.mapPhase");
    expect(featureProjectionSource).toContain("dependencies.implementationRunSummary.deriveCurrentStep");
    expect(orchestratorSource).not.toContain("function reconcileRecoveredPhaseRunSummary");
    expect(orchestratorSource).not.toContain("function attachLatestUnresolvedReviewReport");
  });
});
