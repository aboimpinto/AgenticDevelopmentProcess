import type { PhaseSummary, WorkItemCard } from "@hepha/shared";

type NumberedPhase = PhaseSummary & { number: number };

export interface AuthorizedPhaseReviewScope {
  featureId: string;
  phaseNumber: number;
  projectId: string;
  reviewGateId: string;
}

/** Applies phase completion only after its exact declared authorization is proven. */
export class PhaseCompletionAuthorizationApplication {
  constructor(private readonly dependencies: {
    deriveFeatureId: (feature: WorkItemCard) => string | null;
    formatPhase: (phase: NumberedPhase) => string;
    hasCheckedTaskLedger: (phase: NumberedPhase) => boolean;
    markCompleted: (featureFolderPath: string, phase: NumberedPhase) => void;
  }) {}

  completeAfterReview(
    feature: WorkItemCard,
    phase: NumberedPhase,
    projectId: string,
    authorizedScope: AuthorizedPhaseReviewScope | undefined,
  ): void {
    const featureId = this.dependencies.deriveFeatureId(feature);
    if (!authorizedScope
      || authorizedScope.projectId !== projectId
      || authorizedScope.featureId !== featureId
      || authorizedScope.phaseNumber !== phase.number
      || authorizedScope.reviewGateId !== "code-review") {
      throw new Error(
        `${this.dependencies.formatPhase(phase)} cannot become COMPLETED without its exact authorized V1 code-review gate.`,
      );
    }
    this.dependencies.markCompleted(feature.folderPath, phase);
  }

  completeFromTasks(feature: WorkItemCard, phase: NumberedPhase): void {
    if (!this.dependencies.hasCheckedTaskLedger(phase)) {
      throw new Error(
        `${this.dependencies.formatPhase(phase)} cannot become COMPLETED while a declared task remains unresolved.`,
      );
    }
    this.dependencies.markCompleted(feature.folderPath, phase);
  }
}
