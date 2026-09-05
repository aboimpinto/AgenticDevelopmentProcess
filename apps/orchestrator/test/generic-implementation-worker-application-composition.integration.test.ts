import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-worker-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-worker-applications.ts", import.meta.url)), "utf8");

describe("generic implementation worker application composition Gherkin integration", () => {
  it("specifies identity-blind post-process, handoff, and autonomous paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds worker constructors to one cohesive root factory call", () => {
    expect(root).toContain("createImplementationWorkerApplications({");
    expect(root).not.toContain("new StartFeaturePostProcessApplication");
    expect(root).not.toContain("new AutonomousImplementationWorkflowApplication");
    expect(composition).toContain("new StartFeaturePostProcessApplication");
    expect(composition).toContain("new InteractiveImplementationHandoffApplication");
    expect(composition).toContain("new DirectImplementationSkillApplication");
    expect(composition).toContain("new AutonomousImplementationWorkflowApplication");
  });
});
