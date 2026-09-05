import type { WorkItemCard } from "@hepha/shared";

interface ValidationResult {
  errors: Array<{ path: string }>;
}

interface RefinementArtifactPolicyDependencies {
  validateContinuation: (folderPath: string) => ValidationResult;
  validateInProgress: (folderPath: string) => ValidationResult;
  validateRefined: (folderPath: string) => ValidationResult;
}

export class RefinementArtifactPolicy {
  constructor(private readonly dependencies: RefinementArtifactPolicyDependencies) {}

  getMissingPaths(feature: Pick<WorkItemCard, "folderPath" | "stateFolder">): string[] {
    const validation = feature.stateFolder === "03_IN_PROGRESS"
      ? this.dependencies.validateInProgress(feature.folderPath)
      : this.dependencies.validateRefined(feature.folderPath);
    return [...new Set(validation.errors.map((error) => error.path))];
  }

  isComplete(feature: Pick<WorkItemCard, "folderPath" | "stateFolder">): boolean {
    return this.getMissingPaths(feature).length === 0;
  }

  isContinuationComplete(feature: Pick<WorkItemCard, "folderPath">): boolean {
    return this.dependencies.validateContinuation(feature.folderPath).errors.length === 0;
  }
}
