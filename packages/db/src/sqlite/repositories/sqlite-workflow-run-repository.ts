import type {
  FeatureWorkflowCompletionRecord,
  FeatureWorkflowRunRecord,
  ImplementationAgentRunRecord,
  ImplementationAgentRunStatus,
  ImplementationPhaseRunRecord,
  ImplementationPhaseRunStatus,
  ImplementationTaskRunRecord,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
  StoredImplementationTaskRun,
} from "../../contracts/index.js";
import {
  mapImplementationAgentRunRow,
  mapImplementationPhaseRunRow,
  mapImplementationTaskRunRow,
  type StoredImplementationAgentRunRow,
  type StoredImplementationPhaseRunRow,
  type StoredImplementationTaskRunRow,
} from "../row-mappers/workflow-row-mappers.js";
import type {
  SqliteQueryContext,
  SqliteValue,
} from "../sqlite-query-context.js";

export class SqliteWorkflowRunRepository {
  constructor(
    private readonly context: SqliteQueryContext,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async recordFeatureWorkflowCompletion(
    record: FeatureWorkflowCompletionRecord,
  ): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    const column =
      record.command === "design-feature"
        ? "design_feature_completed_at"
        : record.command === "refine-feature"
          ? "refine_feature_completed_at"
          : null;
    const completionColumnSql = column ? `${column} = ?,` : "";
    const params: SqliteValue[] = column ? [now] : [];

    this.context.run(
      `
      update hepha_card_metadata
      set ${completionColumnSql}
        workflow_command = ?,
        workflow_status = 'completed',
        workflow_run_id = ?,
        workflow_completed_at = ?,
        workflow_current_node_id = null,
        workflow_current_step = null,
        workflow_summary = ?,
        workflow_error = null,
        updated_at = ?
      where project_id = ?
        and card_key = ?
      `,
      [
        ...params,
        record.command,
        record.runId,
        now,
        record.summary,
        now,
        record.projectId,
        record.cardKey,
      ],
    );
  }

  async recordFeatureWorkflowRun(record: FeatureWorkflowRunRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();

    if (record.status === "running") {
      this.context.run(
        `
        update hepha_card_metadata
        set
          workflow_command = ?,
          workflow_status = 'running',
          workflow_started_at = case
            when workflow_run_id = ? and workflow_started_at is not null then workflow_started_at
            else ?
          end,
          workflow_run_id = ?,
          workflow_completed_at = null,
          workflow_current_node_id = case
            when ? is not null then ?
            when workflow_run_id = ? then workflow_current_node_id
            else null
          end,
          workflow_current_step = ?,
          workflow_summary = ?,
          workflow_error = null,
          updated_at = ?
        where project_id = ?
          and card_key = ?
        `,
        [
          record.command,
          record.runId,
          now,
          record.runId,
          record.currentNodeId ?? null,
          record.currentNodeId ?? null,
          record.runId,
          record.currentStep ?? null,
          record.summary ?? null,
          now,
          record.projectId,
          record.cardKey,
        ],
      );
      return;
    }

    this.context.run(
      `
      update hepha_card_metadata
      set
        workflow_command = ?,
        workflow_status = ?,
        workflow_run_id = ?,
        workflow_completed_at = ?,
        workflow_current_node_id = ?,
        workflow_current_step = ?,
        workflow_summary = ?,
        workflow_error = ?,
        updated_at = ?
      where project_id = ?
        and card_key = ?
      `,
      [
        record.command,
        record.status,
        record.runId,
        now,
        record.currentNodeId ?? null,
        record.currentStep ?? null,
        record.summary ?? null,
        record.error ?? null,
        now,
        record.projectId,
        record.cardKey,
      ],
    );
  }

  async recordImplementationPhaseRun(record: ImplementationPhaseRunRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    const existing = this.context.get<StoredImplementationPhaseRunRow>(
      `
      select *
      from hepha_implementation_phase_runs
      where project_id = ?
        and card_key = ?
        and workflow_run_id = ?
        and phase_number = ?
      `,
      [record.projectId, record.cardKey, record.workflowRunId, record.phaseNumber],
    );
    const startedAt = existing?.started_at ?? (record.status === "pending" ? null : now);
    const completedAt = isTerminalPhaseStatus(record.status) ? now : null;

    this.context.run(
      `
      insert into hepha_implementation_phase_runs (
        project_id, card_key, workflow_run_id, phase_number, phase_title,
        status, current_step, agent, model, summary, report_path, error,
        started_at, completed_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (project_id, card_key, workflow_run_id, phase_number)
      do update set
        phase_title = excluded.phase_title,
        status = excluded.status,
        current_step = excluded.current_step,
        agent = excluded.agent,
        model = excluded.model,
        summary = excluded.summary,
        report_path = excluded.report_path,
        error = excluded.error,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
      `,
      [
        record.projectId,
        record.cardKey,
        record.workflowRunId,
        record.phaseNumber,
        record.phaseTitle,
        record.status,
        record.currentStep ?? null,
        record.agent ?? null,
        record.model ?? null,
        record.summary ?? null,
        record.reportPath ?? null,
        record.error ?? null,
        startedAt,
        completedAt,
        now,
      ],
    );
  }

