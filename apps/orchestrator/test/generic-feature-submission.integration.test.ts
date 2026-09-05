import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FeatureSubmissionApplication } from "../src/application/features/feature-submission-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-submission.feature", import.meta.url)), "utf8");
const application = readFileSync(fileURLToPath(new URL("../src/application/features/feature-submission-application.ts", import.meta.url)), "utf8");
const orchestrator = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic feature submission Gherkin integration", () => {
  it("binds every scenario to the production application", () => {
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(application).toContain("this.dependencies.idAllocator.nextFeature(project)");
    expect(application).toContain("deriveFeatureFolderPath(");
    expect(application).toContain("renderSubmitFeatureDocument({");
    expect(application).toContain('"feature.submitted"');
    expect(orchestrator).toContain("featureSubmissionApplication.submit(input)");
    expect(orchestrator).not.toContain("function submitFeature");
    expect(typeof FeatureSubmissionApplication).toBe("function");
  });
});
