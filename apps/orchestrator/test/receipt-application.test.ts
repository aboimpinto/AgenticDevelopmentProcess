import type { StoredAgentInvocation } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  readReceiptDetail,
  searchReceiptEvidence,
  type ReceiptApplicationDependencies,
} from "../src/application/receipts/receipt-application.js";

function invocation(overrides: Partial<StoredAgentInvocation> = {}): StoredAgentInvocation {
  return {
    agentName: "worker",
    agentRole: "implementation",
    cardKey: "CARD-1",
    completedAt: "2026-07-21T10:01:00.000Z",
    createdAt: "2026-07-21T10:00:00.000Z",
    durationMs: 60_000,
    errorMessage: null,
    exitCode: 0,
    id: "invocation-1",
    logPath: null,
    model: "model",
    parentInvocationId: null,
    phaseNumber: 2,
    phaseTitle: "Random title",
    projectId: "project",
    provider: "provider",
    rawRefJson: null,
    receiptPath: null,
    reviewReportPath: null,
    startedAt: "2026-07-21T10:00:00.000Z",
    status: "completed",
    timeoutMarker: false,
    updatedAt: "2026-07-21T10:01:00.000Z",
    workflowCommand: "Continue Implementing",
    workflowNodeId: "node",
    workflowRunId: "run-1",
    ...overrides,
  };
}

function dependencies(records = [invocation()]): ReceiptApplicationDependencies {
  return { queryInvocations: vi.fn(async () => records) };
}

describe("receipt application", () => {
  it("projects invocation evidence when no receipt artifacts are loaded", async () => {
    const deps = dependencies();

    const result = await searchReceiptEvidence({
      command: "continue", projectId: "project",
    }, deps);

    expect(deps.queryInvocations).toHaveBeenCalledWith({ projectId: "project" });
    expect(result).toEqual({
      projectId: "project",
      results: [expect.objectContaining({
        command: "Continue Implementing",
        phaseTitle: "Random title",
        receiptId: "invocation-1",
        runId: "run-1",
      })],
      totalCount: 1,
    });
  });

  it("limits the invocation fallback to fifty entries", async () => {
    const deps = dependencies(Array.from({ length: 60 }, (_, index) => invocation({ id: `inv-${index}` })));

    const result = await searchReceiptEvidence({ projectId: "project" }, deps);

    expect(result.results).toHaveLength(50);
    expect(result.totalCount).toBe(50);
  });

  it("returns not-found detail when no invocation matches the identity", async () => {
    const result = await readReceiptDetail(
      { projectId: "project", receiptId: "missing" }, dependencies([]),
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual(expect.objectContaining({ runId: "missing", status: "not_found" }));
  });

  it("builds receipt detail from an invocation id or workflow run id", async () => {
    const byId = await readReceiptDetail(
      { projectId: "project", receiptId: "invocation-1" }, dependencies(),
    );
    const byRun = await readReceiptDetail(
      { projectId: "project", receiptId: "run-1" }, dependencies(),
    );

    for (const result of [byId, byRun]) {
      expect(result.status).toBe(200);
      expect(result.body).toEqual(expect.objectContaining({
        cardKey: "CARD-1",
        runId: "run-1",
        status: "complete",
      }));
    }
  });
});
