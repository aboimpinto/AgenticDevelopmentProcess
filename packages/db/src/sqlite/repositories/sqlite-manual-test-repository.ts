import type {
  ManualTestPackDbState,
  ManualTestResultRecord,
  ManualTestVerificationPackRecord,
  ManualTestVerificationReviewRecord,
} from "../../contracts/index.js";
import {
  mapManualTestResultRow,
  mapManualTestVerificationPackRow,
  mapManualTestVerificationReviewRow,
  type ManualTestResultRow,
  type ManualTestVerificationPackRow,
  type ManualTestVerificationReviewRow,
} from "../row-mappers/manual-test-row-mappers.js";
import type { SqliteQueryContext } from "../sqlite-query-context.js";

export class SqliteManualTestRepository {
  constructor(private readonly context: SqliteQueryContext) {}

  async recordManualTestPack(record: ManualTestVerificationPackRecord): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      insert into hepha_manual_test_packs (
        id, project_id, card_key, version, state,
        manifest_hash, markdown_path, pdf_path, render_error,
        created_at, superseded_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id)
      do update set
        state = excluded.state,
        markdown_path = excluded.markdown_path,
        pdf_path = excluded.pdf_path,
        render_error = excluded.render_error,
        superseded_at = excluded.superseded_at
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.version,
        record.state,
        record.manifestHash,
        record.markdownPath,
        record.pdfPath ?? null,
        record.renderError ?? null,
        record.createdAt,
        record.supersededAt ?? null,
      ],
    );
  }

  async getCurrentManualTestPack(projectId: string, cardKey: string): Promise<ManualTestVerificationPackRecord | null> {
    this.context.ensure();
    const row = this.context.get<ManualTestVerificationPackRow>(
      `
      select * from hepha_manual_test_packs
      where project_id = ?
        and card_key = ?
        and superseded_at is null
      order by created_at desc
      limit 1
      `,
      [projectId, cardKey],
    );
    return row ? mapManualTestVerificationPackRow(row) : null;
  }

  async getManualTestPack(projectId: string, cardKey: string, packId: string): Promise<ManualTestVerificationPackRecord | null> {
    this.context.ensure();
    const row = this.context.get<ManualTestVerificationPackRow>(
      `
      select * from hepha_manual_test_packs
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [projectId, cardKey, packId],
    );
    return row ? mapManualTestVerificationPackRow(row) : null;
  }

  async listManualTestPacks(projectId: string, cardKey: string): Promise<ManualTestVerificationPackRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ManualTestVerificationPackRow>(
      `
      select * from hepha_manual_test_packs
      where project_id = ?
        and card_key = ?
      order by created_at desc
      `,
      [projectId, cardKey],
    );
    return rows.map(mapManualTestVerificationPackRow);
  }

  async markManualTestPackSuperseded(projectId: string, cardKey: string, packId: string, supersededAt: string): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      update hepha_manual_test_packs
      set superseded_at = ?
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [supersededAt, projectId, cardKey, packId],
    );
  }

  async setManualTestPackState(projectId: string, cardKey: string, packId: string, state: ManualTestPackDbState, renderError?: string): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      update hepha_manual_test_packs
      set state = ?,
          render_error = ?
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [state, renderError ?? null, projectId, cardKey, packId],
    );
  }

  async recordManualTestReview(record: ManualTestVerificationReviewRecord): Promise<ManualTestVerificationReviewRecord> {
    this.context.ensure();
    this.context.run(
      `
      insert into hepha_manual_test_reviews (
        id, project_id, card_key, pack_id,
        reviewed_at, state, invalidated_at,
        invalidated_reason
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id)
      do update set
        state = excluded.state,
        invalidated_at = excluded.invalidated_at,
        invalidated_reason = excluded.invalidated_reason
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.packId,
        record.reviewedAt,
        record.state,
        record.invalidatedAt ?? null,
        record.invalidatedReason ?? null,
      ],
    );
    return record;
  }

  async getCurrentManualTestReview(projectId: string, cardKey: string): Promise<ManualTestVerificationReviewRecord | null> {
    this.context.ensure();
    const row = this.context.get<ManualTestVerificationReviewRow>(
      `
      select * from hepha_manual_test_reviews
      where project_id = ?
        and card_key = ?
        and state = 'current'
      order by reviewed_at desc
      limit 1
      `,
      [projectId, cardKey],
    );
    return row ? mapManualTestVerificationReviewRow(row) : null;
  }

  async invalidateManualTestReview(projectId: string, cardKey: string, reviewId: string, invalidatedAt: string, reason?: string): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      update hepha_manual_test_reviews
      set state = 'invalidated',
          invalidated_at = ?,
          invalidated_reason = ?
      where project_id = ?
        and card_key = ?
        and id = ?
      `,
      [invalidatedAt, reason ?? null, projectId, cardKey, reviewId],
    );
  }

  async recordManualTestResult(record: ManualTestResultRecord): Promise<void> {
    this.context.ensure();
    this.context.run(
      `
      insert into hepha_manual_test_results (
        id, project_id, card_key, pack_id,
        review_id, test_id, result,
        actual_result, notes, finding_id,
        recorded_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id)
      do nothing
      `,
      [
        record.id,
        record.projectId,
        record.cardKey,
        record.packId,
        record.reviewId,
        record.testId,
        record.result,
        record.actualResult ?? null,
        record.notes ?? null,
        record.findingId ?? null,
        record.recordedAt,
      ],
    );
  }

  async listManualTestResults(projectId: string, cardKey: string, packId: string): Promise<ManualTestResultRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ManualTestResultRow>(
      `
      select * from hepha_manual_test_results
      where project_id = ?
        and card_key = ?
        and pack_id = ?
      order by recorded_at asc
      `,
      [projectId, cardKey, packId],
    );
    return rows.map(mapManualTestResultRow);
  }

  async listAllManualTestResults(projectId: string, cardKey: string): Promise<ManualTestResultRecord[]> {
    this.context.ensure();
    const rows = this.context.all<ManualTestResultRow>(
      `
      select * from hepha_manual_test_results
      where project_id = ?
        and card_key = ?
      order by recorded_at desc
      `,
      [projectId, cardKey],
    );
    return rows.map(mapManualTestResultRow);
  }

}

