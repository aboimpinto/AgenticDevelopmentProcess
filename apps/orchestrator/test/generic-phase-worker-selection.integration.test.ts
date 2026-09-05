import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-phase-worker-selection.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const foundationSource = readFileSync(resolve(testRoot, "../src/bootstrap/phase-foundation-applications.ts"), "utf8");
const implementationSource = readFileSync(resolve(testRoot, "../src/bootstrap/implementation-worker-applications.ts"), "utf8");

describe("generic phase worker selection Gherkin integration", () => {
  it("defines three identity-blind selection outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("uses both extracted selection policies", () => {
    expect(foundationSource).toContain("new PhaseCodeClassificationPolicy");
    expect(implementationSource).toContain("selectDeveloperAgentForStack(detectProjectStack");
    expect(orchestratorSource).not.toContain("function selectDeveloperAgentName");
    expect(orchestratorSource).not.toContain("function phaseHasCode");
  });
});
