// Behavior suite: run timeline.
/**
 * FEAT-033 Phase 3 Business Logic Tests
 *
 * Proves pure read-model behavior: phase detail timeline builder,
 * completed FEAT evidence builder, filter helpers, and duration computation.
 *
 * Pure function tests. No live Pi, HTTP servers, or browsers.
 */
import { describe, expect, it } from "vitest";
import type {
  StoredAgentInvocation,
  StoredNormalizedEvent,
} from "@hepha/shared";
import {
  buildPhaseTimeline,
  buildCompletedFeatTimeline,
  filterInvocations,
  filterEvents,
  computeDurationMs,
} from "../src/run-timeline-queries.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInvocation(overrides: Partial<StoredAgentInvocation> = {}): StoredAgentInvocation {
  const now = new Date().toISOString();

  return {
    id: "inv-test",
    projectId: "test-project",
    cardKey: null,
    workflowRunId: null,
    workflowCommand: null,
    workflowNodeId: null,
    phaseNumber: null,
    phaseTitle: null,
    agentRole: null,
    agentName: null,
    model: null,
    provider: null,
    status: "running",
    exitCode: null,
    errorMessage: null,
    timeoutMarker: false,
    parentInvocationId: null,
    logPath: null,
    receiptPath: null,
    reviewReportPath: null,
    rawRefJson: null,
    startedAt: now,
    completedAt: null,
    durationMs: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<StoredNormalizedEvent> = {}): StoredNormalizedEvent {
  const now = new Date().toISOString();

  return {
    id: "evt-test",
    invocationId: null,
    projectId: "test-project",
    cardKey: null,
    workflowRunId: null,
    eventType: "agent.started",
    timestamp: now,
    workflowCommand: null,
    workflowNode: null,
    phase: null,
    agentRole: null,
    model: null,
    pid: null,
    logPath: null,
    receiptPath: null,
    rawRefJson: null,
    errorMessage: null,
    exitCode: null,
    metadataJson: null,
    createdAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase Timeline Builder Tests
// ---------------------------------------------------------------------------

describe("buildPhaseTimeline", () => {
  it("returns empty invocations when no records exist", () => {
    const result = buildPhaseTimeline("proj-1", "FEAT-001", 2, "Data Layer", [], []);

    expect(result.projectId).toBe("proj-1");
    expect(result.cardKey).toBe("FEAT-001");
    expect(result.phaseNumber).toBe(2);
    expect(result.phaseTitle).toBe("Data Layer");
    expect(result.invocations).toHaveLength(0);
  });

  it("returns single invocation without events", () => {
    const inv = makeInvocation({
      id: "inv-1",
      agentRole: "implementation",
      agentName: "pi-agent",
      model: "deepseek-v4-flash",
      status: "completed",
      startedAt: "2026-07-08T12:00:00.000Z",
      completedAt: "2026-07-08T12:05:00.000Z",
      durationMs: 300_000,
    });

    const result = buildPhaseTimeline(
      "proj-1",
      "FEAT-001",
      2,
      "Data Layer",
      [inv],
      [],
    );

    expect(result.invocations).toHaveLength(1);
    expect(result.invocations[0]!.invocationId).toBe("inv-1");
    expect(result.invocations[0]!.agentRole).toBe("implementation");
    expect(result.invocations[0]!.events).toHaveLength(0);
  });

  it("includes linked events for each invocation", () => {
    const inv = makeInvocation({
      id: "inv-1",
      agentRole: "implementation",
      status: "completed",
      startedAt: "2026-07-08T12:00:00.000Z",
    });

    const events = [
      makeEvent({
        id: "evt-1",
        invocationId: "inv-1",
        eventType: "agent.started",
        timestamp: "2026-07-08T12:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        invocationId: "inv-1",
        eventType: "agent.finished",
        timestamp: "2026-07-08T12:05:00.000Z",
      }),
    ];

    const result = buildPhaseTimeline(
      "proj-1",
      "FEAT-001",
      2,
      "Data Layer",
      [inv],
      events,
    );

    expect(result.invocations).toHaveLength(1);
    expect(result.invocations[0]!.events).toHaveLength(2);
    expect(result.invocations[0]!.events[0]!.eventType).toBe("agent.started");
    expect(result.invocations[0]!.events[1]!.eventType).toBe("agent.finished");
  });

  it("returns multiple invocations in chronological order", () => {
    const invs = [
      makeInvocation({
        id: "inv-1",
        agentRole: "implementation",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
      makeInvocation({
        id: "inv-2",
        agentRole: "code-review",
        startedAt: "2026-07-08T12:15:00.000Z",
      }),
      makeInvocation({
        id: "inv-3",
        agentRole: "verification",
        startedAt: "2026-07-08T12:30:00.000Z",
      }),
    ];

    const result = buildPhaseTimeline(
      "proj-1",
      "FEAT-001",
      2,
      "Data Layer",
      invs,
      [],
    );

    expect(result.invocations).toHaveLength(3);
    expect(result.invocations[0]!.invocationId).toBe("inv-1");
    expect(result.invocations[1]!.invocationId).toBe("inv-2");
    expect(result.invocations[2]!.invocationId).toBe("inv-3");
  });

  it("preserves all optional fields when available", () => {
    const inv = makeInvocation({
      id: "inv-1",
      agentRole: "implementation",
      agentName: "pi-impl",
      model: "deepseek-v4-flash",
      workflowNodeId: "phase-2-implementation",
      receiptPath: "/receipts/rec.json",
      logPath: "/logs/session.log",
      reviewReportPath: "/reviews/review.md",
      parentInvocationId: "inv-parent",
      status: "failed",
      startedAt: "2026-07-08T12:00:00.000Z",
      completedAt: "2026-07-08T12:05:00.000Z",
      durationMs: 300_000,
    });

    const result = buildPhaseTimeline(
      "proj-1",
      "FEAT-001",
      2,
      "Data Layer",
      [inv],
      [],
    );

    const entry = result.invocations[0]!;
    expect(entry.workflowNodeId).toBe("phase-2-implementation");
    expect(entry.receiptPath).toBe("/receipts/rec.json");
    expect(entry.logPath).toBe("/logs/session.log");
    expect(entry.reviewReportPath).toBe("/reviews/review.md");
    expect(entry.parentInvocationId).toBe("inv-parent");
    expect(entry.status).toBe("failed");
    expect(entry.durationMs).toBe(300_000);
  });

  it("handles sparse invocations with null optional fields", () => {
    const inv = makeInvocation({
      id: "inv-sparse",
      agentRole: null,
      agentName: null,
      model: null,
      workflowNodeId: null,
      receiptPath: null,
      logPath: null,
      reviewReportPath: null,
      parentInvocationId: null,
      completedAt: null,
      durationMs: null,
      status: "running",
    });

    const result = buildPhaseTimeline(
      "proj-1",
      "FEAT-001",
      2,
      "Data Layer",
      [inv],
      [],
    );

    const entry = result.invocations[0]!;
    expect(entry.agentRole).toBeNull();
    expect(entry.agentName).toBeNull();
    expect(entry.model).toBeNull();
    expect(entry.completedAt).toBeNull();
    expect(entry.durationMs).toBeNull();
    expect(entry.parentInvocationId).toBeNull();
  });

  it("only includes events for the correct invocation", () => {
    const invs = [
      makeInvocation({ id: "inv-1", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "inv-2", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    const events = [
      makeEvent({ id: "evt-1", invocationId: "inv-1", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" }),
      makeEvent({ id: "evt-2", invocationId: "inv-2", eventType: "agent.started", timestamp: "2026-07-08T12:10:00.000Z" }),
      makeEvent({ id: "evt-3", invocationId: "inv-1", eventType: "agent.finished", timestamp: "2026-07-08T12:05:00.000Z" }),
    ];

    const result = buildPhaseTimeline(
      "proj-1",
      "FEAT-001",
      2,
      "Data Layer",
      invs,
      events,
    );

    expect(result.invocations[0]!.events).toHaveLength(2);
    expect(result.invocations[1]!.events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Completed FEAT Evidence Builder Tests
// ---------------------------------------------------------------------------

describe("buildCompletedFeatTimeline", () => {
  it("returns empty evid when no invocations exist", () => {
    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", []);

    expect(result.projectId).toBe("proj-1");
    expect(result.cardKey).toBe("FEAT-001");
    expect(result.evid).toHaveLength(0);
  });

  it("groups invocations by workflow run and phase", () => {
    const invs = [
      makeInvocation({
        id: "inv-1",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 1,
        phaseTitle: "Health Check",
        agentRole: "implementation",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
      makeInvocation({
        id: "inv-2",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "implementation",
        status: "completed",
        startedAt: "2026-07-08T12:10:00.000Z",
      }),
      makeInvocation({
        id: "inv-3",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "code-review",
        status: "completed",
        startedAt: "2026-07-08T12:20:00.000Z",
      }),
    ];

    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", invs);

    expect(result.evid).toHaveLength(2);

    // Phase 1 entry
    const phase1 = result.evid.find((e) => e.phaseNumber === 1)!;
    expect(phase1.runId).toBe("run-001");
    expect(phase1.command).toBe("start-implementing");
    expect(phase1.invocations).toHaveLength(1);

    // Phase 2 entry
    const phase2 = result.evid.find((e) => e.phaseNumber === 2)!;
    expect(phase2.invocations).toHaveLength(2);
    expect(phase2.invocations[0]!.agentRole).toBe("implementation");
    expect(phase2.invocations[1]!.agentRole).toBe("code-review");
  });

  it("handles invocations without workflow run id", () => {
    const invs = [
      makeInvocation({
        id: "inv-1",
        workflowRunId: null,
        phaseNumber: 1,
        phaseTitle: "Setup",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
    ];

    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", invs);

    expect(result.evid).toHaveLength(1);
    expect(result.evid[0]!.runId).toBe("unknown");
  });

  it("includes error, receipt, and review report references", () => {
    const invs = [
      makeInvocation({
        id: "inv-1",
        workflowRunId: "run-001",
        phaseNumber: 1,
        phaseTitle: "Implementation",
        status: "failed",
        errorMessage: "Pi exited with code 1.",
        receiptPath: "/receipts/rec.json",
        reviewReportPath: "/reviews/review.md",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
    ];

    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", invs);
    const entry = result.evid[0]!.invocations[0]!;

    expect(entry.errorMessage).toBe("Pi exited with code 1.");
    expect(entry.receiptPath).toBe("/receipts/rec.json");
    expect(entry.reviewReportPath).toBe("/reviews/review.md");
  });
});

// ---------------------------------------------------------------------------
// Filter Helpers Tests
// ---------------------------------------------------------------------------

describe("filterInvocations", () => {
  it("returns all invocations when no filter options are provided", () => {
    const invs = [
      makeInvocation({ id: "a", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    expect(filterInvocations(invs, {})).toHaveLength(2);
  });

  it("filters by agentRole", () => {
    const invs = [
      makeInvocation({ id: "a", agentRole: "implementation", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", agentRole: "code-review", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    const result = filterInvocations(invs, { agentRole: "code-review" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b");
  });

  it("filters by status", () => {
    const invs = [
      makeInvocation({ id: "a", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", status: "failed", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    const result = filterInvocations(invs, { status: "failed" });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("failed");
  });

  it("filters by model", () => {
    const invs = [
      makeInvocation({ id: "a", model: "deepseek-v4-flash", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", model: "openai-4o", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    const result = filterInvocations(invs, { model: "openai-4o" });
    expect(result).toHaveLength(1);
    expect(result[0]!.model).toBe("openai-4o");
  });

  it("filters by time range", () => {
    const invs = [
      makeInvocation({ id: "a", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", startedAt: "2026-07-08T12:10:00.000Z" }),
      makeInvocation({ id: "c", startedAt: "2026-07-08T12:30:00.000Z" }),
    ];

    const result = filterInvocations(invs, {
      startedAfter: "2026-07-08T12:05:00.000Z",
      startedBefore: "2026-07-08T12:25:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b");
  });

  it("filters by parentInvocationId null", () => {
    const invs = [
      makeInvocation({ id: "a", parentInvocationId: null, startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", parentInvocationId: "inv-parent", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    const result = filterInvocations(invs, { parentInvocationId: null });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a");
  });

  it("filters by parentInvocationId value", () => {
    const invs = [
      makeInvocation({ id: "a", parentInvocationId: null, startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", parentInvocationId: "inv-parent", startedAt: "2026-07-08T12:10:00.000Z" }),
    ];

    const result = filterInvocations(invs, { parentInvocationId: "inv-parent" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("b");
  });

  it("combines multiple filter criteria", () => {
    const invs = [
      makeInvocation({ id: "a", agentRole: "implementation", model: "deepseek-v4-flash", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" }),
      makeInvocation({ id: "b", agentRole: "code-review", model: "openai-4o", status: "completed", startedAt: "2026-07-08T12:10:00.000Z" }),
      makeInvocation({ id: "c", agentRole: "implementation", model: "deepseek-v4-flash", status: "running", startedAt: "2026-07-08T12:20:00.000Z" }),
    ];

    const result = filterInvocations(invs, {
      agentRole: "implementation",
      model: "deepseek-v4-flash",
      status: "completed",
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a");
  });

  it("returns empty array when no invocations match", () => {
    const invs = [
      makeInvocation({ id: "a", agentRole: "implementation", startedAt: "2026-07-08T12:00:00.000Z" }),
    ];

    const result = filterInvocations(invs, { agentRole: "code-review" });
    expect(result).toHaveLength(0);
  });
});

describe("filterEvents", () => {
  const events = [
    makeEvent({ id: "e1", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" }),
    makeEvent({ id: "e2", eventType: "agent.finished", timestamp: "2026-07-08T12:05:00.000Z" }),
    makeEvent({ id: "e3", eventType: "agent.failed", timestamp: "2026-07-08T12:10:00.000Z" }),
  ];

  it("returns all events when no filter options are provided", () => {
    expect(filterEvents(events, {})).toHaveLength(3);
  });

  it("filters by eventType", () => {
    const result = filterEvents(events, { eventType: "agent.finished" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("e2");
  });

  it("filters by time range", () => {
    const result = filterEvents(events, {
      startedAfter: "2026-07-08T12:02:00.000Z",
      startedBefore: "2026-07-08T12:08:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("e2");
  });

  it("filters by invocationId", () => {
    const evts = [
      makeEvent({ id: "e1", invocationId: "inv-1", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" }),
      makeEvent({ id: "e2", invocationId: "inv-2", eventType: "agent.started", timestamp: "2026-07-08T12:10:00.000Z" }),
    ];

    const result = filterEvents(evts, { invocationId: "inv-1" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("e1");
  });

  it("returns empty when no events match", () => {
    const result = filterEvents(events, { eventType: "agent.timeout" });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duration Computation Tests
// ---------------------------------------------------------------------------

describe("computeDurationMs", () => {
  it("computes duration between two ISO timestamps", () => {
    const duration = computeDurationMs(
      "2026-07-08T12:00:00.000Z",
      "2026-07-08T12:05:00.000Z",
    );

    expect(duration).toBe(300_000);
  });

  it("returns null when completedAt is null", () => {
    const duration = computeDurationMs("2026-07-08T12:00:00.000Z", null);
    expect(duration).toBeNull();
  });

  it("returns null for invalid timestamps", () => {
    const duration = computeDurationMs("invalid", "2026-07-08T12:05:00.000Z");
    expect(duration).toBeNull();
  });

  it("returns 0 for identical timestamps", () => {
    const duration = computeDurationMs(
      "2026-07-08T12:00:00.000Z",
      "2026-07-08T12:00:00.000Z",
    );

    expect(duration).toBe(0);
  });
});
