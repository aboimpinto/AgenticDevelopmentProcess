import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-feature-workflow-recovery.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const preparationCompositionSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/feature-preparation-applications.ts"),
  "utf8",
);
const projectionCompositionSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/feature-projection-applications.ts"),
  "utf8",
);
const policySource = readFileSync(
  resolve(testRoot, "../src/application/features/feature-workflow-recovery-policy.ts"),
  "utf8",
);

describe("generic feature workflow recovery Gherkin integration", () => {
  it("defines four identity-blind recovery outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("binds workflow summaries and direct recovery to the extracted policy", () => {
    expect(projectionCompositionSource).toContain(
      "isSupersededWorkflowFailure: isSupersededFeatureWorkflowFailure",
    );
    expect(preparationCompositionSource).toContain("createRecoveredFeatureWorkflowOutcome({");
    expect(orchestratorSource).not.toContain("function isSupersededFeatureWorkflowFailure");
    expect(policySource).toContain("command !== \"complete-feature\"");
  });
});
