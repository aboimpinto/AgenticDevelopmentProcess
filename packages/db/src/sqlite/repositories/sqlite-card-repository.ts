import type {
  FeatureHumanReviewRecord,
  FeatureReadinessSourceConfirmationRecord,
  FeatureUiRequirementRecord,
  HephaDeepDiveRecord,
  ScannedCardMetadata,
  StoredCardMetadata,
  StoredDeepDiveSession,
} from "../../contracts/index.js";
import {
  mapDeepDiveSessionRow,
  mapStoredMetadataRow,
  type StoredCardMetadataRow,
  type StoredDeepDiveSessionRow,
} from "../row-mappers/card-row-mappers.js";
import type { SqliteQueryContext } from "../sqlite-query-context.js";

export class SqliteCardRepository {
  constructor(
    private readonly context: SqliteQueryContext,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async createDeepDiveSession(
    session: StoredDeepDiveSession,
  ): Promise<StoredDeepDiveSession> {
    this.context.ensure();
    this.context.run(
      `
      insert into hepha_deep_dive_sessions (
        id, project_id, card_key, card_id, card_external_id, card_kind, card_title,
        status, agent_connection_status, original_document_path,
        original_document_hash, original_document_mtime, original_document,
        questions, created_at, updated_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id)
      do update set
        status = excluded.status,
        agent_connection_status = excluded.agent_connection_status,
        questions = excluded.questions,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
      `,
      [
        session.id,
        session.projectId,
        session.cardKey,
        session.cardId,
        session.cardExternalId,
        session.cardKind,
        session.cardTitle,
        session.status,
        session.agentConnectionStatus,
        session.originalDocumentPath,
        session.originalDocumentHash,
        session.originalDocumentUpdatedAt,
        session.originalDocument,
        JSON.stringify(session.questions),
        session.createdAt,
        session.updatedAt,
        session.completedAt,
      ],
    );
    return (await this.getDeepDiveSession(session.id)) ?? session;
  }

  async findOpenDeepDiveSession(
    projectId: string,
    cardKey: string,
  ): Promise<StoredDeepDiveSession | null> {
    this.context.ensure();
    const row = this.context.get<StoredDeepDiveSessionRow>(
      `
      select * from hepha_deep_dive_sessions
      where project_id = ? and card_key = ? and status not in ('completed', 'failed')
      order by updated_at desc
      limit 1
      `,
      [projectId, cardKey],
    );
    return row ? mapDeepDiveSessionRow(row) : null;
  }

  async getDeepDiveSession(
    sessionId: string,
  ): Promise<StoredDeepDiveSession | null> {
    this.context.ensure();
    const row = this.context.get<StoredDeepDiveSessionRow>(
      "select * from hepha_deep_dive_sessions where id = ?",
      [sessionId],
    );
    return row ? mapDeepDiveSessionRow(row) : null;
  }

  async updateDeepDiveSession(
    session: StoredDeepDiveSession,
  ): Promise<StoredDeepDiveSession> {
    this.context.ensure();
    this.context.run(
      `
      update hepha_deep_dive_sessions
      set status = ?, agent_connection_status = ?, questions = ?,
          updated_at = ?, completed_at = ?
      where id = ?
      `,
      [
        session.status,
        session.agentConnectionStatus,
        JSON.stringify(session.questions),
        session.updatedAt,
        session.completedAt,
        session.id,
      ],
    );
    return (await this.getDeepDiveSession(session.id)) ?? session;
  }

  async getCardMetadata(
    projectId: string,
    cardKey: string,
  ): Promise<StoredCardMetadata | null> {
    this.context.ensure();
    const row = this.context.get<StoredCardMetadataRow>(
      `${cardMetadataSelect()} where project_id = ? and card_key = ?`,
      [projectId, cardKey],
    );
    return row ? mapStoredMetadataRow(row) : null;
  }

  async recordHephaDeepDive(record: HephaDeepDiveRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    this.context.run(
      `
      update hepha_card_metadata
      set last_hepha_deep_dive_at = ?, last_hepha_deep_dive_run_id = ?,
          last_hepha_deep_dive_source_hash = ?,
          last_hepha_deep_dive_semantic_source = ?,
          last_hepha_deep_dive_source_mtime = ?, updated_at = ?
      where project_id = ? and card_key = ?
      `,
      [
        now,
        record.runId,
        record.sourceDocumentHash,
        record.semanticSource ?? null,
        record.sourceDocumentUpdatedAt,
        now,
        record.projectId,
        record.cardKey,
      ],
    );
  }

  async recordFeatureUiRequirement(
    record: FeatureUiRequirementRecord,
  ): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    this.context.run(
      `
      update hepha_card_metadata
      set ui_requirement_decision = ?, ui_requirement_reason = ?,
          ui_requirement_source_hash = ?, ui_requirement_checked_at = ?, updated_at = ?
      where project_id = ? and card_key = ?
      `,
      [
        record.decision,
        record.reason,
        record.sourceDocumentHash,
        now,
        now,
        record.projectId,
        record.cardKey,
      ],
    );
  }

