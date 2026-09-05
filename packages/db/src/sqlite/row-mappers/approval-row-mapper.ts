import type { StoredApprovalRequest } from "../../contracts/interactive-contracts.js";
import { toIsoString } from "../value-normalizers.js";

// FEAT-030: Approval request row types
// ---------------------------------------------------------------------------

export interface ApprovalRequestRow {
  id: string;
  project_id: string;
  card_key: string;
  workflow_run_id: string | null;
  run_id: string | null;
  action_summary: string;
  policy_reason: string;
  risk_category: string;
  safe_command_summary: string | null;
  matched_rule_id: string;
  policy_decision_json: string;
  status: "pending" | "approved" | "denied" | "timed_out";
  timeout_deadline: string | null;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_reason: string | null;
  updated_at: string;
}

export function mapApprovalRequestRow(row: ApprovalRequestRow): StoredApprovalRequest {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    workflowRunId: row.workflow_run_id,
    runId: row.run_id,
    actionSummary: row.action_summary,
    policyReason: row.policy_reason,
    riskCategory: row.risk_category,
    safeCommandSummary: row.safe_command_summary,
    matchedRuleId: row.matched_rule_id,
    policyDecisionJson: row.policy_decision_json,
    status: row.status,
    timeoutDeadline: row.timeout_deadline,
    requestedAt: toIsoString(row.requested_at) ?? new Date().toISOString(),
    resolvedAt: toIsoString(row.resolved_at),
    resolvedBy: row.resolved_by,
    resolutionReason: row.resolution_reason,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}
