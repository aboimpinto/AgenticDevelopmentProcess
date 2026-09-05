// ---------------------------------------------------------------------------
// start-transition-helpers.ts — FEAT-039 Pure Business Logic
//
// Pure transition-planning helpers for the start-implementing workflow.
// These helpers have no filesystem, git, database, or notification side
// effects, making them deterministically testable without I/O.
//
// Uses the same pattern as feat-readiness-evaluator.ts: pure functions
// that return structured results consumed by I/O adapters in Phase 6.
// ---------------------------------------------------------------------------

import type { FeatDeliveryPolicy } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of resolving the effective delivery policy.
 */
export interface DeliveryPolicyResolution {
  /** The resolved delivery policy. */
  readonly policy: FeatDeliveryPolicy;
  /** How the policy was determined. */
  readonly source: "explicit_config" | "project_default" | "user_override";
  /** Human-readable explanation. */
  readonly explanation: string;
}

/**
 * Plan for branch or worktree preparation based on the delivery policy.
 */
export interface BranchWorktreePlan {
  /** The resolved delivery policy. */
  readonly deliveryPolicy: FeatDeliveryPolicy;
  /** The base branch or ref to use as the starting point. */
  readonly baseBranch: string;
  /** The target branch name for implementation work, if applicable. */
  readonly implementationBranch: string | null;
  /** Suggested worktree path, if applicable. */
  readonly suggestedWorktreePath: string | null;
  /** Whether a worktree is suggested for this plan. */
  readonly suggestsWorktree: boolean;
  /** Human-readable summary of the plan. */
  readonly summary: string;
}

/**
 * Classified start-transition prerequisite status.
 */
export interface PrerequisiteClassification {
  /** Whether all prerequisites are satisfied. */
  readonly readyToProceed: boolean;
  /** Blocking reasons, if any. */
  readonly blockingReasons: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
  }>;
  /** Non-blocking warnings, if any. */
  readonly warnings: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
  }>;
}

/**
 * Conflict state for the start transition.
 */
export interface ConflictClassification {
  /** Whether there is a conflicting active run or incompatible state. */
  readonly hasConflict: boolean;
  /** If blocked, a human-readable reason. */
  readonly blockReason: string | null;
  /** Identified conflict type. */
  readonly conflictType: "none" | "active_run" | "incompatible_state" | "rollback_in_progress";
}

/**
 * Classification of a start transition failure for recovery/rollback decisions.
 */
