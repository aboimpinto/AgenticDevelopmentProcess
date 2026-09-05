import type { FeatDeliveryMode, WorkItemCard } from "@hepha/shared";
import { countMissingPhaseQualityGates } from "../../workflows/phases/phase-quality-evidence-policy.js";
import {
  areAllImplementationPhasesResolved,
  getHumanReviewFindingsPhase,
  isImplementationPhaseResolved,
} from "../../workflows/phases/phase-lifecycle-policy.js";

export interface FeatureCompletionReadinessDependencies {
  readonly readDeliveryMode: (feature: WorkItemCard) => FeatDeliveryMode | null;
}

export class FeatureCompletionReadinessPolicy {
  readonly #dependencies: FeatureCompletionReadinessDependencies;

  constructor(dependencies: FeatureCompletionReadinessDependencies) {
    this.#dependencies = dependencies;
  }

  canStart(feature: WorkItemCard): boolean {
    const workflow = feature.featureWorkflow;
    if (!workflow || workflow.activeRun || feature.stateFolder !== "03_IN_PROGRESS") return false;
    if (!areAllImplementationPhasesResolved(feature)) return false;
    if (!workflow.userCodeReviewCompletedAt || !workflow.manualTestsCompletedAt) return false;
    if (this.#dependencies.readDeliveryMode(feature) === "pull_request") return false;
    if (countMissingPhaseQualityGates(feature) > 0) return false;
    if (workflow.findings.some((finding) => finding.status !== "closed")) return false;
    const humanReviewPhase = getHumanReviewFindingsPhase(feature);
    return !humanReviewPhase || isImplementationPhaseResolved(humanReviewPhase);
  }
}
