const cancellationRequests = new Set<string>();

export class WorkflowCancelledError extends Error {
  constructor(readonly runId: string) {
    super(`Workflow ${runId} was cancelled.`);
    this.name = "WorkflowCancelledError";
  }
}

export function requestWorkflowCancellation(runId: string): void {
  cancellationRequests.add(runId);
}

export function clearWorkflowCancellation(runId: string): void {
  cancellationRequests.delete(runId);
}

export function isWorkflowCancellationRequested(runId: string): boolean {
  return cancellationRequests.has(runId);
}

export function throwIfWorkflowCancelled(runId: string): void {
  if (isWorkflowCancellationRequested(runId)) throw new WorkflowCancelledError(runId);
}

export function isWorkflowCancelledError(error: unknown): error is WorkflowCancelledError {
  return error instanceof WorkflowCancelledError;
}

/** Yield between autonomous decisions so HTTP cancellation and reads can run. */
export async function yieldToWorkflowControlPlane(runId: string): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  throwIfWorkflowCancelled(runId);
}
