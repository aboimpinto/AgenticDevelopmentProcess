import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FeatureCompletionReadinessPolicy } from "../src/application/features/feature-completion-readiness-policy.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-completion-readiness.feature", import.meta.url)), "utf8");
const completionCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-completion-applications.ts", import.meta.url)),
  "utf8",
);
const completionExecutionSource = readFileSync(
  fileURLToPath(new URL("../src/application/features/complete-feature-execution-application.ts", import.meta.url)),
  "utf8",
);

describe("generic feature completion readiness Gherkin integration", () => {
  it("specifies resolved, unresolved, and pull-request paths without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds both automatic and requested completion to one readiness policy", () => {
    expect(FeatureCompletionReadinessPolicy).toBeTypeOf("function");
    expect(completionCompositionSource).toContain("new FeatureCompletionReadinessPolicy");
    expect(completionCompositionSource).toContain("readiness: featureCompletionReadiness");
    expect(completionCompositionSource).toContain("featureCompletionReadiness.canStart(feature)");
    expect(completionExecutionSource).toContain("this.dependencies.readiness.canStart(currentFeature)");
    expect(completionCompositionSource).not.toContain("function shouldStartCompleteFeatureWorkflow");
  });
});
