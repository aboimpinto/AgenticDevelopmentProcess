import {
  getTerminalWorkItemLifecycle,
  type FeatureWorkflowCommand,
  type FeatureWorkflowSummary,
  type MemoryBankStateFolder,
} from "@hepha/shared";

export interface FeatureWorkflowMessageInput {
  humanReviewCompleted: boolean;
  hasDesignArtifacts: boolean;
  hasRefinementArtifacts: boolean;
  implementationCompleted: boolean;
  isWorkflowReady: boolean;
  lastError: string | null;
  manualTestsCompleted: boolean;
  missingQualityGateCount: number;
  recoveredWorkflowMessage: string | null;
  runningCommand: FeatureWorkflowCommand | null;
  stateFolder: MemoryBankStateFolder;
  uiRequirementDecision: FeatureWorkflowSummary["uiRequirementDecision"];
  userCodeReviewCompleted: boolean;
}

export function createFeatureWorkflowMessage(input: FeatureWorkflowMessageInput) {
  const terminalLifecycle = getTerminalWorkItemLifecycle({
    kind: "feature",
    stateFolder: input.stateFolder,
    epicState: null,
  });
  if (terminalLifecycle === "completed") {
    return "Feature is completed. Preparation and implementation workflows are closed.";
  }
  if (terminalLifecycle === "cancelled") {
    return "Feature is cancelled. Preparation and implementation workflows are closed.";
  }

  if (input.runningCommand) {
    return `${formatFeatureWorkflowCommand(input.runningCommand)} is running for this FEAT.`;
  }
  if (input.recoveredWorkflowMessage) {
    return input.recoveredWorkflowMessage;
  }
  if (!input.isWorkflowReady) {
    return "Complete a current FEAT deep-dive and clear validation markers before design or refinement.";
  }
  if (input.lastError) {
    return `Last workflow failed: ${input.lastError}`;
  }

  if (input.hasRefinementArtifacts) {
    if (input.stateFolder === "03_IN_PROGRESS") {
      if (!input.implementationCompleted) {
        return "Implementation is in progress and can be continued.";
      }
      if (input.missingQualityGateCount > 0) {
        return `${input.missingQualityGateCount} phase quality gate${
          input.missingQualityGateCount === 1 ? "" : "s"
        } need evidence or an explicit justified waiver. Continue Implementation can resolve them.`;
      }
      if (input.humanReviewCompleted) {
        return "Implementation phases, user code review, and manual tests are complete.";
      }
      if (input.userCodeReviewCompleted) {
        return "Implementation phases are complete. Manual tests are still required.";
      }
      if (input.manualTestsCompleted) {
        return "Implementation phases are complete. User code review is still required.";
      }
      return "Implementation phases are complete. User code review and manual tests are required.";
    }
    return "Refinement artifacts already exist for this FEAT.";
  }

  if (input.uiRequirementDecision === "unknown") {
    return "Hepha needs to classify whether this FEAT requires UI requirements.";
  }
  if (input.uiRequirementDecision === "requires_ui") {
    return input.hasDesignArtifacts
      ? "UI requirements are available. The FEAT can be refined."
      : "This FEAT needs UI requirements before refinement.";
  }
  return "No UI requirements are needed. The FEAT can be refined.";
}

export function formatFeatureWorkflowCommand(command: FeatureWorkflowCommand) {
  switch (command) {
    case "deep-dive-epic":
      return "EPIC Deep-Dive";
    case "deep-dive-feature":
      return "FEAT Deep-Dive";
    case "design-feature":
      return "Create UI Requirements";
    case "refine-feature":
      return "Refine Feature";
    case "start-implementing":
      return "Start Implementing";
    case "continue-implementing":
      return "Continue Implementing";
    case "complete-feature":
      return "Complete Feature";
  }
}
