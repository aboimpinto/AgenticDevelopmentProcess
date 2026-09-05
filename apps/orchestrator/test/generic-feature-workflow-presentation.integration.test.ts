import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createFeatureWorkflowMessage } from "../src/application/features/feature-workflow-message-policy.js";
import { FeatureWorkflowProgressProjector } from "../src/application/features/feature-workflow-progress-projector.js";
import type { HephaFeatureWorkflowSpec } from "../src/feature-workflow-spec.js";

const featurePath = fileURLToPath(new URL("./generic-feature-workflow-presentation.feature", import.meta.url));
const baseMessage = {
  humanReviewCompleted: false,
  hasDesignArtifacts: false,
  hasRefinementArtifacts: true,
  implementationCompleted: true,
  isWorkflowReady: true,
  lastError: null,
  manualTestsCompleted: false,
  missingQualityGateCount: 0,
  recoveredWorkflowMessage: null,
  runningCommand: null,
  stateFolder: "03_IN_PROGRESS" as const,
  uiRequirementDecision: "no_ui" as const,
  userCodeReviewCompleted: false,
};

describe("generic feature workflow presentation Gherkin integration", () => {
  it("binds every scenario to executable presentation behavior", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);

    const definition = {
      command: "continue-implementing",
      description: null,
      name: "Continuation",
      path: "/workflow.yml",
      nodes: [
        { dependsOn: [], id: "prepare", kind: "action", status: "Prepare" },
        { dependsOn: ["prepare"], id: "execute", kind: "loop", status: "Execute" },
        { dependsOn: ["execute"], id: "finish", kind: "gate", status: "Finish" },
      ],
    } as HephaFeatureWorkflowSpec;
    const projector = new FeatureWorkflowProgressProjector({ loadSpec: () => definition });
    expect(projector.build({
      command: "continue-implementing",
      currentNodeId: "execute",
      currentStep: null,
      status: "running",
    })?.steps.map((step) => step.status)).toEqual(["completed", "running", "pending"]);
    expect(createFeatureWorkflowMessage({
      ...baseMessage,
      runningCommand: "continue-implementing",
      stateFolder: "04_COMPLETED",
    })).toContain("workflows are closed");
    expect(createFeatureWorkflowMessage({ ...baseMessage, missingQualityGateCount: 1 }))
      .toContain("Continue Implementation can resolve them");
    expect(new FeatureWorkflowProgressProjector({ loadSpec: () => { throw new Error("missing"); } }).build({
      command: "continue-implementing",
      currentNodeId: null,
      currentStep: null,
      status: "running",
    })).toBeNull();
  });
});
