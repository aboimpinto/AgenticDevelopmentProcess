import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = import.meta.dirname;
const feature = readFileSync(resolve(testRoot, "generic-feature-workflow-run-coordination.feature"), "utf8");
const rootSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const coordinatorSource = readFileSync(
  resolve(testRoot, "../src/application/features/feature-workflow-run-coordinator.ts"),
  "utf8",
);
const presenterSource = readFileSync(
  resolve(testRoot, "../src/application/workflow-console/workflow-console-summary-presenter.ts"),
  "utf8",
);
const recoveryCompositionSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/implementation-recovery-applications.ts"),
  "utf8",
);
const runCompositionSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/implementation-run-applications.ts"),
  "utf8",
);

describe("generic feature workflow run coordination", () => {
  it("binds every generic scenario without fixed numeric work identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
  });

  it("delegates workflow runner creation and progress recording from composition", () => {
    expect(rootSource).toContain("new FeatureWorkflowRunCoordinator");
    expect(runCompositionSource).toContain("dependencies.runCoordinator.createFeatureRunner");
    expect(runCompositionSource).toContain("dependencies.runCoordinator.recordFeatureProgress");
    expect(rootSource).not.toContain("function createFeatureWorkflowRunner");
    expect(rootSource).not.toContain("function recordFeatureWorkflowProgress");
    expect(coordinatorSource).toContain("this.dependencies.assertRunActive(input.runId)");
    expect(coordinatorSource.indexOf("recordFeatureWorkflowRun")).toBeLessThan(
      coordinatorSource.indexOf("notifyProjectChanged"),
    );
  });

  it("delegates bounded console evidence to its presenter", () => {
    expect(recoveryCompositionSource).toContain("dependencies.consoleSummary.render(input.runId)");
    expect(rootSource).not.toContain("function renderWorkflowConsoleSummary");
    expect(presenterSource).toContain("truncate(file.content, 6000)");
    expect(presenterSource).toContain("Unable to read workflow console files");
  });
});
