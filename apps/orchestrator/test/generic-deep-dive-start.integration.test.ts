import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DeepDiveStartApplication } from "../src/application/deep-dive/deep-dive-start-application.js";

const featurePath = fileURLToPath(new URL("./generic-deep-dive-start.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL(
  "../src/application/deep-dive/deep-dive-start-application.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

describe("generic Deep-Dive start Gherkin integration", () => {
  it("binds every scenario to the production application", () => {
    const specification = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(specification.match(/^  Scenario:/gm)).toHaveLength(5);
    expect(specification).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(application).toContain("findOpenDeepDiveSession(project.id, cardKey)");
    expect(application).toContain("void this.generateQuestions(");
    expect(application).toContain('workflow.runNode("generate-questions"');
    expect(application).toContain('"deep-dive.questions-ready"');
    expect(application).toContain('"deep-dive.failed"');
    expect(orchestrator).toContain("deepDiveStartApplication.start(input)");
    expect(orchestrator).not.toContain("function startDeepDiveSession");
    expect(orchestrator).not.toContain("function executeDeepDiveQuestionGeneration");
    expect(typeof DeepDiveStartApplication).toBe("function");
  });
});
