import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import {
  getPhaseExecutionContractForDocument,
  loadPhaseExecutionContract,
  phaseRequiresGitCheckpoint,
  type PhaseExecutionContractPhase,
} from "../../phase-execution-contract.js";

interface PhaseExecutionContractApplicationDependencies {
  getNumberedPhases: (
    feature: Pick<WorkItemCard, "phases">,
  ) => Array<PhaseSummary & { number: number }>;
  isGitCheckpointSatisfied: (input: {
    branchName: string;
    memoryBankPath: string;
    phaseDocumentPath: string;
    projectRoot: string;
  }) => boolean;
}

export class PhaseExecutionContractApplication {
  constructor(private readonly dependencies: PhaseExecutionContractApplicationDependencies) {}

  get(
    feature: Pick<WorkItemCard, "folderPath">,
    phase: Pick<PhaseSummary, "documentPath">,
  ): PhaseExecutionContractPhase | null {
    const loaded = loadPhaseExecutionContract(feature.folderPath);
    return getPhaseExecutionContractForDocument(loaded.contract, phase.documentPath, feature.folderPath);
  }

  require(feature: Pick<WorkItemCard, "externalId" | "folderPath">) {
    const loaded = loadPhaseExecutionContract(feature.folderPath);
    if (loaded.contract) return loaded.contract;

    throw new Error(
      `Refinement artifacts for ${feature.externalId} require PhaseExecutionContract.json: ${loaded.diagnostics
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join("; ")}`,
    );
  }

  countMissingGitCheckpoints(
    project: StoredProject,
    feature: WorkItemCard,
    branchName: string,
  ): number {
    return this.dependencies.getNumberedPhases(feature).filter((phase) => {
      const contract = this.get(feature, phase);
      return phaseRequiresGitCheckpoint(contract) && !this.dependencies.isGitCheckpointSatisfied({
        branchName,
        memoryBankPath: project.memoryBankPath,
        phaseDocumentPath: phase.documentPath,
        projectRoot: project.rootPath,
      });
    }).length;
  }
}
