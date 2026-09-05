import type { PackageEvidence } from "@hepha/db";

export type WorkflowExtensionOperation =
  | "emit-event"
  | "record-receipt"
  | "get-context"
  | "submit-question"
  | "lookup-knowledge";

export type WorkflowExtensionOutcome =
  | "allowed"
  | "blocked"
  | "pending_approval"
  | "denied"
  | "timed_out"
  | "unsupported_version"
  | "handler_failure"
  | "revoked"
  | "untrusted";

/** Durable extension evidence retained for backward-compatible receipt reads. */
export interface WorkflowExtensionReceiptEntry {
  readonly extensionId: string;
  readonly extensionVersion: string;
  readonly apiVersion: string;
  readonly correlationId: string;
  readonly operation: WorkflowExtensionOperation;
  readonly effectiveProfileId: string;
  readonly policyOutcome: "allowed" | "blocked" | "approval_required";
  readonly approvalStatus?: "pending" | "approved" | "denied" | "timed_out";
  readonly approvalRequestId?: string;
  readonly outcome: WorkflowExtensionOutcome;
  readonly resultRef?: string;
  readonly timestamp: string;
  readonly packageEvidence?: PackageEvidence;
}
