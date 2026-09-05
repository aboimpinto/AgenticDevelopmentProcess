import { getTerminalWorkItemLifecycle } from "@hepha/shared";

export interface DeepDiveLifecycleCandidate {
  readonly externalId: string;
  readonly kind: "epic" | "feature";
  readonly stateFolder: string;
  readonly epicState: string | null;
}

/**
 * Refuse lifecycle regression before creating a session or mutating metadata.
 */
export function assertDeepDiveLifecycleEligible(item: DeepDiveLifecycleCandidate): void {
  const terminalLifecycle = getTerminalWorkItemLifecycle(item);
  if (!terminalLifecycle) return;

  throw new Error(
    `Deep-Dive is unavailable because ${item.externalId} is ${terminalLifecycle}. Terminal work items are read-only.`,
  );
}
