import type { WorkItemCard } from "@hepha/shared";

/** Retry after a source revision, not on every scan/render of the same source. */
export function uiClassificationAttemptKey(projectId: string, item: WorkItemCard): string {
  return JSON.stringify([projectId, item.id, item.specMarkdown]);
}
