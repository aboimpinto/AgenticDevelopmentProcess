export interface StoredDeepDiveSession {
  agentConnectionStatus: string;
  cardExternalId: string;
  cardId: string;
  cardKey: string;
  cardKind: "epic" | "feature";
  cardTitle: string;
  completedAt: string | null;
  createdAt: string;
  id: string;
  originalDocument: string;
  originalDocumentHash: string;
  originalDocumentPath: string | null;
  originalDocumentUpdatedAt: string | null;
  projectId: string;
  questions: unknown[];
  status: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// FEAT-030: Approval request types
// ---------------------------------------------------------------------------

/**
 * Approval status stored in the database.
 */
export type ApprovalDbStatus = "pending" | "approved" | "denied" | "timed_out";

/**
 * Stored approval request record.
 */
export interface StoredApprovalRequest {
  readonly id: string;
  readonly projectId: string;
  readonly cardKey: string;
  readonly workflowRunId: string | null;
  readonly runId: string | null;
  readonly actionSummary: string;
  readonly policyReason: string;
  readonly riskCategory: string;
  readonly safeCommandSummary: string | null;
  readonly matchedRuleId: string;
  readonly policyDecisionJson: string;
  readonly status: ApprovalDbStatus;
  readonly timeoutDeadline: string | null;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolutionReason: string | null;
  readonly updatedAt: string;
}

// -------------------------------------------------------------------------
// FEAT-034: Live activity stream types
// -------------------------------------------------------------------------

/**
 * Record input for persisting a phase lifecycle live activity event.
 */
