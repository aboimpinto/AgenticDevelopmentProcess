import { useState } from "react";
import type {
  LinkFeatureToEpicInput,
  LinkFeatureToEpicResponse,
  WorkItemCard,
  WorkItemListResponse,
} from "@hepha/shared";
import { apiGet, apiPost, getErrorMessage } from "../api/http-client.js";

export interface FeatureEpicLinkOptions {
  projectId: string | null;
  onItems(items: WorkItemCard[]): void;
  onNotice(message: string): void;
}

export function useFeatureEpicLink(options: FeatureEpicLinkOptions) {
  const [error, setError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function link(
    item: WorkItemCard,
    operation: "link" | "relink" | "unlink",
    targetEpicCardId?: string,
  ) {
    const projectId = options.projectId;
    if (!projectId) return;
    setIsLinking(true);
    setResult(null);
    setError(null);
    try {
      const encodedProjectId = encodeURIComponent(projectId);
      const encodedCardId = encodeURIComponent(item.externalId);
      const response = await apiPost<LinkFeatureToEpicResponse>(
        `/api/projects/${encodedProjectId}/features/${encodedCardId}/link-epic`,
        { operation, targetEpicCardId } satisfies LinkFeatureToEpicInput,
      );
      const itemsResponse = await apiGet<WorkItemListResponse>(
        `/api/projects/${encodedProjectId}/work-items`,
      );
      options.onItems(itemsResponse.items);
      if (response.blockers.length > 0) {
        setError(response.blockers.join("; "));
      } else {
        setResult(response.summary);
        options.onNotice(
          response.warnings.length > 0
            ? response.summary + " Warnings: " + response.warnings.join("; ")
            : response.summary,
        );
      }
    } catch (caught: unknown) {
      setError(getErrorMessage(caught));
    } finally {
      setIsLinking(false);
    }
  }

  return { error, isLinking, link, result };
}
