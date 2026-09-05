// Behavior suite: start transition.
import { describe, it, expect } from "vitest";
import {
  resolveEffectiveDeliveryPolicy,
  planBranchWorktree,
  classifyStartPrerequisites,
  classifyStartConflicts,
  createBranchPreparationMetadata,
  classifyStartFailure,
  resolveDefaultBaseBranch,
  isFeatureBranch,
  deriveFeatureBranchName,
  deriveCompletedSteps,
  type BranchWorktreePlan,
} from "../src/start-transition-helpers.js";

// ---------------------------------------------------------------------------
// resolveEffectiveDeliveryPolicy tests
// ---------------------------------------------------------------------------

describe("resolveEffectiveDeliveryPolicy", () => {
  it('returns direct_merge as default when no policy is configured', () => {
    const result = resolveEffectiveDeliveryPolicy(null);

    expect(result.policy).toBe("direct_merge");
    expect(result.source).toBe("project_default");
    expect(result.explanation).toContain("default direct_merge");
  });

  it('returns direct_merge when undefined is passed', () => {
    const result = resolveEffectiveDeliveryPolicy(undefined);

    expect(result.policy).toBe("direct_merge");
    expect(result.source).toBe("project_default");
  });

  it('returns direct_merge when explicitly configured', () => {
    const result = resolveEffectiveDeliveryPolicy("direct_merge");

    expect(result.policy).toBe("direct_merge");
    expect(result.source).toBe("explicit_config");
  });

  it('returns pull_request when explicitly configured', () => {
    const result = resolveEffectiveDeliveryPolicy("pull_request");

    expect(result.policy).toBe("pull_request");
    expect(result.source).toBe("explicit_config");
  });
});

// ---------------------------------------------------------------------------
// deriveFeatureBranchName tests
// ---------------------------------------------------------------------------

describe("deriveFeatureBranchName", () => {
  it("generates branch name from external ID and title slug", () => {
    const name = deriveFeatureBranchName("FEAT-039", "Start Implementing Transition");

    expect(name).toBe("feat/feat-039-start-implementing-transition");
  });

  it("generates branch name with only external ID when title slug is null", () => {
    const name = deriveFeatureBranchName("FEAT-039", null);

    expect(name).toBe("feat/feat-039");
  });

  it("generates branch name with only external ID when title slug is empty", () => {
    const name = deriveFeatureBranchName("FEAT-039", "");

    expect(name).toBe("feat/feat-039");
  });

  it("sanitizes special characters in title slug", () => {
    const name = deriveFeatureBranchName("FEAT-042", "Code Review: Finding Ledger & Repair Loop!");

    expect(name).toBe("feat/feat-042-code-review-finding-ledger-repair-loop");
  });
});

// ---------------------------------------------------------------------------
// planBranchWorktree tests
// ---------------------------------------------------------------------------

describe("planBranchWorktree", () => {
  it('plans direct_merge without isolated branch or worktree', () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo");

    expect(plan.deliveryPolicy).toBe("direct_merge");
    expect(plan.implementationBranch).toBeNull();
    expect(plan.suggestedWorktreePath).toBeNull();
    expect(plan.suggestsWorktree).toBe(false);
    expect(plan.baseBranch).toBe("master");
    expect(plan.summary).toContain("Direct merge mode");
  });

  it('plans pull_request with isolated feature branch', () => {
    const plan = planBranchWorktree("pull_request", "feat/FEAT-039-test", "/tmp/repo");

    expect(plan.deliveryPolicy).toBe("pull_request");
    expect(plan.implementationBranch).toBe("feat/FEAT-039-test");
    expect(plan.suggestedWorktreePath).toBeNull();
    expect(plan.suggestsWorktree).toBe(false);
    expect(plan.summary).toContain("Pull request mode");
  });

  it('plans pull_request with worktree when useWorktree is true', () => {
    const plan = planBranchWorktree("pull_request", "feat/FEAT-039-test", "/tmp/repo", "main", true);

    expect(plan.deliveryPolicy).toBe("pull_request");
    expect(plan.implementationBranch).toBe("feat/FEAT-039-test");
    expect(plan.suggestedWorktreePath).toContain("/tmp/repo-worktrees/feat-FEAT-039-test");
    expect(plan.suggestsWorktree).toBe(true);
    expect(plan.baseBranch).toBe("main");
  });

  it('uses custom base branch when provided', () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo", "develop");

    expect(plan.baseBranch).toBe("develop");
  });

  it('produces different summaries for direct_merge and pull_request', () => {
    const directPlan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo");
    const prPlan = planBranchWorktree("pull_request", "feat/FEAT-039-test", "/tmp/repo");

    expect(directPlan.summary).not.toBe(prPlan.summary);
  });
});

// ---------------------------------------------------------------------------
// classifyStartPrerequisites tests
// ---------------------------------------------------------------------------

