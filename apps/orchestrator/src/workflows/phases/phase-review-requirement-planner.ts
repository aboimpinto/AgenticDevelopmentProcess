import {
  phaseRequiresCodeReview,
  phaseUsesOrderedTaskExecutors,
  type PhaseExecutionContractPhase,
  type PhaseExecutionTaskContract,
} from "../../phase-execution-contract.js";
import { requiresAutonomousCodeReview } from "../../autonomous-code-review-policy.js";

export interface PhaseReviewRequirementPlan {
  orderedReviewRequired: boolean;
  orderedTasksComplete: boolean;
  reviewRequiredNow: boolean;
  skipConditionalReviewTask: boolean;
}

/** Resolves declarative and legacy review requirements from phase-attributed file evidence. */
export function planPhaseReviewRequirement(input: {
  contract: PhaseExecutionContractPhase | null;
  nextOrderedTask: PhaseExecutionTaskContract | null;
  observedChangedFiles: readonly string[];
}): PhaseReviewRequirementPlan {
  const orderedTaskWorkflow = phaseUsesOrderedTaskExecutors(input.contract);
  const productionCodeChanged = input.observedChangedFiles.length > 0;
  const orderedTasksComplete = input.contract !== null
    && orderedTaskWorkflow
    && input.nextOrderedTask === null;
  const orderedReviewRequired = input.contract !== null
    && orderedTaskWorkflow
    && input.contract.tasks.some((task) => task.kind === "code_review"
      && (task.condition === "always"
        || (task.condition === "when_production_code_changes" && productionCodeChanged)));
  const reviewRequiredNow = input.contract && orderedTaskWorkflow
    ? input.nextOrderedTask?.kind === "code_review"
      && (input.nextOrderedTask.condition === "always" || productionCodeChanged)
    : input.contract
      ? phaseRequiresCodeReview(input.contract, productionCodeChanged)
      : requiresAutonomousCodeReview({ changedFiles: input.observedChangedFiles });
  return {
    orderedReviewRequired,
    orderedTasksComplete,
    reviewRequiredNow,
    skipConditionalReviewTask: input.nextOrderedTask?.kind === "code_review" && !reviewRequiredNow,
  };
}
