import { describe, expect, it } from "vitest";
import {
  createFeatureWorkflowMessage,
  formatFeatureWorkflowCommand,
  type FeatureWorkflowMessageInput,
} from "../src/application/features/feature-workflow-message-policy.js";

const baseInput: FeatureWorkflowMessageInput = {
  humanReviewCompleted: false,
  hasDesignArtifacts: false,
  hasRefinementArtifacts: false,
  implementationCompleted: false,
  isWorkflowReady: true,
  lastError: null,
  manualTestsCompleted: false,
  missingQualityGateCount: 0,
  recoveredWorkflowMessage: null,
  runningCommand: null,
  stateFolder: "01_SUBMITTED",
  uiRequirementDecision: "no_ui",
  userCodeReviewCompleted: false,
};

describe("feature workflow message policy", () => {
  it("closes workflow actions for terminal lifecycle states before other messages", () => {
    expect(createFeatureWorkflowMessage({
      ...baseInput,
      runningCommand: "continue-implementing",
      stateFolder: "04_COMPLETED",
    })).toContain("workflows are closed");
    expect(createFeatureWorkflowMessage({ ...baseInput, stateFolder: "05_CANCELLED" })).toContain("cancelled");
  });

  it("prioritizes active, recovered, readiness, and failure messages", () => {
    expect(createFeatureWorkflowMessage({ ...baseInput, runningCommand: "refine-feature" }))
      .toBe("Refine Feature is running for this FEAT.");
    expect(createFeatureWorkflowMessage({ ...baseInput, recoveredWorkflowMessage: "Recovered safely." }))
      .toBe("Recovered safely.");
    expect(createFeatureWorkflowMessage({ ...baseInput, isWorkflowReady: false }))
      .toContain("current FEAT deep-dive");
    expect(createFeatureWorkflowMessage({ ...baseInput, lastError: "provider unavailable" }))
      .toBe("Last workflow failed: provider unavailable");
  });

  it("describes implementation gates and required human verification", () => {
    const implementing = {
      ...baseInput,
      hasRefinementArtifacts: true,
      implementationCompleted: true,
      stateFolder: "03_IN_PROGRESS" as const,
    };
    expect(createFeatureWorkflowMessage({ ...implementing, implementationCompleted: false }))
      .toContain("can be continued");
    expect(createFeatureWorkflowMessage({ ...implementing, missingQualityGateCount: 2 }))
      .toContain("2 phase quality gates");
    expect(createFeatureWorkflowMessage({ ...implementing, userCodeReviewCompleted: true }))
      .toContain("Manual tests are still required");
    expect(createFeatureWorkflowMessage({ ...implementing, manualTestsCompleted: true }))
      .toContain("User code review is still required");
    expect(createFeatureWorkflowMessage({ ...implementing, humanReviewCompleted: true }))
      .toContain("manual tests are complete");
  });

  it("describes UI preparation decisions", () => {
    expect(createFeatureWorkflowMessage({ ...baseInput, uiRequirementDecision: "unknown" }))
      .toContain("classify whether");
    expect(createFeatureWorkflowMessage({ ...baseInput, uiRequirementDecision: "requires_ui" }))
      .toContain("needs UI requirements");
    expect(createFeatureWorkflowMessage({
      ...baseInput,
      hasDesignArtifacts: true,
      uiRequirementDecision: "requires_ui",
    })).toContain("can be refined");
    expect(formatFeatureWorkflowCommand("complete-feature")).toBe("Complete Feature");
  });
});