describe("classifyStartPrerequisites", () => {
  it("returns ready when all prerequisites are satisfied", () => {
    const result = classifyStartPrerequisites(true, [], false, null);

    expect(result.readyToProceed).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it("blocks when readiness is not confirmed", () => {
    const result = classifyStartPrerequisites(false, [{ code: "missing_document", message: "FeatureTasks.md missing" }], false, null);

    expect(result.readyToProceed).toBe(false);
    expect(result.blockingReasons).toHaveLength(1);
    expect(result.blockingReasons[0]!.code).toBe("missing_document");
  });

  it("blocks when an active run exists", () => {
    const result = classifyStartPrerequisites(true, [], true, "continue-implementing");

    expect(result.readyToProceed).toBe(false);
    expect(result.blockingReasons).toHaveLength(1);
    expect(result.blockingReasons[0]!.code).toBe("active_workflow_run");
  });

  it("reports multiple blocking reasons", () => {
    const result = classifyStartPrerequisites(false, [{ code: "markers_present", message: "Validation markers" }], true, "start-implementing");

    expect(result.readyToProceed).toBe(false);
    expect(result.blockingReasons).toHaveLength(2);
  });

  it("adds warning when not ready but no active run", () => {
    const result = classifyStartPrerequisites(false, [{ code: "empty_document", message: "Empty FeatureDescription" }], false, null);

    expect(result.readyToProceed).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.code).toBe("readiness_not_confirmed");
  });

  it("returns no warnings when ready", () => {
    const result = classifyStartPrerequisites(true, [], false, null);

    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// classifyStartConflicts tests
// ---------------------------------------------------------------------------

describe("classifyStartConflicts", () => {
  it("returns no conflict when conditions are clean", () => {
    const result = classifyStartConflicts(false, null, false);

    expect(result.hasConflict).toBe(false);
    expect(result.blockReason).toBeNull();
    expect(result.conflictType).toBe("none");
  });

  it("detects active workflow run conflict", () => {
    const result = classifyStartConflicts(true, "continue-implementing", false);

    expect(result.hasConflict).toBe(true);
    expect(result.blockReason).toContain("continue-implementing");
    expect(result.conflictType).toBe("active_run");
  });

  it("detects rollback in progress", () => {
    const result = classifyStartConflicts(false, null, true);

    expect(result.hasConflict).toBe(true);
    expect(result.blockReason).toContain("rollback");
    expect(result.conflictType).toBe("rollback_in_progress");
  });
});

// ---------------------------------------------------------------------------
// createBranchPreparationMetadata tests
// ---------------------------------------------------------------------------

describe("createBranchPreparationMetadata", () => {
  it("creates metadata for created branch", () => {
    const plan: BranchWorktreePlan = {
      deliveryPolicy: "pull_request",
      baseBranch: "master",
      implementationBranch: "feat/FEAT-039-test",
      suggestedWorktreePath: null,
      suggestsWorktree: false,
      summary: "Pull request mode",
    };

    const metadata = createBranchPreparationMetadata(plan, "/tmp/repo", "abc123", "created");

    expect(metadata.deliveryPolicy).toBe("pull_request");
    expect(metadata.implementationBranch).toBe("feat/FEAT-039-test");
    expect(metadata.baseBranch).toBe("master");
    expect(metadata.repoRoot).toBe("/tmp/repo");
    expect(metadata.startCommit).toBe("abc123");
    expect(metadata.preparationResult).toBe("created");
    expect(metadata.failureReason).toBeNull();
    expect(metadata.branchName).toBe("feat/FEAT-039-test");
  });

  it("creates metadata for direct_merge skip", () => {
    const plan: BranchWorktreePlan = {
      deliveryPolicy: "direct_merge",
      baseBranch: "master",
      implementationBranch: null,
      suggestedWorktreePath: null,
      suggestsWorktree: false,
      summary: "Direct merge mode",
    };

    const metadata = createBranchPreparationMetadata(plan, "/tmp/repo", "def456", "skipped_direct_merge");

    expect(metadata.deliveryPolicy).toBe("direct_merge");
    expect(metadata.implementationBranch).toBeNull();
    expect(metadata.preparationResult).toBe("skipped_direct_merge");
    expect(metadata.branchName).toBeNull();
  });

  it("includes failure reason when preparation failed", () => {
    const plan: BranchWorktreePlan = {
      deliveryPolicy: "pull_request",
      baseBranch: "master",
      implementationBranch: "feat/FEAT-039-fail",
      suggestedWorktreePath: null,
      suggestsWorktree: false,
      summary: "Pull request mode",
    };

    const metadata = createBranchPreparationMetadata(
      plan, "/tmp/repo", "ghi789", "failed", "Branch already exists with different base",
    );

    expect(metadata.preparationResult).toBe("failed");
    expect(metadata.failureReason).toBe("Branch already exists with different base");
    expect(metadata.message).toBe("Branch already exists with different base");
  });

  it("preserves legacy branchName field for backward compatibility", () => {
    const plan: BranchWorktreePlan = {
      deliveryPolicy: "direct_merge",
      baseBranch: "master",
      implementationBranch: null,
      suggestedWorktreePath: null,
      suggestsWorktree: false,
      summary: "Direct merge mode",
    };

    const metadata = createBranchPreparationMetadata(plan, "/tmp/repo", "abc123", "skipped_direct_merge", null, "existing-branch");

    expect(metadata.branchName).toBe("existing-branch");
    expect(metadata.message).toContain("skipped_direct_merge");
  });
});

// ---------------------------------------------------------------------------
// deriveCompletedSteps tests
// ---------------------------------------------------------------------------

describe("deriveCompletedSteps", () => {
  it("returns empty array when no steps completed", () => {
    const steps = deriveCompletedSteps(-1);

    expect(steps).toHaveLength(0);
  });

  it("returns first step for index 0", () => {
    const steps = deriveCompletedSteps(0);

    expect(steps).toEqual(["validate_readiness"]);
  });

  it("returns all steps up to the given index", () => {
    const steps = deriveCompletedSteps(3);

    expect(steps).toEqual([
      "validate_readiness",
      "check_conflicts",
      "resolve_policy",
      "plan_branch_worktree",
    ]);
  });

  it("returns all steps for the last index", () => {
    const steps = deriveCompletedSteps(8);

    expect(steps).toHaveLength(9);
    expect(steps[steps.length - 1]).toBe("record_completion");
  });
});

// ---------------------------------------------------------------------------
// classifyStartFailure tests
// ---------------------------------------------------------------------------

describe("classifyStartFailure", () => {
  it("classifies pure check failure as safe with no rollback needed", () => {
    const result = classifyStartFailure(3, false, false);

    expect(result.needsRollback).toBe(false);
    expect(result.isSafeFailure).toBe(true);
    expect(result.recommendedAction).toBe("none");
  });

  it("classifies metadata-only failure as safe with report", () => {
    const result = classifyStartFailure(4, false, false);

    expect(result.needsRollback).toBe(false);
    expect(result.isSafeFailure).toBe(true);
    expect(result.recommendedAction).toBe("report_only");
  });

  it("classifies branch-created-but-folder-not-moved as needing branch rollback", () => {
    const result = classifyStartFailure(5, true, false);

    expect(result.needsRollback).toBe(true);
    expect(result.recommendedAction).toBe("rollback_folder_and_branch");
  });

  it("classifies branch-not-created as safe when no folder moved", () => {
    const result = classifyStartFailure(5, false, false);

    expect(result.needsRollback).toBe(false);
    expect(result.recommendedAction).toBe("report_only");
  });

  it("classifies folder-moved failure as needing folder rollback", () => {
    const result = classifyStartFailure(6, true, true);

    expect(result.needsRollback).toBe(true);
    expect(result.recommendedAction).toBe("rollback_folder");
  });

  it("always needs rollback when folder was moved", () => {
    const result = classifyStartFailure(8, true, true);

    expect(result.needsRollback).toBe(true);
    expect(result.recommendedAction).toBe("rollback_folder");
  });
});

// ---------------------------------------------------------------------------
// resolveDefaultBaseBranch tests
// ---------------------------------------------------------------------------

describe("resolveDefaultBaseBranch", () => {
  it("returns master when available", () => {
    const branch = resolveDefaultBaseBranch(["main", "master", "develop"]);

    expect(branch).toBe("master");
  });

  it("returns main when master is not available", () => {
    const branch = resolveDefaultBaseBranch(["main", "develop"]);

    expect(branch).toBe("main");
  });

  it("returns master default when neither master nor main exist", () => {
    const branch = resolveDefaultBaseBranch(["develop", "feature"]);

    expect(branch).toBe("master");
  });

  it("returns master when empty list", () => {
    const branch = resolveDefaultBaseBranch([]);

    expect(branch).toBe("master");
  });
});

// ---------------------------------------------------------------------------
// isFeatureBranch tests
// ---------------------------------------------------------------------------

describe("isFeatureBranch", () => {
  it("returns true for feat/ prefixed branch", () => {
    expect(isFeatureBranch("feat/FEAT-039")).toBe(true);
    expect(isFeatureBranch("feat/my-feature")).toBe(true);
  });

  it("returns false for non-feature branches", () => {
    expect(isFeatureBranch("master")).toBe(false);
    expect(isFeatureBranch("main")).toBe(false);
    expect(isFeatureBranch("develop")).toBe(false);
    expect(isFeatureBranch("main/FEAT-039")).toBe(false);
  });
});
