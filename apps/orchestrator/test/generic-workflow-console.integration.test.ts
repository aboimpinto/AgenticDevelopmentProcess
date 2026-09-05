import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-workflow-console.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL(
  "../src/application/workflow-console/workflow-console-application.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

describe("generic workflow console Gherkin integration", () => {
  it("binds every scenario to the production workflow console application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("read(runId: string)");
    expect(application).toContain("cleanup(keepRunId: string | null)");
    expect(orchestrator).toContain("workflowConsoleApplication.read(runId)");
    expect(orchestrator).toContain("workflowConsoleApplication.cleanup(keepRunId)");
  });
});
