import type { SharedStateCategory } from "./serialization-contracts.js";

export type CommandPolicyOutcome =
  | "allowed"
  | "approval_required"
  | "blocked";

export type CommandPolicyDecisionCode =
  | "ALLOWED_VERIFICATION"
  | "ALLOWED_BY_RULE"
  | "APPROVAL_REQUIRED_BY_RULE"
  | "BLOCKED_DANGEROUS_PATTERN"
  | "BLOCKED_DEFAULT_DENY"
  | "BLOCKED_BY_RULE"
  | "BLOCKED_SERIALIZATION_CONFLICT";

export type CommandRiskCategory =
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

export interface CommandPolicyDecisionSummary {
  outcome: CommandPolicyOutcome;
  code: CommandPolicyDecisionCode;
  profileId: string;
  riskCategory: CommandRiskCategory;
  safeCommand: string;
  reason: string;
  executed: boolean;
  timestamp: string;
  runId?: string;
  serializationClassification?: SharedStateCategory;
  resourceScope?: string;
  conflictActiveCommand?: string;
  conflictReason?: string;
}

export interface WorkflowCommandPolicyExtension {
  commandPolicyDecisions?: CommandPolicyDecisionSummary[];
}