export interface FailureClassification {
  /** Whether rollback is needed. */
  readonly needsRollback: boolean;
  /** Whether the failure is safe (no ambiguous state left behind). */
  readonly isSafeFailure: boolean;
  /** Which transition steps were completed before the failure. */
  readonly completedSteps: ReadonlyArray<string>;
  /** Recommended recovery action. */
  readonly recommendedAction: "none" | "rollback_folder" | "rollback_folder_and_branch" | "report_only";
  /** Human-readable explanation. */
  readonly explanation: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_BRANCH = "master";
const FEATURE_BRANCH_PREFIX = "feat/";

/**
 * The ordered list of transition steps, used by FailureClassification
 * to determine which steps were completed.
 */
export const TRANSITION_STEPS = [
  "validate_readiness",
  "check_conflicts",
  "resolve_policy",
  "plan_branch_worktree",
  "persist_metadata",
  "prepare_branch",
  "move_folder",
  "sync_epic",
  "record_completion",
] as const;

type TransitionStep = (typeof TRANSITION_STEPS)[number];

// ---------------------------------------------------------------------------
// Pure Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the effective delivery policy.
 *
 * When no durable project configuration exists, returns the safe
 * default `direct_merge` with a clear explanation.
 *
 * @param configuredPolicy - Optional explicit policy from project config
 * @returns Structured delivery policy resolution
 */
export function resolveEffectiveDeliveryPolicy(
  configuredPolicy: string | null | undefined,
): DeliveryPolicyResolution {
  if (configuredPolicy === "pull_request") {
    return {
      policy: "pull_request",
      source: "explicit_config",
      explanation: "Project delivery policy is explicitly set to pull_request.",
    };
  }

  if (configuredPolicy === "direct_merge") {
    return {
      policy: "direct_merge",
      source: "explicit_config",
      explanation: "Project delivery policy is explicitly set to direct_merge.",
    };
  }

  return {
    policy: "direct_merge",
    source: "project_default",
    explanation:
      "No durable delivery policy configured. Using safe default direct_merge. " +
      "FEAT-046 will add policy configuration and PR-creation support.",
  };
}

/**
 * Generate a feature branch name from the feature's external ID and a title
 * slug. This is the canonical pure branch-name policy used by Start Feature.
 *
 * @param externalId - e.g., "FEAT-039"
 * @param titleSlug - e.g., "start-implementing-transition"
 * @returns Full branch name, e.g., "feat/FEAT-039-start-implementing-transition"
 */
export function deriveFeatureBranchName(externalId: string, titleSlug: string | null): string {
  const slug = (titleSlug ?? "").toLowerCase().replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  return slug ? `${FEATURE_BRANCH_PREFIX}${externalId.toLowerCase()}-${slug}` : `${FEATURE_BRANCH_PREFIX}${externalId.toLowerCase()}`;
}

/**
 * Plan branch or worktree preparation based on the delivery policy.
 *
 * For `direct_merge`: plan to use the base branch directly; no isolated
 * branch or worktree is needed. Implementation workers will work on the
 * integration branch.
 *
 * For `pull_request`: plan to create an isolated feature branch. Optionally
 * suggest a worktree path when a worktree strategy is enabled.
 *
 * @param deliveryPolicy - The resolved delivery policy
 * @param featureBranchName - The candidate feature branch name
 * @param repoRoot - The repository root path
 * @param baseBranch - Optional base branch override (defaults to master)
 * @param useWorktree - Whether to suggest a worktree for pull_request mode
 * @returns A branch/worktree plan
 */
export function planBranchWorktree(
  deliveryPolicy: FeatDeliveryPolicy,
  featureBranchName: string,
  repoRoot: string,
  baseBranch: string = DEFAULT_BASE_BRANCH,
  useWorktree: boolean = false,
): BranchWorktreePlan {
  if (deliveryPolicy === "direct_merge") {
    return {
      deliveryPolicy: "direct_merge",
      baseBranch,
      implementationBranch: null,
      suggestedWorktreePath: null,
      suggestsWorktree: false,
      summary: `Direct merge mode: working on branch ${baseBranch}. No isolated feature branch or worktree needed.`,
    };
  }

  // pull_request mode
  const worktreePath = useWorktree
    ? `${repoRoot}-worktrees/${featureBranchName.replace(/[^a-zA-Z0-9-_]/g, "-")}`
    : null;

  return {
    deliveryPolicy: "pull_request",
    baseBranch,
    implementationBranch: featureBranchName,
    suggestedWorktreePath: worktreePath,
    suggestsWorktree: useWorktree,
    summary: `Pull request mode: creating isolated branch ${featureBranchName} from ${baseBranch}.${worktreePath ? ` Worktree: ${worktreePath}` : ""}`,
  };
}

/**
 * Classify start-transition prerequisites into allowed/blocked.
 *
 * This helper evaluates the readiness results and determines if
 * the transition can proceed. It does not perform I/O.
 *
 * @param isReady - Whether the readiness evaluator returned ready
 * @param blockingReasons - Blocking reasons from the readiness evaluator
 * @param hasActiveRun - Whether there is an active workflow run
 * @param activeRunCommand - The command of the active run, if any
 * @returns Classification with blocking reasons and warnings
 */
export function classifyStartPrerequisites(
  isReady: boolean,
  blockingReasons: ReadonlyArray<{ code: string; message: string }>,
  hasActiveRun: boolean,
  activeRunCommand: string | null,
): PrerequisiteClassification {
  const blocking: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!isReady) {
    blocking.push(...blockingReasons);
  }

  if (hasActiveRun) {
    blocking.push({
      code: "active_workflow_run",
      message: `A workflow run (${activeRunCommand ?? "unknown"}) is already active for this FEAT.` +
        " Wait for it to complete or cancel it before starting a new implementation run.",
    });
  }

  if (!isReady && !hasActiveRun) {
    warnings.push({
      code: "readiness_not_confirmed",
      message: "Although no active run exists, readiness checks were not fully satisfied. Review blocking reasons carefully.",
    });
  }

  return {
    readyToProceed: blocking.length === 0,
    blockingReasons: blocking,
    warnings,
  };
}

/**
 * Classify potential conflicts for the start transition.
 *
 * @param hasActiveRun - Whether another workflow run is active for this FEAT
 * @param activeRunCommand - The command of the active run, if any
 * @param isRollbackInProgress - Whether a rollback is currently in progress
 * @returns Conflict classification
 */
export function classifyStartConflicts(
  hasActiveRun: boolean,
  activeRunCommand: string | null,
  isRollbackInProgress: boolean = false,
): ConflictClassification {
  if (isRollbackInProgress) {
    return {
      hasConflict: true,
      blockReason: "A rollback is in progress for this FEAT. Start transition is blocked until rollback completes.",
      conflictType: "rollback_in_progress",
    };
  }

  if (hasActiveRun) {
    return {
      hasConflict: true,
      blockReason: `An active ${activeRunCommand ?? "workflow"} run is in progress.` +
        " Cancel or wait for it to complete before starting implementation.",
      conflictType: "active_run",
    };
  }

  return {
    hasConflict: false,
    blockReason: null,
    conflictType: "none",
  };
}

/**
 * Create branch preparation metadata from a plan and execution context.
 *
 * @param plan - The branch/worktree plan
 * @param repoRoot - Repository root path
 * @param startCommit - The commit hash at preparation time
 * @param preparationResult - How preparation completed
 * @param failureReason - Failure reason, if any
 * @param existingBranchName - Existing branch name from a previous attempt, if any
 * @returns Structured preparation result matching shared BranchPreparationResult shape
 */
