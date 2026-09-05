// Behavior suite: run timeline database integration.
/**
 * FEAT-033 Phase 2 SQLite Data Layer Integration Tests
 *
 * Proves FEAT-033 schema migration, record persistence, query filtering,
 * and idempotency using temp SQLite databases.
 *
 * No live Pi, HTTP servers, or browsers.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createCardMetadataStore,
  type AgentInvocationRecord,
  type NormalizedEventRecord,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers — each test gets its own temp database to avoid shared state
// ---------------------------------------------------------------------------

function withStore(fn: (store: ReturnType<typeof createCardMetadataStore>) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "feat-033-test-"));
    const dbPath = resolve(dir, "test.sqlite");
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: dbPath });

    try {
      await fn(store);
    } finally {
      await store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function seedInvocations(
  store: ReturnType<typeof createCardMetadataStore>,
  records: AgentInvocationRecord[],
): Promise<void[]> {
  return Promise.all(records.map((r) => store.recordAgentInvocation(r)));
}

function seedEvents(
  store: ReturnType<typeof createCardMetadataStore>,
  records: NormalizedEventRecord[],
): Promise<void[]> {
  return Promise.all(records.map((r) => store.recordNormalizedEvent(r)));
}

// ---------------------------------------------------------------------------
// Migration idempotency tests
// ---------------------------------------------------------------------------

describe("FEAT-033 migration idempotency", () => {
  it(
    "creates hepha_agent_invocations table without error",
    withStore(async (store) => {
      const record: AgentInvocationRecord = {
        id: "inv-idemp-001",
        projectId: "test-project",
        status: "running",
        startedAt: "2026-07-08T12:00:00.000Z",
      };

      await store.recordAgentInvocation(record);
      // Second call with same record should work (upsert)
      await store.recordAgentInvocation(record);
    }),
  );

  it(
    "creates hepha_normalized_events table without error",
    withStore(async (store) => {
      const record: NormalizedEventRecord = {
        id: "evt-idemp-001",
        projectId: "test-project",
        eventType: "agent.started",
        timestamp: "2026-07-08T12:00:00.000Z",
      };

      await store.recordNormalizedEvent(record);
    }),
  );

  it(
    "schema creation is idempotent across multiple ensureSchema calls",
    withStore(async (store) => {
      await store.recordAgentInvocation({
        id: "inv-idemp-002",
        projectId: "test-project",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
      });

      await store.recordAgentInvocation({
        id: "inv-idemp-003",
        projectId: "test-project",
        status: "failed",
        startedAt: "2026-07-08T12:05:00.000Z",
      });

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
      });

      expect(results).toHaveLength(2);
    }),
  );
});

// ---------------------------------------------------------------------------
// Agent invocation record persistence tests
// ---------------------------------------------------------------------------

describe("FEAT-033 agent invocation storage", () => {
  it(
    "stores and retrieves a full invocation record",
    withStore(async (store) => {
      const record: AgentInvocationRecord = {
        id: "inv-full-001",
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
        timeoutMarker: false,
        logPath: "/tmp/logs/session.stream.log",
        receiptPath: "/tmp/receipts/rec.json",
        startedAt: "2026-07-08T12:00:00.000Z",
        completedAt: "2026-07-08T12:05:00.000Z",
        durationMs: 300_000,
      };

      await store.recordAgentInvocation(record);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("inv-full-001");
      expect(results[0]!.status).toBe("completed");
      expect(results[0]!.cardKey).toBe("FEAT-033");
      expect(results[0]!.phaseNumber).toBe(2);
      expect(results[0]!.durationMs).toBe(300_000);
    }),
  );

  it(
    "stores and retrieves a sparse invocation record",
    withStore(async (store) => {
      const record: AgentInvocationRecord = {
        id: "inv-sparse-001",
        projectId: "test-project",
        status: "running",
        startedAt: "2026-07-08T12:00:00.000Z",
      };

      await store.recordAgentInvocation(record);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("inv-sparse-001");
      expect(results[0]!.status).toBe("running");
      expect(results[0]!.cardKey).toBeNull();
      expect(results[0]!.phaseNumber).toBeNull();
      expect(results[0]!.agentRole).toBeNull();
      expect(results[0]!.model).toBeNull();
      expect(results[0]!.logPath).toBeNull();
      expect(results[0]!.completedAt).toBeNull();
    }),
  );

  it(
    "upserts: updates existing invocation on conflict",
    withStore(async (store) => {
      await store.recordAgentInvocation({
        id: "inv-upsert-001",
        projectId: "test-project",
        status: "running",
        startedAt: "2026-07-08T12:00:00.000Z",
      });

      await store.recordAgentInvocation({
        id: "inv-upsert-001",
        projectId: "test-project",
        status: "completed",
        completedAt: "2026-07-08T12:05:00.000Z",
        durationMs: 300_000,
        startedAt: "2026-07-08T12:00:00.000Z",
      });

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("completed");
      expect(results[0]!.durationMs).toBe(300_000);
    }),
  );

  it(
    "stores repeated invocations (multiple per phase)",
    withStore(async (store) => {
      const base = "2026-07-08T12:00:00.000Z";
      await seedInvocations(store, [
        {
          id: "inv-rep-001",
          projectId: "test-project",
          cardKey: "FEAT-033",
          phaseNumber: 3,
          phaseTitle: "Business Logic",
          agentRole: "implementation",
          agentName: "pi-impl-1",
          status: "completed",
          startedAt: base,
          completedAt: "2026-07-08T12:10:00.000Z",
          durationMs: 600_000,
        },
        {
          id: "inv-rep-002",
          projectId: "test-project",
          cardKey: "FEAT-033",
          phaseNumber: 3,
          phaseTitle: "Business Logic",
          agentRole: "code-review",
          agentName: "pi-review-1",
          status: "completed",
          startedAt: "2026-07-08T12:15:00.000Z",
          completedAt: "2026-07-08T12:20:00.000Z",
          durationMs: 300_000,
        },
        {
          id: "inv-rep-003",
          projectId: "test-project",
          cardKey: "FEAT-033",
          phaseNumber: 3,
          phaseTitle: "Business Logic",
          agentRole: "verification",
          agentName: "pi-verify-1",
          status: "completed",
          startedAt: "2026-07-08T12:25:00.000Z",
          completedAt: "2026-07-08T12:27:00.000Z",
          durationMs: 120_000,
        },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        phaseNumber: 3,
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.agentRole).toBe("implementation");
      expect(results[1]!.agentRole).toBe("code-review");
      expect(results[2]!.agentRole).toBe("verification");
    }),
  );

  it(
    "stores with parent invocation reference",
    withStore(async (store) => {
      await store.recordAgentInvocation({
        id: "inv-parent",
        projectId: "test-project",
        status: "completed",
        startedAt: "2026-07-08T12:00:00.000Z",
      });

      await store.recordAgentInvocation({
        id: "inv-child",
        projectId: "test-project",
        status: "running",
        parentInvocationId: "inv-parent",
        startedAt: "2026-07-08T12:05:00.000Z",
      });

      const children = await store.queryAgentInvocations({
        projectId: "test-project",
        parentInvocationId: "inv-parent",
      });

      expect(children).toHaveLength(1);
      expect(children[0]!.id).toBe("inv-child");
      expect(children[0]!.parentInvocationId).toBe("inv-parent");
    }),
  );
});

// ---------------------------------------------------------------------------
// Normalized event record persistence tests
// ---------------------------------------------------------------------------

describe("FEAT-033 normalized event storage", () => {
  it(
    "stores and retrieves a full event record",
    withStore(async (store) => {
      const record: NormalizedEventRecord = {
        id: "evt-full-001",
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
        logPath: "/tmp/logs/session.stream.log",
        receiptPath: "/tmp/receipts/rec.json",
      };

      await store.recordNormalizedEvent(record);

      const results = await store.queryNormalizedEvents({
        projectId: "test-project",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("evt-full-001");
      expect(results[0]!.eventType).toBe("agent.started");
      expect(results[0]!.invocationId).toBe("inv-001");
      expect(results[0]!.pid).toBe(12345);
    }),
  );

  it(
    "stores a sparse event record",
    withStore(async (store) => {
      const record: NormalizedEventRecord = {
        id: "evt-sparse-001",
        projectId: "test-project",
        eventType: "agent.finished",
        timestamp: "2026-07-08T12:01:00.000Z",
      };

      await store.recordNormalizedEvent(record);

      const results = await store.queryNormalizedEvents({
        projectId: "test-project",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.invocationId).toBeNull();
      expect(results[0]!.workflowCommand).toBeNull();
      expect(results[0]!.phase).toBeNull();
    }),
  );

  it(
    "stores failed and timeout events",
    withStore(async (store) => {
      await seedEvents(store, [
        {
          id: "evt-fail-001",
          projectId: "test-project",
          eventType: "agent.failed",
          timestamp: "2026-07-08T12:05:00.000Z",
          errorMessage: "Pi exited with code 1.",
          exitCode: 1,
        },
        {
          id: "evt-to-001",
          projectId: "test-project",
          eventType: "agent.timeout",
          timestamp: "2026-07-08T12:10:00.000Z",
          errorMessage: "Agent run timed out after 300 seconds.",
        },
      ]);

      const results = await store.queryNormalizedEvents({
        projectId: "test-project",
      });

      expect(results).toHaveLength(2);

      const failed = results.find((e) => e.eventType === "agent.failed")!;
      expect(failed.errorMessage).toBe("Pi exited with code 1.");
      expect(failed.exitCode).toBe(1);

      const timeout = results.find((e) => e.eventType === "agent.timeout")!;
      expect(timeout.errorMessage).toContain("timed out");
    }),
  );
});

// ---------------------------------------------------------------------------
// Query filter tests — each test seeds its own data
// ---------------------------------------------------------------------------

describe("FEAT-033 query filters", () => {
  it(
    "filters by projectId only",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-1", projectId: "test-project", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-2", projectId: "test-project", status: "completed", startedAt: "2026-07-08T12:05:00.000Z" },
        { id: "q-3", projectId: "test-project", status: "running", startedAt: "2026-07-08T12:10:00.000Z" },
        { id: "q-4", projectId: "other-project", status: "completed", startedAt: "2026-07-08T13:00:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({ projectId: "test-project" });
      expect(results).toHaveLength(3);
    }),
  );

  it(
    "filters by projectId and cardKey",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-5", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-6", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:15:00.000Z" },
        { id: "q-7", projectId: "test-project", cardKey: "FEAT-033", status: "running", startedAt: "2026-07-08T12:30:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({ projectId: "test-project", cardKey: "FEAT-033" });
      expect(results).toHaveLength(3);
    }),
  );

  it(
    "filters by projectId and phaseNumber",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-8", projectId: "test-project", cardKey: "FEAT-033", phaseNumber: 1, status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-9", projectId: "test-project", cardKey: "FEAT-033", phaseNumber: 1, status: "completed", startedAt: "2026-07-08T12:15:00.000Z" },
        { id: "q-10", projectId: "test-project", cardKey: "FEAT-033", phaseNumber: 2, status: "running", startedAt: "2026-07-08T12:30:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        phaseNumber: 1,
      });

      expect(results).toHaveLength(2);
    }),
  );

  it(
    "filters by projectId and agentRole",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-11", projectId: "test-project", cardKey: "FEAT-033", agentRole: "implementation", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-12", projectId: "test-project", cardKey: "FEAT-033", agentRole: "code-review", status: "completed", startedAt: "2026-07-08T12:15:00.000Z" },
        { id: "q-13", projectId: "test-project", cardKey: "FEAT-033", agentRole: "implementation", status: "running", startedAt: "2026-07-08T12:30:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        agentRole: "code-review",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.agentRole).toBe("code-review");
    }),
  );

  it(
    "filters by projectId and status",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-14", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-15", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:15:00.000Z" },
        { id: "q-16", projectId: "test-project", cardKey: "FEAT-033", status: "running", startedAt: "2026-07-08T12:30:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        status: "running",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("running");
    }),
  );

  it(
    "returns empty array for non-matching filters",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-17", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "NONEXISTENT",
      });

      expect(results).toHaveLength(0);
    }),
  );

  it(
    "filters by model",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-18", projectId: "test-project", cardKey: "FEAT-033", model: "deepseek-v4-flash", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-19", projectId: "test-project", cardKey: "FEAT-033", model: "openai-4o", status: "completed", startedAt: "2026-07-08T12:15:00.000Z" },
        { id: "q-20", projectId: "test-project", cardKey: "FEAT-033", model: "deepseek-v4-flash", status: "running", startedAt: "2026-07-08T12:30:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        model: "openai-4o",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.model).toBe("openai-4o");
    }),
  );

  it(
    "limits results when limit is set",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-21", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-22", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:05:00.000Z" },
        { id: "q-23", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:10:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        limit: 2,
      });

      expect(results).toHaveLength(2);
    }),
  );

  it(
    "respects time range filter",
    withStore(async (store) => {
      await seedInvocations(store, [
        { id: "q-24", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:00:00.000Z" },
        { id: "q-25", projectId: "test-project", cardKey: "FEAT-033", status: "completed", startedAt: "2026-07-08T12:15:00.000Z" },
        { id: "q-26", projectId: "test-project", cardKey: "FEAT-033", status: "running", startedAt: "2026-07-08T12:30:00.000Z" },
      ]);

      const results = await store.queryAgentInvocations({
        projectId: "test-project",
        cardKey: "FEAT-033",
        startedAfter: "2026-07-08T12:20:00.000Z",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("q-26");
    }),
  );
});

// ---------------------------------------------------------------------------
// Normalized event filter tests
// ---------------------------------------------------------------------------

describe("FEAT-033 normalized event filters", () => {
  it(
    "filters events by projectId",
    withStore(async (store) => {
      await seedEvents(store, [
        { id: "ev-q-1", projectId: "test-project", cardKey: "FEAT-033", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" },
        { id: "ev-q-2", projectId: "test-project", cardKey: "FEAT-033", eventType: "agent.finished", timestamp: "2026-07-08T12:05:00.000Z" },
        { id: "ev-q-3", projectId: "test-project", cardKey: "FEAT-033", eventType: "agent.started", timestamp: "2026-07-08T12:10:00.000Z" },
        { id: "ev-q-4", projectId: "other-project", eventType: "agent.started", timestamp: "2026-07-08T13:00:00.000Z" },
      ]);

      const results = await store.queryNormalizedEvents({ projectId: "test-project" });
      expect(results).toHaveLength(3);
    }),
  );

  it(
    "filters events by projectId and eventType",
    withStore(async (store) => {
      await seedEvents(store, [
        { id: "ev-q-5", projectId: "test-project", cardKey: "FEAT-033", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" },
        { id: "ev-q-6", projectId: "test-project", cardKey: "FEAT-033", eventType: "agent.finished", timestamp: "2026-07-08T12:05:00.000Z" },
        { id: "ev-q-7", projectId: "test-project", cardKey: "FEAT-033", eventType: "agent.started", timestamp: "2026-07-08T12:10:00.000Z" },
      ]);

      const results = await store.queryNormalizedEvents({
        projectId: "test-project",
        cardKey: "FEAT-033",
        eventType: "agent.finished",
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.eventType).toBe("agent.finished");
    }),
  );

  it(
    "filters events by invocationId",
    withStore(async (store) => {
      await seedEvents(store, [
        { id: "ev-q-8", projectId: "test-project", invocationId: "inv-001", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" },
        { id: "ev-q-9", projectId: "test-project", invocationId: "inv-001", eventType: "agent.finished", timestamp: "2026-07-08T12:05:00.000Z" },
        { id: "ev-q-10", projectId: "test-project", invocationId: "inv-002", eventType: "agent.started", timestamp: "2026-07-08T12:10:00.000Z" },
      ]);

      const results = await store.queryNormalizedEvents({
        projectId: "test-project",
        invocationId: "inv-001",
      });

      expect(results).toHaveLength(2);
    }),
  );

  it(
    "returns empty for non-matching event filter",
    withStore(async (store) => {
      await seedEvents(store, [
        { id: "ev-q-11", projectId: "test-project", eventType: "agent.started", timestamp: "2026-07-08T12:00:00.000Z" },
      ]);

      const results = await store.queryNormalizedEvents({
        projectId: "test-project",
        cardKey: "NONEXISTENT",
      });

      expect(results).toHaveLength(0);
    }),
  );
});
