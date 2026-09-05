import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import {
  encodeManualTestDeferralSummary,
  parseManualTestDeferrals,
  persistManualTestObligation,
} from "../../manual-test-obligation.js";
import type { OrderedPhaseTask, OrderedTaskOutcome, OrderedTaskTransition } from "../../ordered-phase-task-policy.js";
import type { PhaseExecutionContractPhase, PhaseExecutionTaskContract } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Settles the active worker task, then refreshes the canonical feature and phase. */
export class PhaseWorkerTaskSettlementApplication {
  constructor(private readonly dependencies: {
    completeTask: (input: {
      activeTask: PhaseTaskLedgerItem | null;
      cardKey: string;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
      summary: string;
    }) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    skipTask: (input: {
      activeTask: PhaseTaskLedgerItem;
      cardKey: string;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
      summary: string;
    }) => Promise<void>;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
    selectTransition: (task: OrderedPhaseTask, outcome: OrderedTaskOutcome) => OrderedTaskTransition;
    summarize: (output: string, fallback: string) => string;
    toOrderedTasks: (contract: PhaseExecutionContractPhase, productionCodeChanged: boolean) => readonly OrderedPhaseTask[];
  }) {}

  async settle(input: {
    activeTask: PhaseTaskLedgerItem | null;
    cardKey: string;
    command: FeatureWorkflowCommand;
    contract: PhaseExecutionContractPhase | null;
    feature: WorkItemCard;
    nextContractTask: PhaseExecutionTaskContract | null;
    observedProductionChange: boolean;
    output: string;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    resolvingReviewFindings: boolean;
    runId: string;
  }): Promise<{ feature: WorkItemCard; phase: NumberedPhase; summary: string }> {
    const summary = this.dependencies.summarize(
      input.output,
      input.resolvingReviewFindings ? "Review findings resolution completed." : "Phase worker completed.",
    );
    const orderedTask = input.contract && input.nextContractTask
      ? this.dependencies.toOrderedTasks(input.contract, input.observedProductionChange)
        .find((task) => task.id === input.nextContractTask?.id) ?? null
      : null;
    const transition = orderedTask
      ? this.dependencies.selectTransition(
        orderedTask,
        input.resolvingReviewFindings ? "FIXER_SUCCEEDED" : "SUCCEEDED",
      )
      : null;

    const deferrals = parseManualTestDeferrals(input.output);
    if (deferrals.length > 0) {
      if (!input.activeTask || deferrals.some(
        (deferral) => deferral.phaseNumber !== input.phase.number || deferral.taskId !== input.activeTask?.id,
      )) {
        throw new Error(`${input.phaseRef}: manual-test deferral does not match the orchestrator-selected task.`);
      }
      for (const deferral of deferrals) {
        persistManualTestObligation(input.feature.folderPath, input.feature.externalId, deferral);
      }
      await this.dependencies.skipTask({
        activeTask: input.activeTask,
        cardKey: input.cardKey,
        phase: input.phase,
        project: input.project,
        runId: input.runId,
        summary: deferrals.map(encodeManualTestDeferralSummary).join("\n"),
      });
    } else if (!transition || transition.kind === "complete_current_task") {
      await this.dependencies.completeTask({
        activeTask: input.activeTask,
        cardKey: input.cardKey,
        phase: input.phase,
        project: input.project,
        runId: input.runId,
        summary: this.dependencies.summarize(input.output, "Phase task completed."),
      });
    } else if (transition.kind === "blocked") {
      throw new Error(`${input.phaseRef}: the current declared task returned an explicit blocker.`);
    }

    const feature = await this.dependencies.refreshFeature(input.project, input.feature.externalId, input.feature);
    return {
      feature,
      phase: this.dependencies.resolvePhase(feature, input.phase.number, input.phase),
      summary: `${input.phaseRef}: ${summary}`,
    };
  }
}
