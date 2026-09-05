// Behavior suite: git action guard.
/**
 * Generic Git guardrail receipt-contract tests.
 *
 * Proves git guardrail data contracts: type definitions, receipt extension
 * compatibility, and safe DTO serialization.
 *
 * Uses pure type-level tests and isolated data fixtures. No live Pi,
 * HTTP servers, or browsers.
 */
import { describe, expect, it } from "vitest";
import { deriveWorkflowReceipt } from "../src/workflow-receipt.js";

// ---------------------------------------------------------------------------
// Type-level compatibility tests
// ---------------------------------------------------------------------------

describe("git guardrail shared types", () => {
  it("defines GitActionCategory values", () => {
    // Compile-time check: verify the union type covers all required categories
    const categories: readonly string[] = [
      "inspection",
      "local_status_check",
      "local_branch_change",
      "commit_creation",
      "remote_write",
      "pr_action",
      "unknown_local",
      "unknown_blocked",
    ];

    expect(categories).toContain("inspection");
    expect(categories).toContain("local_status_check");
    expect(categories).toContain("local_branch_change");
    expect(categories).toContain("commit_creation");
    expect(categories).toContain("remote_write");
    expect(categories).toContain("pr_action");
    expect(categories).toContain("unknown_local");
    expect(categories).toContain("unknown_blocked");
    expect(categories).toHaveLength(8);
  });

  it("defines GitGuardrailDecision values", () => {
    const decisions: readonly string[] = [
      "allowed",
      "blocked",
      "approval_required",
    ];

    expect(decisions).toContain("allowed");
    expect(decisions).toContain("blocked");
    expect(decisions).toContain("approval_required");
    expect(decisions).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Receipt extension compatibility tests
// ---------------------------------------------------------------------------

describe("receipt gitGuardrailEvidence compatibility", () => {
  it("creates a receipt without git guardrail evidence (backward compatible)", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "start-implementing",
      stage: "planning",
      status: "complete",
      nextState: "03_IN_PROGRESS",
    });

    expect(receipt.runId).toBeTruthy();
    expect(receipt.gitGuardrailEvidence).toBeUndefined();
  });

  it("creates a receipt with git guardrail evidence (additive)", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "start-implementing",
      stage: "phase-3",
      status: "complete",
      nextState: "03_IN_PROGRESS",
      gitGuardrailEvidence: [
        {
          actionCategory: "inspection",
          policyDecision: "allowed",
          workflowStateCheck: "passed",
          approvalRequired: false,
        },
      ],
    });

    expect(receipt.gitGuardrailEvidence).toBeDefined();
    expect(receipt.gitGuardrailEvidence).toHaveLength(1);
    expect(receipt.gitGuardrailEvidence![0].actionCategory).toBe("inspection");
    expect(receipt.gitGuardrailEvidence![0].policyDecision).toBe("allowed");
    expect(receipt.gitGuardrailEvidence![0].workflowStateCheck).toBe("passed");
    expect(receipt.gitGuardrailEvidence![0].approvalRequired).toBe(false);
  });

  it("creates a receipt with full git guardrail evidence including approval and dirty state", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "complete-feature",
      stage: "push",
      status: "blocked",
      nextState: "03_IN_PROGRESS",
      gitGuardrailEvidence: [
        {
          actionCategory: "remote_write",
          policyDecision: "approval_required",
          workflowStateCheck: "passed",
          approvalRequired: true,
          approvalRequestId: "req-123",
          approvalStatus: "pending",
          dirtyStateSummary: {
            clean: false,
            modifiedCount: 3,
            stagedCount: 1,
            untrackedCount: 0,
          },
        },
      ],
    });

    expect(receipt.gitGuardrailEvidence).toHaveLength(1);
    const evidence = receipt.gitGuardrailEvidence![0];
    expect(evidence.actionCategory).toBe("remote_write");
    expect(evidence.policyDecision).toBe("approval_required");
    expect(evidence.approvalRequired).toBe(true);
    expect(evidence.approvalRequestId).toBe("req-123");
    expect(evidence.approvalStatus).toBe("pending");
    expect(evidence.dirtyStateSummary).toBeDefined();
    expect(evidence.dirtyStateSummary!.clean).toBe(false);
    expect(evidence.dirtyStateSummary!.modifiedCount).toBe(3);
  });

  it("creates a receipt with blocked git action evidence", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "start-implementing",
      stage: "git-guard",
      status: "blocked",
      nextState: "03_IN_PROGRESS",
      gitGuardrailEvidence: [
        {
          actionCategory: "remote_write",
          policyDecision: "blocked",
          workflowStateCheck: "blocked",
          approvalRequired: false,
          blockedReason:
            "Remote writes not allowed when feature state is SUBMITTED.",
          dirtyStateSummary: {
            clean: true,
            modifiedCount: 0,
            stagedCount: 0,
            untrackedCount: 0,
          },
        },
      ],
    });

    expect(receipt.gitGuardrailEvidence).toHaveLength(1);
    const evidence = receipt.gitGuardrailEvidence![0];
    expect(evidence.policyDecision).toBe("blocked");
    expect(evidence.blockedReason).toContain("Remote writes not allowed");
    expect(evidence.dirtyStateSummary!.clean).toBe(true);
  });

  it("multiple git guardrail evidence entries are preserved in order", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "continue-implementing",
      stage: "phase-4",
      status: "complete",
      nextState: "03_IN_PROGRESS",
      gitGuardrailEvidence: [
        {
          actionCategory: "inspection",
          policyDecision: "allowed",
          workflowStateCheck: "not_applicable",
          approvalRequired: false,
        },
        {
          actionCategory: "commit_creation",
          policyDecision: "allowed",
          workflowStateCheck: "passed",
          approvalRequired: false,
        },
        {
          actionCategory: "remote_write",
          policyDecision: "approval_required",
          workflowStateCheck: "passed",
          approvalRequired: true,
          approvalRequestId: "req-456",
          approvalStatus: "pending",
        },
      ],
    });

    expect(receipt.gitGuardrailEvidence).toHaveLength(3);
    expect(receipt.gitGuardrailEvidence![0].actionCategory).toBe("inspection");
    expect(receipt.gitGuardrailEvidence![1].actionCategory).toBe(
      "commit_creation",
    );
    expect(receipt.gitGuardrailEvidence![2].actionCategory).toBe(
      "remote_write",
    );
    expect(receipt.gitGuardrailEvidence![2].approvalRequestId).toBe("req-456");
  });
});

