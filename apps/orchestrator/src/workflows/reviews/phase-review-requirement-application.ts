import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase, PhaseExecutionTaskContract } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseReviewRequirementPlan } from "../phases/phase-review-requirement-planner.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Applies the current phase's declarative review requirement before review-state resolution. */
export class PhaseReviewRequirementApplication {
  constructor(private readonly dependencies: {
    isAwaitingReview: (phase: NumberedPhase) => boolean;
    isOrderedTaskWorkflow: (contract: PhaseExecutionContractPhase | null) => boolean;
    isResolved: (phase: NumberedPhase) => boolean;
    plan: (input: {
      contract: PhaseExecutionContractPhase | null;
      nextOrderedTask: PhaseExecutionTaskContract | null;
      observedChangedFiles: readonly string[];
    }) => PhaseReviewRequirementPlan;
    reconcile: (input: { cardKey: string; project: StoredProject; runId: string }, feature: WorkItemCard) => Promise<{
      feature: WorkItemCard;
    }>;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
    skipTask: (input: {
      cardKey: string;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
      summary: string;
      taskId: string;
    }) => Promise<void>;
  }) {}

  async prepare(input: {
    cardKey: string;
    contract: PhaseExecutionContractPhase | null;
    feature: WorkItemCard;
    nextOrderedTask: PhaseExecutionTaskContract | null;
    observedChangedFiles: readonly string[];
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    runId: string;
  }): Promise<{
    feature: WorkItemCard;
    kind: "continue" | "repeat_phase";
    phase: NumberedPhase;
    plan: PhaseReviewRequirementPlan;
    summaries: string[];
  }> {
    const plan = this.dependencies.plan({
      contract: input.contract,
      nextOrderedTask: input.nextOrderedTask,
      observedChangedFiles: input.observedChangedFiles,
    });
    if (plan.skipConditionalReviewTask && input.nextOrderedTask) {
      await this.dependencies.skipTask({
        cardKey: input.cardKey,
        phase: input.phase,
        project: input.project,
        runId: input.runId,
        taskId: input.nextOrderedTask.id,
        summary: "Skipped by the declared code-review condition because no production code changed.",
      });
      return {
        feature: input.feature,
        kind: "repeat_phase",
        phase: input.phase,
        plan,
        summaries: [`${input.phaseRef}: skipped conditional code-review task; selecting the next declared task.`],
      };
    }

    let feature = input.feature;
    let phase = input.phase;
    const summaries: string[] = [];
    if (
      !this.dependencies.isOrderedTaskWorkflow(input.contract)
      && !plan.reviewRequiredNow
      && this.dependencies.isAwaitingReview(phase)
    ) {
      const reconciliation = await this.dependencies.reconcile({
        cardKey: input.cardKey,
        project: input.project,
        runId: input.runId,
      }, feature);
      feature = reconciliation.feature;
      phase = this.dependencies.resolvePhase(feature, phase.number, phase);
      if (this.dependencies.isResolved(phase)) {
        summaries.push(`${input.phaseRef}: recovered stale documentation-only review state; phase completed.`);
      }
    }
    return { feature, kind: "continue", phase, plan, summaries };
  }
}
