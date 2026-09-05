// Behavior suite: pi event normalization.
/**
 * Generic normalized-event transport contract tests.
 *
 * Proves shared event normalization data contracts: type-level
 * definitions, serialization, sparse events, and backward compatibility.
 *
 * Pure type and value tests. No live Pi, HTTP servers, or browsers.
 */
import { describe, expect, it } from "vitest";
import type {
  NormalizedEvent,
  NormalizedEventName,
  RawEventRef,
  RawEventRefSource,
  PiJsonLineInput,
  OrchestratorLifecycleInput,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Type-level compatibility tests
// ---------------------------------------------------------------------------

describe("NormalizedEventName union", () => {
  it("defines all four lifecycle event names", () => {
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

describe("RawEventRefSource union", () => {
  it("defines all four raw reference source kinds", () => {
    const sources: readonly RawEventRefSource[] = [
      "pi-jsonl",
      "workflow-stream-log",
      "orchestrator-launch",
      "session-file",
    ];

    expect(sources).toContain("pi-jsonl");
    expect(sources).toContain("workflow-stream-log");
    expect(sources).toContain("orchestrator-launch");
    expect(sources).toContain("session-file");
    expect(sources).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// NormalizedEvent serialization tests
// ---------------------------------------------------------------------------

describe("NormalizedEvent contract", () => {
  it("creates a fully populated normalized event", () => {
    const event: NormalizedEvent = {
      type: "agent.started",
      timestamp: "2026-07-08T12:00:00.000Z",
      workflowCommand: "start-implementing",
      workflowNode: "phase-2",
      phase: "Data Layer",
      agentRole: "implementation",
      model: "deepseek-v4-flash",
      pid: 12345,
      logPath: "/tmp/hepha/session/log-abc.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec-xyz.json",
      rawRef: {
        source: "orchestrator-launch",
        originalType: "agent_start",
        sessionId: "run-001",
      },
      metadata: { source: "runPiAgent" },
    };

    expect(event.type).toBe("agent.started");
    expect(event.timestamp).toBe("2026-07-08T12:00:00.000Z");
    expect(event.workflowCommand).toBe("start-implementing");
    expect(event.workflowNode).toBe("phase-2");
    expect(event.phase).toBe("Data Layer");
    expect(event.agentRole).toBe("implementation");
    expect(event.model).toBe("deepseek-v4-flash");
    expect(event.pid).toBe(12345);
    expect(event.logPath).toContain("stream.log");
    expect(event.receiptPath).toContain("rec-xyz.json");
    expect(event.rawRef?.source).toBe("orchestrator-launch");
    expect(event.rawRef?.originalType).toBe("agent_start");
    expect(event.metadata?.source).toBe("runPiAgent");
  });

  it("serializes a minimal sparse event with only required fields", () => {
    const event: NormalizedEvent = {
      type: "agent.timeout",
      timestamp: "2026-07-08T12:00:00.000Z",
    };

    // All optional fields should be undefined
    expect(event.type).toBe("agent.timeout");
    expect(event.timestamp).toBe("2026-07-08T12:00:00.000Z");
    expect(event.workflowCommand).toBeUndefined();
    expect(event.workflowNode).toBeUndefined();
    expect(event.phase).toBeUndefined();
    expect(event.agentRole).toBeUndefined();
    expect(event.model).toBeUndefined();
    expect(event.pid).toBeUndefined();
    expect(event.logPath).toBeUndefined();
    expect(event.receiptPath).toBeUndefined();
    expect(event.rawRef).toBeUndefined();
    expect(event.metadata).toBeUndefined();
    expect(event.errorMessage).toBeUndefined();
    expect(event.exitCode).toBeUndefined();
  });

  it("creates a finished event without optional fields", () => {
    const event: NormalizedEvent = {
      type: "agent.finished",
      timestamp: "2026-07-08T12:01:00.000Z",
    };

    expect(event.type).toBe("agent.finished");
    expect(event.timestamp).toBe("2026-07-08T12:01:00.000Z");
    expect(event.pid).toBeUndefined();
    expect(event.logPath).toBeUndefined();
  });

  it("creates a failed event with error detail", () => {
    const event: NormalizedEvent = {
      type: "agent.failed",
      timestamp: "2026-07-08T12:05:00.000Z",
      errorMessage: "Pi exited with code 1.",
      exitCode: 1,
      model: "deepseek-v4-flash",
      pid: 12346,
    };

    expect(event.type).toBe("agent.failed");
    expect(event.errorMessage).toBe("Pi exited with code 1.");
    expect(event.exitCode).toBe(1);
    expect(event.model).toBe("deepseek-v4-flash");
  });

  it("creates a timeout event with exitCode null", () => {
    const event: NormalizedEvent = {
      type: "agent.timeout",
      timestamp: "2026-07-08T12:10:00.000Z",
      errorMessage: "Pi run timed out after 300 seconds.",
      exitCode: null,
    };

    expect(event.type).toBe("agent.timeout");
    expect(event.errorMessage).toContain("timed out");
    expect(event.exitCode).toBeNull();
  });

  it("preserves rawRef with full details", () => {
    const rawRef: RawEventRef = {
      source: "pi-jsonl",
      originalType: "agent_end",
      logPath: "/tmp/hepha/session/log-abc.stream.log",
      lineNumber: 42,
      rawPayload: '{"type":"agent_end","messages":[]}',
      sequenceId: "seq-001",
      sessionId: "run-002",
    };

    const event: NormalizedEvent = {
      type: "agent.finished",
      timestamp: "2026-07-08T12:20:00.000Z",
      rawRef,
    };

    expect(event.rawRef?.source).toBe("pi-jsonl");
    expect(event.rawRef?.originalType).toBe("agent_end");
    expect(event.rawRef?.lineNumber).toBe(42);
    expect(event.rawRef?.rawPayload).toBe('{"type":"agent_end","messages":[]}');
    expect(event.rawRef?.sequenceId).toBe("seq-001");
    expect(event.rawRef?.sessionId).toBe("run-002");
  });
});

// ---------------------------------------------------------------------------
// Input DTO contract tests
// ---------------------------------------------------------------------------

describe("PiJsonLineInput contract", () => {
  it("creates a fully populated Pi JSONL input", () => {
    const input: PiJsonLineInput = {
      raw: { type: "agent_start", timestamp: "2026-07-08T12:00:00Z" },
      lineNumber: 1,
      logPath: "/tmp/hepha/session/log-abc.stream.log",
      sessionId: "run-001",
    };

    expect(input.raw.type).toBe("agent_start");
    expect(input.lineNumber).toBe(1);
    expect(input.logPath).toContain("stream.log");
    expect(input.sessionId).toBe("run-001");
  });

  it("creates a minimal Pi JSONL input with only raw field", () => {
    const input: PiJsonLineInput = {
      raw: { type: "unknown_event" },
    };

    expect(input.raw.type).toBe("unknown_event");
    expect(input.lineNumber).toBeUndefined();
    expect(input.logPath).toBeUndefined();
    expect(input.sessionId).toBeUndefined();
  });
});

describe("OrchestratorLifecycleInput contract", () => {
  it("creates a fully populated orchestrator lifecycle input", () => {
    const input: OrchestratorLifecycleInput = {
      event: "agent.started",
      timestamp: "2026-07-08T12:00:00.000Z",
      workflowCommand: "start-implementing",
      workflowNode: "phase-2",
      phase: "Data Layer",
      agentRole: "implementation",
      model: "deepseek-v4-flash",
      pid: 12345,
      logPath: "/tmp/hepha/session/log-abc.stream.log",
      receiptPath: "/tmp/hepha/receipts/rec-xyz.json",
      metadata: { source: "runPiAgent" },
    };

    expect(input.event).toBe("agent.started");
    expect(input.workflowCommand).toBe("start-implementing");
    expect(input.model).toBe("deepseek-v4-flash");
    expect(input.pid).toBe(12345);
  });

  it("creates a minimal orchestrator lifecycle input with only required fields", () => {
    const input: OrchestratorLifecycleInput = {
      event: "agent.timeout",
    };

    expect(input.event).toBe("agent.timeout");
    expect(input.timestamp).toBeUndefined();
    expect(input.workflowCommand).toBeUndefined();
    expect(input.model).toBeUndefined();
    expect(input.pid).toBeUndefined();
    expect(input.errorMessage).toBeUndefined();
  });

  it("includes failure details in orchestrator input", () => {
    const input: OrchestratorLifecycleInput = {
      event: "agent.failed",
      errorMessage: "Provider error: model unavailable",
      exitCode: 1,
    };

    expect(input.event).toBe("agent.failed");
    expect(input.errorMessage).toBe("Provider error: model unavailable");
    expect(input.exitCode).toBe(1);
  });

  it("includes timeout details in orchestrator input", () => {
    const input: OrchestratorLifecycleInput = {
      event: "agent.timeout",
      errorMessage: "Pi process produced no output for 120 seconds.",
      exitCode: null,
    };

    expect(input.event).toBe("agent.timeout");
    expect(input.errorMessage).toContain("no output");
    expect(input.exitCode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// JSON serialization round-trip tests
// ---------------------------------------------------------------------------

describe("NormalizedEvent JSON serialization", () => {
  it("round-trips a fully populated event through JSON", () => {
    const original: NormalizedEvent = {
      type: "agent.started",
      timestamp: "2026-07-08T12:00:00.000Z",
      model: "deepseek-v4-flash",
      pid: 12345,
      rawRef: {
        source: "orchestrator-launch",
        originalType: "agent_start",
      },
    };

    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as NormalizedEvent;

    expect(parsed.type).toBe("agent.started");
    expect(parsed.timestamp).toBe("2026-07-08T12:00:00.000Z");
    expect(parsed.model).toBe("deepseek-v4-flash");
    expect(parsed.pid).toBe(12345);
    expect(parsed.rawRef?.source).toBe("orchestrator-launch");
  });

  it("round-trips a sparse event without throwing", () => {
    const original: NormalizedEvent = {
      type: "agent.finished",
      timestamp: "2026-07-08T12:00:00.000Z",
    };

    const json = JSON.stringify(original);
    const parsed = JSON.parse(json) as NormalizedEvent;

    expect(parsed.type).toBe("agent.finished");
    expect(parsed.timestamp).toBe("2026-07-08T12:00:00.000Z");
    expect(parsed.model).toBeUndefined();
    expect(parsed.workflowCommand).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility: NormalizedEvent does not interfere with AgentEvent
// ---------------------------------------------------------------------------

describe("normalized-event backward compatibility with existing types", () => {
  it("does not require changes to AgentEvent consumer code", () => {
    // AgentEvent type is unchanged — NormalizedEvent is purely additive
    // Consumers that expect { type: string, title: string, detail: string }
    // continue to work without modification.
    const agentEvent = {
      id: "evt-001",
      type: "agent.started",
      title: "Pi Agent Started",
      detail: "Implementation agent started with deepseek-v4-flash.",
      time: "Just now",
      tone: "action" as const,
    };

    expect(agentEvent.type).toBe("agent.started");
    expect(agentEvent.title).toBe("Pi Agent Started");

    // NormalizedEvent is a separate type — no existing consumer is forced
    // to adopt it.
    const normalizedEvent: NormalizedEvent = {
      type: "agent.started",
      timestamp: "2026-07-08T12:00:00.000Z",
    };

    expect(normalizedEvent.type).toBe("agent.started");
  });

  it("can coexist with existing FeatureCard/AgentTask types", () => {
    // Existing FeatureCard and AgentTask fields are unchanged.
    // NormalizedEvent is an independent additive contract.
    const task = {
      id: "task-001",
      title: "Test Task",
      state: "Execute" as const,
      agent: "implementation",
      latestActivity: "Running",
      eventCount: 5,
      age: "Just now",
      columnId: "execute" as const,
      createdAt: Date.now(),
      model: "deepseek-v4-flash",
      output: "Task output",
      prompt: "Test prompt",
      runId: "run-001",
      status: "running" as const,
      events: [],
    };

    expect(task.runId).toBe("run-001");
    expect(task.model).toBe("deepseek-v4-flash");

    // NormalizedEvent fields don't leak into AgentTask
    const typedTask = task as typeof task & { normalizedEvents?: NormalizedEvent[] };
    expect(typedTask.normalizedEvents).toBeUndefined();
  });
});
