import type { WorkItemCard } from "@hepha/shared";
import { getErrorMessage } from "../api/http-client.js";
import { manualTestApi } from "./manual-test-api.js";

export interface ManualTestActionOptions {
  projectId: string | null;
  onError(message: string | null): void;
  onNotice(message: string | null): void;
  onPendingAction(actionId: string | null): void;
  refreshWorkItems(projectId: string): Promise<void>;
}

export function useManualTestActions(options: ManualTestActionOptions) {
  async function execute(
    actionId: string,
    operation: (projectId: string) => Promise<{ message: string }>,
  ) {
    const projectId = options.projectId;
    if (!projectId) return;
    options.onPendingAction(actionId);
    options.onNotice(null);
    try {
      const response = await operation(projectId);
      options.onNotice(response.message);
      options.onError(null);
      await options.refreshWorkItems(projectId);
    } catch (error: unknown) {
      options.onError(getErrorMessage(error));
      throw error;
    } finally {
      options.onPendingAction(null);
    }
  }

  return {
    generate: (item: WorkItemCard) => execute(
      `manual-test-generate-${item.id}`,
      (projectId) => manualTestApi.generate(projectId, item.id),
    ),
    review: (item: WorkItemCard, packId: string) => execute(
      `manual-test-review-${item.id}`,
      (projectId) => manualTestApi.review(projectId, item.id, packId),
    ),
    record: (
      item: WorkItemCard,
      packId: string,
      reviewId: string,
      testId: string | undefined,
      result: "pass" | "fail",
      actualResult?: string,
      notes?: string,
    ) => execute(
      `manual-test-${result}-${item.id}`,
      (projectId) => manualTestApi.record(projectId, item.id, packId, reviewId, testId, result, actualResult, notes),
    ),
    status: async (item: WorkItemCard) => {
      if (!options.projectId) return null;
      try {
        return await manualTestApi.status(options.projectId, item.id);
      } catch {
        return null;
      }
    },
  };
}
