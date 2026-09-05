import type { ManualTestPackDbState, ManualTestResultDbOutcome, ManualTestResultRecord, ManualTestReviewDbState, ManualTestVerificationPackRecord, ManualTestVerificationReviewRecord } from "../../contracts/manual-test-contracts.js";
import { toIsoString } from "../value-normalizers.js";

// FEAT-045: Manual Test Verification Pack — row types and mappers
// -------------------------------------------------------------------------

export interface ManualTestVerificationPackRow {
  id: string;
  project_id: string;
  card_key: string;
  version: string;
  state: string;
  manifest_hash: string;
  markdown_path: string;
  pdf_path: string | null;
  render_error: string | null;
  created_at: string;
  superseded_at: string | null;
}

export interface ManualTestVerificationReviewRow {
  id: string;
  project_id: string;
  card_key: string;
  pack_id: string;
  reviewed_at: string;
  state: string;
  invalidated_at: string | null;
  invalidated_reason: string | null;
}

export interface ManualTestResultRow {
  id: string;
  project_id: string;
  card_key: string;
  pack_id: string;
  review_id: string;
  test_id: string;
  result: string;
  actual_result: string | null;
  notes: string | null;
  finding_id: string | null;
  recorded_at: string;
}

export function mapManualTestVerificationPackRow(row: ManualTestVerificationPackRow): ManualTestVerificationPackRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    version: row.version,
    state: row.state as ManualTestPackDbState,
    manifestHash: row.manifest_hash,
    markdownPath: row.markdown_path,
    pdfPath: row.pdf_path,
    renderError: row.render_error,
    createdAt: toIsoString(row.created_at) ?? row.created_at,
    supersededAt: row.superseded_at,
  };
}

export function mapManualTestVerificationReviewRow(row: ManualTestVerificationReviewRow): ManualTestVerificationReviewRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    packId: row.pack_id,
    reviewedAt: toIsoString(row.reviewed_at) ?? row.reviewed_at,
    state: row.state as ManualTestReviewDbState,
    invalidatedAt: row.invalidated_at,
    invalidatedReason: row.invalidated_reason,
  };
}

// -------------------------------------------------------------------------

export function mapManualTestResultRow(row: ManualTestResultRow): ManualTestResultRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    cardKey: row.card_key,
    packId: row.pack_id,
    reviewId: row.review_id,
    testId: row.test_id,
    result: row.result as ManualTestResultDbOutcome,
    actualResult: row.actual_result,
    notes: row.notes,
    findingId: row.finding_id,
    recordedAt: toIsoString(row.recorded_at) ?? row.recorded_at,
  };
}
