import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPhasePlanningAcceptanceRules } from "../src/workflows/prompts/phase-planning-acceptance-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-planning-acceptance-prompt.feature", import.meta.url));
describe("generic phase planning acceptance prompt Gherkin integration", () => {
  it("documents generic planning and acceptance behavior", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A planning phase creates the cross-phase handoff");
    expect(specification).toContain("Scenario: A later phase consumes the handoff");
    expect(specification).toContain("Scenario: Acceptance coverage already exists");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });
  it("renders distinct arbitrary planning and consumer contracts", () => {
    const planning = renderPhasePlanningAcceptanceRules({ epicAcceptanceTestsFileName: "accept.md", featurePlanningArtifactFileName: "plan.md", isPlanningPhase: true });
    const consumer = renderPhasePlanningAcceptanceRules({ epicAcceptanceTestsFileName: "accept.md", featurePlanningArtifactFileName: "plan.md", isPlanningPhase: false });
    expect(planning.join("\n")).toContain("Create or update `plan.md`");
    expect(consumer.join("\n")).toContain("Read this phase's row");
  });
});
