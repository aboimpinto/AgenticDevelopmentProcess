import type { WorkItemCard, WorkItemSourceIssue } from "./index.js";
import { compareWorkItemsByExternalId } from "./epic-board.js";

export type FeatBoardColumnId = MemoryBankStateFolderForFeat | "invalid-sources";
export type MemoryBankStateFolderForFeat = Exclude<
  import("./index.js").MemoryBankStateFolder,
  "00_EPICS"
>;

export interface FeatBoardColumnDefinition {
  id: FeatBoardColumnId;
  title: string;
}

export interface FeatBoardColumn extends FeatBoardColumnDefinition {
  count: number;
  items: WorkItemCard[];
  sourceIssues: WorkItemSourceIssue[];
}

export interface FeatBoardModel {
  columns: FeatBoardColumn[];
  empty: boolean;
  hasInvalidSources: boolean;
  sourceIssues: WorkItemSourceIssue[];
  validItems: WorkItemCard[];
}

export const featBoardColumnDefinitions: FeatBoardColumnDefinition[] = [
  { id: "01_SUBMITTED", title: "Submitted" },
  { id: "02_READY_TO_DEVELOP", title: "Ready To Develop" },
  { id: "03_IN_PROGRESS", title: "In Progress" },
  { id: "04_COMPLETED", title: "Completed" },
  { id: "05_CANCELLED", title: "Cancelled" },
  { id: "invalid-sources", title: "Invalid Sources" },
];

/**
 * Build a deterministic FEAT board model from scanner/API results.
 *
 * Pure function — no filesystem, API, or side effects.
 *
 * @param workItems - All scanned work items (EPICs and FEATs).
 * @param sourceIssues - All source issues from the scanner (EPIC and FEAT).
 * @returns A FeatBoardModel with lifecycle columns, invalid-source diagnostics,
 *          and sorted FEAT items.
 */
export function buildFeatureBoardModel(
  workItems: WorkItemCard[],
  sourceIssues: WorkItemSourceIssue[] = [],
): FeatBoardModel {
  const validItems = workItems
    .filter((item) => item.kind === "feature")
    .sort(compareWorkItemsByExternalId);

  const featSourceIssues = sourceIssues
    .filter((issue) => issue.sourceType === "feature")
    .sort(compareSourceIssues);

  const columns = featBoardColumnDefinitions.map((definition): FeatBoardColumn => {
    const items = isFeatLifecycleColumn(definition.id)
      ? validItems.filter((item) => item.stateFolder === definition.id)
      : [];
    const columnIssues = definition.id === "invalid-sources" ? featSourceIssues : [];

    return {
      ...definition,
      count: items.length + columnIssues.length,
      items,
      sourceIssues: columnIssues,
    };
  });

  return {
    columns,
    empty: validItems.length === 0 && featSourceIssues.length === 0,
    hasInvalidSources: featSourceIssues.length > 0,
    sourceIssues: featSourceIssues,
    validItems,
  };
}



function compareSourceIssues(left: WorkItemSourceIssue, right: WorkItemSourceIssue) {
  return (
    left.folderName.localeCompare(right.folderName, undefined, { numeric: true, sensitivity: "base" }) ||
    (left.sourcePath ?? "").localeCompare(right.sourcePath ?? "", undefined, { numeric: true, sensitivity: "base" })
  );
}

function isFeatLifecycleColumn(columnId: FeatBoardColumnId): columnId is MemoryBankStateFolderForFeat {
  return columnId !== "invalid-sources";
}
