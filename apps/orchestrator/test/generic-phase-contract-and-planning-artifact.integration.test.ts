import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-phase-contract-and-planning-artifact.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const foundationSource = readFileSync(resolve(testRoot, "../src/bootstrap/phase-foundation-applications.ts"), "utf8");
const commandSource = readFileSync(resolve(testRoot, "../src/bootstrap/implementation-command-applications.ts"), "utf8");

describe("generic phase contract and planning artifact Gherkin integration", () => {
  it("defines four identity-blind policy outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("composes both extracted responsibilities", () => {
    expect(orchestratorSource).toContain("createPhaseFoundationApplications");
    expect(foundationSource).toContain("new PhaseExecutionContractApplication");
    expect(foundationSource).toContain("new FeaturePlanningArtifactPolicy");
    expect(commandSource).toContain("dependencies.phaseContract.countMissingGitCheckpoints");
    expect(orchestratorSource).not.toContain("function assertRefinedPhaseExecutionContract");
    expect(orchestratorSource).not.toContain("function isPlanningPhaseMissingArtifact");
  });
});
