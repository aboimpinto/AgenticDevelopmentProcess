import type { MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";

export type BladeMode = "project" | "detail" | "source-issue";
export type PrimaryView = "work-board" | "feat-board" | "epic-board" | "projects" | "completed-features" | "approvals";

export interface BoardColumn {
  id: MemoryBankStateFolder;
  title: string;
}

export const COLUMNS: BoardColumn[] = [
  { id: "00_EPICS", title: "Epics" },
  { id: "01_SUBMITTED", title: "Submitted" },
  { id: "02_READY_TO_DEVELOP", title: "Ready" },
  { id: "03_IN_PROGRESS", title: "In Progress" },
  { id: "04_COMPLETED", title: "Completed" },
  { id: "05_CANCELLED", title: "Cancelled" },
];

export const COMPLETED_COLUMN_PREVIEW_LIMIT = 6;

export function getCompletedFeatureTime(item: WorkItemCard): number {
  const workflow = item.featureWorkflow;
  const candidates = [
    workflow?.lastRun?.command === "complete-feature" ? workflow.lastRun.completedAt : null,
    workflow?.implementationPhases
      .map((phase) => phase.completedAt ?? phase.updatedAt ?? phase.startedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    item.documentUpdatedAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const time = new Date(candidate).getTime();

    if (Number.isFinite(time)) {
      return time;
    }
  }

  return 0;
}

export function getCompletedFeatureTimestamp(item: WorkItemCard): string {
  const timestamp = getCompletedFeatureTime(item);

  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : item.documentUpdatedAt ?? new Date(0).toISOString();
}
