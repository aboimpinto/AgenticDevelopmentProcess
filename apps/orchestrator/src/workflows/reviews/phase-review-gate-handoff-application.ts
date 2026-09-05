import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Persists the baseline review handoff and projects current baseline/rerun readiness. */
export class PhaseReviewGateHandoffApplication {
  constructor(private readonly dependencies: {
    getMissingGates: (feature: WorkItemCard, phaseNumber: number) => readonly string[];
    hasCheckedTaskLedger: (phase: NumberedPhase) => boolean;
    isAwaitingReview: (phase: NumberedPhase) => boolean;
    isAwaitingRerun: (phase: NumberedPhase) => boolean;
    markAwaitingReview: (feature: WorkItemCard, phase: NumberedPhase) => void;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    resolvePhase: (feature: WorkItemCard, phaseNumber: number, fallback: NumberedPhase) => NumberedPhase;
  }) {}

  async prepare(input: {
    baselineReady: boolean;
    feature: WorkItemCard;
    hasReviewFindings: boolean;
    phase: NumberedPhase;
    project: StoredProject;
    rerunReady: boolean;
    reviewRequired: boolean;
  }): Promise<{
    awaitsBaseline: boolean;
    awaitsRerun: boolean;
    feature: WorkItemCard;
    phase: NumberedPhase;
  }> {
    let feature = input.feature;
    let phase = input.phase;
    const awaitsRerunBeforeHandoff = input.reviewRequired
      && (input.rerunReady || this.dependencies.isAwaitingRerun(phase));

    if (
      input.reviewRequired
      && this.dependencies.hasCheckedTaskLedger(phase)
      && this.dependencies.getMissingGates(feature, phase.number).includes("code_review")
      && !input.hasReviewFindings
      && !this.dependencies.isAwaitingRerun(phase)
    ) {
      this.dependencies.markAwaitingReview(feature, phase);
      feature = await this.dependencies.refreshFeature(input.project, feature.externalId, feature);
      phase = this.dependencies.resolvePhase(feature, phase.number, phase);
    }

    return {
      awaitsBaseline: input.reviewRequired
        && (input.baselineReady || this.dependencies.isAwaitingReview(phase)),
      awaitsRerun: input.reviewRequired
        && (awaitsRerunBeforeHandoff || this.dependencies.isAwaitingRerun(phase)),
      feature,
      phase,
    };
  }
}
