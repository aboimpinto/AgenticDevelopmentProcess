import type {
  ManualTestVerificationGenerateResponse,
  ManualTestVerificationResultResponse,
  ManualTestVerificationReviewResponse,
  ManualTestVerificationStatusResponse,
} from "@hepha/shared";
import { apiGet, apiPost } from "../api/http-client.js";

export const manualTestApi = {
  generate: (projectId: string, cardId: string) =>
    apiPost<ManualTestVerificationGenerateResponse>("/api/manual-test-verification/generate", { cardId, projectId }),
  review: (projectId: string, cardId: string, packId: string) =>
    apiPost<ManualTestVerificationReviewResponse>("/api/manual-test-verification/review", { cardId, packId, projectId }),
  record: (
    projectId: string,
    cardId: string,
    packId: string,
    reviewId: string,
    testId: string | undefined,
    result: "pass" | "fail",
    actualResult?: string,
    notes?: string,
  ) => apiPost<ManualTestVerificationResultResponse>(
    result === "pass" ? "/api/manual-test-verification/record-pass" : "/api/manual-test-verification/record-fail",
    {
      actualResult: actualResult ?? null,
      cardId,
      notes: notes ?? null,
      packId,
      projectId,
      result,
      reviewId,
      testId,
    },
  ),
  status: (projectId: string, cardId: string) =>
    apiGet<ManualTestVerificationStatusResponse>(
      `/api/manual-test-verification/status?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(cardId)}`,
    ),
};
