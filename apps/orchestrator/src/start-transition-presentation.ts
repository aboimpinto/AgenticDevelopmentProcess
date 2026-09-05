// ---------------------------------------------------------------------------
// start-transition-presentation.ts — FEAT-039 Presentation Logic
//
// Pure formatting helpers for start-transition status, branch/worktree
// metadata, and API error summaries. These helpers produce structured
// messages for dashboard display and API error responses without
// performing I/O.
// ---------------------------------------------------------------------------

import type {
  FeatDeliveryPolicy,
  StartTransitionStatus,
  BranchPreparationResult,
  StartTransitionMetadata,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Structured error reason for API responses.
 */
export interface TransitionErrorReason {
  /** Machine-readable error code. */
  readonly code: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Suggested next step for the user or workflow. */
  readonly nextStep: string;
}

/**
 * Structured transition status summary for API responses and dashboard.
 */
export interface TransitionStatusSummary {
  /** Current transition status. */
  readonly status: StartTransitionStatus;
  /** Human-readable status label. */
  readonly label: string;
  /** Whether the transition is in a terminal state. */
  readonly terminal: boolean;
  /** Whether the transition was successful. */
  readonly success: boolean;
}

/**
 * Structured branch/worktree display summary.
 */
export interface BranchWorktreeDisplaySummary {
  /** Delivery policy label. */
  readonly deliveryPolicyLabel: string;
  /** Formatted branch info. */
  readonly branchInfo: string;
  /** Worktree info, if applicable. */
  readonly worktreeInfo: string | null;
  /** Base branch display. */
  readonly baseBranch: string;
  /** Commit short hash. */
  readonly startCommitShort: string;
}

// ---------------------------------------------------------------------------
// Status labels and helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<StartTransitionStatus, string> = {
  prerequisites_ready: "Prerequisites satisfied",
  prerequisites_blocked: "Prerequisites not met",
  branch_preparing: "Preparing branch or worktree",
  branch_ready: "Branch or worktree ready",
  folder_moving: "Moving FEAT to In Progress",
  transition_completed: "Transition completed",
  transition_failed: "Transition failed",
  rollback_needed: "Rollback in progress",
  rolled_back: "Rolled back to Ready",
};

const TERMINAL_STATUSES: ReadonlySet<StartTransitionStatus> = new Set([
  "transition_completed",
  "transition_failed",
  "rolled_back",
]);

const SUCCESS_STATUSES: ReadonlySet<StartTransitionStatus> = new Set([
  "transition_completed",
]);

// ---------------------------------------------------------------------------
// Pure formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a transition status into a human-readable label and terminal/success flags.
 */
export function formatTransitionStatus(status: StartTransitionStatus): TransitionStatusSummary {
  return {
    status,
    label: STATUS_LABELS[status] ?? status,
    terminal: TERMINAL_STATUSES.has(status),
    success: SUCCESS_STATUSES.has(status),
  };
}

/**
 * Format a delivery policy into a human-readable label.
 */
export function formatDeliveryPolicy(policy: FeatDeliveryPolicy): string {
  switch (policy) {
    case "direct_merge":
      return "Direct merge (work on integration branch)";
    case "pull_request":
      return "Pull request (isolated feature branch)";
    default:
      return policy;
  }
}

/**
 * Format branch/worktree metadata into a display-friendly summary.
 */
export function formatBranchWorktreeSummary(
  metadata: BranchPreparationResult | StartTransitionMetadata,
): BranchWorktreeDisplaySummary {
  const branchInfo = metadata.implementationBranch
    ? `Branch: ${metadata.implementationBranch}`
    : "No isolated branch (direct merge mode)";

  const worktreeInfo = metadata.worktreePath
    ? `Worktree: ${metadata.worktreePath}`
    : null;

  const shortCommit = metadata.startCommit.length > 7
    ? metadata.startCommit.slice(0, 7)
    : metadata.startCommit;

  return {
    deliveryPolicyLabel: formatDeliveryPolicy(metadata.deliveryPolicy),
    branchInfo,
    worktreeInfo,
    baseBranch: metadata.baseBranch,
    startCommitShort: shortCommit,
  };
}

/**
 * Format an error reason for API responses.
 */
export function formatTransitionError(
  code: string,
  message: string,
  nextStep?: string,
): TransitionErrorReason {
  const defaultNextSteps: Record<string, string> = {
    active_workflow_run:
      "Cancel or wait for the active workflow to complete before starting implementation.",
    folder_state_mismatch:
      "Ensure the FEAT is in Ready To Develop state before starting implementation.",
    missing_required_document:
      "Run the refine-feature workflow to create required documents.",
    validation_markers_present:
      "Run a current Deep-Dive to resolve [NEEDS VALIDATION] markers.",
    deep_dive_not_recorded:
      "Run a Deep-Dive before starting implementation.",
    deep_dive_stale:
      "Run a new Deep-Dive or confirm current understanding.",
    ui_requirement_unknown:
      "Run the design-feature workflow to classify UI requirements.",
    missing_design_artifacts:
      "Complete the design-feature workflow before starting implementation.",
    empty_document:
      "Fill in the empty or placeholder document before implementation.",
    branch_preparation_failed:
      "Check git state, resolve conflicts, or verify branch name availability.",
    folder_move_failed:
      "Check filesystem permissions or lock state.",
    rollback_in_progress:
      "Wait for the rollback to complete before retrying.",
  };

  return {
    code,
    message,
    nextStep: nextStep ?? defaultNextSteps[code] ?? "Review the error and retry after resolving the issue.",
  };
}

/**
 * Format a list of error reasons into a compact API error body.
 */
export function formatTransitionErrorResponse(
  errors: ReadonlyArray<TransitionErrorReason>,
): { errors: TransitionErrorReason[]; summary: string } {
  const summary = errors.length === 1
    ? errors[0]!.message
    : `${errors.length} issues block the start transition.`;

  return {
    errors: [...errors],
    summary,
  };
}

/**
 * Format a successful transition result summary.
 */
export function formatTransitionSuccessSummary(
  metadata: StartTransitionMetadata | null,
): string {
  const policy = metadata
    ? formatDeliveryPolicy(metadata.deliveryPolicy)
    : "direct_merge";

  const branch = metadata?.implementationBranch
    ? ` on branch ${metadata.implementationBranch}`
    : "";

  return `Start transition completed (${policy})${branch}.`;
}
