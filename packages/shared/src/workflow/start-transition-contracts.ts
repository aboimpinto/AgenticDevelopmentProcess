// FEAT-039: Start Transition & Branch/Worktree Metadata
// ---------------------------------------------------------------------------

/**
 * The delivery policy that determines how a FEAT's implementation
 * branch or worktree is prepared. Extensible by FEAT-046 for PR creation.
 */
export type FeatDeliveryPolicy = "direct_merge" | "pull_request";

/**
 * Structured result from preparing the implementation branch or worktree.
 * All fields except `branchName` and `message` are additive for backward
 * compatibility.
 */
export interface BranchPreparationResult {
  /** Delivery policy used for preparation (additive). */
  readonly deliveryPolicy: FeatDeliveryPolicy;
  /** Base branch or commit ref used as the starting point (additive). */
  readonly baseBranch: string;
  /** The branch where implementation work should happen, if applicable (additive). */
  readonly implementationBranch: string | null;
  /** Worktree path when an isolated worktree is used (additive). */
  readonly worktreePath: string | null;
  /** Canonical repository root path (additive). */
  readonly repoRoot: string;
  /** Git commit hash at the time branch/worktree preparation completed (additive). */
  readonly startCommit: string;
  /** How preparation completed (additive). */
  readonly preparationResult: "created" | "already_exists" | "skipped_direct_merge" | "failed";
  /** Human-readable failure reason when preparationResult is "failed" (additive). */
  readonly failureReason: string | null;
  /** Original branch name field for backward compatibility. */
  readonly branchName: string | null;
  /** Original message field for backward compatibility. */
  readonly message: string;
}

/**
 * Status of the start-implementing transition.
 */
export type StartTransitionStatus =
  | "prerequisites_ready"
  | "prerequisites_blocked"
  | "branch_preparing"
  | "branch_ready"
  | "folder_moving"
  | "transition_completed"
  | "transition_failed"
  | "rollback_needed"
  | "rolled_back";

/**
 * Full start-implementing transition metadata persisted for later
 * workflow stages (continue-implementing, review, verification,
 * completion).
 */
export interface StartTransitionMetadata {
  /** Effective delivery policy used. */
  readonly deliveryPolicy: FeatDeliveryPolicy;
  /** Base branch or commit ref. */
  readonly baseBranch: string;
  /** Implementation branch name, if applicable. */
  readonly implementationBranch: string | null;
  /** Worktree path, if applicable. */
  readonly worktreePath: string | null;
  /** Repository root at transition time. */
  readonly repoRoot: string;
  /** Commit hash when transition completed. */
  readonly startCommit: string;
  /** Transition status. */
  readonly transitionStatus: StartTransitionStatus;
  /** Which step was last executed, for recovery. */
  readonly transitionStep: string;
  /** Error/reason when transition failed or was rolled back. */
  readonly failureReason: string | null;
  /** Whether the FEAT was rolled back to Ready. */
  readonly rolledBack: boolean;
}