  async recordImplementationTaskRun(record: ImplementationTaskRunRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    const existing = this.context.get<StoredImplementationTaskRunRow>(
      `
      select *
      from hepha_implementation_task_runs
      where project_id = ?
        and card_key = ?
        and phase_number = ?
        and task_id = ?
      `,
      [record.projectId, record.cardKey, record.phaseNumber, record.taskId],
    );
    const startedAt =
      record.startedAt !== undefined
        ? record.startedAt
        : record.status === "NOT_STARTED"
          ? null
          : existing?.status === "COMPLETED" || existing?.status === "SKIPPED"
            ? now
            : existing?.started_at ?? now;
    const completedAt =
      record.completedAt !== undefined
        ? record.completedAt
        : record.status === "COMPLETED" || record.status === "SKIPPED"
          ? now
          : null;

    this.context.run(
      `
      insert into hepha_implementation_task_runs (
        project_id, card_key, phase_number, task_id, task_index, task_title,
        phase_title, section, status, current_step, summary, error,
        workflow_run_id, source_line, started_at, completed_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (project_id, card_key, phase_number, task_id)
      do update set
        task_index = excluded.task_index,
        task_title = excluded.task_title,
        phase_title = excluded.phase_title,
        section = excluded.section,
        status = excluded.status,
        current_step = excluded.current_step,
        summary = excluded.summary,
        error = excluded.error,
        workflow_run_id = excluded.workflow_run_id,
        source_line = excluded.source_line,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
      `,
      [
        record.projectId,
        record.cardKey,
        record.phaseNumber,
        record.taskId,
        record.taskIndex,
        record.taskTitle,
        record.phaseTitle,
        record.section,
        record.status,
        record.currentStep ?? null,
        record.summary ?? null,
        record.error ?? null,
        record.workflowRunId,
        record.sourceLine ?? null,
        startedAt,
        completedAt,
        now,
      ],
    );
  }

  async recordImplementationAgentRun(record: ImplementationAgentRunRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    const existing = this.context.get<StoredImplementationAgentRunRow>(
      "select * from hepha_implementation_agent_runs where id = ?",
      [record.id],
    );
    const startedAt = existing?.started_at ?? now;
    const completedAt = isTerminalAgentStatus(record.status) ? now : null;

    this.context.run(
      `
      insert into hepha_implementation_agent_runs (
        id, project_id, card_key, workflow_run_id, phase_number, phase_title,
        agent_role, agent_name, model, status, current_step, summary,
        report_path, error, started_at, completed_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id)
      do update set
        status = excluded.status,
        current_step = excluded.current_step,
        summary = excluded.summary,
        report_path = excluded.report_path,
        error = excluded.error,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.workflowRunId,
        record.phaseNumber ?? null,
        record.phaseTitle ?? null,
        record.agentRole,
        record.agentName,
        record.model,
        record.status,
        record.currentStep ?? null,
        record.summary ?? null,
        record.reportPath ?? null,
        record.error ?? null,
        startedAt,
        completedAt,
        now,
      ],
    );
  }

  async listImplementationPhaseRuns(
    projectId: string,
    cardKeys: string[],
  ): Promise<Map<string, StoredImplementationPhaseRun[]>> {
    this.context.ensure();
    if (cardKeys.length === 0) {
      return new Map();
    }

    const rows = this.context.all<StoredImplementationPhaseRunRow>(
      `
      select *
      from hepha_implementation_phase_runs phase_run
      where phase_run.project_id = ?
        and phase_run.card_key in (${placeholders(cardKeys.length)})
        and not exists (
          select 1
          from hepha_implementation_phase_runs newer
          where newer.project_id = phase_run.project_id
            and newer.card_key = phase_run.card_key
            and newer.phase_number = phase_run.phase_number
            and (
              newer.updated_at > phase_run.updated_at
              or (
                newer.updated_at = phase_run.updated_at
                and newer.workflow_run_id > phase_run.workflow_run_id
              )
            )
        )
      order by phase_run.card_key, phase_run.phase_number
      `,
      [projectId, ...cardKeys],
    );
    return groupRows(rows, mapImplementationPhaseRunRow);
  }

  async listImplementationAgentRuns(
    projectId: string,
    cardKeys: string[],
  ): Promise<Map<string, StoredImplementationAgentRun[]>> {
    this.context.ensure();
    if (cardKeys.length === 0) {
      return new Map();
    }

    const rows = this.context.all<StoredImplementationAgentRunRow>(
      `
      select *
      from hepha_implementation_agent_runs
      where project_id = ?
        and card_key in (${placeholders(cardKeys.length)})
      order by card_key asc, started_at asc, id asc
      `,
      [projectId, ...cardKeys],
    );
    return groupRows(rows, mapImplementationAgentRunRow);
  }

  async listImplementationTaskRuns(
    projectId: string,
    cardKey: string,
    phaseNumber: number,
  ): Promise<StoredImplementationTaskRun[]> {
    this.context.ensure();
    const rows = this.context.all<StoredImplementationTaskRunRow>(
      `
      select * from hepha_implementation_task_runs
      where project_id = ? and card_key = ? and phase_number = ?
      order by task_index asc, task_id asc
      `,
      [projectId, cardKey, phaseNumber],
    );
    return rows.map(mapImplementationTaskRunRow);
  }
}

function placeholders(count: number) {
  return new Array(count).fill("?").join(", ");
}

function isTerminalPhaseStatus(status: ImplementationPhaseRunStatus) {
  return status === "completed" || status === "blocked" || status === "failed";
}

function isTerminalAgentStatus(status: ImplementationAgentRunStatus) {
  return status === "completed" || status === "failed" || status === "blocked";
}

function groupRows<Row extends { card_key: string }, Record>(
  rows: Row[],
  mapRow: (row: Row) => Record,
) {
  const grouped = new Map<string, Record[]>();
  for (const row of rows) {
    const records = grouped.get(row.card_key) ?? [];
    records.push(mapRow(row));
    grouped.set(row.card_key, records);
  }
  return grouped;
}
