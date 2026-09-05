import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-autonomous-phase-queue.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL(
  "../src/workflows/phases/autonomous-phase-queue-application.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));

describe("generic autonomous phase queue Gherkin integration", () => {
  it("binds every scenario to the production queue application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");

    expect(feature.match(/^  Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.assertBranches({");
    expect(application).toContain("this.dependencies.selectQueue({");
    expect(application).toContain("this.dependencies.extractFailurePhaseNumber");
    expect(orchestrator).toContain("this.dependencies.queue.prepare({");
  });
});
