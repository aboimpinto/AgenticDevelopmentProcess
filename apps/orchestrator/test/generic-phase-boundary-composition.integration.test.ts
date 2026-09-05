import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-boundary-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/phase-boundary-applications.ts", import.meta.url)), "utf8");

describe("generic phase boundary composition Gherkin integration", () => {
  it("specifies identity-blind verification, checkpoint, and failure paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds phase-boundary constructors to one root factory call", () => {
    expect(root).toContain("createPhaseBoundaryApplications({");
    expect(root).not.toContain("new PhaseExitApplication");
    expect(root).not.toContain("new AutonomousPhaseQueueApplication");
    expect(composition).toContain("new DeclaredVerificationTaskApplication");
    expect(composition).toContain("new PhaseExitApplication");
    expect(composition).toContain("new PhaseExitLifecycleApplication");
    expect(composition).toContain("new AutonomousPhaseQueueApplication");
    expect(composition).toContain("new ImplementationCompletionApplication");
  });
});
