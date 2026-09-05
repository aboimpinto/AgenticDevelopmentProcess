import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { CodeReviewReportResult } from "../../code-review-report-result.js";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

/**
 * Moves the first eligible completed phase to independent review. The phase
 * executor supplies policy and persistence ports so this application owns the
 * handoff decision without knowing phase names or feature kinds.
 */
export class PhaseReviewHandoffApplication {
  constructor(private readonly dependencies: {
    findLatestReviewResult: (feature: WorkItemCard, phase: NumberedPhase) => CodeReviewReportResult | null;
    getMissingGates: (feature: WorkItemCard, phaseNumber: number) => readonly string[];
    isAwaitingReview: (phase: NumberedPhase) => boolean;
    isReadyForReview: (feature: WorkItemCard, phase: NumberedPhase) => boolean;
    isReviewRequired: (project: StoredProject, feature: WorkItemCard, phase: NumberedPhase) => boolean;
    markAwaitingReview: (feature: WorkItemCard, phase: NumberedPhase) => void;
    orderPhases: (feature: WorkItemCard) => readonly NumberedPhase[];
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
  }) {}

  async handoff(project: StoredProject, feature: WorkItemCard): Promise<WorkItemCard> {
    for (const phase of this.dependencies.orderPhases(feature)) {
      if (!this.isEligible(project, feature, phase)) continue;
      this.dependencies.markAwaitingReview(feature, phase);
      return this.dependencies.refreshFeature(project, feature.externalId, feature);
    }
    return feature;
  }

  private isEligible(project: StoredProject, feature: WorkItemCard, phase: NumberedPhase): boolean {
    if (!this.dependencies.isReviewRequired(project, feature, phase)
      || !this.dependencies.isReadyForReview(feature, phase)
      || !this.dependencies.getMissingGates(feature, phase.number).includes("code_review")
      || this.dependencies.isAwaitingReview(phase)) return false;

    const latestResult = this.dependencies.findLatestReviewResult(feature, phase);
    return latestResult !== "NEEDS_CHANGES" && latestResult !== "BLOCKED";
  }
}
