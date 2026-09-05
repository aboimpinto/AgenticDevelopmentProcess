import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGeneratedDeepDiveQuestions } from "../src/application/deep-dive/deep-dive-question-parser.js";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-deep-dive-question-parser.feature", import.meta.url)),
  "utf8",
);
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const deepDiveCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/deep-dive-applications.ts", import.meta.url)), "utf8");
const questionPlannerSource = readFileSync(
  fileURLToPath(new URL("../src/application/deep-dive/deep-dive-question-planner.ts", import.meta.url)),
  "utf8",
);

describe("generic deep-dive question parser Gherkin integration", () => {
  it("specifies normalization, exclusion, and fallback signaling generically", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds generated question handling to the extracted production parser", () => {
    expect(parseGeneratedDeepDiveQuestions("unstructured")).toEqual([]);
    expect(orchestratorSource).toContain("createDeepDiveApplications({");
    expect(deepDiveCompositionSource).toContain("new DeepDiveQuestionPlanner");
    expect(questionPlannerSource).toContain('from "./deep-dive-question-parser.js"');
    expect(orchestratorSource).not.toContain("function normalizeGeneratedQuestion");
  });
});
