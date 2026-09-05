import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContract, PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseExecutionQueueDecision } from "./phase-execution-queue-policy.js";

type NumberedPhase = PhaseSummary & { number: number };

type PreparedQueueBase = Readonly<{
  contract: PhaseExecutionContract | null;
  forcedRecoveryPhaseNumber: number | null;
  usesOrderedPhaseWorkflow: boolean;
}>;

export type AutonomousPhaseQueueResult = PreparedQueueBase & (
  | Readonly<{ kind: "execute_phases"; phases: readonly NumberedPhase[] }>
  | Readonly<{ kind: "recover_legacy_gate"; phaseNumber: number }>
  | Readonly<{ kind: "execute_human_review"; phase: NumberedPhase }>
  | Readonly<{ kind: "complete" }>
);

/** Builds the durable autonomous phase queue before any worker is dispatched. */
export class AutonomousPhaseQueueApplication {
  constructor(private readonly dependencies: {
    assertBranches: (input: {
      branchName: string;
      memoryBankPath: string;
      projectRoot: string;
    }) => void;
    contractUsesOrderedTasks: (contract: PhaseExecutionContract | null) => boolean;
    extractFailurePhaseNumber: (brief: string) => number | null;
    firstMissingQualityGatePhaseNumber: (feature: WorkItemCard) => number | null;
    getContractPhase: (feature: WorkItemCard, phase: NumberedPhase) => PhaseExecutionContractPhase | null;
    getHumanReviewPhase: (feature: WorkItemCard) => NumberedPhase | null;
    getMissingQualityGates: (feature: WorkItemCard, phaseNumber: number) => readonly string[];
    getNumberedPhases: (feature: WorkItemCard) => NumberedPhase[];
    isGitCheckpointSatisfied: (input: {
      branchName: string;
      memoryBankPath: string;
      phaseDocumentPath: string;
      projectRoot: string;
    }) => boolean;
    isPlanningArtifactMissing: (feature: WorkItemCard, phase: NumberedPhase) => boolean;
    isResolved: (phase: PhaseSummary) => boolean;
    loadContract: (feature: WorkItemCard) => PhaseExecutionContract | null;
    orderPhases: (
      contract: PhaseExecutionContract | null,
      featureFolderPath: string,
      phases: readonly NumberedPhase[],
    ) => readonly NumberedPhase[];
    requiresGitCheckpoint: (contract: PhaseExecutionContractPhase | null) => boolean;
    selectQueue: (input: {
      firstMissingQualityGatePhaseNumber: number | null;
      humanReviewPending: boolean;
      phases: Array<{
        forcedRecovery: boolean;
        gitCheckpointRequired: boolean;
        gitCheckpointSatisfied: boolean;
        missingQualityGateCount: number;
        phase: NumberedPhase;
        planningArtifactMissing: boolean;
        resolved: boolean;
      }>;
      usesOrderedTaskWorkflow: boolean;
    }) => PhaseExecutionQueueDecision<NumberedPhase>;
  }) {}

  prepare(input: {
    branchName: string;
    feature: WorkItemCard;
    forcedRecoveryPhaseNumber?: number | null;
    previousFailureBrief: string | null;
    project: StoredProject;
  }): AutonomousPhaseQueueResult {
    this.dependencies.assertBranches({
      branchName: input.branchName,
      memoryBankPath: input.project.memoryBankPath,
      projectRoot: input.project.rootPath,
    });
    const contract = this.dependencies.loadContract(input.feature);
    const phases = this.dependencies.orderPhases(
      contract,
      input.feature.folderPath,
      this.dependencies.getNumberedPhases(input.feature),
    );
    const usesOrderedPhaseWorkflow = this.dependencies.contractUsesOrderedTasks(contract);
    const humanReviewPhase = this.dependencies.getHumanReviewPhase(input.feature);
    const forcedRecoveryPhaseNumber = input.forcedRecoveryPhaseNumber
      ?? this.dependencies.extractFailurePhaseNumber(input.previousFailureBrief ?? "");

    if (phases.length === 0 && !humanReviewPhase) {
      throw new Error("Autonomous implementation requires phase files from refine-feature.");
    }

    const decision = this.dependencies.selectQueue({
      firstMissingQualityGatePhaseNumber: this.dependencies.firstMissingQualityGatePhaseNumber(input.feature),
      humanReviewPending: Boolean(humanReviewPhase && !this.dependencies.isResolved(humanReviewPhase)),
      phases: phases.map((phase) => {
        const phaseContract = this.dependencies.getContractPhase(input.feature, phase);
        const gitCheckpointRequired = this.dependencies.requiresGitCheckpoint(phaseContract);
        return {
          forcedRecovery: phase.number === forcedRecoveryPhaseNumber,
          gitCheckpointRequired,
          gitCheckpointSatisfied: !gitCheckpointRequired || this.dependencies.isGitCheckpointSatisfied({
            branchName: input.branchName,
            memoryBankPath: input.project.memoryBankPath,
            phaseDocumentPath: phase.documentPath,
            projectRoot: input.project.rootPath,
          }),
          missingQualityGateCount: this.dependencies.getMissingQualityGates(input.feature, phase.number).length,
          phase,
          planningArtifactMissing: this.dependencies.isPlanningArtifactMissing(input.feature, phase),
          resolved: this.dependencies.isResolved(phase),
        };
      }),
      usesOrderedTaskWorkflow: usesOrderedPhaseWorkflow,
    });
    const base = { contract, forcedRecoveryPhaseNumber, usesOrderedPhaseWorkflow };

    if (decision.kind === "execute_human_review") {
      if (!humanReviewPhase) {
        throw new Error("Phase execution queue selected human review without a durable review phase.");
      }
      return { ...base, kind: decision.kind, phase: humanReviewPhase };
    }
    return { ...base, ...decision };
  }
}
