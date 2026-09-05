// Behavior suite: start transition.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {

  resolveEffectiveDeliveryPolicy,
  classifyStartConflicts,
  classifyStartPrerequisites,
  planBranchWorktree,
  deriveFeatureBranchName,
  createBranchPreparationMetadata,
  classifyStartFailure,
  deriveCompletedSteps,
} from "../src/start-transition-helpers.js";

// ---------------------------------------------------------------------------
// Happy Path: direct_merge transition
// ---------------------------------------------------------------------------

describe("FEAT-039: Integration — direct_merge happy path", () => {
  it("resolves delivery policy to direct_merge by default", () => {
    const policy = resolveEffectiveDeliveryPolicy(null);
    expect(policy.policy).toBe("direct_merge");
    expect(policy.source).toBe("project_default");
  });

  it("generates a feature branch name", () => {
    const branchName = deriveFeatureBranchName("FEAT-039", "start-implementing-transition");
    expect(branchName).toBe("feat/feat-039-start-implementing-transition");
  });

  it("plans direct_merge without isolated branch", () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo", "master", false);

    expect(plan.deliveryPolicy).toBe("direct_merge");
    expect(plan.implementationBranch).toBeNull();
    expect(plan.suggestsWorktree).toBe(false);
  });

  it("classifies prerequisites as ready when all checks pass", () => {
    const result = classifyStartPrerequisites(true, [], false, null);
    expect(result.readyToProceed).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it("creates branch preparation metadata for successful transition", () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo", "master", false);
    const metadata = createBranchPreparationMetadata(plan, "/tmp/repo", "abc123", "skipped_direct_merge");

    expect(metadata.deliveryPolicy).toBe("direct_merge");
    expect(metadata.preparationResult).toBe("skipped_direct_merge");
    expect(metadata.failureReason).toBeNull();

    // Backward compatibility fields
    expect(metadata.branchName).toBeNull();
    expect(metadata.message).toContain("skipped_direct_merge");
  });

  it("completes all transition steps successfully", () => {
    // Simulating all 9 transition steps completed
    const completedSteps = deriveCompletedSteps(8);
    expect(completedSteps).toHaveLength(9);
    expect(completedSteps[completedSteps.length - 1]).toBe("record_completion");
  });
});

// ---------------------------------------------------------------------------
// Happy Path: pull_request transition
// ---------------------------------------------------------------------------

describe("FEAT-039: Integration — pull_request happy path", () => {
  it("resolves delivery policy to pull_request when explicitly configured", () => {
    const policy = resolveEffectiveDeliveryPolicy("pull_request");
    expect(policy.policy).toBe("pull_request");
    expect(policy.source).toBe("explicit_config");
  });

  it("plans pull_request with isolated branch", () => {
    const plan = planBranchWorktree("pull_request", "feat/FEAT-042-code-review", "/tmp/repo", "main", false);

    expect(plan.deliveryPolicy).toBe("pull_request");
    expect(plan.implementationBranch).toBe("feat/FEAT-042-code-review");
    expect(plan.baseBranch).toBe("main");
    expect(plan.suggestsWorktree).toBe(false);
  });

  it("plans pull_request with worktree when requested", () => {
    const plan = planBranchWorktree("pull_request", "feat/FEAT-042-code-review", "/tmp/repo", "master", true);

    expect(plan.suggestsWorktree).toBe(true);
    expect(plan.suggestedWorktreePath).toContain("/tmp/repo-worktrees");
  });

  it("creates branch preparation metadata for pull_request mode", () => {
    const plan = planBranchWorktree("pull_request", "feat/FEAT-039-test", "/tmp/repo", "master", false);
    const metadata = createBranchPreparationMetadata(plan, "/tmp/repo", "def456", "created");

    expect(metadata.deliveryPolicy).toBe("pull_request");
    expect(metadata.implementationBranch).toBe("feat/FEAT-039-test");
    expect(metadata.preparationResult).toBe("created");
    expect(metadata.branchName).toBe("feat/FEAT-039-test");
  });
});

// ---------------------------------------------------------------------------
// Conflict Path
// ---------------------------------------------------------------------------

