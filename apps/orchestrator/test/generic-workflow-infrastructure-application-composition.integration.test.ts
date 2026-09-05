import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-workflow-infrastructure-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic workflow infrastructure application composition Gherkin integration", () => {
  it("specifies identity-blind metadata, evidence, and notification paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds infrastructure constructors to one cohesive root factory call", () => {
    expect(root).toContain("createWorkflowInfrastructureApplications({");
    expect(root).not.toContain("new WorkflowMachineStateRepository");
    expect(root).not.toContain("new LiveActivitySseService");
    expect(composition).toContain("new WorkflowMachineStateRepository");
    expect(composition).toContain("new LiveActivitySseService");
    expect(composition).toContain("new CodeReviewFailureContextRepository");
    expect(composition).toContain("new ProjectChangeNotifier");
  });
});
