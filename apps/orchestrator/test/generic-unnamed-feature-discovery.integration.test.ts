import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnnamedFeatureDiscoveryApplication } from "../src/application/epics/unnamed-feature-discovery-application.js";

const featurePath = fileURLToPath(new URL("./generic-unnamed-feature-discovery.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL(
  "../src/application/epics/unnamed-feature-discovery-application.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const compositionPath = fileURLToPath(new URL("../src/bootstrap/work-item-authoring-applications.ts", import.meta.url));
const batchPath = fileURLToPath(new URL("../src/application/features/missing-feature-batch-application.ts", import.meta.url));

describe("generic unnamed feature discovery Gherkin integration", () => {
  it("binds every scenario to the production application", () => {
    const specification = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const composition = readFileSync(compositionPath, "utf8");
    const batch = readFileSync(batchPath, "utf8");

    expect(specification.match(/^  Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(application).toContain('filter((item) => item.kind === "feature")');
    expect(application).toContain("buildUnnamedFeatureDiscoveryPrompt({");
    expect(application).toContain("parseDiscoveredFeatures(await this.dependencies.runPrompt(prompt, plan))");
    expect(batch).toContain("this.dependencies.discover.discover(epic, workItems)");
    expect(orchestrator).toContain("createWorkItemAuthoringApplications({");
    expect(composition).toContain("discover: unnamedFeatureDiscoveryApplication");
    expect(orchestrator).not.toContain("function discoverUnnamedFeaturesFromEpic");
    expect(typeof UnnamedFeatureDiscoveryApplication).toBe("function");
  });
});
