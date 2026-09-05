import type { MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";
import { COMPLETED_COLUMN_PREVIEW_LIMIT, getCompletedFeatureTime } from "./board-types.js";

/**
 * Filter work items for the main work-board view.
 * Excludes completed and cancelled EPICs from the active work queue.
 */
export function getWorkBoardItems(workItems: WorkItemCard[]): WorkItemCard[] {
  return workItems.filter((item) => !(
    item.kind === "epic"
    && (item.epicState === "completed" || item.epicState === "cancelled")
  ));
}

/**
 * Return completed features sorted by most recently completed first.
 */
export function getCompletedFeatures(workItems: WorkItemCard[]): WorkItemCard[] {
  return workItems
    .filter((item) => item.kind === "feature" && item.stateFolder === "04_COMPLETED")
    .sort((left, right) => getCompletedFeatureTime(right) - getCompletedFeatureTime(left));
}

/**
 * Filter work items by state folder, applying the completed-features sort
 * and limit for the COMPLETED column.
 */
export function getColumnItems(
  workItems: WorkItemCard[],
  stateFolder: MemoryBankStateFolder,
): WorkItemCard[] {
  const columnItems = workItems.filter((item) => item.stateFolder === stateFolder);

  return stateFolder === "04_COMPLETED" ? getCompletedFeatures(columnItems) : columnItems;
}

/**
 * Get display items for a column — completed column is preview-limited.
 */
export function getColumnDisplayItems(
  workItems: WorkItemCard[],
  stateFolder: MemoryBankStateFolder,
): { displayItems: WorkItemCard[]; hiddenCount: number } {
  const columnItems = getColumnItems(workItems, stateFolder);

  if (stateFolder !== "04_COMPLETED") {
    return { displayItems: columnItems, hiddenCount: 0 };
  }

  const displayItems = columnItems.slice(0, COMPLETED_COLUMN_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, columnItems.length - displayItems.length);

  return { displayItems, hiddenCount };
}
