import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-completion-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/feature-completion-applications.ts", import.meta.url)), "utf8");

describe("generic feature completion application composition Gherkin integration", () => {
  it("specifies identity-blind cancellation, completion, and human-review paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds completion constructors to one cohesive root factory call", () => {
    expect(root).toContain("createFeatureCompletionApplications({");
    expect(root).not.toContain("new FeatureWorkflowCancellationApplication");
    expect(root).not.toContain("new CompleteFeatureExecutionApplication");
    expect(root).not.toContain("new FeatureHumanReviewApplication");
    expect(composition).toContain("new FeatureWorkflowCancellationApplication");
    expect(composition).toContain("new WorkflowTransitionReceiptPolicy");
    expect(composition).toContain("new CompleteFeatureExecutionApplication");
    expect(composition).toContain("new FeatureHumanReviewApplication");
  });
});
