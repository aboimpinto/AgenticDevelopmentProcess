import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-run-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");

describe("generic implementation run application composition Gherkin integration", () => {
  it("specifies identity-blind start, continuation, and scheduling paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds the cyclic run graph inside one cohesive root factory call", () => {
    expect(root).toContain("createImplementationRunApplications({");
    expect(root).not.toContain("new StartImplementationRunApplication");
    expect(root).not.toContain("new ContinueImplementationRunApplication");
    expect(root).not.toContain("new AutonomousContinuationScheduler");
    expect(composition).toContain("new StartImplementationRunApplication");
    expect(composition).toContain("new ContinueImplementationRunApplication");
    expect(composition).toContain("new AutonomousContinuationScheduler");
    expect(composition).toContain("continueImplementationRunApplication.execute");
  });
});
