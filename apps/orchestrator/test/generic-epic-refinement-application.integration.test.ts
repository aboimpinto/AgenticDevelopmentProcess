import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EpicRefinementApplication } from "../src/application/epics/epic-refinement-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-epic-refinement-application.feature", import.meta.url)), "utf8");
const application = readFileSync(fileURLToPath(new URL("../src/application/epics/epic-refinement-application.ts", import.meta.url)), "utf8");
const orchestrator = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic EPIC refinement application Gherkin integration", () => {
  it("binds every scenario to the production application", () => {
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(application).toContain("buildEpicRefinementPrompt({");
    expect(application).toContain("parseEpicRefinementResponse(");
    expect(application).toContain("appendEpicRefinementHistory(");
    expect(application).toContain('"epic.refined"');
    expect(orchestrator).toContain("epicRefinementApplication.submit(input)");
    expect(orchestrator).not.toContain("function submitEpicRefinement");
    expect(typeof EpicRefinementApplication).toBe("function");
  });
});
