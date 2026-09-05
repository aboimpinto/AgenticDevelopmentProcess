import { resolve } from "node:path";
import { createAuthoritativeReviewArtifactId } from "../../review-artifact-identity.js";

export interface PhaseReviewScope {
  featureId: string;
  phaseNumber: number;
  projectId: string;
  reviewGateId: "code-review";
}

export interface ApprovedPhaseReviewReceipt {
  contentHash: string;
  databasePath: string;
  scope: PhaseReviewScope;
}

export interface PhaseReviewInvocationPlan {
  approvedReceipt?: ApprovedPhaseReviewReceipt;
  artifactId: string;
  databasePath: string;
  dispatchReviewer: boolean;
  rerun: boolean;
  scope: PhaseReviewScope;
}

/** Binds one potential reviewer invocation to exact durable scope and storage identity. */
export function planPhaseReviewInvocation(input: {
  baselineReviewRequired: boolean;
  configuredDatabasePath?: string | null;
  durableApprovedEvidence?: { contentHash: string } | null;
  featureId: string;
  invocationId: string;
  phaseNumber: number;
  projectId: string;
  projectRoot: string;
  rerunRequired: boolean;
  terminalDecisionPresent: boolean;
  workflowRunId: string;
}): PhaseReviewInvocationPlan {
  const databasePath = input.configuredDatabasePath
    ?? resolve(input.projectRoot, ".hepha", "hepha.sqlite");
  const scope: PhaseReviewScope = {
    featureId: input.featureId,
    phaseNumber: input.phaseNumber,
    projectId: input.projectId,
    reviewGateId: "code-review",
  };
  const approvedReceipt = input.durableApprovedEvidence
    ? {
      contentHash: input.durableApprovedEvidence.contentHash,
      databasePath,
      scope,
    }
    : undefined;
  return {
    ...(approvedReceipt ? { approvedReceipt } : {}),
    artifactId: createAuthoritativeReviewArtifactId(
      input.phaseNumber,
      input.workflowRunId,
      input.invocationId,
    ),
    databasePath,
    dispatchReviewer: !input.terminalDecisionPresent
      && (input.baselineReviewRequired || input.rerunRequired),
    rerun: input.rerunRequired,
    scope,
  };
}
