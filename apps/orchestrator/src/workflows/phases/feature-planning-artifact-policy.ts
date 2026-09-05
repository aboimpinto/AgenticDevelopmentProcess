import { resolve } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import { normalizeImplementationPhaseStatus } from "./phase-lifecycle-policy.js";

interface FeaturePlanningArtifactPolicyDependencies {
  artifactFileName: string;
  exists: (path: string) => boolean;
  getContractPhase: (
    feature: Pick<WorkItemCard, "folderPath">,
    phase: Pick<PhaseSummary, "documentPath">,
  ) => PhaseExecutionContractPhase | null;
  readSnippet: (path: string, maxCharacters: number) => string;
}

export class FeaturePlanningArtifactPolicy {
  constructor(private readonly dependencies: FeaturePlanningArtifactPolicyDependencies) {}

  getPath(feature: Pick<WorkItemCard, "folderPath">): string {
    const rootPath = resolve(feature.folderPath, this.dependencies.artifactFileName);
    const phasePath = resolve(feature.folderPath, "Phases", this.dependencies.artifactFileName);

    if (this.isNonEmpty(phasePath)) return phasePath;
    return rootPath;
  }

  has(feature: Pick<WorkItemCard, "folderPath">): boolean {
    return this.isNonEmpty(this.getPath(feature));
  }

  isPlanningPhase(
    feature: Pick<WorkItemCard, "folderPath">,
    phase: Pick<PhaseSummary, "documentPath" | "number">,
  ): boolean {
    const contract = this.dependencies.getContractPhase(feature, phase);
    return contract ? contract.role === "planning" : phase.number === 1;
  }

  isMissing(
    feature: Pick<WorkItemCard, "folderPath">,
    phase: Pick<PhaseSummary, "documentPath" | "number" | "status">,
  ): boolean {
    return this.isPlanningPhase(feature, phase)
      && normalizeImplementationPhaseStatus(phase.status) !== "SKIPPED"
      && !this.has(feature);
  }

  assertPresent(feature: Pick<WorkItemCard, "folderPath">): void {
    const planningArtifactPath = this.getPath(feature);
    if (!this.has(feature)) {
      throw new Error(
        `The planning phase did not create a non-empty planning artifact at ${planningArtifactPath}.`,
      );
    }
  }

  private isNonEmpty(path: string): boolean {
    return this.dependencies.exists(path)
      && this.dependencies.readSnippet(path, 20_000).trim().length > 0;
  }
}
