import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CompleteFeatureExecutionApplication } from "../src/application/features/complete-feature-execution-application.js";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-complete-feature-execution-application.feature", import.meta.url)),
  "utf8",
);
const applicationSource = readFileSync(
  fileURLToPath(new URL("../src/application/features/complete-feature-execution-application.ts", import.meta.url)),
  "utf8",
);
const completionCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-completion-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic Complete Feature execution Gherkin integration", () => {
  it("specifies authorization, scheduling, execution, and failure without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns transition authorization and detached completion execution", () => {
    expect(CompleteFeatureExecutionApplication).toBeTypeOf("function");
    expect(applicationSource).toContain("receiptPolicy.validate");
    expect(applicationSource).toContain('nextState: "04_COMPLETED"');
    expect(applicationSource).toContain('"collect-context"');
    expect(applicationSource).toContain('"finalize-feature"');
    expect(applicationSource).toContain("finalizer.launch");
    expect(applicationSource).toContain("recordFeatureWorkflowRun");
    expect(applicationSource).toContain('"workflow.detached"');
    expect(applicationSource).toContain('"workflow.failed"');
  });

  it("leaves the composition root with delegation instead of implementation", () => {
    expect(completionCompositionSource).toContain("completeFeatureExecutionApplication.start(project, feature)");
    expect(completionCompositionSource).toContain("completeFeatureExecutionApplication.assertTransitionAllowed(project, feature)");
    expect(completionCompositionSource).not.toContain("function assertCompleteFeatureTransitionAllowed");
    expect(completionCompositionSource).not.toContain("function maybeStartCompleteFeatureWorkflow");
    expect(completionCompositionSource).not.toContain("function executeCompleteFeatureRun");
  });
});