  async confirmFeatureReadinessSource(
    record: FeatureReadinessSourceConfirmationRecord,
  ): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    if (record.uiRequirementSourceHash) {
      this.context.run(
        `
        update hepha_card_metadata
        set last_hepha_deep_dive_source_hash = ?,
            last_hepha_deep_dive_semantic_source = coalesce(?, last_hepha_deep_dive_semantic_source),
            last_hepha_deep_dive_source_mtime = ?, ui_requirement_source_hash = ?, updated_at = ?
        where project_id = ? and card_key = ?
        `,
        [
          record.sourceDocumentHash,
          record.semanticSource ?? null,
          record.sourceDocumentUpdatedAt,
          record.uiRequirementSourceHash,
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
      set last_hepha_deep_dive_source_hash = ?,
          last_hepha_deep_dive_semantic_source = coalesce(?, last_hepha_deep_dive_semantic_source),
          last_hepha_deep_dive_source_mtime = ?, updated_at = ?
      where project_id = ? and card_key = ?
      `,
      [
        record.sourceDocumentHash,
        record.semanticSource ?? null,
        record.sourceDocumentUpdatedAt,
        now,
        record.projectId,
        record.cardKey,
      ],
    );
  }

  async recordFeatureHumanReview(record: FeatureHumanReviewRecord): Promise<void> {
    this.context.ensure();
    const now = this.clock();
    const column =
      record.check === "user-code-review"
        ? "user_code_review_completed_at"
        : "manual_tests_completed_at";
    this.context.run(
      `
      update hepha_card_metadata
      set ${column} = coalesce(${column}, ?), updated_at = ?
      where project_id = ? and card_key = ?
      `,
      [now, now, record.projectId, record.cardKey],
    );
  }

  async reconcileScannedCards(
    cards: ScannedCardMetadata[],
  ): Promise<Map<string, StoredCardMetadata>> {
    if (cards.length === 0) {
      return new Map();
    }
    this.context.ensure();

    return this.context.transaction(() => {
      for (const card of cards) {
        const now = this.clock();
        this.context.run(
          `
          insert into hepha_card_metadata (
            project_id, card_key, kind, external_id, title, state_folder,
            source_document_path, source_document_hash, source_document_mtime,
            source_document_size, ui_requirement_decision, ui_requirement_reason,
            ui_requirement_source_hash, ui_requirement_checked_at,
            design_feature_completed_at, refine_feature_completed_at,
            user_code_review_completed_at, manual_tests_completed_at,
            workflow_command, workflow_status, workflow_run_id,
            workflow_started_at, workflow_completed_at, workflow_current_node_id,
            workflow_current_step, workflow_summary, workflow_error,
            created_at, updated_at
          ) values (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null,
            ?, ?
          )
          on conflict (project_id, card_key)
          do update set
            kind = excluded.kind,
            external_id = excluded.external_id,
            title = excluded.title,
            state_folder = excluded.state_folder,
            source_document_path = excluded.source_document_path,
            source_document_hash = excluded.source_document_hash,
            source_document_mtime = excluded.source_document_mtime,
            source_document_size = excluded.source_document_size,
            updated_at = excluded.updated_at
          `,
          [
            card.projectId,
            card.cardKey,
            card.kind,
            card.externalId,
            card.title,
            card.stateFolder,
            card.documentPath,
            card.documentHash,
            card.documentUpdatedAt,
            card.documentSize,
            now,
            now,
          ],
        );
      }

      const projectId = cards[0]!.projectId;
      const cardKeys = cards.map((card) => card.cardKey);
      const rows = this.context.all<StoredCardMetadataRow>(
        `${cardMetadataSelect(false)} where project_id = ? and card_key in (${placeholders(cardKeys.length)})`,
        [projectId, ...cardKeys],
      );
      return new Map(rows.map((row) => [row.card_key, mapStoredMetadataRow(row)]));
    });
  }
}

function cardMetadataSelect(includeRecovery = true) {
  const recoveryColumns = includeRecovery
    ? "workflow_recovery_attempt_count, workflow_last_recovery_at"
    : "null as workflow_recovery_attempt_count, null as workflow_last_recovery_at";
  return `
    select
      card_key,
      last_hepha_deep_dive_at,
      last_hepha_deep_dive_run_id,
      last_hepha_deep_dive_source_hash,
      last_hepha_deep_dive_semantic_source,
      last_hepha_deep_dive_source_mtime,
      ui_requirement_decision,
      ui_requirement_reason,
      ui_requirement_source_hash,
      ui_requirement_checked_at,
      design_feature_completed_at,
      refine_feature_completed_at,
      user_code_review_completed_at,
      manual_tests_completed_at,
      workflow_command,
      workflow_status,
      workflow_run_id,
      workflow_started_at,
      workflow_completed_at,
      workflow_current_node_id,
      workflow_current_step,
      workflow_summary,
      workflow_error,
      ${recoveryColumns}
    from hepha_card_metadata
  `;
}

function placeholders(count: number) {
  return new Array(count).fill("?").join(", ");
}
