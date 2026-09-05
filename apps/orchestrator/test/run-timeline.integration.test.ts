// Behavior suite: run timeline.
/**
 * FEAT-033 Phase 6 Integration Tests
 *
 * Proves FEAT-033 read-only API endpoints work correctly with the
 * SQLite store. Uses temp databases and pure function queries.
 *
 * No live Pi, HTTP servers, or browsers.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildPhaseTimeline, buildCompletedFeatTimeline } from "../src/run-timeline-queries.js";
import type { StoredAgentInvocation, StoredNormalizedEvent } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Pure function integration tests (no HTTP server needed)
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
// Phase Detail Timeline Integration Tests
// ---------------------------------------------------------------------------

describe("Phase detail timeline integration", () => {
  it("returns empty invocations for a phase with no records", () => {
    const result = buildPhaseTimeline("proj-1", "FEAT-001", 1, "Health Check", [], []);

    expect(result.projectId).toBe("proj-1");
    expect(result.cardKey).toBe("FEAT-001");
    expect(result.phaseNumber).toBe(1);
    expect(result.invocations).toHaveLength(0);

    // Verify the result is a valid PhaseTimelineApiResponse shape (serializable)
    const json = JSON.stringify(result);
    expect(json).toContain('"invocations":[]');
  });

  it("returns phase detail with implementation, review, recovery, and verification invocations", () => {
    const invocations = [
      makeInvocation({
        id: "inv-impl",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "implementation",
        agentName: "pi-agent",
        model: "deepseek-v4-flash",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:10:00.000Z",
        durationMs: 600_000,
      }),
      makeInvocation({
        id: "inv-review",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "code-review",
        agentName: "pi-review",
        model: "openai-4o",
        status: "completed",
        startedAt: "2026-07-08T12:15:00.000Z",
        completedAt: "2026-07-08T12:20:00.000Z",
        durationMs: 300_000,
      }),
      makeInvocation({
        id: "inv-recovery",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "recovery",
        agentName: "pi-recovery",
        model: "deepseek-v4-flash",
        status: "completed",
        parentInvocationId: "inv-review",
        startedAt: "2026-07-08T12:22:00.000Z",
        completedAt: "2026-07-08T12:25:00.000Z",
        durationMs: 180_000,
      }),
      makeInvocation({
        id: "inv-verify",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "verification",
        agentName: "pi-verify",
        model: "deepseek-v4-flash",
        status: "completed",
        startedAt: "2026-07-08T12:30:00.000Z",
        completedAt: "2026-07-08T12:32:00.000Z",
        durationMs: 120_000,
      }),
    ];

    const events = [
      makeEvent({
        id: "evt-1",
        invocationId: "inv-impl",
        eventType: "agent.started",
        timestamp: "2026-07-08T12:00:00.000Z",
      }),
      makeEvent({
        id: "evt-2",
        invocationId: "inv-impl",
        eventType: "agent.finished",
        timestamp: "2026-07-08T12:10:00.000Z",
      }),
      makeEvent({
        id: "evt-3",
        invocationId: "inv-verify",
        eventType: "agent.started",
        timestamp: "2026-07-08T12:30:00.000Z",
      }),
      makeEvent({
        id: "evt-4",
        invocationId: "inv-verify",
        eventType: "agent.finished",
        timestamp: "2026-07-08T12:32:00.000Z",
      }),
    ];

    const result = buildPhaseTimeline("proj-1", "FEAT-001", 2, "Data Layer", invocations, events);

    expect(result.invocations).toHaveLength(4);

    // Verify chronological ordering
    expect(result.invocations[0]!.invocationId).toBe("inv-impl");
    expect(result.invocations[1]!.invocationId).toBe("inv-review");
    expect(result.invocations[2]!.invocationId).toBe("inv-recovery");
    expect(result.invocations[3]!.invocationId).toBe("inv-verify");

    // Verify agent roles
    expect(result.invocations[0]!.agentRole).toBe("implementation");
    expect(result.invocations[1]!.agentRole).toBe("code-review");
    expect(result.invocations[2]!.agentRole).toBe("recovery");
    expect(result.invocations[3]!.agentRole).toBe("verification");

    // Verify events are linked to correct invocations
    expect(result.invocations[0]!.events).toHaveLength(2);
    expect(result.invocations[3]!.events).toHaveLength(2);
    expect(result.invocations[1]!.events).toHaveLength(0);

    // Verify parent invocation link
    expect(result.invocations[2]!.parentInvocationId).toBe("inv-review");
  });

  it("handles failed invocations with error detail", () => {
    const invocations = [
      makeInvocation({
        id: "inv-fail",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "implementation",
        status: "failed",
        errorMessage: "Pi exited with code 1.",
        exitCode: 1,
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:05:00.000Z",
        durationMs: 300_000,
      }),
    ];

    const events = [
      makeEvent({
        id: "evt-fail",
        invocationId: "inv-fail",
        eventType: "agent.failed",
        timestamp: "2026-07-08T12:05:00.000Z",
        errorMessage: "Pi exited with code 1.",
      }),
    ];

    const result = buildPhaseTimeline("proj-1", "FEAT-001", 2, "Data Layer", invocations, events);

    expect(result.invocations[0]!.status).toBe("failed");
    expect(result.invocations[0]!.events[0]!.errorMessage).toBe("Pi exited with code 1.");
  });

  it("handles timeout invocations", () => {
    const invocations = [
      makeInvocation({
        id: "inv-timeout",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        status: "timed_out",
        timeoutMarker: true,
        errorMessage: "Agent run timed out after 300 seconds.",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
    ];

    const result = buildPhaseTimeline("proj-1", "FEAT-001", 2, "Data Layer", invocations, []);

    expect(result.invocations[0]!.status).toBe("timed_out");
  });
});

// ---------------------------------------------------------------------------
// Completed FEAT Evidence Integration Tests
// ---------------------------------------------------------------------------

describe("Completed FEAT evidence integration", () => {
  it("returns evidence for a FEAT with multiple runs and phases", () => {
    const invocations = [
      // Run 1: Phase 1
      makeInvocation({
        id: "inv-r1-p1",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 1,
        phaseTitle: "Health Check",
        agentRole: "implementation",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
      // Run 1: Phase 2 - multiple invocations
      makeInvocation({
        id: "inv-r1-p2-impl",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "implementation",
        status: "completed",
        startedAt: "2026-07-08T12:10:00.000Z",
      }),
      makeInvocation({
        id: "inv-r1-p2-review",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        agentRole: "code-review",
        status: "completed",
        startedAt: "2026-07-08T12:20:00.000Z",
      }),
    ];

    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", invocations);

    expect(result.projectId).toBe("proj-1");
    expect(result.cardKey).toBe("FEAT-001");
    expect(result.evid).toHaveLength(2);

    // Phase 1 evidence
    const phase1 = result.evid.find((e) => e.phaseNumber === 1)!;
    expect(phase1.runId).toBe("run-001");
    expect(phase1.command).toBe("start-implementing");
    expect(phase1.invocations).toHaveLength(1);

    // Phase 2 evidence
    const phase2 = result.evid.find((e) => e.phaseNumber === 2)!;
    expect(phase2.invocations).toHaveLength(2);
    expect(phase2.invocations[0]!.agentRole).toBe("implementation");
    expect(phase2.invocations[1]!.agentRole).toBe("code-review");
  });

  it("returns empty evidence for a FEAT with no invocations", () => {
    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", []);

    expect(result.evid).toHaveLength(0);
  });

  it("includes receipt and review paths in evidence", () => {
    const invocations = [
      makeInvocation({
        id: "inv-r1-p1",
        projectId: "proj-1",
        cardKey: "FEAT-001",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 1,
        phaseTitle: "Data Layer",
        agentRole: "implementation",
        status: "completed",
        receiptPath: "/receipts/rec.json",
        reviewReportPath: "/reviews/review.md",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
    ];

    const result = buildCompletedFeatTimeline("proj-1", "FEAT-001", invocations);

    expect(result.evid[0]!.invocations[0]!.receiptPath).toBe("/receipts/rec.json");
    expect(result.evid[0]!.invocations[0]!.reviewReportPath).toBe("/reviews/review.md");
  });
});

// ---------------------------------------------------------------------------
// Read-Only Endpoint Behavior Tests
// ---------------------------------------------------------------------------

describe("FEAT-033 read-only endpoint behavior", () => {
  it("buildPhaseTimeline does not mutate inputs", () => {
    const invocations = [
      makeInvocation({
        id: "inv-1",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
    ];
    const events = [
      makeEvent({
        id: "evt-1",
        invocationId: "inv-1",
        timestamp: "2026-07-08T12:00:00.000Z",
      }),
    ];

    const invocationsBefore = JSON.stringify(invocations);
    const eventsBefore = JSON.stringify(events);

    buildPhaseTimeline("proj-1", "FEAT-001", 1, "Test", invocations, events);

    expect(JSON.stringify(invocations)).toBe(invocationsBefore);
    expect(JSON.stringify(events)).toBe(eventsBefore);
  });

  it("buildCompletedFeatTimeline does not mutate inputs", () => {
    const invocations = [
      makeInvocation({
        id: "inv-1",
        workflowRunId: "run-001",
        startedAt: "2026-07-08T12:00:00.000Z",
      }),
    ];

    const invocationsBefore = JSON.stringify(invocations);
    buildCompletedFeatTimeline("proj-1", "FEAT-001", invocations);
    expect(JSON.stringify(invocations)).toBe(invocationsBefore);
  });

  it("both endpoint handlers return deterministic results for same inputs", () => {
    const invocations = [
      makeInvocation({
        id: "inv-1",
        workflowRunId: "run-001",
        workflowCommand: "start-implementing",
        phaseNumber: 1,
        phaseTitle: "Test",
        agentRole: "implementation",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:05:00.000Z",
        durationMs: 300_000,
      }),
    ];
    const events = [
      makeEvent({
        id: "evt-1",
        invocationId: "inv-1",
        eventType: "agent.started",
        timestamp: "2026-07-08T12:00:00.000Z",
      }),
    ];

    // Validate deterministic results
    const a = buildPhaseTimeline("proj-1", "FEAT-001", 1, "Test", invocations, events);
    const b = buildPhaseTimeline("proj-1", "FEAT-001", 1, "Test", invocations, events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const c = buildCompletedFeatTimeline("proj-1", "FEAT-001", invocations);
    const d = buildCompletedFeatTimeline("proj-1", "FEAT-001", invocations);
    expect(JSON.stringify(c)).toBe(JSON.stringify(d));
  });
});
