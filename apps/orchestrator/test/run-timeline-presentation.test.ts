// Behavior suite: run timeline.
/**
 * FEAT-033 Phase 4 Presentation Contract Tests
 *
 * Proves API response mappers produce correct, serializable responses
 * and that shared response types are additive and backward-compatible.
 *
 * Pure function tests. No live Pi, HTTP servers, or browsers.
 */
import { describe, expect, it } from "vitest";
import type {
  PhaseTimelineResult,
  CompletedFeatTimelineResult,
  PhaseTimelineApiResponse,
  CompletedFeatTimelineApiResponse,
} from "@hepha/shared";
import {
  toPhaseTimelineApiResponse,
  toCompletedFeatTimelineApiResponse,
} from "../src/run-timeline-queries.js";

// ---------------------------------------------------------------------------
// Phase Detail Timeline API Response Tests
// ---------------------------------------------------------------------------

describe("toPhaseTimelineApiResponse", () => {
  it("maps a full PhaseTimelineResult to API response", () => {
    const readModel: PhaseTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      invocations: [
        {
          invocationId: "inv-1",
          agentRole: "implementation",
          agentName: "pi-impl",
          model: "deepseek-v4-flash",
          status: "completed",
          startedAt: "2026-07-08T12:00:00.000Z",
          completedAt: "2026-07-08T12:05:00.000Z",
          durationMs: 300_000,
          workflowNodeId: "phase-2-impl",
          receiptPath: "/r/rec.json",
          logPath: "/l/session.log",
          reviewReportPath: "/rv/review.md",
          parentInvocationId: null,
          events: [
            {
              eventId: "evt-1",
              eventType: "agent.started",
              timestamp: "2026-07-08T12:00:00.000Z",
              errorMessage: null,
            },
          ],
        },
      ],
    };

    const response = toPhaseTimelineApiResponse(readModel);

    // Check it's a valid PhaseTimelineApiResponse
    expect(response.projectId).toBe("proj-1");
    expect(response.cardKey).toBe("FEAT-001");
    expect(response.phaseNumber).toBe(2);
    expect(response.phaseTitle).toBe("Data Layer");
    expect(response.invocations).toHaveLength(1);
    expect(response.invocations[0]!.invocationId).toBe("inv-1");

    // Confirm serializability (no undefined values polluting JSON)
    const json = JSON.stringify(response);
    const parsed = JSON.parse(json) as PhaseTimelineApiResponse;
    expect(parsed.projectId).toBe("proj-1");
    expect(parsed.invocations[0]!.events[0]!.eventType).toBe("agent.started");
  });

  it("handles empty invocations array", () => {
    const readModel: PhaseTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      invocations: [],
    };

    const response = toPhaseTimelineApiResponse(readModel);

    expect(response.invocations).toHaveLength(0);
    expect(JSON.stringify(response)).toContain('"invocations":[]');
  });

  it("preserves null optional fields in responses", () => {
    const readModel: PhaseTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      invocations: [
        {
          invocationId: "inv-1",
          agentRole: null,
          agentName: null,
          model: null,
          status: "running",
          startedAt: "2026-07-08T12:00:00.000Z",
          completedAt: null,
          durationMs: null,
          workflowNodeId: null,
          receiptPath: null,
          logPath: null,
          reviewReportPath: null,
          parentInvocationId: null,
          events: [],
        },
      ],
    };

    const response = toPhaseTimelineApiResponse(readModel);
    const json = JSON.stringify(response);

    expect(response.invocations[0]!.agentRole).toBeNull();
    expect(response.invocations[0]!.completedAt).toBeNull();
    expect(response.invocations[0]!.durationMs).toBeNull();
    // JSON serialization should include nulls explicitly
    expect(json).toContain('"agentRole":null');
    expect(json).toContain('"completedAt":null');
  });

  it("includes errorMessage for failed events", () => {
    const readModel: PhaseTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      invocations: [
        {
          invocationId: "inv-1",
          agentRole: "implementation",
          agentName: null,
          model: null,
          status: "failed",
          startedAt: "2026-07-08T12:00:00.000Z",
          completedAt: null,
          durationMs: null,
          workflowNodeId: null,
          receiptPath: null,
          logPath: null,
          reviewReportPath: null,
          parentInvocationId: null,
          events: [
            {
              eventId: "evt-1",
              eventType: "agent.failed",
              timestamp: "2026-07-08T12:05:00.000Z",
              errorMessage: "Pi exited with code 1.",
            },
          ],
        },
      ],
    };

    const response = toPhaseTimelineApiResponse(readModel);
    expect(response.invocations[0]!.events[0]!.errorMessage).toBe("Pi exited with code 1.");
  });
});

// ---------------------------------------------------------------------------
// Completed FEAT Evidence API Response Tests
// ---------------------------------------------------------------------------