export function createBranchPreparationMetadata(
  plan: BranchWorktreePlan,
  repoRoot: string,
  startCommit: string,
  preparationResult: "created" | "already_exists" | "skipped_direct_merge" | "failed",
  failureReason: string | null = null,
  existingBranchName: string | null = null,
) {
  const branchName = existingBranchName ?? plan.implementationBranch;

  return {
    deliveryPolicy: plan.deliveryPolicy,
    baseBranch: plan.baseBranch,
    implementationBranch: branchName,
    worktreePath: plan.suggestedWorktreePath,
    repoRoot,
    startCommit,
    preparationResult,
    failureReason,
    branchName,
    message: failureReason ?? `Branch/worktree preparation: ${preparationResult}`,
  };
}

/**
 * Determine which steps were completed before a failure, based on the
 * last successfully completed step index.
 *
 * @param lastCompletedStepIndex - Index into TRANSITION_STEPS of the last completed step (-1 if none)
 * @returns Ordered list of completed step names
 */
export function deriveCompletedSteps(lastCompletedStepIndex: number): readonly string[] {
  if (lastCompletedStepIndex < 0) {
    return [];
  }

  return TRANSITION_STEPS.slice(0, lastCompletedStepIndex + 1);
}

/**
 * Classify a start transition failure to determine recovery strategy.
 *
 * Rules:
 * - If only pure checks were completed (steps 0-4), no rollback needed — no state was mutated.
 * - If branch was prepared (step 5) but folder was not moved, rollback folder is not needed,
 *   but the created branch may need cleanup.
 * - If folder was moved (step 6) but EPIC sync or completion recording failed, rollback the
 *   folder move.
 * - If EPIC sync (step 7) completed but recording failed, rollback may be optional.
 *
 * @param lastCompletedStepIndex - Index of the last successfully completed step (-1 if none)
 * @param hasBranchBeenCreated - Whether a branch was actually created
 * @param hasFolderBeenMoved - Whether the FEAT folder was moved to In Progress
 * @returns Failure classification
 */
export function classifyStartFailure(
  lastCompletedStepIndex: number,
  hasBranchBeenCreated: boolean,
  hasFolderBeenMoved: boolean,
): FailureClassification {
  const completedSteps = deriveCompletedSteps(lastCompletedStepIndex);

  // No I/O mutations — safe failure
  if (lastCompletedStepIndex < 4) {
    return {
      needsRollback: false,
      isSafeFailure: true,
      completedSteps,
      recommendedAction: "none",
      explanation: "Failure occurred during pure prerequisite checks. No filesystem or git state was mutated.",
    };
  }

  // Metadata was persisted but no branch or folder was mutated
  if (lastCompletedStepIndex === 4) {
    return {
      needsRollback: false,
      isSafeFailure: true,
      completedSteps,
      recommendedAction: "report_only",
      explanation: "Metadata was written but no branch or folder was created. No rollback needed; the metadata can be cleared.",
    };
  }

  // Branch was prepared but folder was not moved
  if (lastCompletedStepIndex === 5 && !hasFolderBeenMoved) {
    return {
      needsRollback: hasBranchBeenCreated,
      isSafeFailure: !hasBranchBeenCreated,
      completedSteps,
      recommendedAction: hasBranchBeenCreated ? "rollback_folder_and_branch" : "report_only",
      explanation: hasBranchBeenCreated
        ? "Branch was created but folder was not moved. Rollback should delete the created branch."
        : "Branch preparation failed without creating a branch. No rollback needed.",
    };
  }

  // Folder was moved — definitely needs rollback
  if (lastCompletedStepIndex >= 5 && hasFolderBeenMoved) {
    return {
      needsRollback: true,
      isSafeFailure: false,
      completedSteps,
      recommendedAction: "rollback_folder",
      explanation: "Folder was moved to In Progress. Rollback must move it back to Ready and clean up metadata.",
    };
  }

  // Fallback
  return {
    needsRollback: hasFolderBeenMoved || hasBranchBeenCreated,
    isSafeFailure: !(hasFolderBeenMoved || hasBranchBeenCreated),
    completedSteps,
    recommendedAction: hasFolderBeenMoved
      ? "rollback_folder"
      : hasBranchBeenCreated
        ? "rollback_folder_and_branch"
        : "report_only",
    explanation: "Uncertain failure state. Review completed steps and clean up any mutated state.",
  };
}

/**
 * Determine the default base branch name from a list of known branches.
 * Prefers "master" over "main" when both exist.
 *
 * @param knownBranches - List of branch names available in the repo
 * @returns The base branch name, defaulting to "master"
 */
export function resolveDefaultBaseBranch(knownBranches: ReadonlyArray<string>): string {
  if (knownBranches.includes("master")) {
    return "master";
  }

  if (knownBranches.includes("main")) {
    return "main";
  }

  return DEFAULT_BASE_BRANCH;
}

/**
 * Check whether a branch name looks like a feature branch.
 *
 * @param branchName - The branch name to check
 * @returns Whether it starts with the feature branch prefix
 */
export function isFeatureBranch(branchName: string): boolean {
  return branchName.startsWith(FEATURE_BRANCH_PREFIX);
}
