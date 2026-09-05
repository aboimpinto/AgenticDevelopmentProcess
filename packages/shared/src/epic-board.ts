import type { EpicDeliveryState, WorkItemCard, WorkItemScanStatus, WorkItemSourceIssue } from "./index.js";

export type EpicBoardColumnId = EpicDeliveryState | "invalid-sources";

export interface EpicBoardColumnDefinition {
  id: EpicBoardColumnId;
  title: string;
}

export interface EpicBoardColumn extends EpicBoardColumnDefinition {
  count: number;
  items: WorkItemCard[];
  sourceIssues: WorkItemSourceIssue[];
}

export interface EpicBoardModel {
  columns: EpicBoardColumn[];
  empty: boolean;
  failed: boolean;
  hasInvalidSources: boolean;
  message: string | null;
  sourceIssues: WorkItemSourceIssue[];
  validItems: WorkItemCard[];
}

export const epicBoardColumnDefinitions: EpicBoardColumnDefinition[] = [
  { id: "not-started", title: "Not Started" },
  { id: "in-progress", title: "In Progress" },
  { id: "completed", title: "Completed" },
  { id: "cancelled", title: "Cancelled" },
  { id: "invalid-sources", title: "Invalid Sources" },
];

export function buildEpicBoardModel(
  workItems: WorkItemCard[],
  sourceIssues: WorkItemSourceIssue[] = [],
  scanStatus: WorkItemScanStatus | null = null,
): EpicBoardModel {
  const validItems = workItems.filter((item) => item.kind === "epic").sort(compareWorkItemsByExternalId);
  const epicSourceIssues = sourceIssues
    .filter((issue) => issue.sourceType === "epic")
    .sort(compareSourceIssues);
  const columns = epicBoardColumnDefinitions.map((definition): EpicBoardColumn => {
    const items = isEpicDeliveryColumn(definition.id)
      ? validItems.filter((item) => getEpicStateForBoard(item) === definition.id)
      : [];
    const columnIssues = definition.id === "invalid-sources" ? epicSourceIssues : [];

    return {
      ...definition,
      count: items.length + columnIssues.length,
      items,
      sourceIssues: columnIssues,
    };
  });
  const failed = Boolean(scanStatus?.epicScanFailed);

  return {
    columns,
    empty: !failed && validItems.length === 0 && epicSourceIssues.length === 0,
    failed,
    hasInvalidSources: epicSourceIssues.length > 0,
    message: scanStatus?.message ?? null,
    sourceIssues: epicSourceIssues,
    validItems,
  };
}

export function getEpicStateForBoard(item: WorkItemCard): EpicDeliveryState {
  return item.epicState ?? "not-started";
}

export function compareWorkItemsByExternalId(left: Pick<WorkItemCard, "externalId">, right: Pick<WorkItemCard, "externalId">) {
  return left.externalId.localeCompare(right.externalId, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareSourceIssues(left: WorkItemSourceIssue, right: WorkItemSourceIssue) {
  return (
    left.folderName.localeCompare(right.folderName, undefined, { numeric: true, sensitivity: "base" }) ||
    (left.sourcePath ?? "").localeCompare(right.sourcePath ?? "", undefined, { numeric: true, sensitivity: "base" })
  );
}

function isEpicDeliveryColumn(columnId: EpicBoardColumnId): columnId is EpicDeliveryState {
  return columnId !== "invalid-sources";
}