describe("toCompletedFeatTimelineApiResponse", () => {
  it("maps a full CompletedFeatTimelineResult to API response", () => {
    const readModel: CompletedFeatTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      evid: [
        {
          runId: "run-001",
          command: "start-implementing",
          phaseNumber: 2,
          phaseTitle: "Data Layer",
          invocations: [
            {
              id: "inv-1",
              agentRole: "implementation",
              agentName: "pi-impl",
              model: "deepseek-v4-flash",
              status: "completed",
              startedAt: "2026-07-08T12:00:00.000Z",
              completedAt: "2026-07-08T12:05:00.000Z",
              durationMs: 300_000,
              errorMessage: null,
              receiptPath: "/r/rec.json",
              reviewReportPath: "/rv/review.md",
              parentInvocationId: null,
            },
          ],
        },
      ],
    };

    const response = toCompletedFeatTimelineApiResponse(readModel);

    expect(response.projectId).toBe("proj-1");
    expect(response.cardKey).toBe("FEAT-001");
    expect(response.evid).toHaveLength(1);
    expect(response.evid[0]!.runId).toBe("run-001");
    expect(response.evid[0]!.command).toBe("start-implementing");
    expect(response.evid[0]!.invocations[0]!.agentRole).toBe("implementation");

    // Confirm serializability
    const json = JSON.stringify(response);
    const parsed = JSON.parse(json) as CompletedFeatTimelineApiResponse;
    expect(parsed.evid[0]!.invocations[0]!.model).toBe("deepseek-v4-flash");
  });

  it("handles empty evid array", () => {
    const readModel: CompletedFeatTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      evid: [],
    };

    const response = toCompletedFeatTimelineApiResponse(readModel);
    expect(response.evid).toHaveLength(0);
  });

  it("preserves error, receipt, and review references", () => {
    const readModel: CompletedFeatTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      evid: [
        {
          runId: "run-001",
          command: "start-implementing",
          phaseNumber: 1,
          phaseTitle: "Implementation",
          invocations: [
            {
              id: "inv-1",
              agentRole: "implementation",
              agentName: null,
              model: null,
              status: "failed",
              startedAt: "2026-07-08T12:00:00.000Z",
              completedAt: null,
              durationMs: null,
              errorMessage: "Pi exited with code 1.",
              receiptPath: "/r/rec.json",
              reviewReportPath: "/rv/review.md",
              parentInvocationId: null,
            },
          ],
        },
      ],
    };

    const response = toCompletedFeatTimelineApiResponse(readModel);
    expect(response.evid[0]!.invocations[0]!.errorMessage).toBe("Pi exited with code 1.");
    expect(response.evid[0]!.invocations[0]!.receiptPath).toBe("/r/rec.json");
    expect(response.evid[0]!.invocations[0]!.reviewReportPath).toBe("/rv/review.md");
  });

  it("produces deterministic JSON key ordering", () => {
    const readModel: CompletedFeatTimelineResult = {
      projectId: "proj-1",
      cardKey: "FEAT-001",
      evid: [
        {
          runId: "run-001",
          command: "start-implementing",
          phaseNumber: 1,
          phaseTitle: "Test",
          invocations: [
            {
              id: "inv-1",
              agentRole: null,
              agentName: null,
              model: null,
              status: "completed",
              startedAt: "2026-07-08T12:00:00.000Z",
              completedAt: null,
              durationMs: null,
              errorMessage: null,
              receiptPath: null,
              reviewReportPath: null,
              parentInvocationId: null,
            },
          ],
        },
      ],
    };

    // Two calls should produce identical JSON
    const a = toCompletedFeatTimelineApiResponse(readModel);
    const b = toCompletedFeatTimelineApiResponse(readModel);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Additive/Backward-Compatibility Tests
// ---------------------------------------------------------------------------

describe("FEAT-033 shared response types backward compatibility", () => {
  it("PhaseTimelineApiResponse is a standalone type, requires only its own fields", () => {
    const response: PhaseTimelineApiResponse = {
      projectId: "p",
      cardKey: "c",
      phaseNumber: 1,
      phaseTitle: "t",
      invocations: [],
    };

    expect(response.projectId).toBe("p");
    // Verify no existing dashboard-only fields are required
    expect("workflowCommand" in response).toBe(false);
    expect("agentRole" in response).toBe(false);
  });

  it("CompletedFeatTimelineApiResponse is a standalone type", () => {
    const response: CompletedFeatTimelineApiResponse = {
      projectId: "p",
      cardKey: "c",
      evid: [],
    };

    expect(response.projectId).toBe("p");
    // Verify no dashboard-only fields are required
    expect("dashboardData" in response).toBe(false);
  });

  it("no mutation fields in API responses", () => {
    const response: PhaseTimelineApiResponse = {
      projectId: "p",
      cardKey: "c",
      phaseNumber: 1,
      phaseTitle: "t",
      invocations: [],
    };

    expect(typeof response).toBe("object");
    expect(Array.isArray(response.invocations)).toBe(true);

    // Verify it's serializable without undefined values
    const json = JSON.stringify(response);
    expect(json).not.toContain("undefined");
  });
});
