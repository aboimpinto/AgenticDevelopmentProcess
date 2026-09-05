import type {
  ApprovalDbStatus,
  StoredApprovalRequest,
} from "../../contracts/index.js";
import {
  mapApprovalRequestRow,
  type ApprovalRequestRow,
} from "../row-mappers/approval-row-mapper.js";
import type {
  SqliteQueryContext,
  SqliteValue,
} from "../sqlite-query-context.js";

export class SqliteApprovalRepository {
  constructor(
    private readonly context: SqliteQueryContext,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async createApprovalRequest(
    request: StoredApprovalRequest,
  ): Promise<StoredApprovalRequest> {
    this.context.ensure();
    this.context.run(
      `
      insert into hepha_approval_requests (
        id, project_id, card_key, workflow_run_id, run_id,
        action_summary, policy_reason, risk_category,
        safe_command_summary, matched_rule_id, policy_decision_json,
        status, timeout_deadline, requested_at,
        resolved_at, resolved_by, resolution_reason, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        request.id,
        request.projectId,
        request.cardKey,
        request.workflowRunId,
        request.runId,
        request.actionSummary,
        request.policyReason,
        request.riskCategory,
        request.safeCommandSummary,
        request.matchedRuleId,
        request.policyDecisionJson,
        request.status,
        request.timeoutDeadline,
        request.requestedAt,
        request.resolvedAt,
        request.resolvedBy,
        request.resolutionReason,
        request.updatedAt,
      ],
    );

    return (await this.getApprovalRequest(request.id)) ?? request;
  }

  async getApprovalRequest(
    requestId: string,
  ): Promise<StoredApprovalRequest | null> {
    this.context.ensure();
    const row = this.context.get<ApprovalRequestRow>(
      "select * from hepha_approval_requests where id = ?",
      [requestId],
    );
    return row ? mapApprovalRequestRow(row) : null;
  }

  async listApprovalRequests(
    projectId: string,
    status: ApprovalDbStatus | "all" = "pending",
    limit: number = 50,
  ): Promise<StoredApprovalRequest[]> {
    this.context.ensure();

    let sql: string;
    let params: SqliteValue[];
    if (status === "all") {
      sql = `
        select *
        from hepha_approval_requests
        where project_id = ?
        order by requested_at desc
        limit ?
      `;
      params = [projectId, limit];
    } else {
      sql = `
        select *
        from hepha_approval_requests
        where project_id = ?
          and status = ?
        order by requested_at desc
        limit ?
      `;
      params = [projectId, status, limit];
    }

    return this.context.all<ApprovalRequestRow>(sql, params).map(mapApprovalRequestRow);
  }

  async listApprovalRequestsByCard(
    projectId: string,
    cardKey: string,
  ): Promise<StoredApprovalRequest[]> {
    this.context.ensure();
    const rows = this.context.all<ApprovalRequestRow>(
      `
      select *
      from hepha_approval_requests
      where project_id = ?
        and card_key = ?
      order by requested_at desc
      `,
      [projectId, cardKey],
    );
    return rows.map(mapApprovalRequestRow);
  }

  async resolveApprovalRequest(
    requestId: string,
    status: "approved" | "denied" | "timed_out",
    resolvedBy: string,
    resolutionReason: string | null,
  ): Promise<StoredApprovalRequest | null> {
    this.context.ensure();
    const existing = this.context.get<ApprovalRequestRow>(
      "select * from hepha_approval_requests where id = ?",
      [requestId],
    );
    if (!existing) {
      return null;
    }
    if (existing.status !== "pending") {
      return mapApprovalRequestRow(existing);
    }

    const now = this.clock();
    this.context.run(
      `
      update hepha_approval_requests
      set status = ?,
          resolved_at = ?,
          resolved_by = ?,
          resolution_reason = ?,
          updated_at = ?
      where id = ?
        and status = 'pending'
      `,
      [status, now, resolvedBy, resolutionReason, now, requestId],
    );

    const updatedRow = this.context.get<ApprovalRequestRow>(
      "select * from hepha_approval_requests where id = ?",
      [requestId],
    );
    return updatedRow ? mapApprovalRequestRow(updatedRow) : null;
  }

  async finalizeTimedOutApprovals(clockNow: string): Promise<number> {
    this.context.ensure();
    const result = this.context.run(
      `
      update hepha_approval_requests
      set status = 'timed_out',
          resolved_at = ?,
          resolved_by = 'timeout',
          resolution_reason = 'Approval deadline elapsed',
          updated_at = ?
      where status = 'pending'
        and timeout_deadline is not null
        and timeout_deadline < ?
      `,
      [clockNow, clockNow, clockNow],
    );
    return Number(result.changes);
  }
}
