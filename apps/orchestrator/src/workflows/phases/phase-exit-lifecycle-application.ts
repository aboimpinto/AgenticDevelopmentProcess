import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseExitApplication, PhaseExitReviewReceipt } from "./phase-exit-application.js";
import type {
  PhaseGitCheckpointApplication,
  PhaseGitCheckpointApplicationResult,
} from "./phase-git-checkpoint-application.js";
import type { PhaseProgressInput } from "./phase-progress-recorder.js";

type NumberedPhase = PhaseSummary & { number: number };

export type PhaseExitLifecycleResult =
  | Readonly<{ kind: "repeat_phase"; feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }>
  | Readonly<{ kind: "checkpoint_pending"; feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }>
  | Readonly<{ kind: "completed"; feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }>;

/** Coordinates the post-review phase-exit boundary and optional non-fatal git checkpoint. */
export class PhaseExitLifecycleApplication {
  constructor(private readonly dependencies: {
    authorize: (input: Parameters<PhaseExitApplication["authorize"]>[0]) => ReturnType<PhaseExitApplication["authorize"]>;
    completeRecoveredReviewTask: (input: {
      cardKey: string;
      contract: PhaseExecutionContractPhase;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
      summary: string;
    }) => Promise<boolean>;
    executeGitCheckpoint: (
      input: Parameters<PhaseGitCheckpointApplication["execute"]>[0],
    ) => Promise<PhaseGitCheckpointApplicationResult>;
    hasUnresolvedContractTask: (phase: NumberedPhase, contract: PhaseExecutionContractPhase) => boolean;
    isGitCheckpointRequired: (contract: PhaseExecutionContractPhase | null) => boolean;
    isOrderedTaskWorkflow: (contract: PhaseExecutionContractPhase | null) => boolean;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
  }) {}

  async execute(input: {
    branchName: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    contract: PhaseExecutionContractPhase | null;
    feature: WorkItemCard;
    implementationAgent: string;
    implementationModel: import("@hepha/shared").HandoffPlanV1;
    orderedReviewRequired: boolean;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    resumingAtPhaseExit: boolean;
    reviewReceipt?: PhaseExitReviewReceipt;
    runId: string;
    summaryFallback?: string;
    v1ReviewRequired: boolean;
  }): Promise<PhaseExitLifecycleResult> {
    let feature = await this.dependencies.refreshFeature(input.project, input.feature.externalId, input.feature);
    let phase = this.dependencies.resolvePhase(feature, input.phase.number, input.phase);
    const summaries: string[] = [];
    const orderedTaskWorkflow = this.dependencies.isOrderedTaskWorkflow(input.contract);

    if (input.resumingAtPhaseExit && orderedTaskWorkflow && input.contract) {
      const completedReviewTask = await this.dependencies.completeRecoveredReviewTask({
        cardKey: input.cardKey,
        contract: input.contract,
        phase,
        project: input.project,
        runId: input.runId,
        summary: "Recovered the durable approved review and completed the declared code-review task.",
      });
      if (completedReviewTask) {
        summaries.push(`${input.phaseRef}: recovered approved code-review task; selecting the next declared task.`);
        return { kind: "repeat_phase", feature, phase, summaries };
      }
    }

    const phaseExit = await this.dependencies.authorize({
      cardKey: input.cardKey,
      command: input.command,
      feature,
      orderedReviewRequired: input.orderedReviewRequired,
      orderedTaskWorkflow,
      orderedTasksComplete: Boolean(input.contract)
        && orderedTaskWorkflow
        && !this.dependencies.hasUnresolvedContractTask(phase, input.contract!),
      phase,
      project: input.project,
      ...(input.reviewReceipt ? { reviewReceipt: input.reviewReceipt } : {}),
      runId: input.runId,
      v1ReviewRequired: input.v1ReviewRequired,
    });
    feature = phaseExit.feature;
    phase = phaseExit.phase;

    if (this.dependencies.isGitCheckpointRequired(input.contract)) {
      const checkpoint = await this.dependencies.executeGitCheckpoint({
        branchName: input.branchName,
        cardKey: input.cardKey,
        command: input.command,
        feature,
        phase,
        project: input.project,
        runId: input.runId,
      });
      summaries.push(checkpoint.summary);
      if (checkpoint.kind === "checkpoint_pending") {
        return { kind: "checkpoint_pending", feature, phase, summaries };
      }
    }

    await this.dependencies.recordProgress({
      agent: input.implementationAgent,
      cardKey: input.cardKey,
      command: input.command,
      currentStep: `${input.phaseRef} completed`,
      feature,
      model: input.implementationModel.resolvedRoute.route.modelId,
      phase,
      project: input.project,
      runId: input.runId,
      status: "completed",
      summary: summaries.at(-1) ?? input.summaryFallback ?? `${input.phaseRef} completed.`,
    });
    return { kind: "completed", feature, phase, summaries };
  }
}
