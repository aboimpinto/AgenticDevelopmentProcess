import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { AuthoritativeReviewRerunLineageContext } from "../../authoritative-review-integration.js";
import { recoverReviewContractDraft } from "../../review-contract-draft-recovery.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { buildReviewContractRepairPrompt } from "../prompts/review-contract-repair-prompt.js";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";
import type { PhaseProgressInput } from "../phases/phase-progress-recorder.js";
import type { ReviewOutputEnforcementResult } from "./review-output-enforcement.js";
import { readReviewContractRepairSources } from "./review-contract-repair-source-repository.js";
import type { PhaseReviewScope } from "./phase-review-invocation-planner.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseReviewContractRepairResult {
  review: ReviewOutputEnforcementResult;
  reviewOutput: string;
  summary: string | null;
}

/** Owns representation-only repair and revalidation of one rejected V1 review draft. */
export class PhaseReviewContractRepairApplication {
  constructor(private readonly dependencies: {
    enforce: (input: {
      feature: WorkItemCard;
      phase: NumberedPhase;
      project: StoredProject;
      reviewGateId: "code-review";
      reviewOutput: string;
    }) => ReviewOutputEnforcementResult;
    recordProgress: (input: PhaseProgressInput) => Promise<void>;
    runWorker: (input: ImplementationWorkerInput) => Promise<string>;
  }) {}

  async repair(input: {
    artifactId: string;
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    lineage: Exclude<AuthoritativeReviewRerunLineageContext, { readonly kind: "unavailable" }>;
    model: import("@hepha/shared").HandoffPlanV1;
    phase: NumberedPhase;
    phaseRef: string;
    phaseTitle: string;
    project: StoredProject;
    reviewOutput: string;
    runId: string;
    scope: PhaseReviewScope;
  }): Promise<PhaseReviewContractRepairResult> {
    let review = this.dependencies.enforce({
      feature: input.feature,
      phase: input.phase,
      project: input.project,
      reviewGateId: "code-review",
      reviewOutput: input.reviewOutput,
    });
    if (review.state !== "V1_REJECTED") {
      return { review, reviewOutput: input.reviewOutput, summary: null };
    }

    const recovery = await recoverReviewContractDraft({
      initialDraft: input.reviewOutput,
      validate: (draft) => {
        const validation = this.dependencies.enforce({
          feature: input.feature,
          phase: input.phase,
          project: input.project,
          reviewGateId: "code-review",
          reviewOutput: draft,
        });
        return validation.state === "V1_VALIDATED"
          ? { kind: "validated" as const, value: validation }
          : {
            kind: "rejected" as const,
            code: validation.rejection.code,
            message: validation.rejection.message,
          };
      },
      repair: async ({ draft, rejection, attempt, maximumAttempts }) => {
        await this.dependencies.recordProgress({
          agent: "Review Contract Repair Agent",
          cardKey: input.cardKey,
          command: input.command,
          currentStep: `Repairing rejected V1 review contract for ${input.phaseRef}`,
          feature: input.feature,
          model: input.model.resolvedRoute.route.modelId,
          phase: input.phase,
          project: input.project,
          runId: input.runId,
          status: "code_review",
          summary: `${input.phaseRef}: repairing review contract serialization after ${rejection.code}; the independent review decision is unchanged.`,
        });
        return await this.dependencies.runWorker({
          agentAction: "code-review",
          agentName: "Review Contract Repair Agent",
          agentRole: "review-contract-repair",
          cardKey: input.cardKey,
          feature: input.feature,
          plan: input.model,
          phaseNumber: input.phase.number,
          phaseTitle: input.phaseTitle,
          project: input.project,
          prompt: buildReviewContractRepairPrompt({
            artifactId: input.artifactId,
            attempt,
            draft,
            lineage: input.lineage,
            maximumAttempts,
            rejectionCode: rejection.code,
            rejectionMessage: rejection.message,
            scope: input.scope,
          }, readReviewContractRepairSources(input.project.rootPath)),
          runId: input.runId,
          step: `Repair Review Contract ${input.phaseRef} (${attempt}/${maximumAttempts})`,
        });
      },
    });

    if (recovery.kind === "validated") {
      review = recovery.value;
      return {
        review,
        reviewOutput: recovery.draft,
        summary: `${input.phaseRef}: repaired and revalidated the review contract in ${recovery.repairAttempts} attempt(s).`,
      };
    }
    return {
      review: {
        state: "V1_REJECTED",
        rejection: {
          valid: false,
          code: recovery.rejection.code,
          message: recovery.rejection.message,
        },
      },
      reviewOutput: recovery.draft,
      summary: `${input.phaseRef}: review contract repair stopped (${recovery.reason}) after ${recovery.repairAttempts} attempt(s).`,
    };
  }
}