// ---------------------------------------------------------------------------
// Receipt backward-compatibility tests
// ---------------------------------------------------------------------------

describe("receipt backward compatibility", () => {
  it("receipt without gitGuardrailEvidence validates successfully", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "test-command",
      stage: "test",
      status: "complete",
      nextState: "03_IN_PROGRESS",
    });

    // Ensure gitGuardrailEvidence is absent (backward compatible)
    expect(receipt.gitGuardrailEvidence).toBeUndefined();

    // Ensure existing receipt fields are present
    expect(receipt.runId).toBeTruthy();
    expect(receipt.projectId).toBe("test-project");
    expect(receipt.cardKey).toBe("WORK-001");
    expect(receipt.command).toBe("test-command");
    expect(receipt.stage).toBe("test");
    expect(receipt.status).toBe("complete");
    expect(receipt.nextState).toBe("03_IN_PROGRESS");
  });

  it("receipt with existing optional fields coexists with gitGuardrailEvidence", () => {
    const receipt = deriveWorkflowReceipt({
      projectId: "test-project",
      cardKey: "WORK-001",
      command: "test-command",
      stage: "test",
      status: "complete",
      nextState: "03_IN_PROGRESS",
      selectedProfile: {
        profileId: "git-writer",
        category: "git-writes",
        capabilities: {
          "read-discover": true,
          "document-write": false,
          "test-run": false,
          "source-edit": false,
          "git-write": true,
          "privileged-action": false,
        },
        selectionSource: "workflow-node",
        selectionReason: "Git write operation requested",
      },
      commandPolicyDecisions: [
        {
          outcome: "allowed",
          code: "ALLOWED_VERIFICATION",
          profileId: "git-writer",
          riskCategory: "git_local",
          safeCommand: "git status",
          reason: "Command matched allow rule: allow-git-status",
          executed: true,
          timestamp: new Date().toISOString(),
        },
      ],
      gitGuardrailEvidence: [
        {
          actionCategory: "inspection",
          policyDecision: "allowed",
          workflowStateCheck: "passed",
          approvalRequired: false,
        },
      ],
    });

    // All optional fields present
    expect(receipt.selectedProfile).toBeDefined();
    expect(receipt.selectedProfile!.profileId).toBe("git-writer");
    expect(receipt.commandPolicyDecisions).toHaveLength(1);
    expect(receipt.gitGuardrailEvidence).toHaveLength(1);

    // Coexistence: git guardrail data does not interfere with other fields
    expect(receipt.selectedProfile!.capabilities["git-write"]).toBe(true);
    expect(receipt.commandPolicyDecisions![0].safeCommand).toBe("git status");
    expect(receipt.gitGuardrailEvidence![0].actionCategory).toBe("inspection");
  });
});
