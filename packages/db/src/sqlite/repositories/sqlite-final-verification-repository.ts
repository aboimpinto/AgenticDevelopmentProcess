import type {
  FinalVerificationCheckRecord,
  FinalVerificationRunRecord,
} from "../../contracts/index.js";
import {
  mapFinalVerificationCheckRow,
  mapFinalVerificationRunRow,
  type FinalVerificationCheckRow,
  type FinalVerificationRunRow,
} from "../row-mappers/review-row-mappers.js";
import type { SqliteQueryContext } from "../sqlite-query-context.js";

export class SqliteFinalVerificationRepository {
  constructor(private readonly context: SqliteQueryContext) {}

  async recordFinalVerificationRun(
    record: FinalVerificationRunRecord,
  ): Promise<FinalVerificationRunRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_final_verification_runs (
        id, project_id, card_key, workflow_run_id,
        execution_root, aggregate_status, blocked_reason,
        persistence_warning, duration, started_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.workflowRunId,
        record.executionRoot,
        record.aggregateStatus,
        record.blockedReason,
        record.persistenceWarning,
        record.duration,
        record.startedAt,
        record.completedAt,
      ],
    );
    return record;
  }

  async recordFinalVerificationCheck(
    record: FinalVerificationCheckRecord,
  ): Promise<FinalVerificationCheckRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_final_verification_checks (
        id, run_id, project_id, card_key,
        check_id, intent, description, command,
        working_directory, outcome, duration, exit_code,
        started_at, output_summary, required_check
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        record.id,
        record.runId,
        record.projectId,
        record.cardKey,
        record.checkId,
        record.intent,
        record.description,
        record.command,
        record.workingDirectory,
        record.outcome,
        record.duration,
        record.exitCode,
        record.startedAt,
        record.outputSummary,
        record.required ? 1 : 0,
      ],
    );
    return record;
  }

  async listFinalVerificationRuns(
    projectId: string,
    cardKey: string,
  ): Promise<FinalVerificationRunRecord[]> {
    this.context.ensure();
    const rows = this.context.all<FinalVerificationRunRow>(
      `
      select * from hepha_final_verification_runs
      where project_id = ? and card_key = ?
      order by started_at desc
      limit 20
      `,
      [projectId, cardKey],
    );
    return rows.map(mapFinalVerificationRunRow);
  }

  async listFinalVerificationChecks(
    runId: string,
  ): Promise<FinalVerificationCheckRecord[]> {
    this.context.ensure();
    const rows = this.context.all<FinalVerificationCheckRow>(
      `
      select * from hepha_final_verification_checks
      where run_id = ?
      order by started_at asc
      `,
      [runId],
    );
    return rows.map(mapFinalVerificationCheckRow);
  }
}
