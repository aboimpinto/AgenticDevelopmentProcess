/**
 * Builds the immutable identity for one authoritative review invocation.
 *
 * A workflow run can dispatch more than one review for the same phase (for
 * example, a baseline review followed by a remediation rerun).  The workflow
 * run ID alone is therefore not an artifact identity: every dispatch receives
 * a distinct invocation ID before the model is called.
 */
export function createAuthoritativeReviewArtifactId(
  phaseNumber: number,
  workflowRunId: string,
  invocationId: string,
): string {
  if (!Number.isSafeInteger(phaseNumber) || phaseNumber < 0) {
    throw new Error("Invalid review phase number.");
  }
  if (!workflowRunId || !invocationId) {
    throw new Error("Review artifact identity requires workflow and invocation IDs.");
  }
  return `phase-${phaseNumber}-code-review-${workflowRunId}-${invocationId}`;
}

/**
 * Builds an immutable identity for a successor artifact that belongs to one
 * review remediation cycle.  The artifact kind is explicit so response and
 * receipt IDs cannot collide even when they are allocated in one dispatch.
 */
export function createAuthoritativeReviewSuccessorArtifactId(
  phaseNumber: number,
  artifactKind: "remediation-response" | "verification-receipt",
  workflowRunId: string,
  invocationId: string,
): string {
  if (!Number.isSafeInteger(phaseNumber) || phaseNumber < 0) {
    throw new Error("Invalid review phase number.");
  }
  if (!workflowRunId || !invocationId) {
    throw new Error("Review successor artifact identity requires workflow and invocation IDs.");
  }
  return `phase-${phaseNumber}-${artifactKind}-${workflowRunId}-${invocationId}`;
}
