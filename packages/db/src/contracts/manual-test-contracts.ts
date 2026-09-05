export type ManualTestPackDbState = "current" | "stale" | "render_failed";
export type ManualTestReviewDbState = "current" | "invalidated";
export type ManualTestResultDbOutcome = "pass" | "fail";

export interface ManualTestVerificationPackRecord {
  id: string;
  projectId: string;
  cardKey: string;
  version: string;
  state: ManualTestPackDbState;
  manifestHash: string;
  markdownPath: string;
  pdfPath: string | null;
  renderError: string | null;
  createdAt: string;
  supersededAt: string | null;
}

export interface ManualTestVerificationReviewRecord {
  id: string;
  projectId: string;
  cardKey: string;
  packId: string;
  reviewedAt: string;
  state: ManualTestReviewDbState;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
}

export interface ManualTestResultRecord {
  id: string;
  projectId: string;
  cardKey: string;
  packId: string;
  reviewId: string;
  testId: string;
  result: ManualTestResultDbOutcome;
  actualResult: string | null;
  notes: string | null;
  findingId: string | null;
  recordedAt: string;
}
