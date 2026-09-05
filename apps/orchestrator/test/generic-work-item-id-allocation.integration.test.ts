import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkItemIdAllocator } from "../src/application/work-items/work-item-id-allocator.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-work-item-id-allocation.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const missingFeatureBatchSource = readFileSync(fileURLToPath(new URL("../src/application/features/missing-feature-batch-application.ts", import.meta.url)), "utf8");
const featureSubmissionSource = readFileSync(fileURLToPath(new URL("../src/application/features/feature-submission-application.ts", import.meta.url)), "utf8");
const epicSubmissionSource = readFileSync(fileURLToPath(new URL("../src/application/epics/epic-submission-application.ts", import.meta.url)), "utf8");

describe("generic work-item ID allocation Gherkin integration", () => {
  it("specifies counter and folder authority without fixed work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds feature, EPIC, and batch creation to the extracted allocator", () => {
    expect(new WorkItemIdAllocator()).toBeInstanceOf(WorkItemIdAllocator);
    expect(featureSubmissionSource).toContain("this.dependencies.idAllocator.nextFeature(project)");
    expect(epicSubmissionSource).toContain("this.dependencies.idAllocator.nextEpic(project)");
    expect(missingFeatureBatchSource).toContain("this.dependencies.idAllocator.advanceFeaturePast(project, createdFeatureIds)");
    expect(orchestratorSource).not.toContain("function allocateNextFeatureId");
    expect(orchestratorSource).not.toContain("function allocateNextEpicId");
  });
});
