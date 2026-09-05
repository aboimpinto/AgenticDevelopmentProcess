import { afterEach, describe, expect, it } from "vitest";

import {
  clearWorkflowCancellation,
  isWorkflowCancelledError,
  requestWorkflowCancellation,
  throwIfWorkflowCancelled,
  yieldToWorkflowControlPlane,
} from "../src/workflow-cancellation.js";

const runIds = new Set<string>();

function runId() {
  const value = `run-${runIds.size}`;
  runIds.add(value);
  return value;
}

afterEach(() => {
  for (const value of runIds) clearWorkflowCancellation(value);
  runIds.clear();
});

describe("generic workflow cooperative cancellation", () => {
  it("interrupts an in-process workflow even when no child process exists", () => {
    const id = runId();
    requestWorkflowCancellation(id);
    expect(() => throwIfWorkflowCancelled(id)).toThrowError("was cancelled");
  });

  it("yields control before the next autonomous decision", async () => {
    const id = runId();
    const checkpoint = yieldToWorkflowControlPlane(id);
    requestWorkflowCancellation(id);
    await expect(checkpoint).rejects.toSatisfy(isWorkflowCancelledError);
  });

  it("does not leak cancellation into a different workflow run", () => {
    const cancelled = runId();
    const active = runId();
    requestWorkflowCancellation(cancelled);
    expect(() => throwIfWorkflowCancelled(active)).not.toThrow();
  });
});
