import type { WorkItemCard } from "@hepha/shared";

/** Returns the canonical runtime identity used for one MemoryBank work-item card. */
export function createWorkItemCardKey(kind: WorkItemCard["kind"], externalId: string): string {
  return `${kind}:${externalId.toUpperCase()}`;
}
