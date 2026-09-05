export interface StartTransitionRecord {
  readonly cardKey: string;
  readonly projectId: string;
  readonly runId: string;
  readonly deliveryPolicy: string;
  readonly baseBranch: string;
  readonly implementationBranch: string | null;
  readonly worktreePath: string | null;
  readonly repoRoot: string;
  readonly startCommit: string;
  readonly transitionStatus: string;
  readonly transitionStep: string;
  readonly failureReason: string | null;
  readonly rolledBack: boolean;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

/**
 * Exception/rollback record for when a start transition fails after
 * partial progress and must be cleaned up.
 */
export interface StartTransitionExceptionRecord {
  readonly cardKey: string;
  readonly projectId: string;
  readonly runId: string;
  readonly failedAtStep: string;
  readonly failureReason: string;
  readonly rolledBack: boolean;
  readonly effectiveStateAfter: string;
  readonly cleanedAt: string;
}

// ---------------------------------------------------------------------------
// FEAT-046: Delivery metadata types
// ---------------------------------------------------------------------------

/**
 * Persisted delivery metadata record for a FEAT.
 */
export interface DeliveryMetadataRecord {
  readonly projectId: string;
  readonly cardKey: string;
  readonly deliveryMode: string;
  readonly targetBranch: string;
  readonly githubIssue: number | null;
  readonly issueRole: string;
  readonly issueUpdateMode: string;
  readonly pullRequest: number | null;
  readonly deliveryStatus: string;
  readonly deliveryError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Input for creating or updating delivery metadata.
 */
export interface DeliveryMetadataInput {
  readonly projectId: string;
  readonly cardKey: string;
  readonly deliveryMode: string;
  readonly targetBranch: string;
  readonly githubIssue: number | null;
  readonly issueRole: string;
  readonly issueUpdateMode: string;
  readonly pullRequest: number | null;
  readonly deliveryStatus: string;
  readonly deliveryError: string | null;
}

// ---------------------------------------------------------------------------
// FEAT-042: Code-review finding ledger types
// ---------------------------------------------------------------------------
