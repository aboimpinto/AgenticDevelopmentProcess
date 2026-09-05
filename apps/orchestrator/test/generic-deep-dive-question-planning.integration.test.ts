import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DeepDiveQuestionPlanner,
  extractNeedsValidationTopics,
} from "../src/application/deep-dive/deep-dive-question-planner.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-deep-dive-question-planning.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const deepDiveCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/deep-dive-applications.ts", import.meta.url)), "utf8");

describe("generic Deep-Dive question planning Gherkin integration", () => {
  it("specifies generated and deterministic planning without fixed work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds question generation to the extracted planner", () => {
    expect(DeepDiveQuestionPlanner).toBeTypeOf("function");
    expect(orchestratorSource).toContain("createDeepDiveApplications({");
    expect(deepDiveCompositionSource).toContain("new DeepDiveQuestionPlanner");
    expect(deepDiveCompositionSource).toContain("deepDiveQuestionPlanner.create");
    expect(orchestratorSource).not.toContain("function createDeepDiveQuestions");
    expect(orchestratorSource).not.toContain("function extractNeedsValidationTopics");
  });

  it("keeps validation-topic discovery generic", () => {
    expect(extractNeedsValidationTopics("## Any topic\n[NEEDS VALIDATION] Choose.")).toEqual([
      { detail: "Choose.", heading: "Any topic" },
    ]);
  });
});
