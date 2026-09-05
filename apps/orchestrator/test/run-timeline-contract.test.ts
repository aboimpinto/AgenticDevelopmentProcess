// Behavior suite: run timeline.
/**
 * FEAT-033 Phase 2 Data Layer Tests
 *
 * Proves FEAT-033 data contracts: type-level definitions, serialization,
 * sparse/full records, migration contract, and backward compatibility.
 *
 * Pure type and value tests. No live Pi, HTTP servers, or browsers.
 */
import { describe, expect, it } from "vitest";
import type {
  AgentInvocationRecord,
  NormalizedEventRecord,
  StoredAgentInvocation,
  StoredNormalizedEvent,
  InvocationFilter,
  EventFilter,
  AgentInvocationStatus,
  NormalizedEventName,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Type union tests
// ---------------------------------------------------------------------------

describe("FEAT-033 AgentInvocationStatus union", () => {
  it("defines all four invocation status values", () => {
    const statuses: readonly AgentInvocationStatus[] = [
      "running",
      "completed",
      "failed",
      "timed_out",
    ];

    expect(statuses).toContain("running");
    expect(statuses).toContain("completed");
    expect(statuses).toContain("failed");
    expect(statuses).toContain("timed_out");
    expect(statuses).toHaveLength(4);
  });
});

describe("FEAT-033 NormalizedEventName reuse", () => {
  it("uses the normalized-event transport lifecycle names", () => {
    const names: readonly NormalizedEventName[] = [
      "agent.started",
      "agent.finished",
      "agent.failed",
      "agent.timeout",
    ];

    expect(names).toContain("agent.started");
    expect(names).toContain("agent.finished");
    expect(names).toContain("agent.failed");
    expect(names).toContain("agent.timeout");
    expect(names).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// AgentInvocationRecord serialization tests
// ---------------------------------------------------------------------------

describe("FEAT-033 AgentInvocationRecord contract", () => {
  it("creates a fully populated agent invocation record", () => {
    const record: AgentInvocationRecord = {
      id: "inv-001",
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      workflowCommand: "start-implementing",
      workflowNodeId: "phase-2",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      agentRole: "implementation",
      agentName: "pi-agent-1",
      model: "deepseek-v4-flash",
      provider: "deepseek",
      status: "running",
      parentInvocationId: undefined,
      logPath: "/tmp/hepha/logs/session-abc.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec-xyz.json",
      startedAt: "2026-07-08T12:00:00.000Z",
    };

    expect(record.id).toBe("inv-001");
    expect(record.projectId).toBe("test-project");
    expect(record.cardKey).toBe("FEAT-033");
    expect(record.workflowRunId).toBe("run-001");
    expect(record.workflowCommand).toBe("start-implementing");
    expect(record.workflowNodeId).toBe("phase-2");
    expect(record.phaseNumber).toBe(2);
    expect(record.phaseTitle).toBe("Data Layer");
    expect(record.agentRole).toBe("implementation");
    expect(record.agentName).toBe("pi-agent-1");
    expect(record.model).toBe("deepseek-v4-flash");
    expect(record.provider).toBe("deepseek");
    expect(record.status).toBe("running");
    expect(record.startedAt).toBe("2026-07-08T12:00:00.000Z");
  });

  it("creates a minimal sparse invocation record", () => {
    const record: AgentInvocationRecord = {
      id: "inv-002",
      projectId: "test-project",
      status: "running",
      startedAt: "2026-07-08T12:00:00.000Z",
    };

    // Only required fields present; all optional fields are undefined
    expect(record.id).toBe("inv-002");
    expect(record.projectId).toBe("test-project");
    expect(record.status).toBe("running");
    expect(record.startedAt).toBe("2026-07-08T12:00:00.000Z");
    expect(record.cardKey).toBeUndefined();
    expect(record.workflowRunId).toBeUndefined();
    expect(record.workflowCommand).toBeUndefined();
    expect(record.workflowNodeId).toBeUndefined();
    expect(record.phaseNumber).toBeUndefined();
    expect(record.phaseTitle).toBeUndefined();
    expect(record.agentRole).toBeUndefined();
    expect(record.agentName).toBeUndefined();
    expect(record.model).toBeUndefined();
    expect(record.provider).toBeUndefined();
    expect(record.exitCode).toBeUndefined();
    expect(record.errorMessage).toBeUndefined();
    expect(record.timeoutMarker).toBeUndefined();
    expect(record.parentInvocationId).toBeUndefined();
    expect(record.logPath).toBeUndefined();
    expect(record.receiptPath).toBeUndefined();
    expect(record.reviewReportPath).toBeUndefined();
    expect(record.rawRefJson).toBeUndefined();
    expect(record.completedAt).toBeUndefined();
    expect(record.durationMs).toBeUndefined();
  });

  it("creates a completed invocation record with full metadata", () => {
    const record: AgentInvocationRecord = {
      id: "inv-003",
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      workflowCommand: "continue-implementing",
      workflowNodeId: "phase-2",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      agentRole: "code-review",
      agentName: "pi-reviewer",
      model: "openai-4o",
      provider: "openai",
      status: "completed",
      exitCode: 0,
      timeoutMarker: false,
      parentInvocationId: "inv-001",
      logPath: "/tmp/hepha/logs/review-abc.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec-review.json",
      reviewReportPath: "/tmp/hepha/reviews/phase-2-review.md",
      startedAt: "2026-07-08T12:30:00.000Z",
      completedAt: "2026-07-08T12:35:00.000Z",
      durationMs: 300_000,
    };

    expect(record.status).toBe("completed");
    expect(record.exitCode).toBe(0);
    expect(record.timeoutMarker).toBe(false);
    expect(record.parentInvocationId).toBe("inv-001");
    expect(record.reviewReportPath).toContain("phase-2-review.md");
    expect(record.completedAt).toBe("2026-07-08T12:35:00.000Z");
    expect(record.durationMs).toBe(300_000);
  });

  it("creates a failed invocation record", () => {
    const record: AgentInvocationRecord = {
      id: "inv-004",
      projectId: "test-project",
      status: "failed",
      errorMessage: "Pi exited with code 1.",
      exitCode: 1,
      startedAt: "2026-07-08T12:40:00.000Z",
    };

    expect(record.status).toBe("failed");
    expect(record.errorMessage).toBe("Pi exited with code 1.");
    expect(record.exitCode).toBe(1);
  });

  it("creates a timed_out invocation record", () => {
    const record: AgentInvocationRecord = {
      id: "inv-005",
      projectId: "test-project",
      status: "timed_out",
      timeoutMarker: true,
      errorMessage: "Agent run timed out after 300 seconds.",
      exitCode: null,
      startedAt: "2026-07-08T12:00:00.000Z",
    };

    expect(record.status).toBe("timed_out");
    expect(record.timeoutMarker).toBe(true);
    expect(record.errorMessage).toContain("timed out");
    expect(record.exitCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NormalizedEventRecord serialization tests
// ---------------------------------------------------------------------------

describe("FEAT-033 NormalizedEventRecord contract", () => {
  it("creates a fully populated normalized event record", () => {
    const record: NormalizedEventRecord = {
      id: "evt-001",
      invocationId: "inv-001",
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      eventType: "agent.started",
      timestamp: "2026-07-08T12:00:00.000Z",
      workflowCommand: "start-implementing",
      workflowNode: "phase-2",
      phase: "Data Layer",
      agentRole: "implementation",
      model: "deepseek-v4-flash",
      pid: 12345,
      logPath: "/tmp/hepha/logs/session-abc.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec-xyz.json",
      rawRefJson: '{"source":"orchestrator-launch","originalType":"agent_start"}',
    };

    expect(record.eventType).toBe("agent.started");
    expect(record.invocationId).toBe("inv-001");
    expect(record.workflowCommand).toBe("start-implementing");
    expect(record.rawRefJson).toContain("orchestrator-launch");
  });

  it("creates a minimal sparse normalized event record", () => {
    const record: NormalizedEventRecord = {
      id: "evt-002",
      projectId: "test-project",
      eventType: "agent.finished",
      timestamp: "2026-07-08T12:01:00.000Z",
    };

    expect(record.eventType).toBe("agent.finished");
    expect(record.invocationId).toBeUndefined();
    expect(record.workflowCommand).toBeUndefined();
    expect(record.workflowNode).toBeUndefined();
    expect(record.phase).toBeUndefined();
    expect(record.agentRole).toBeUndefined();
    expect(record.model).toBeUndefined();
    expect(record.pid).toBeUndefined();
  });

  it("creates a failed normalized event record with error detail", () => {
    const record: NormalizedEventRecord = {
      id: "evt-003",
      projectId: "test-project",
      eventType: "agent.failed",
      timestamp: "2026-07-08T12:05:00.000Z",
      errorMessage: "Pi exited with code 1.",
      exitCode: 1,
    };

    expect(record.eventType).toBe("agent.failed");
    expect(record.errorMessage).toBe("Pi exited with code 1.");
    expect(record.exitCode).toBe(1);
  });

  it("creates a timeout normalized event record", () => {
    const record: NormalizedEventRecord = {
      id: "evt-004",
      projectId: "test-project",
      eventType: "agent.timeout",
      timestamp: "2026-07-08T12:10:00.000Z",
      errorMessage: "Agent run timed out after 300 seconds.",
    };

    expect(record.eventType).toBe("agent.timeout");
    expect(record.errorMessage).toContain("timed out");
  });
});

// ---------------------------------------------------------------------------
// InvocationFilter contract tests
// ---------------------------------------------------------------------------

describe("FEAT-033 InvocationFilter contract", () => {
  it("requires only projectId", () => {
    const filter: InvocationFilter = {
      projectId: "test-project",
    };

    expect(filter.projectId).toBe("test-project");
    expect(filter.cardKey).toBeUndefined();
    expect(filter.phaseNumber).toBeUndefined();
    expect(filter.limit).toBeUndefined();
  });

  it("accepts all optional filter fields", () => {
    const filter: InvocationFilter = {
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      phaseNumber: 2,
      agentRole: "implementation",
      agentName: "pi-agent-1",
      model: "deepseek-v4-flash",
      parentInvocationId: "inv-000",
      status: "completed",
      startedAfter: "2026-07-08T12:00:00.000Z",
      startedBefore: "2026-07-08T13:00:00.000Z",
      limit: 50,
      offset: 0,
    };

    expect(filter.cardKey).toBe("FEAT-033");
    expect(filter.phaseNumber).toBe(2);
    expect(filter.status).toBe("completed");
    expect(filter.limit).toBe(50);
  });
});

describe("FEAT-033 EventFilter contract", () => {
  it("requires only projectId", () => {
    const filter: EventFilter = {
      projectId: "test-project",
    };

    expect(filter.projectId).toBe("test-project");
    expect(filter.eventType).toBeUndefined();
  });

  it("accepts all optional filter fields", () => {
    const filter: EventFilter = {
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      invocationId: "inv-001",
      eventType: "agent.started",
      startedAfter: "2026-07-08T12:00:00.000Z",
      startedBefore: "2026-07-08T13:00:00.000Z",
      limit: 100,
      offset: 0,
    };

    expect(filter.eventType).toBe("agent.started");
    expect(filter.invocationId).toBe("inv-001");
    expect(filter.limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// StoredAgentInvocation contract tests
// ---------------------------------------------------------------------------

describe("FEAT-033 StoredAgentInvocation contract", () => {
  it("fully populated stored record maps all fields", () => {
    const stored: StoredAgentInvocation = {
      id: "inv-001",
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      workflowCommand: "start-implementing",
      workflowNodeId: "phase-2",
      phaseNumber: 2,
      phaseTitle: "Data Layer",
      agentRole: "implementation",
      agentName: "pi-agent-1",
      model: "deepseek-v4-flash",
      provider: "deepseek",
      status: "completed",
      exitCode: 0,
      errorMessage: null,
      timeoutMarker: false,
      parentInvocationId: null,
      logPath: "/tmp/hepha/logs/session.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec.json",
      reviewReportPath: null,
      rawRefJson: null,
      startedAt: "2026-07-08T12:00:00.000Z",
      completedAt: "2026-07-08T12:05:00.000Z",
      durationMs: 300_000,
      createdAt: "2026-07-08T12:00:00.000Z",
      updatedAt: "2026-07-08T12:05:00.000Z",
    };

    expect(stored.cardKey).toBe("FEAT-033");
    expect(stored.phaseNumber).toBe(2);
    expect(stored.status).toBe("completed");
    expect(stored.durationMs).toBe(300_000);
    expect(stored.timeoutMarker).toBe(false);
    expect(stored.errorMessage).toBeNull();
    expect(stored.parentInvocationId).toBeNull();
  });

  it("sparse stored record has nulls for missing references", () => {
    const stored: StoredAgentInvocation = {
      id: "inv-002",
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
      startedAt: "2026-07-08T12:00:00.000Z",
      completedAt: null,
      durationMs: null,
      createdAt: "2026-07-08T12:00:00.000Z",
      updatedAt: "2026-07-08T12:00:00.000Z",
    };

    expect(stored.cardKey).toBeNull();
    expect(stored.phaseNumber).toBeNull();
    expect(stored.agentRole).toBeNull();
    expect(stored.model).toBeNull();
    expect(stored.logPath).toBeNull();
    expect(stored.receiptPath).toBeNull();
    expect(stored.completedAt).toBeNull();
    expect(stored.durationMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StoredNormalizedEvent contract tests
// ---------------------------------------------------------------------------

describe("FEAT-033 StoredNormalizedEvent contract", () => {
  it("fully populated stored event record maps all fields", () => {
    const stored: StoredNormalizedEvent = {
      id: "evt-001",
      invocationId: "inv-001",
      projectId: "test-project",
      cardKey: "FEAT-033",
      workflowRunId: "run-001",
      eventType: "agent.started",
      timestamp: "2026-07-08T12:00:00.000Z",
      workflowCommand: "start-implementing",
      workflowNode: "phase-2",
      phase: "Data Layer",
      agentRole: "implementation",
      model: "deepseek-v4-flash",
      pid: 12345,
      logPath: "/tmp/hepha/logs/session.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec.json",
      rawRefJson: null,
      errorMessage: null,
      exitCode: null,
      metadataJson: null,
      createdAt: "2026-07-08T12:00:00.000Z",
    };

    expect(stored.eventType).toBe("agent.started");
    expect(stored.invocationId).toBe("inv-001");
    expect(stored.pid).toBe(12345);
    expect(stored.rawRefJson).toBeNull();
  });

  it("sparse stored event has nulls for missing references", () => {
    const stored: StoredNormalizedEvent = {
      id: "evt-002",
      invocationId: null,
      projectId: "test-project",
      cardKey: null,
      workflowRunId: null,
      eventType: "agent.finished",
      timestamp: "2026-07-08T12:01:00.000Z",
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
      createdAt: "2026-07-08T12:01:00.000Z",
    };

    expect(stored.invocationId).toBeNull();
    expect(stored.workflowCommand).toBeNull();
    expect(stored.pid).toBeNull();
  });

  it("failed stored event has error details", () => {
    const stored: StoredNormalizedEvent = {
      id: "evt-003",
      invocationId: "inv-004",
      projectId: "test-project",
      cardKey: null,
      workflowRunId: null,
      eventType: "agent.failed",
      timestamp: "2026-07-08T12:05:00.000Z",
      workflowCommand: null,
      workflowNode: null,
      phase: null,
      agentRole: null,
      model: null,
      pid: null,
      logPath: null,
      receiptPath: null,
      rawRefJson: null,
      errorMessage: "Pi exited with code 1.",
      exitCode: 1,
      metadataJson: null,
      createdAt: "2026-07-08T12:05:00.000Z",
    };

    expect(stored.eventType).toBe("agent.failed");
    expect(stored.errorMessage).toBe("Pi exited with code 1.");
    expect(stored.exitCode).toBe(1);
  });
});
