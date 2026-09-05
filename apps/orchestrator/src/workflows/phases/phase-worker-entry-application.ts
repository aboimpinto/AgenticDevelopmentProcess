import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase, PhaseExecutionTaskContract } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseProgressInput } from "./phase-progress-recorder.js";
import type { PhaseTaskLedgerItem } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

export type PhaseWorkerEntryResult =
  | { kind: "review_route"; summary: string }
  | { kind: "repeat_phase"; summary: string }
  | { activeTask: PhaseTaskLedgerItem | null; kind: "worker" };

/** Selects review bypass, declared verification, or a normal phase worker entry. */
export class PhaseWorkerEntryApplication {
  constructor(private readonly dependencies: {
    beginTask: (input: {
      cardKey: string;
      command: FeatureWorkflowCommand;
      feature: WorkItemCard;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
    }) => Promise<PhaseTaskLedgerItem | null>;
    executeVerification: (input: {
      activeTask: PhaseTaskLedgerItem;
      cardKey: string;
      command: FeatureWorkflowCommand;
      feature: WorkItemCard;
      implementationModel: import("@hepha/shared").HandoffPlanV1;
      phase: NumberedPhase;
      phaseRole: string;
      profile: "full";
      project: StoredProject;
      reviewArtifactHash: string | null;
      runId: string;
      taskId: string;
    }) => Promise<string>;
    getActiveContractTask: (
      task: PhaseTaskLedgerItem | null,
      contract: PhaseExecutionContractPhase | null,
    ) => PhaseExecutionTaskContract | null;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
  }) {}

  async enter(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    contract: PhaseExecutionContractPhase | null;
    feature: WorkItemCard;
    implementationAgent: string;
    implementationModel: import("@hepha/shared").HandoffPlanV1;
    implementationStep: string;
    orderedTasksComplete: boolean;
    phase: NumberedPhase;
    phaseHasTerminalReviewDecision: boolean;
    phaseReadyForReviewGate: boolean;
    phaseReadyForReviewRerun: boolean;
    phaseRef: string;
    project: StoredProject;
    resolvingReviewFindings: boolean;
    resumingAtPhaseExit: boolean;
    resumingBlockedReview: boolean;
    reviewArtifactHash: string | null;
    runId: string;
  }): Promise<PhaseWorkerEntryResult> {
    if (input.phaseReadyForReviewGate || input.phaseHasTerminalReviewDecision || input.orderedTasksComplete) {
      return {
        kind: "review_route",
        summary: input.orderedTasksComplete
          ? `${input.phaseRef}: every declared task is resolved; checking phase exit.`
          : input.resumingAtPhaseExit
            ? `${input.phaseRef}: durable review approval found; checking phase exit.`
            : input.resumingBlockedReview
              ? `${input.phaseRef}: durable reviewer decision blocked the phase.`
              : input.phaseReadyForReviewRerun
                ? `${input.phaseRef}: review fixes already applied; rerunning review.`
                : `${input.phaseRef}: already awaiting review; running review gate.`,
      };
    }

    const activeTask = await this.dependencies.beginTask({
      cardKey: input.cardKey,
      command: input.command,
      feature: input.feature,
      phase: input.phase,
      project: input.project,
      runId: input.runId,
    });
    const contractTask = this.dependencies.getActiveContractTask(activeTask, input.contract);
    if (contractTask?.kind === "verification" && contractTask.profile === "full") {
      if (!activeTask) throw new Error(`${input.phaseRef} declared verification task has no durable ledger item.`);
      return {
        kind: "repeat_phase",
        summary: await this.dependencies.executeVerification({
          activeTask,
          cardKey: input.cardKey,
          command: input.command,
          feature: input.feature,
          implementationModel: input.implementationModel,
          phase: input.phase,
          phaseRole: input.contract?.role ?? "implementation",
          profile: "full",
          project: input.project,
          reviewArtifactHash: input.reviewArtifactHash,
          runId: input.runId,
          taskId: contractTask.id,
        }),
      };
    }

    await this.dependencies.recordProgress({
      agent: input.implementationAgent,
      cardKey: input.cardKey,
      command: input.command,
      currentStep: input.implementationStep,
      feature: input.feature,
      model: input.implementationModel.resolvedRoute.route.modelId,
      phase: input.phase,
      project: input.project,
      runId: input.runId,
      status: input.contract?.role === "planning" && !input.resolvingReviewFindings ? "planning" : "implementing",
      summary: input.resolvingReviewFindings
        ? "Resolve review findings before rerunning the review gate."
        : "Phase worker started.",
    });
    return { activeTask, kind: "worker" };
  }
}
