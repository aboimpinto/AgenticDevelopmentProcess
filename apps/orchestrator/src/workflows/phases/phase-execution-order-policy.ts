import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContract } from "../../phase-execution-contract.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Resolves the contract-owned execution order for numbered phase documents. */
export class PhaseExecutionOrderPolicy {
  constructor(private readonly dependencies: {
    getNumberedPhases: (feature: Pick<WorkItemCard, "folderPath" | "phases">) => NumberedPhase[];
    loadContract: (featureFolderPath: string) => { contract: PhaseExecutionContract | null };
    orderByContract: (
      contract: PhaseExecutionContract | null,
      featureFolderPath: string,
      phases: readonly NumberedPhase[],
    ) => readonly NumberedPhase[];
  }) {}

  order(feature: Pick<WorkItemCard, "folderPath" | "phases">): readonly NumberedPhase[] {
    const loaded = this.dependencies.loadContract(feature.folderPath);
    return this.dependencies.orderByContract(
      loaded.contract,
      feature.folderPath,
      this.dependencies.getNumberedPhases(feature),
    );
  }
}
