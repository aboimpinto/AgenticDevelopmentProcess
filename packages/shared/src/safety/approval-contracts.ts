export type ApprovalStatus = "pending" | "approved" | "denied" | "timed_out";

export type ApprovalDecisionSource = "operator" | "timeout" | "system";

export interface ApprovalEvidence {
  readonly requestId: string;
  readonly status: ApprovalStatus;
  readonly actionSummary: string;
  readonly policyReason: string;
  readonly riskCategory: string;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: ApprovalDecisionSource | null;
  readonly resolutionReason: string | null;
  readonly runId: string | null;
  readonly workflowRunId: string | null;
}

export interface ApprovalDTO {
  readonly id: string;
  readonly cardKey: string;
  readonly projectId: string;
  readonly actionSummary: string;
  readonly policyReason: string;
  readonly riskCategory: string;
  readonly requestedAt: string;
  readonly timeoutDeadline: string | null;
  readonly status: ApprovalStatus;
  readonly resolvedAt: string | null;
  readonly resolvedBy: ApprovalDecisionSource | null;
  readonly resolutionReason: string | null;
  readonly runId: string | null;
  readonly workflowRunId: string | null;
}

export interface ResolveApprovalInput {
  readonly decision: "approve" | "deny";
  readonly reason?: string;
}

export interface ResolveApprovalResponse {
  readonly id: string;
  readonly status: "approved" | "denied" | "already_final";
  readonly previousStatus: ApprovalStatus;
  readonly message: string;
}
