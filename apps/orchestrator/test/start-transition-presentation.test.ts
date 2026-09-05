// Behavior suite: start transition.
import { describe, it, expect } from "vitest";
import {
  formatTransitionStatus,
  formatDeliveryPolicy,
  formatBranchWorktreeSummary,
  formatTransitionError,
  formatTransitionErrorResponse,
  formatTransitionSuccessSummary,
} from "../src/start-transition-presentation.js";
import type { BranchPreparationResult, StartTransitionMetadata } from "@hepha/shared";

// ---------------------------------------------------------------------------
// formatTransitionStatus tests
// ---------------------------------------------------------------------------

describe("formatTransitionStatus", () => {
  it("formats transition_completed as terminal success", () => {
    const result = formatTransitionStatus("transition_completed");

    expect(result.label).toBe("Transition completed");
    expect(result.terminal).toBe(true);
    expect(result.success).toBe(true);
  });

  it("formats transition_failed as terminal failure", () => {
    const result = formatTransitionStatus("transition_failed");

    expect(result.terminal).toBe(true);
    expect(result.success).toBe(false);
  });

  it("formats prerequisites_ready as non-terminal pending", () => {
    const result = formatTransitionStatus("prerequisites_ready");

    expect(result.terminal).toBe(false);
    expect(result.success).toBe(false);
  });

  it("formats rolled_back as terminal failure", () => {
    const result = formatTransitionStatus("rolled_back");

    expect(result.terminal).toBe(true);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDeliveryPolicy tests
// ---------------------------------------------------------------------------

describe("formatDeliveryPolicy", () => {
  it("formats direct_merge", () => {
    expect(formatDeliveryPolicy("direct_merge")).toContain("Direct merge");
  });

  it("formats pull_request", () => {
    expect(formatDeliveryPolicy("pull_request")).toContain("Pull request");
  });
});

// ---------------------------------------------------------------------------
// formatBranchWorktreeSummary tests
// ---------------------------------------------------------------------------

describe("formatBranchWorktreeSummary", () => {
  it("formats direct_merge metadata without isolated branch", () => {
    const metadata: BranchPreparationResult = {
      deliveryPolicy: "direct_merge",
      baseBranch: "master",
      implementationBranch: null,
      worktreePath: null,
      repoRoot: "/tmp/repo",
      startCommit: "abcdef1234567890",
      preparationResult: "skipped_direct_merge",
      failureReason: null,
      branchName: null,
      message: "Direct merge",
    };

    const summary = formatBranchWorktreeSummary(metadata);

    expect(summary.deliveryPolicyLabel).toContain("Direct merge");
    expect(summary.branchInfo).toContain("No isolated branch");
    expect(summary.worktreeInfo).toBeNull();
    expect(summary.startCommitShort).toBe("abcdef1");
  });

  it("formats pull_request metadata with branch and worktree", () => {
    const metadata: BranchPreparationResult = {
      deliveryPolicy: "pull_request",
      baseBranch: "master",
      implementationBranch: "feat/FEAT-039-test",
      worktreePath: "/tmp/repo-worktrees/test",
      repoRoot: "/tmp/repo",
      startCommit: "abc123",
      preparationResult: "created",
      failureReason: null,
      branchName: "feat/FEAT-039-test",
      message: "Branch created",
    };

    const summary = formatBranchWorktreeSummary(metadata);

    expect(summary.deliveryPolicyLabel).toContain("Pull request");
    expect(summary.branchInfo).toContain("Branch: feat/FEAT-039-test");
    expect(summary.worktreeInfo).toContain("Worktree: /tmp/repo-worktrees/test");
    expect(summary.baseBranch).toBe("master");
  });
});

// ---------------------------------------------------------------------------
// formatTransitionError tests
// ---------------------------------------------------------------------------

describe("formatTransitionError", () => {
  it("formats error with known default next step", () => {
    const error = formatTransitionError("active_workflow_run", "An active workflow run exists.");

    expect(error.code).toBe("active_workflow_run");
    expect(error.nextStep).toContain("Cancel or wait");
  });

  it("formats error with custom next step", () => {
    const error = formatTransitionError("custom_error", "Custom error", "Do something specific.");

    expect(error.code).toBe("custom_error");
    expect(error.nextStep).toBe("Do something specific.");
  });

  it("provides generic next step for unknown codes", () => {
    const error = formatTransitionError("unknown_code", "Something went wrong.");

    expect(error.nextStep).toContain("Review the error");
  });
});

// ---------------------------------------------------------------------------
// formatTransitionErrorResponse tests
// ---------------------------------------------------------------------------

describe("formatTransitionErrorResponse", () => {
  it("formats single error response", () => {
    const errors = [
      { code: "active_workflow_run", message: "Active run", nextStep: "Wait." },
    ];

    const response = formatTransitionErrorResponse(errors);

    expect(response.errors).toHaveLength(1);
    expect(response.summary).toBe("Active run");
  });

  it("formats multiple error response with count summary", () => {
    const errors = [
      { code: "missing_document", message: "Missing FeatureTasks.md", nextStep: "Refine." },
      { code: "validation_markers", message: "Validation markers present", nextStep: "Deep-dive." },
    ];

    const response = formatTransitionErrorResponse(errors);

    expect(response.errors).toHaveLength(2);
    expect(response.summary).toContain("2 issues");
  });
});

// ---------------------------------------------------------------------------
// formatTransitionSuccessSummary tests
// ---------------------------------------------------------------------------

describe("formatTransitionSuccessSummary", () => {
  it("formats success summary with metadata", () => {
    const metadata: StartTransitionMetadata = {
      deliveryPolicy: "pull_request",
      baseBranch: "master",
      implementationBranch: "feat/FEAT-039-test",
      worktreePath: null,
      repoRoot: "/tmp/repo",
      startCommit: "abc123",
      transitionStatus: "transition_completed",
      transitionStep: "record_completion",
      failureReason: null,
      rolledBack: false,
    };

    const summary = formatTransitionSuccessSummary(metadata);

    expect(summary).toContain("Start transition completed");
    expect(summary).toContain("Pull request");
    expect(summary).toContain("feat/FEAT-039-test");
  });

  it("formats success summary without metadata (defaults)", () => {
    const summary = formatTransitionSuccessSummary(null);

    expect(summary).toContain("Start transition completed");
    expect(summary).toContain("direct_merge");
  });
});
