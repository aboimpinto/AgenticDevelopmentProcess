// FEAT-045: Manual Test Verification Pack — dashboard status type
// -------------------------------------------------------------------------

export type ManualTestPackDashboardState =
  | "missing"
  | "generating"
  | "current"
  | "stale"
  | "render_failed";

export interface ManualTestPackDashboardStatus {
  readonly state: ManualTestPackDashboardState;
  readonly currentPackId: string | null;
  readonly currentVersion: string | null;
  readonly hasMarkdown: boolean;
  readonly hasPdf: boolean;
  readonly isStale: boolean;
  readonly isReviewed: boolean;
  readonly currentReviewId: string | null;
  readonly failedCount: number;
  readonly passedCount: number;
  readonly hasResults: boolean;
  readonly applicability?: "applicable" | "not_applicable" | "incomplete";
  readonly manualTestCount?: number;
  readonly invalidManualTestCount?: number;
  readonly isReady?: boolean;
  readonly message: string;
}

// -------------------------------------------------------------------------
// FEAT-045: Manual Test Verification — API input/output types
// -------------------------------------------------------------------------

export interface ManualTestVerificationStatusResponse {
  success: boolean;
  status: ManualTestPackDashboardStatus;
  summary: string;
}

export interface ManualTestVerificationActionInput {
  cardId: string;
  projectId: string;
  packId?: string;
  reviewId?: string;
  testId?: string;
  /** Test result for record-success/record-failure. */
  result?: "pass" | "fail";
  actualResult?: string | null;
  notes?: string | null;
}

export interface ManualTestVerificationGenerateResponse {
  success: boolean;
  packId?: string;
  version?: string;
  state?: ManualTestPackDashboardState;
  message: string;
  errors: string[];
}

export interface ManualTestVerificationReviewResponse {
  success: boolean;
  reviewId?: string;
  packId?: string;
  message: string;
  errors: string[];
}

export interface ManualTestVerificationResultResponse {
  success: boolean;
  resultId?: string;
  findingId?: string | null;
  message: string;
  errors: string[];
}
