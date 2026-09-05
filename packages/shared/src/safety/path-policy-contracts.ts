export type PathPolicyDecisionCode =
  | "ALLOWED"
  | "BLOCKED_NO_RULE"
  | "BLOCKED_DENY_PATTERN"
  | "BLOCKED_OUTSIDE_ALLOW"
  | "BLOCKED_UNKNOWN_ROOT"
  | "BLOCKED_UNRESOLVED_ROOT"
  | "BLOCKED_TRAVERSAL_ESCAPE"
  | "BLOCKED_GLOBAL_DENY";

export interface PathPolicyDecisionSummary {
  allowed: boolean;
  code: PathPolicyDecisionCode;
  reason: string;
  profileId: string;
  action: "read" | "write";
  displayPath: string;
  timestamp: string;
  runId?: string;
}

export interface BlockedPathAttempt {
  root: string | null;
  targetDisplayPath: string;
  action: "read" | "write";
  code: PathPolicyDecisionCode;
  reason: string;
  profileId: string;
  runId?: string;
  timestamp: string;
}

export interface WorkflowPathPolicyExtension {
  pathPolicyDecisions?: PathPolicyDecisionSummary[];
  blockedPathAttempts?: BlockedPathAttempt[];
}
