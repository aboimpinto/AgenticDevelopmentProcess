import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const repositoryRoot = resolve(testRoot, "../../..");
const specification = readFileSync(resolve(testRoot, "generic-work-management-contracts.feature"), "utf8");
const barrel = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const projectSummary = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/projects/project-summary.ts"), "utf8");
const scanner = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/memorybank-scanner.ts"), "utf8");
const workflowProjection = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/application/features/feature-workflow-summary-projector.ts"), "utf8");
const manualTests = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/application/manual-tests/manual-test-verification-application.ts"), "utf8");
const batchPreviewPlan = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/batch-preview/plan-builder.ts"), "utf8");
const deepDive = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/application/deep-dive/deep-dive-session-application.ts"), "utf8");
const linking = readFileSync(resolve(repositoryRoot, "apps/orchestrator/src/application/features/feature-epic-link-application.ts"), "utf8");

describe("generic work-management contracts Gherkin integration", () => {
  it("specifies four identity-blind work-management paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("keeps the shared root as an export-only compatibility barrel", () => {
    const codeLines = barrel.split("\n").map((line) => line.trim()).filter(Boolean);
    expect(codeLines.every((line) => /^export \* from ".+";$/.test(line))).toBe(true);
    expect(codeLines.length).toBeLessThanOrEqual(50);
  });

  it("keeps bounded contracts connected to production owners", () => {
    expect(projectSummary).toContain("ProjectSummary");
    expect(scanner).toContain("WorkItemCard");
    expect(workflowProjection).toContain("FeatureWorkflowSummary");
    expect(manualTests).toContain("ManualTestVerificationActionInput");
    expect(batchPreviewPlan).toContain("BatchPreviewPlan");
    expect(deepDive).toContain("DeepDiveSession");
    expect(linking).toContain("LinkFeatureToEpicResponse");
  });
});
