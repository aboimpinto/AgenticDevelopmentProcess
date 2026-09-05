import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-preparation-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const authoring = readFileSync(fileURLToPath(new URL("../src/bootstrap/work-item-authoring-applications.ts", import.meta.url)), "utf8");
const deepDive = readFileSync(fileURLToPath(new URL("../src/bootstrap/deep-dive-applications.ts", import.meta.url)), "utf8");

describe("generic preparation application composition Gherkin integration", () => {
  it("specifies identity-blind authoring, deep-dive, and recovery paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds preparation constructors to two cohesive root factory calls", () => {
    expect(root).toContain("createWorkItemAuthoringApplications({");
    expect(root).toContain("createDeepDiveApplications({");
    expect(root).not.toContain("new EpicSubmissionApplication");
    expect(root).not.toContain("new DeepDiveStartApplication");
    expect(authoring).toContain("new MissingFeatureBatchApplication");
    expect(authoring).toContain("new EpicSubmissionApplication");
    expect(deepDive).toContain("new DeepDiveStartApplication");
    expect(deepDive).toContain("new DeepDiveCompletionApplication");
    expect(deepDive).toContain("new DeepDiveContinuationRecoveryApplication");
  });
});