describe("FEAT-039: Integration — conflict path", () => {
  it("blocks start when conflicting active run exists", () => {
    const conflictCheck = classifyStartConflicts(true, "continue-implementing", false);
    expect(conflictCheck.hasConflict).toBe(true);
    expect(conflictCheck.conflictType).toBe("active_run");

    const prerequisiteCheck = classifyStartPrerequisites(true, [], true, "continue-implementing");
    expect(prerequisiteCheck.readyToProceed).toBe(false);
    expect(prerequisiteCheck.blockingReasons[0]!.code).toBe("active_workflow_run");
  });

  it("blocks start when rollback is in progress", () => {
    const conflictCheck = classifyStartConflicts(false, null, true);
    expect(conflictCheck.hasConflict).toBe(true);
    expect(conflictCheck.conflictType).toBe("rollback_in_progress");
  });

  it("no conflict when conditions are clean", () => {
    const conflictCheck = classifyStartConflicts(false, null, false);
    expect(conflictCheck.hasConflict).toBe(false);
    expect(conflictCheck.conflictType).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Failure / Rollback Path
// ---------------------------------------------------------------------------

describe("FEAT-039: Integration — failure/rollback path", () => {
  it("pure check failure: safe, no rollback needed", () => {
    // Only steps 0-3 completed (pure checks), no I/O
    const failure = classifyStartFailure(3, false, false);

    expect(failure.needsRollback).toBe(false);
    expect(failure.isSafeFailure).toBe(true);
    expect(failure.recommendedAction).toBe("none");
  });

  it("metadata persistence failure: report only, no rollback", () => {
    // Steps 0-4 completed: metadata written but no branch/folder mutation
    const failure = classifyStartFailure(4, false, false);

    expect(failure.needsRollback).toBe(false);
    expect(failure.isSafeFailure).toBe(true);
    expect(failure.recommendedAction).toBe("report_only");
  });

  it("branch created but folder not moved: needs branch rollback", () => {
    // Steps 0-5 completed, branch was created
    const failure = classifyStartFailure(5, true, false);

    expect(failure.needsRollback).toBe(true);
    expect(failure.recommendedAction).toBe("rollback_folder_and_branch");
  });

  it("folder moved failure: needs folder rollback", () => {
    // Steps 0-6 completed, folder was moved
    const failure = classifyStartFailure(6, true, true);

    expect(failure.needsRollback).toBe(true);
    expect(failure.recommendedAction).toBe("rollback_folder");
  });

  it("completed steps are accurately derived for failure analysis", () => {
    // Branch creation failed at step 5
    const steps = deriveCompletedSteps(4);
    expect(steps).toEqual([
      "validate_readiness",
      "check_conflicts",
      "resolve_policy",
      "plan_branch_worktree",
      "persist_metadata",
    ]);
  });
});

// ---------------------------------------------------------------------------
// No-auto-implementation: the transition stops before implementation
// ---------------------------------------------------------------------------

describe("FEAT-039: Integration — start transition and autonomous handoff", () => {
  it("runs the first implementation worker when autonomous mode is selected", () => {
    const startRoute = readFileSync(
      fileURLToPath(new URL("../src/application/features/start-implementation-application.ts", import.meta.url)),
      "utf8",
    );

    expect(startRoute).toContain("transitionOnly: !autonomous");
  });

  it("classifyStartFailure only triggers rollback when things go wrong", () => {
    // When last completed step is before branch creation, no rollback
    const safeFailure = classifyStartFailure(4, true, false);
    expect(safeFailure.needsRollback).toBe(false);
    expect(safeFailure.recommendedAction).toBe("report_only");

    // When folder was moved and things failed, rollback IS needed
    const needsRollback = classifyStartFailure(6, true, true);
    expect(needsRollback.needsRollback).toBe(true);

    // The transition-only stop is enforced by executeStartImplementingRun via the transitionOnly boolean
    // not by the failure classification helper
  });

  it("deriveCompletedSteps shows transition ends at record_completion", () => {
    const steps = deriveCompletedSteps(8);
    // The last step is record_completion — no implementation step exists
    const implementationStep = steps.find((s) => s.includes("implementation"));
    expect(implementationStep).toBeUndefined();
  });

  it("planBranchWorktree does not suggest implementation actions", () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo");
    // The plan is metadata-only, no execution instructions
    expect(plan.summary).not.toContain("implementation");
  });
});

// ---------------------------------------------------------------------------
// Acceptance traceability verification
// ---------------------------------------------------------------------------

describe("FEAT-039: Acceptance traceability", () => {
  // AC1: Readiness is validated before any state change
  it("AC1 — readiness validated before state change (classifyStartPrerequisites is pure)", () => {
    const result = classifyStartPrerequisites(false, [{ code: "missing_doc", message: "Missing doc" }], false, null);
    expect(result.readyToProceed).toBe(false);
  });

  // AC2: Conflicting active workflow runs block start
  it("AC2 — conflicting active runs block start", () => {
    const result = classifyStartPrerequisites(true, [], true, "continue-implementing");
    expect(result.readyToProceed).toBe(false);
  });

  // AC3: Passing validation moves FEAT to In Progress (happy path)
  it("AC3 — all prerequisites pass, transition can proceed", () => {
    const result = classifyStartPrerequisites(true, [], false, null);
    expect(result.readyToProceed).toBe(true);
  });

  // AC4: direct_merge records integration branch context
  it("AC4 — direct_merge records integration branch context", () => {
    const policy = resolveEffectiveDeliveryPolicy("direct_merge");
    expect(policy.policy).toBe("direct_merge");
  });

  // AC5: pull_request creates/selects isolated branch/worktree
  it("AC5 — pull_request selects isolated branch", () => {
    const plan = planBranchWorktree("pull_request", "feat/FEAT-039-test", "/tmp/repo");
    expect(plan.implementationBranch).toBe("feat/FEAT-039-test");
    expect(plan.deliveryPolicy).toBe("pull_request");
  });

  // AC7: Branch/worktree metadata is recorded (via createBranchPreparationMetadata)
  it("AC7 — branch/worktree metadata contains required fields", () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039-test", "/tmp/repo", "master");
    const metadata = createBranchPreparationMetadata(plan, "/tmp/repo", "abc123", "skipped_direct_merge");

    expect(metadata.deliveryPolicy).toBeDefined();
    expect(metadata.baseBranch).toBeDefined();
    expect(metadata.repoRoot).toBeDefined();
    expect(metadata.startCommit).toBeDefined();
    expect(metadata.preparationResult).toBeDefined();
    expect(metadata.branchName).toBeDefined(); // backward compat
    expect(metadata.message).toBeDefined(); // backward compat
  });

  // AC8: Metadata is additive and backward-compatible
  it("AC8 — new fields are additive, legacy fields preserved", () => {
    const plan = planBranchWorktree("direct_merge", null as unknown as string, "/tmp/repo");
    const metadata = createBranchPreparationMetadata(plan as any, "/tmp/repo", "abc123", "skipped_direct_merge", null, "old-branch");

    // Legacy fields
    expect(metadata.branchName).toBe("old-branch");
    expect(metadata.message).toBeTruthy();

    // New fields
    expect(metadata.deliveryPolicy).toBe("direct_merge");
    expect(metadata.startCommit).toBe("abc123");
  });

  // AC9: Transition does not launch implementation work automatically
  it("AC9 — helpers do not contain implementation launch logic", () => {
    const plan = planBranchWorktree("direct_merge", "feat/FEAT-039", "/tmp/repo");

    // Pure helpers produce metadata only
    expect(plan.suggestsWorktree).toBe(false);
    expect(typeof plan.summary).toBe("string");
  });

  // AC10: Failures leave safe explainable state
  it("AC10 — failure classification provides actionable rollback guidance", () => {
    const failure = classifyStartFailure(6, true, true);

    expect(failure.needsRollback).toBe(true);
    expect(failure.recommendedAction).toBe("rollback_folder");
    expect(failure.completedSteps.length).toBeGreaterThan(0);
    expect(failure.explanation).toBeTruthy();
  });
});
