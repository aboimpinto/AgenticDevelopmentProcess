/**
 * Terminal lifecycle policy shared by the scanner, API boundaries, and UI.
 *
 * Preparation workflows are meaningful only while a work item is active.
 * Completion-time documentation edits may make freshness metadata stale, but
 * that must never reopen Deep-Dive, refinement, implementation, or completion.
 */

export type TerminalWorkItemLifecycle = "completed" | "cancelled";

export interface WorkItemLifecycleFacts {
  readonly kind: "epic" | "feature";
  readonly stateFolder: string;
  readonly epicState: string | null;
}

export function getTerminalWorkItemLifecycle(
  item: WorkItemLifecycleFacts,
): TerminalWorkItemLifecycle | null {
  if (item.kind === "feature") {
    if (item.stateFolder === "04_COMPLETED") return "completed";
    if (item.stateFolder === "05_CANCELLED") return "cancelled";
    return null;
  }

  if (item.epicState === "completed") return "completed";
  if (item.epicState === "cancelled") return "cancelled";
  return null;
}
