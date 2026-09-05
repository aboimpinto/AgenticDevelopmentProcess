import type { EpicDeliveryState, MemoryBankStateFolder } from "@hepha/shared";

// ---------------------------------------------------------------------------
// FEAT-012: Targeted EPIC Status Synchronization — types
// ---------------------------------------------------------------------------

export type FeatNormalizedState =
  | "SUBMITTED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "MISSING";

export interface FeatStatusSnapshot {
  featId: string;
  title: string;
  stateFolder: MemoryBankStateFolder | null;
  normalizedState: FeatNormalizedState;
  found: boolean;
  ambiguousState: boolean;
  issues: string[];
}

export interface ProgressCounts {
  total: number;
  completed: number;
  inProgress: number;
  ready: number;
  submitted: number;
  cancelled: number;
  missing: number;
}

export interface SectionChangeSummary {
  section: string;
  changed: boolean;
  warning?: string;
}

export interface EpicSyncResult {
  markdown: string;
  changed: boolean;
  sections: SectionChangeSummary[];
  warnings: string[];
  blockers: string[];
}

// ---------------------------------------------------------------------------
// FEAT-012: Snapshot building and normalization
// ---------------------------------------------------------------------------

const STATE_FOLDER_MAP: Record<MemoryBankStateFolder, FeatNormalizedState> = {
  "00_EPICS": "SUBMITTED",
  "01_SUBMITTED": "SUBMITTED",
  "02_READY_TO_DEVELOP": "READY",
  "03_IN_PROGRESS": "IN_PROGRESS",
  "04_COMPLETED": "COMPLETED",
  "05_CANCELLED": "CANCELLED",
};

const MERMAID_CLASS_MAP: Record<FeatNormalizedState, string> = {
  SUBMITTED: "notStarted",
  READY: "ready",
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  MISSING: "notStarted",
};

export function normalizeFeatState(
  stateFolder: MemoryBankStateFolder | null,
): FeatNormalizedState {
  if (!stateFolder) {
    return "MISSING";
  }
  return STATE_FOLDER_MAP[stateFolder] ?? "MISSING";
}

/**
 * Build FEAT status snapshots from an EPIC's linkedFeatureIds and the current
 * work-items array. Detects missing FEATs, ambiguous duplicates, and resolves
 * each linked FEAT to its current lifecycle state.
 */
export function buildFeatStatusSnapshots(
  linkedFeatureIds: string[],
  workItems: Array<{ externalId: string; stateFolder: MemoryBankStateFolder; title: string }>,
): FeatStatusSnapshot[] {
  const snapshots: FeatStatusSnapshot[] = [];
  const seenFolders = new Map<string, MemoryBankStateFolder[]>();

  // Build folder index: for each FEAT ID, collect all state folders it appears in
  for (const item of workItems) {
    const existing = seenFolders.get(item.externalId) ?? [];
    existing.push(item.stateFolder);
    seenFolders.set(item.externalId, existing);
  }

  for (const featId of linkedFeatureIds) {
    const folders = seenFolders.get(featId);
    const found = Boolean(folders && folders.length > 0);
    const ambiguousState = found ? (folders!.length > 1) : false;
    const stateFolder = found && !ambiguousState ? folders![0] : null;
    const issues: string[] = [];

    if (!found) {
      issues.push(`FEAT ${featId} is referenced but not found in any state folder`);
    }
    if (ambiguousState) {
      issues.push(
        `FEAT ${featId} found in multiple state folders: ${folders!.join(", ")}`,
      );
    }

    const workItem = found && !ambiguousState
      ? workItems.find((wi) => wi.externalId === featId)
      : undefined;

    snapshots.push({
      featId,
      title: workItem?.title ?? "",
      stateFolder,
      normalizedState: normalizeFeatState(stateFolder),
      found,
      ambiguousState,
      issues,
    });
  }

  return snapshots;
}

/**
 * Derive EPIC delivery state from snapshots using the same rules as
 * deriveEpicStateFromFeatureStateFolders but from snapshot data.
 */
export function deriveEpicStateFromSnapshots(
  snapshots: FeatStatusSnapshot[],
): EpicDeliveryState {
  const hasMissing = snapshots.some((s) => !s.found);
  const allResolved = snapshots.length > 0 && !hasMissing && snapshots.every((s) => s.found);

  if (allResolved && snapshots.every((s) => s.normalizedState === "COMPLETED")) {
    return "completed";
  }

  if (allResolved && snapshots.every((s) => s.normalizedState === "CANCELLED")) {
    return "cancelled";
  }

  if (
    snapshots.some((s) =>
      ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(s.normalizedState),
    )
  ) {
    return "in-progress";
  }

  return "not-started";
}

/**
 * Compute progress counts from FEAT status snapshots.
 */
export function computeProgressCounts(snapshots: FeatStatusSnapshot[]): ProgressCounts {
  const counts: ProgressCounts = {
    total: snapshots.length,
    completed: 0,
    inProgress: 0,
    ready: 0,
    submitted: 0,
    cancelled: 0,
    missing: 0,
  };

  for (const snap of snapshots) {
    switch (snap.normalizedState) {
      case "COMPLETED":
        counts.completed++;
        break;
      case "IN_PROGRESS":
        counts.inProgress++;
        break;
      case "READY":
        counts.ready++;
        break;
      case "SUBMITTED":
        counts.submitted++;
        break;
      case "CANCELLED":
        counts.cancelled++;
        break;
      case "MISSING":
        counts.missing++;
        break;
    }
  }

  return counts;
}

/**
 * Compute progress percentage rounded to nearest integer.
 */
export function computeProgressPercent(counts: ProgressCounts): number {
  if (counts.total === 0) {
    return 0;
  }
  return Math.round((counts.completed / counts.total) * 100);
}

/** Map a normalized child state to the standard Mermaid status class. */
export function getMermaidClassName(
  state: FeatNormalizedState,
  classDefs?: Map<string, string>,
): string {
  const defaultClass = MERMAID_CLASS_MAP[state] ?? "notStarted";

  if (!classDefs) {
    return defaultClass;
  }

  // Preserve the standard mapping when a document provides class definitions.
  return defaultClass;
}
