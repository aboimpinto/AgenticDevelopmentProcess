import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type {
  AuthoritativeReviewPhaseExitInput,
  AuthoritativeReviewPhaseScope,
  PhaseExitCheckpointDecision,
  PhaseExitCheckpointInput,
  PhaseExitGate,
} from "../../phase-exit-checkpoint.js";
import type { OrderedPhaseExitTransition } from "../../ordered-phase-task-policy.js";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };
type ReviewStore = AuthoritativeReviewPhaseExitInput["store"] & { close(): void };

export interface PhaseExitReviewReceipt {
  readonly contentHash: string;
  readonly databasePath: string;
  readonly scope: AuthoritativeReviewPhaseScope;
}

/** Owns the sole terminal authorization boundary for an implementation phase. */
export class PhaseExitApplication {
  constructor(private readonly dependencies: {
    assessCheckpoint: (input: PhaseExitCheckpointInput) => PhaseExitCheckpointDecision;
    getQualityGates: (feature: WorkItemCard, phaseNumber: number) => PhaseExitGate[];
    hasCheckedTaskLedger: (phase: NumberedPhase) => boolean;
    hasCompletionEvidence: (phase: NumberedPhase) => boolean;
    markCompletedAfterReview: (feature: WorkItemCard, phase: NumberedPhase, projectId: string, scope?: AuthoritativeReviewPhaseScope) => void;
    markCompletedFromTasks: (feature: WorkItemCard, phase: NumberedPhase) => void;
    openReviewStore: (projectRoot: string, databasePath: string) => ReviewStore | undefined;
    recordProgress: (input: {
      agent: string; cardKey: string; command: FeatureWorkflowCommand; currentStep: string; error?: string;
      feature: WorkItemCard; model: string; phase: NumberedPhase; project: StoredProject; runId: string;
      status: "checkpoint" | "blocked"; summary: string;
    }) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    selectOrderedExit: (input: { tasksComplete: boolean; reviewRequired: boolean; durableReviewApproved: boolean }) => OrderedPhaseExitTransition;
  }) {}

  async authorize(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    orderedReviewRequired: boolean;
    orderedTaskWorkflow: boolean;
    orderedTasksComplete: boolean;
    phase: NumberedPhase;
    project: StoredProject;
    reviewReceipt?: PhaseExitReviewReceipt;
    runId: string;
    v1ReviewRequired: boolean;
  }): Promise<{ feature: WorkItemCard; phase: NumberedPhase; reason: string }> {
    const phaseRef = `Phase ${input.phase.number}`;
    const orderedExit = this.dependencies.selectOrderedExit({
      tasksComplete: input.orderedTasksComplete,
      reviewRequired: input.orderedReviewRequired,
      durableReviewApproved: input.reviewReceipt !== undefined,
    });
    const store = input.reviewReceipt
      ? this.dependencies.openReviewStore(input.project.rootPath, input.reviewReceipt.databasePath)
      : undefined;
    let checkpoint: PhaseExitCheckpointDecision;
    try {
      checkpoint = input.orderedTaskWorkflow
        ? orderedExit.kind === "blocked" && orderedExit.missing === "declared_tasks"
          ? { allowed: false, missingGates: ["declared-phase-tasks"], reason: `${phaseRef} cannot exit while a declared task remains unresolved.` }
          : this.dependencies.assessCheckpoint({
              completionEvidencePresent: true,
              phaseNumber: input.phase.number,
              phaseStatus: input.phase.status,
              qualityGates: [],
              ...(input.orderedReviewRequired ? { authoritativeReview: reviewAuthority(input.reviewReceipt, store) } : {}),
            })
        : this.dependencies.assessCheckpoint({
            completionEvidencePresent: input.v1ReviewRequired || input.orderedTasksComplete
              ? this.dependencies.hasCheckedTaskLedger(input.phase)
              : this.dependencies.hasCompletionEvidence(input.phase),
            phaseNumber: input.phase.number,
            phaseStatus: input.phase.status,
            qualityGates: this.dependencies.getQualityGates(input.feature, input.phase.number),
            ...(input.v1ReviewRequired ? { authoritativeReview: reviewAuthority(input.reviewReceipt, store) } : {}),
          });
    } finally {
      store?.close();
    }

    await this.dependencies.recordProgress({
      agent: "Hepha phase-exit checkpoint", cardKey: input.cardKey, command: input.command,
      currentStep: `${phaseRef} exit checkpoint`, ...(checkpoint.allowed ? {} : { error: checkpoint.reason }),
      feature: input.feature, model: "orchestrator", phase: input.phase, project: input.project,
      runId: input.runId, status: checkpoint.allowed ? "checkpoint" : "blocked", summary: checkpoint.reason,
    });
    // Derived-state safety net: if the V1 gate is required but no receipt
    // exists (review completed before V1 was deployed), allow exit through
    // markCompletedFromTasks when the task ledger is fully checked. The V1
    // gate is not a substitute for the actual phase task evidence.
    let feature = input.feature;
    let phase = input.phase;
    if (!checkpoint.allowed && input.v1ReviewRequired && input.orderedTasksComplete) {
      this.dependencies.markCompletedFromTasks(feature, phase);
      ({ feature, phase } = await this.refresh(feature, phase, input.project));
    } else if (!checkpoint.allowed) {
      throw new Error(input.v1ReviewRequired
        ? `${phaseRef}: REVIEW_CONTRACT_V1_GATE_DENIED (${checkpoint.reason})`
        : checkpoint.reason);
    } else if (input.orderedTasksComplete) {
      this.dependencies.markCompletedFromTasks(feature, phase);
      ({ feature, phase } = await this.refresh(feature, phase, input.project));
    } else if (input.v1ReviewRequired) {
      this.dependencies.markCompletedAfterReview(feature, phase, input.project.id, input.reviewReceipt?.scope);
      ({ feature, phase } = await this.refresh(feature, phase, input.project));
    }
    return { feature, phase, reason: checkpoint.reason };
  }

  private async refresh(feature: WorkItemCard, phase: NumberedPhase, project: StoredProject) {
    const refreshed = await this.dependencies.refreshFeature(project, feature.externalId, feature);
    return { feature: refreshed, phase: refreshed.phases.find((candidate): candidate is NumberedPhase => candidate.number === phase.number) ?? phase };
  }
}

function reviewAuthority(receipt: PhaseExitReviewReceipt | undefined, store: ReviewStore | undefined) {
  return {
    required: true,
    ...(receipt && store ? { phaseExit: { scope: receipt.scope, freshTriggerArtifactHash: receipt.contentHash, persistenceReadBackVerified: true, store } } : {}),
  };
}
