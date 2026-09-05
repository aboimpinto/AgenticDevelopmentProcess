import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { PersistedReviewEvidenceReadModel } from "../../review-ingestion-presentation.js";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseReviewResumePlan, PhaseReviewResumePlanningInput } from "../phases/phase-review-resume-planner.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseReviewFailureContext {
  phaseNumber: number;
  reportPath: string;
}

export interface LatestPhaseReviewReport {
  path: string;
  result: string;
}

/** Resolves restart-safe report and immutable-store facts into one review resume plan. */
export class PhaseReviewStateApplication {
  constructor(private readonly dependencies: {
    deriveFeatureId: (feature: WorkItemCard) => string | null;
    findLatestReport: (feature: WorkItemCard, phaseNumber: number) => LatestPhaseReviewReport | null;
    isAwaitingReview: (phase: NumberedPhase) => boolean;
    isAwaitingRerun: (phase: NumberedPhase) => boolean;
    isReadyForIndependentReview: (phase: NumberedPhase, contract: PhaseExecutionContractPhase | null) => boolean;
    isOrderedTaskWorkflow: (contract: PhaseExecutionContractPhase | null) => boolean;
    plan: (input: PhaseReviewResumePlanningInput) => PhaseReviewResumePlan;
    readCurrentEvidence: (input: {
      databasePath: string;
      expectedScope: {
        projectId: string;
        featureId: string;
        phaseNumber: number;
        reviewGateId: "code-review";
      };
      projectRoot: string;
    }) => PersistedReviewEvidenceReadModel | undefined;
    resolveFailureContext: (feature: WorkItemCard, rawError: string) => PhaseReviewFailureContext | null;
  }) {}

  resolve(input: {
    contract: PhaseExecutionContractPhase | null;
    databasePath: string;
    feature: WorkItemCard;
    missingQualityGates: readonly string[];
    nextOrderedTaskKind: string | null;
    orderedReviewRequired: boolean;
    phase: NumberedPhase;
    previousFailureBrief: string | null;
    project: StoredProject;
    reviewRequired: boolean;
  }): {
    durableEvidence: PersistedReviewEvidenceReadModel | undefined;
    failureContext: PhaseReviewFailureContext | null;
    latestReport: LatestPhaseReviewReport | null;
    plan: PhaseReviewResumePlan;
  } {
    const failureContext = this.dependencies.resolveFailureContext(
      input.feature,
      input.previousFailureBrief ?? "",
    );
    const latestReport = input.reviewRequired
      ? this.dependencies.findLatestReport(input.feature, input.phase.number)
      : null;
    const featureId = this.dependencies.deriveFeatureId(input.feature);
    const durableEvidence = (input.reviewRequired || input.orderedReviewRequired) && featureId
      ? this.dependencies.readCurrentEvidence({
        databasePath: input.databasePath,
        expectedScope: {
          projectId: input.project.id,
          featureId,
          phaseNumber: input.phase.number,
          reviewGateId: "code-review",
        },
        projectRoot: input.project.rootPath,
      })
      : undefined;
    const currentArtifactKind = durableEvidence?.artifact.artifactKind;
    const currentGateState = durableEvidence?.gate.gateState;
    const currentManifestResult = durableEvidence?.artifact.artifactKind === "review_manifest"
      ? durableEvidence.artifact.result
      : undefined;
    const plan = this.dependencies.plan({
      awaitingIndependentRerun: this.dependencies.isAwaitingRerun(input.phase),
      awaitingReview: this.dependencies.isAwaitingReview(input.phase),
      reviewRequired: input.reviewRequired,
      workReadyForReview: this.dependencies.isReadyForIndependentReview(input.phase, input.contract),
      failureContextPhaseNumber: failureContext?.phaseNumber ?? null,
      latestReportResult: latestReport?.result ?? null,
      missingQualityGates: input.missingQualityGates,
      nextOrderedTaskKind: this.dependencies.isOrderedTaskWorkflow(input.contract)
        ? input.nextOrderedTaskKind
        : null,
      orderedTaskWorkflow: this.dependencies.isOrderedTaskWorkflow(input.contract),
      phaseNumber: input.phase.number,
      ...(currentArtifactKind === "review_manifest"
        || currentArtifactKind === "remediation_response"
        || currentArtifactKind === "verification_receipt"
        ? { currentDurableArtifactKind: currentArtifactKind }
        : {}),
      ...(currentGateState === "APPROVED"
        || currentGateState === "REJECTED"
        || currentGateState === "BLOCKED"
        || currentGateState === "PENDING"
        ? { currentDurableGateState: currentGateState }
        : {}),
      ...(currentManifestResult === "APPROVED"
        || currentManifestResult === "NEEDS_CHANGES"
        || currentManifestResult === "BLOCKED"
        ? { currentDurableManifestResult: currentManifestResult }
        : {}),
    });
    return { durableEvidence, failureContext, latestReport, plan };
  }
}
