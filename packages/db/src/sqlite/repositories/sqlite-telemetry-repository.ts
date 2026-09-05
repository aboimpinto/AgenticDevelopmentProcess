import type {
  AgentInvocationRecord,
  EventFilter,
  InvocationFilter,
  NormalizedEventRecord,
  PhaseLifecycleEventRecord,
  StoredAgentInvocation,
  StoredNormalizedEvent,
  StoredPhaseLifecycleEvent,
} from "../../contracts/index.js";
import {
  mapAgentInvocationRow,
  mapNormalizedEventRow,
  mapPhaseLifecycleEventRow,
  type AgentInvocationRow,
  type NormalizedEventRow,
  type PhaseLifecycleEventRow,
} from "../row-mappers/telemetry-row-mappers.js";
import type {
  SqliteQueryContext,
  SqliteValue,
} from "../sqlite-query-context.js";

export class SqliteTelemetryRepository {
  constructor(
    private readonly context: SqliteQueryContext,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async recordAgentInvocation(record: AgentInvocationRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    this.context.run(
      `
      insert into hepha_agent_invocations (
        id, project_id, card_key, workflow_run_id, workflow_command, workflow_node_id,
        phase_number, phase_title, agent_role, agent_name, model, provider,
        status, exit_code, error_message, timeout_marker,
        parent_invocation_id, log_path, receipt_path, review_report_path, raw_ref_json,
        started_at, completed_at, duration_ms, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id)
      do update set
        status = excluded.status,
        exit_code = excluded.exit_code,
        error_message = excluded.error_message,
        timeout_marker = excluded.timeout_marker,
        completed_at = excluded.completed_at,
        duration_ms = excluded.duration_ms,
        updated_at = excluded.updated_at
      `,
      [
        record.id,
        record.projectId,
        record.cardKey ?? null,
        record.workflowRunId ?? null,
        record.workflowCommand ?? null,
        record.workflowNodeId ?? null,
        record.phaseNumber ?? null,
        record.phaseTitle ?? null,
        record.agentRole ?? null,
        record.agentName ?? null,
        record.model ?? null,
        record.provider ?? null,
        record.status,
        record.exitCode ?? null,
        record.errorMessage ?? null,
        record.timeoutMarker ? 1 : 0,
        record.parentInvocationId ?? null,
        record.logPath ?? null,
        record.receiptPath ?? null,
        record.reviewReportPath ?? null,
        record.rawRefJson ?? null,
        record.startedAt,
        record.completedAt ?? null,
        record.durationMs ?? null,
        now,
        now,
      ],
    );
  }

  async recordNormalizedEvent(record: NormalizedEventRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    this.context.run(
      `
      insert into hepha_normalized_events (
        id, invocation_id, project_id, card_key, workflow_run_id,
        event_type, timestamp, workflow_command, workflow_node, phase,
        agent_role, model, pid, log_path, receipt_path,
        raw_ref_json, error_message, exit_code, metadata_json, created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.id,
        record.invocationId ?? null,
        record.projectId,
        record.cardKey ?? null,
        record.workflowRunId ?? null,
        record.eventType,
        record.timestamp,
        record.workflowCommand ?? null,
        record.workflowNode ?? null,
        record.phase ?? null,
        record.agentRole ?? null,
        record.model ?? null,
        record.pid ?? null,
        record.logPath ?? null,
        record.receiptPath ?? null,
        record.rawRefJson ?? null,
        record.errorMessage ?? null,
        record.exitCode ?? null,
        record.metadataJson ?? null,
        now,
      ],
    );
  }

  async queryAgentInvocations(
    filters: InvocationFilter,
  ): Promise<StoredAgentInvocation[]> {
    this.context.ensure();
    const conditions: string[] = ["project_id = ?"];
    const params: SqliteValue[] = [filters.projectId];

    const optionalFilters: Array<[unknown, string]> = [
      [filters.cardKey, "card_key = ?"],
      [filters.workflowRunId, "workflow_run_id = ?"],
      [filters.phaseNumber, "phase_number = ?"],
      [filters.agentRole, "agent_role = ?"],
      [filters.agentName, "agent_name = ?"],
      [filters.model, "model = ?"],
      [filters.parentInvocationId, "parent_invocation_id = ?"],
      [filters.status, "status = ?"],
      [filters.startedAfter, "started_at >= ?"],
      [filters.startedBefore, "started_at <= ?"],
    ];
    for (const [value, condition] of optionalFilters) {
      if (value !== undefined) {
        conditions.push(condition);
        params.push(value as SqliteValue);
      }
    }

    const limitClause = filters.limit !== undefined ? ` limit ${filters.limit}` : "";
    const offsetClause = filters.offset !== undefined ? ` offset ${filters.offset}` : "";
    const rows = this.context.all<AgentInvocationRow>(
      `select * from hepha_agent_invocations where ${conditions.join(" and ")} order by started_at asc${limitClause}${offsetClause}`,
      params,
    );
    return rows.map(mapAgentInvocationRow);
  }

  async queryNormalizedEvents(
    filters: EventFilter,
  ): Promise<StoredNormalizedEvent[]> {
    this.context.ensure();
    const conditions: string[] = ["project_id = ?"];
    const params: SqliteValue[] = [filters.projectId];

    const optionalFilters: Array<[unknown, string]> = [
      [filters.cardKey, "card_key = ?"],
      [filters.workflowRunId, "workflow_run_id = ?"],
      [filters.invocationId, "invocation_id = ?"],
      [filters.eventType, "event_type = ?"],
      [filters.startedAfter, "timestamp >= ?"],
      [filters.startedBefore, "timestamp <= ?"],
    ];
    for (const [value, condition] of optionalFilters) {
      if (value !== undefined) {
        conditions.push(condition);
        params.push(value as SqliteValue);
      }
    }

    const limitClause = filters.limit !== undefined ? ` limit ${filters.limit}` : "";
    const offsetClause = filters.offset !== undefined ? ` offset ${filters.offset}` : "";
    const rows = this.context.all<NormalizedEventRow>(
      `select * from hepha_normalized_events where ${conditions.join(" and ")} order by timestamp asc${limitClause}${offsetClause}`,
      params,
    );
    return rows.map(mapNormalizedEventRow);
  }

  async recordPhaseLifecycleEvent(
    record: PhaseLifecycleEventRecord,
  ): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      insert into hepha_phase_lifecycle_events (
        id, project_id, category, event_type, occurred_at,
        card_id, run_id, phase_number, phase_title, phase_status,
        summary, metadata
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.id,
        record.projectId,
        record.category,
        record.eventType,
        record.occurredAt,
        record.cardId ?? null,
        record.runId ?? null,
        record.phaseNumber ?? null,
        record.phaseTitle ?? null,
        record.phaseStatus ?? null,
        record.summary,
        record.metadata !== undefined ? JSON.stringify(record.metadata) : null,
      ],
    );
  }

  async queryPhaseLifecycleEventsAfterCursor(
    projectId: string,
    cursorId: string,
  ): Promise<StoredPhaseLifecycleEvent[]> {
    this.context.ensure();
    const rows = this.context.all<PhaseLifecycleEventRow>(
      `
      select * from hepha_phase_lifecycle_events
      where project_id = ?
        and (occurred_at, id) > (
          select occurred_at, id from hepha_phase_lifecycle_events where id = ?
        )
      order by occurred_at asc, id asc
      `,
      [projectId, cursorId],
    );
    return rows.map(mapPhaseLifecycleEventRow);
  }
}
