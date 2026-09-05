import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };
type PhaseTemplateRepairFailureContext = {
  agent: string;
  currentStep: string;
  model: string;
  phase: NumberedPhase;
  summary: string;
};

export type PhaseEntryPreparationResult = {
  feature: WorkItemCard;
  missingQualityGates: readonly string[];
  phase: NumberedPhase;
  summaries: string[];
} & (
  | { kind: "execute" }
  | { kind: "skip"; summary: string }
);

/** Refreshes and validates one selected phase before any task or review route is chosen. */
export class PhaseEntryPreparationApplication {
  constructor(private readonly dependencies: {
    getContract: (feature: WorkItemCard, phase: NumberedPhase) => PhaseExecutionContractPhase | null;
    getMissingGates: (feature: WorkItemCard, phaseNumber: number) => readonly string[];
    isGitCheckpointSatisfied: (input: {
      branchName: string;
      memoryBankPath: string;
      phaseDocumentPath: string;
      projectRoot: string;
    }) => boolean;
    isPlanningArtifactMissing: (feature: WorkItemCard, phase: NumberedPhase) => boolean;
    isResolved: (phase: NumberedPhase) => boolean;
    normalizeStatus: (status: string | null) => string;
    prepareTemplate: (input: {
      cardKey: string;
      command: FeatureWorkflowCommand;
      feature: WorkItemCard;
      model: import("@hepha/shared").HandoffPlanV1;
      onRepairStarted: (context: PhaseTemplateRepairFailureContext) => void;
      phase: NumberedPhase;
      project: StoredProject;
      runId: string;
    }) => Promise<{ feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    requiresGitCheckpoint: (contract: PhaseExecutionContractPhase | null) => boolean;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
  }) {}

  async prepare(input: {
    branchName: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    forcedRecoveryPhaseNumber: number | null;
    model: import("@hepha/shared").HandoffPlanV1;
    onRepairStarted: (context: PhaseTemplateRepairFailureContext) => void;
    phase: NumberedPhase;
    project: StoredProject;
    runId: string;
  }): Promise<PhaseEntryPreparationResult> {
    let feature = await this.dependencies.refreshFeature(
      input.project,
      input.feature.externalId,
      input.feature,
    );
    let phase = this.dependencies.resolvePhase(feature, input.phase.number, input.phase);
    const template = await this.dependencies.prepareTemplate({
      cardKey: input.cardKey,
      command: input.command,
      feature,
      model: input.model,
      onRepairStarted: input.onRepairStarted,
      phase,
      project: input.project,
      runId: input.runId,
    });
    feature = template.feature;
    phase = template.phase;

    const resolved = this.dependencies.isResolved(phase);
    const missingQualityGates = resolved
      ? this.dependencies.getMissingGates(feature, phase.number)
      : [];
    const planningArtifactMissing = this.dependencies.isPlanningArtifactMissing(feature, phase);
    const contract = this.dependencies.getContract(feature, phase);
    const gitCheckpointSatisfied = !this.dependencies.requiresGitCheckpoint(contract)
      || this.dependencies.isGitCheckpointSatisfied({
        branchName: input.branchName,
        memoryBankPath: input.project.memoryBankPath,
        phaseDocumentPath: phase.documentPath,
        projectRoot: input.project.rootPath,
      });
    const maySkip = resolved
      && !planningArtifactMissing
      && phase.number !== input.forcedRecoveryPhaseNumber
      && gitCheckpointSatisfied
      && missingQualityGates.length === 0;

    if (!maySkip) {
      return { feature, kind: "execute", missingQualityGates, phase, summaries: template.summaries };
    }
    return {
      feature,
      kind: "skip",
      missingQualityGates,
      phase,
      summaries: template.summaries,
      summary: `Phase ${phase.number}: already ${this.dependencies.normalizeStatus(phase.status).toLowerCase()}.`,
    };
  }
}
