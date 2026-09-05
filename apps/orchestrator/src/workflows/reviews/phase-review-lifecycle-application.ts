import type { PhaseProgressInput } from "../phases/phase-progress-recorder.js";
import type {
  PhaseReviewContractRepairApplication,
  PhaseReviewContractRepairResult,
} from "./phase-review-contract-repair-application.js";
import type {
  PhaseReviewExecutionApplication,
  PhaseReviewExecutionResult,
} from "./phase-review-execution-application.js";
import type {
  PhaseReviewPublicationApplication,
  PhaseReviewPublicationResult,
} from "./phase-review-publication-application.js";

export type PhaseReviewLifecycleInput = Parameters<PhaseReviewExecutionApplication["execute"]>[0];

export interface PhaseReviewLifecycleResult extends PhaseReviewPublicationResult {
  summaries: string[];
}

/** Owns one review execution, representation repair, and authoritative publication cycle. */
export class PhaseReviewLifecycleApplication {
  constructor(private readonly dependencies: {
    executeReview: (input: PhaseReviewLifecycleInput) => Promise<PhaseReviewExecutionResult>;
    publishReview: (
      input: Parameters<PhaseReviewPublicationApplication["publish"]>[0],
    ) => Promise<PhaseReviewPublicationResult>;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    repairReview: (
      input: Parameters<PhaseReviewContractRepairApplication["repair"]>[0],
    ) => Promise<PhaseReviewContractRepairResult>;
  }) {}

  async execute(input: PhaseReviewLifecycleInput): Promise<PhaseReviewLifecycleResult> {
    const execution = await this.dependencies.executeReview(input);
    const repair = await this.dependencies.repairReview({
      artifactId: input.invocation.artifactId,
      cardKey: input.cardKey,
      command: input.command,
      feature: input.feature,
      lineage: execution.lineage,
      model: input.model,
      phase: input.phase,
      phaseRef: input.phaseRef,
      phaseTitle: input.phaseTitle,
      project: input.project,
      reviewOutput: execution.reviewOutput,
      runId: input.runId,
      scope: input.invocation.scope,
    });
    const summaries = repair.summary ? [repair.summary] : [];
    if (repair.review.state === "V1_REJECTED") {
      const failure = `${input.phaseRef}: REVIEW_CONTRACT_V1_VALIDATION_DENIED (${repair.review.rejection.code}).`;
      await this.dependencies.recordProgress({
        agent: `Code-Review ${input.phaseRef}`,
        cardKey: input.cardKey,
        command: input.command,
        currentStep: `Review contract rejected (V1) ${input.phaseRef}`,
        error: failure,
        feature: input.feature,
        model: input.model.resolvedRoute.route.modelId,
        phase: input.phase,
        project: input.project,
        runId: input.runId,
        status: "blocked",
        summary: failure,
      });
      throw new Error(failure);
    }

    const publication = await this.dependencies.publishReview({
      cardKey: input.cardKey,
      command: input.command,
      databasePath: input.invocation.databasePath,
      feature: input.feature,
      model: input.model.resolvedRoute.route.modelId,
      phase: input.phase,
      phaseRef: input.phaseRef,
      project: input.project,
      review: repair.review,
      runId: input.runId,
      scope: input.invocation.scope,
    });
    return {
      ...publication,
      summaries: [...summaries, ...publication.summaries],
    };
  }
}
