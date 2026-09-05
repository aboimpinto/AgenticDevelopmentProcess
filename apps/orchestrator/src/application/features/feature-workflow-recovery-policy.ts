import type { StoredCardMetadata } from "@hepha/db";
import type { FeatureWorkflowCommand, WorkItemCard } from "@hepha/shared";
import { formatFeatureWorkflowCommand } from "./feature-workflow-message-policy.js";
import { isImplementationWorkflowCommand } from "./implementation-run-summary-projector.js";

export interface SupersededFeatureWorkflowFailureInput {
  command: FeatureWorkflowCommand | null;
  hasDesignArtifacts: boolean;
  hasRefinementArtifacts: boolean;
  implementationCompleted: boolean;
  item: WorkItemCard;
  status: StoredCardMetadata["workflowStatus"];
}

export function isSupersededFeatureWorkflowFailure(input: SupersededFeatureWorkflowFailureInput): boolean {
  if (input.status !== "failed" || !input.command) return false;
  if (input.command === "design-feature") return input.hasDesignArtifacts;
  if (input.command === "refine-feature") {
    return input.hasRefinementArtifacts && input.item.stateFolder !== "01_SUBMITTED";
  }
  if (!isImplementationWorkflowCommand(input.command)) return false;
  if (input.item.stateFolder === "04_COMPLETED" && input.command !== "complete-feature") return true;
  return input.implementationCompleted && input.command !== "complete-feature";
}

export function createRecoveredFeatureWorkflowOutcome(input: {
  command: FeatureWorkflowCommand;
  errorMessage: string | null;
  item: WorkItemCard;
}): { summary: string; workflowMessage: string } {
  const timedOut = isWorkflowTimeoutText(input.errorMessage);
  const recoveryLabel = timedOut ? "Recovered timeout" : "Recovered workflow stop";

  if (input.command === "refine-feature") {
    const summary = `${recoveryLabel}: FeatureTasks.md and numbered phase files are present, and the FEAT is in ${input.item.stateLabel}. `
      + `${timedOut ? "Pi timed out before returning its final refine report." : "Pi stopped before returning a clean refine completion signal."} `
      + "No required refinement artifacts are missing.";
    return {
      summary,
      workflowMessage: `${summary} Start Implementation can continue; rerun Refine only if you need a fresh final report.`,
    };
  }

  if (input.command === "design-feature") {
    const summary = `${recoveryLabel}: UI requirement artifacts are present. `
      + `${timedOut ? "Pi timed out before returning its final design report." : "Pi stopped before returning a clean design completion signal."} `
      + "No required design artifacts are missing.";
    return {
      summary,
      workflowMessage: `${summary} Refine Feature can continue; rerun UI requirements only if you need a fresh final report.`,
    };
  }

  const summary = `${recoveryLabel}: ${formatFeatureWorkflowCommand(input.command)} was superseded by the current FEAT state. `
    + "Review the current workflow state before retrying completed work.";
  return { summary, workflowMessage: summary };
}

export function isWorkflowTimeoutText(value: string | null | undefined): boolean {
  return /\b(?:timed out after|timeout after|timed out|timeout)\b/i.test(value ?? "");
}
