import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DesignFeatureExecutionApplication } from "../src/application/features/design-feature-execution-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-design-feature-execution-application.feature", import.meta.url)), "utf8");
const applicationSource = readFileSync(fileURLToPath(new URL("../src/application/features/design-feature-execution-application.ts", import.meta.url)), "utf8");
const preparationCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-preparation-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic Design Feature execution Gherkin integration", () => {
  it("specifies completion and recoverable failure without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns ordered workflow execution, artifact authorization, and terminal recording", () => {
    expect(DesignFeatureExecutionApplication).toBeTypeOf("function");
    expect(applicationSource).toContain('"collect-context"');
    expect(applicationSource).toContain('"generate-design-artifacts"');
    expect(applicationSource).toContain("artifactPolicy.assertComplete");
    expect(applicationSource).toContain("recordFeatureWorkflowCompletion");
    expect(applicationSource).toContain("recordFeatureWorkflowRun");
    expect(applicationSource).toContain('"workflow.completed"');
    expect(applicationSource).toContain('"workflow.failed"');
  });

  it("leaves the composition root with delegation instead of implementation", () => {
    expect(preparationCompositionSource).toContain("designFeatureExecutionApplication.execute(input)");
    expect(preparationCompositionSource).not.toContain("function executeDesignFeatureRun");
  });
});
