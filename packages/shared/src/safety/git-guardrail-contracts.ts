import type { ApprovalStatus } from "./approval-contracts.js";

export type GitActionCategory =
  | "inspection"
  | "local_status_check"
  | "local_branch_change"
  | "commit_creation"
  | "remote_write"
  | "pr_action"
  | "unknown_local"
  | "unknown_blocked";

export type GitGuardrailDecision =
  | "allowed"
  | "blocked"
  | "approval_required";

export interface DirtyStateSummary {
  readonly clean: boolean;
  readonly modifiedCount: number;
  readonly stagedCount: number;
  readonly untrackedCount: number;
}

export interface PendingGitActionSummary {
  readonly approvalRequestId: string;
  readonly actionCategory: GitActionCategory;
  readonly actionSummary: string;
  readonly requestedAt: string;
  readonly status: ApprovalStatus;
}

export interface GitGuardrailEvidence {
  readonly actionCategory: GitActionCategory;
  readonly policyDecision: GitGuardrailDecision;
  readonly workflowStateCheck: "passed" | "blocked" | "not_applicable";
  readonly approvalRequired: boolean;
  readonly approvalRequestId?: string;
  readonly approvalStatus?: ApprovalStatus;
  readonly blockedReason?: string;
  readonly dirtyStateSummary?: DirtyStateSummary;
}

export interface WorkflowGitGuardrailExtension {
  readonly gitGuardrailEvidence?: GitGuardrailEvidence[];
}
