import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MissingFeatureBatchApplication } from "../src/application/features/missing-feature-batch-application.js";

const featurePath = fileURLToPath(new URL("./generic-missing-feature-batch.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/application/features/missing-feature-batch-application.ts", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

describe("generic missing-feature batch Gherkin integration", () => {
  it("binds every scenario to the production application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(application).toContain("validateApprovedPreviewPlan({");
    expect(application).toContain("detectAmbiguousFeatState(project.memoryBankPath)");
    expect(application).toContain("orderByDependencies(");
    expect(application).toContain("this.dependencies.documentWriter.createFromPlan");
    expect(application).toContain("this.dependencies.synchronizeEpic.syncEpic");
    expect(orchestrator).toContain("missingFeatureBatchApplication.preview(input)");
    expect(orchestrator).not.toContain("function createCurrentPreviewPlan");
    expect(typeof MissingFeatureBatchApplication).toBe("function");
  });
});
