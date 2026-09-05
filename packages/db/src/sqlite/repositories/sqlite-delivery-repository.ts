import type {
  DeliveryMetadataInput,
  DeliveryMetadataRecord,
  StartTransitionExceptionRecord,
  StartTransitionRecord,
} from "../../contracts/index.js";
import {
  mapStartTransitionRow,
  type StartTransitionRow,
} from "../row-mappers/delivery-row-mapper.js";
import type { SqliteQueryContext } from "../sqlite-query-context.js";

export class SqliteDeliveryRepository {
  constructor(private readonly context: SqliteQueryContext) {}

  async recordStartTransition(record: StartTransitionRecord): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_start_transitions (
        card_key, project_id, run_id, delivery_policy, base_branch,
        implementation_branch, worktree_path, repo_root, start_commit,
        transition_status, transition_step, failure_reason, rolled_back,
        started_at, completed_at
      ) values (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
      `,
      [
        record.cardKey,
        record.projectId,
        record.runId,
        record.deliveryPolicy,
        record.baseBranch,
        record.implementationBranch,
        record.worktreePath,
        record.repoRoot,
        record.startCommit,
        record.transitionStatus,
        record.transitionStep,
        record.failureReason,
        record.rolledBack ? 1 : 0,
        record.startedAt,
        record.completedAt,
      ],
    );
  }

  async getStartTransition(
    cardKey: string,
    projectId: string,
    runId: string,
  ): Promise<StartTransitionRecord | null> {
    this.context.ensure();
    const row = this.context.get<StartTransitionRow>(
      `
      select * from hepha_start_transitions
      where project_id = ? and card_key = ? and run_id = ?
      `,
      [projectId, cardKey, runId],
    );

    return row ? mapStartTransitionRow(row) : null;
  }

  async listStartTransitions(
    cardKey: string,
    projectId: string,
  ): Promise<StartTransitionRecord[]> {
    this.context.ensure();
    const rows = this.context.all<StartTransitionRow>(
      `
      select * from hepha_start_transitions
      where project_id = ? and card_key = ?
      order by started_at desc
      `,
      [projectId, cardKey],
    );

    return rows.map(mapStartTransitionRow);
  }

  async recordStartTransitionException(record: StartTransitionExceptionRecord): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_start_transition_exceptions (
        card_key, project_id, run_id, failed_at_step, failure_reason,
        rolled_back, effective_state_after, cleaned_at
      ) values (
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
      `,
      [
        record.cardKey,
        record.projectId,
        record.runId,
        record.failedAtStep,
        record.failureReason,
        record.rolledBack ? 1 : 0,
        record.effectiveStateAfter,
        record.cleanedAt,
      ],
    );
  }

  // --- FEAT-046: Delivery metadata ---

  async upsertDeliveryMetadata(input: DeliveryMetadataInput, clockNow: string): Promise<DeliveryMetadataRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert or replace into hepha_delivery_metadata (
        project_id, card_key, delivery_mode, target_branch,
        github_issue, issue_role, issue_update_mode, pull_request,
        delivery_status, delivery_error, created_at, updated_at
      ) values (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      `,
      [
        input.projectId,
        input.cardKey,
        input.deliveryMode,
        input.targetBranch,
        input.githubIssue,
        input.issueRole,
        input.issueUpdateMode,
        input.pullRequest,
        input.deliveryStatus,
        input.deliveryError,
        clockNow,
        clockNow,
      ],
    );

    return {
      projectId: input.projectId,
      cardKey: input.cardKey,
      deliveryMode: input.deliveryMode as any,
      targetBranch: input.targetBranch,
      githubIssue: input.githubIssue,
      issueRole: input.issueRole,
      issueUpdateMode: input.issueUpdateMode,
      pullRequest: input.pullRequest,
      deliveryStatus: input.deliveryStatus as any,
      deliveryError: input.deliveryError,
      createdAt: clockNow,
      updatedAt: clockNow,
    };
  }

  async getDeliveryMetadata(projectId: string, cardKey: string): Promise<DeliveryMetadataRecord | null> {
    this.context.ensure();
    const row = this.context.get<any>(
      `
      select * from hepha_delivery_metadata
      where project_id = ? and card_key = ?
      `,
      [projectId, cardKey],
    );

    if (!row) return null;

    return {
      projectId: row.project_id,
      cardKey: row.card_key,
      deliveryMode: row.delivery_mode,
      targetBranch: row.target_branch,
      githubIssue: row.github_issue ?? null,
      issueRole: row.issue_role,
      issueUpdateMode: row.issue_update_mode,
      pullRequest: row.pull_request ?? null,
      deliveryStatus: row.delivery_status,
      deliveryError: row.delivery_error ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listDeliveryMetadata(projectId: string): Promise<DeliveryMetadataRecord[]> {
    this.context.ensure();
    const rows = this.context.all<any>(
      `
      select * from hepha_delivery_metadata
      where project_id = ?
      order by updated_at desc
      `,
      [projectId],
    );

    return rows.map((row) => ({
      projectId: row.project_id,
      cardKey: row.card_key,
      deliveryMode: row.delivery_mode,
      targetBranch: row.target_branch,
      githubIssue: row.github_issue ?? null,
      issueRole: row.issue_role,
      issueUpdateMode: row.issue_update_mode,
      pullRequest: row.pull_request ?? null,
      deliveryStatus: row.delivery_status,
      deliveryError: row.delivery_error ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
