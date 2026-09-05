import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import {
  createRecoveredFeatureWorkflowOutcome,
  isSupersededFeatureWorkflowFailure,
  isWorkflowTimeoutText,
} from "../src/application/features/feature-workflow-recovery-policy.js";

function item(stateFolder = "02_READY_TO_DEVELOP"): WorkItemCard {
  return { stateFolder, stateLabel: "Ready" } as WorkItemCard;
}

function superseded(overrides: Partial<Parameters<typeof isSupersededFeatureWorkflowFailure>[0]> = {}) {
  return isSupersededFeatureWorkflowFailure({
    command: "design-feature",
    hasDesignArtifacts: false,
    hasRefinementArtifacts: false,
    implementationCompleted: false,
    item: item(),
    status: "failed",
    ...overrides,
  });
}

describe("feature workflow recovery policy", () => {
  it("uses durable design and refinement artifacts to supersede failed preparation runs", () => {
    expect(superseded({ hasDesignArtifacts: true })).toBe(true);
    expect(superseded({ command: "refine-feature", hasRefinementArtifacts: true })).toBe(true);
    expect(superseded({ command: "refine-feature", hasRefinementArtifacts: true, item: item("01_SUBMITTED") })).toBe(false);
    expect(superseded({ status: "running", hasDesignArtifacts: true })).toBe(false);
  });

  it("supersedes implementation failures only after durable completion and never masks complete-feature", () => {
    expect(superseded({ command: "continue-implementing", implementationCompleted: true })).toBe(true);
    expect(superseded({ command: "start-implementing", item: item("04_COMPLETED") })).toBe(true);
    expect(superseded({ command: "complete-feature", implementationCompleted: true })).toBe(false);
    expect(superseded({ command: "deep-dive-feature", implementationCompleted: true })).toBe(false);
  });

  it("distinguishes timeout recovery and preserves operation-specific next actions", () => {
    const refined = createRecoveredFeatureWorkflowOutcome({
      command: "refine-feature",
      errorMessage: "timed out after 10 minutes",
      item: item(),
    });
    expect(refined.summary).toContain("Recovered timeout");
    expect(refined.workflowMessage).toContain("Start Implementation can continue");
    const designed = createRecoveredFeatureWorkflowOutcome({
      command: "design-feature",
      errorMessage: "worker stopped",
      item: item(),
    });
    expect(designed.summary).toContain("Recovered workflow stop");
    expect(designed.workflowMessage).toContain("Refine Feature can continue");
  });

  it("uses a generic current-state warning for superseded implementation work", () => {
    const outcome = createRecoveredFeatureWorkflowOutcome({
      command: "continue-implementing",
      errorMessage: null,
      item: item(),
    });
    expect(outcome.summary).toContain("Continue Implementing was superseded by the current FEAT state");
    expect(outcome.workflowMessage).toBe(outcome.summary);
    expect(isWorkflowTimeoutText("provider timeout after dispatch")).toBe(true);
    expect(isWorkflowTimeoutText("ordinary failure")).toBe(false);
  });
});
