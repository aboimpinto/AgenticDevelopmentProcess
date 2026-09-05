import type { StoredAgentInvocation, StoredNormalizedEvent } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  readCompletedTimeline,
  readPhaseTimeline,
  type TimelineApplicationDependencies,
} from "../src/application/timeline/timeline-application.js";

function invocation(overrides: Partial<StoredAgentInvocation> = {}): StoredAgentInvocation {
  return {
    agentName: "worker",
    agentRole: "implementation",
    cardKey: "CARD-1",
    completedAt: null,
    createdAt: "2026-07-21T10:00:00.000Z",
    durationMs: null,
    errorMessage: null,
    exitCode: null,
    id: "invocation-1",
    logPath: null,
    model: "model",
    parentInvocationId: null,
    phaseNumber: 4,
    phaseTitle: "Arbitrary phase title",
    projectId: "project",
    provider: "provider",
    rawRefJson: null,
    receiptPath: null,
    reviewReportPath: null,
    startedAt: "2026-07-21T10:00:00.000Z",
    status: "running",
    timeoutMarker: false,
    updatedAt: "2026-07-21T10:00:00.000Z",
    workflowCommand: "Continue Implementing",
    workflowNodeId: null,
    workflowRunId: "run-1",
    ...overrides,
  };
}

function event(): StoredNormalizedEvent {
  return {
    agentRole: null,
    cardKey: "CARD-1",
    createdAt: "2026-07-21T10:00:01.000Z",
    errorMessage: null,
    eventType: "agent.started",
    exitCode: null,
    id: "event-1",
    invocationId: "invocation-1",
    logPath: null,
    metadataJson: null,
    model: null,
    phase: null,
    pid: null,
    projectId: "project",
    rawRefJson: null,
    receiptPath: null,
    timestamp: "2026-07-21T10:00:01.000Z",
    workflowCommand: null,
    workflowNode: null,
    workflowRunId: "run-1",
  };
}

function dependencies(): TimelineApplicationDependencies {
  return {
    queryEvents: vi.fn(async () => [event()]),
    queryInvocations: vi.fn(async () => [invocation()]),
  };
}

describe("timeline application", () => {
  it("loads every invocation event and preserves the stored phase title", async () => {
    const deps = dependencies();

    const result = await readPhaseTimeline(
      { cardKey: "CARD-1", phaseNumber: 4, projectId: "project" }, deps,
    );

    expect(deps.queryInvocations).toHaveBeenCalledWith({
      cardKey: "CARD-1", phaseNumber: 4, projectId: "project",
    });
    expect(deps.queryEvents).toHaveBeenCalledWith({
      cardKey: "CARD-1", invocationId: "invocation-1", projectId: "project",
    });
    expect(result).toEqual(expect.objectContaining({
      cardKey: "CARD-1",
      phaseNumber: 4,
      phaseTitle: "Arbitrary phase title",
    }));
    expect(result.invocations[0]?.events).toEqual([
      expect.objectContaining({ eventId: "event-1" }),
    ]);
  });

  it("uses the generic numbered title when a phase has no invocations", async () => {
    const deps = dependencies();
    vi.mocked(deps.queryInvocations).mockResolvedValue([]);

    await expect(readPhaseTimeline(
      { cardKey: "CARD-1", phaseNumber: 9, projectId: "project" }, deps,
    )).resolves.toEqual(expect.objectContaining({ phaseTitle: "Phase 9", invocations: [] }));
    expect(deps.queryEvents).not.toHaveBeenCalled();
  });

  it("projects the completed feature timeline from all card invocations", async () => {
    const deps = dependencies();

    const result = await readCompletedTimeline(
      { cardKey: "CARD-1", projectId: "project" }, deps,
    );

    expect(deps.queryInvocations).toHaveBeenCalledWith({ cardKey: "CARD-1", projectId: "project" });
    expect(result).toEqual(expect.objectContaining({
      cardKey: "CARD-1",
      evid: [expect.objectContaining({ phaseNumber: 4, phaseTitle: "Arbitrary phase title" })],
      projectId: "project",
    }));
  });
});
