export type WorkflowCommandPolicyOutcome =
  | "allowed"
  | "approval_required"
  | "blocked";

export type WorkflowCommandPolicyDecisionCode =
  | "ALLOWED_VERIFICATION"
  | "ALLOWED_BY_RULE"
  | "APPROVAL_REQUIRED_BY_RULE"
  | "BLOCKED_DANGEROUS_PATTERN"
  | "BLOCKED_DEFAULT_DENY"
  | "BLOCKED_BY_RULE"
  | "BLOCKED_SERIALIZATION_CONFLICT";

export type WorkflowCommandRiskCategory =
  | "verification"
  | "build"
  | "documentation"
  | "git_local"
  | "git_remote"
  | "destructive"
  | "privileged"
  | "remote_effect"
  | "network"
  | "package_install"
  | "secret_exposure"
  | "unknown";

export type WorkflowSharedStateCategory = "shared_state" | "safe" | "unknown";

/** Durable command-policy evidence retained for backward-compatible receipt reads. */
export interface WorkflowCommandPolicyDecisionSummary {
  readonly outcome: WorkflowCommandPolicyOutcome;
  readonly code: WorkflowCommandPolicyDecisionCode;
  readonly profileId: string;
  readonly riskCategory: WorkflowCommandRiskCategory;
  readonly safeCommand: string;
  readonly reason: string;
  readonly executed: boolean;
  readonly timestamp: string;
  readonly runId?: string;
  readonly serializationClassification?: WorkflowSharedStateCategory;
  readonly resourceScope?: string;
  readonly conflictActiveCommand?: string;
  readonly conflictReason?: string;
}
