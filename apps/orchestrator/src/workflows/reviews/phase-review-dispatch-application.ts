import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseReviewLifecycleInput, PhaseReviewLifecycleResult } from "./phase-review-lifecycle-application.js";
import type { ApprovedPhaseReviewReceipt, PhaseReviewInvocationPlan } from "./phase-review-invocation-planner.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseReviewDispatchFailureContext {
  agent: string;
  currentStep: string;
  model: string;
  phase: NumberedPhase;
  summary: string;
}

export type PhaseReviewDispatchResult = Readonly<{
  kind: "continue" | "repeat_phase";
  receipt?: ApprovedPhaseReviewReceipt;
  summaries: readonly string[];
}>;

/** Plans and executes one independent review invocation at the declared review gate. */
export class PhaseReviewDispatchApplication {
  constructor(private readonly dependencies: {
    canonicalFeatureId: (feature: WorkItemCard) => string | null;
    completeReviewTask: (input: {
      cardKey: string;
      contract: PhaseExecutionContractPhase;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
      summary: string;
    }) => Promise<unknown | null>;
    createInvocationId: () => string;
    executeReview: (input: PhaseReviewLifecycleInput) => Promise<PhaseReviewLifecycleResult>;
    isOrderedTaskWorkflow: (contract: PhaseExecutionContractPhase) => boolean;
    planInvocation: (input: {
      baselineReviewRequired: boolean;
      configuredDatabasePath?: string | null;
      durableApprovedEvidence?: { contentHash: string } | null;
      featureId: string;
      invocationId: string;
      phaseNumber: number;
      projectId: string;
      projectRoot: string;
      rerunRequired: boolean;
      terminalDecisionPresent: boolean;
      workflowRunId: string;
    }) => PhaseReviewInvocationPlan;
  }) {}

  async dispatch(input: {
    baselineReviewRequired: boolean;
    branchName: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    configuredDatabasePath?: string | null;
    contract: PhaseExecutionContractPhase | null;
    durableApprovedHash: string | null;
    feature: WorkItemCard;
    model: import("@hepha/shared").HandoffPlanV1;
    onReviewStarted: (context: PhaseReviewDispatchFailureContext) => void;
    phase: NumberedPhase;
    phaseRef: string;
    phaseTitle: string;
    previousFailureBrief?: string;
    project: StoredProject;
    rerunRequired: boolean;
    runId: string;
    terminalDecisionPresent: boolean;
  }): Promise<PhaseReviewDispatchResult> {
    const invocation = this.dependencies.planInvocation({
      baselineReviewRequired: input.baselineReviewRequired,
      configuredDatabasePath: input.configuredDatabasePath,
      durableApprovedEvidence: input.durableApprovedHash
        ? { contentHash: input.durableApprovedHash }
        : null,
      featureId: this.dependencies.canonicalFeatureId(input.feature) ?? "",
      invocationId: this.dependencies.createInvocationId(),
      phaseNumber: input.phase.number,
      projectId: input.project.id,
      projectRoot: input.project.rootPath,
      rerunRequired: input.rerunRequired,
      terminalDecisionPresent: input.terminalDecisionPresent,
      workflowRunId: input.runId,
    });
    if (!invocation.dispatchReviewer) {
      return {
        kind: "continue",
        ...(invocation.approvedReceipt ? { receipt: invocation.approvedReceipt } : {}),
        summaries: [],
      };
    }

    const reviewStep = `Code-Review ${input.phaseRef}`;
    input.onReviewStarted({
      agent: "Code Review Agent",
      currentStep: `${reviewStep} failed`,
      model: input.model.resolvedRoute.route.modelId,
      phase: input.phase,
      summary: `${input.phaseRef} code review failed.`,
    });
    const lifecycle = await this.dependencies.executeReview({
      branchName: input.branchName,
      cardKey: input.cardKey,
      command: input.command,
      feature: input.feature,
      invocation,
      model: input.model,
      phase: input.phase,
      phaseRef: input.phaseRef,
      phaseTitle: input.phaseTitle,
      ...(input.previousFailureBrief ? { previousFailureBrief: input.previousFailureBrief } : {}),
      project: input.project,
      runId: input.runId,
    });
    if (lifecycle.route === "fixer") {
      return { kind: "repeat_phase", receipt: lifecycle.receipt, summaries: lifecycle.summaries };
    }

    if (
      lifecycle.route === "phase_exit"
      && lifecycle.gateApproved
      && input.contract
      && this.dependencies.isOrderedTaskWorkflow(input.contract)
    ) {
      const completed = await this.dependencies.completeReviewTask({
        cardKey: input.cardKey,
        contract: input.contract,
        phase: input.phase,
        project: input.project,
        runId: input.runId,
        summary: lifecycle.reviewSummary,
      });
      if (completed) {
        return {
          kind: "repeat_phase",
          receipt: lifecycle.receipt,
          summaries: [
            ...lifecycle.summaries,
            `${input.phaseRef}: declared code-review task completed; selecting the next declared task.`,
          ],
        };
      }
    }
    return { kind: "continue", receipt: lifecycle.receipt, summaries: lifecycle.summaries };
  }
}
