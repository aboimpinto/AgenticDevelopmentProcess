import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type {
  AgentInvocationRecord,
  NormalizedEventRecord,
  PhaseLifecycleEventRecord,
} from "../src/contracts/index.js";
import { SqliteTelemetryRepository } from "../src/sqlite/repositories/sqlite-telemetry-repository.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";

const recordedAt = "2026-07-21T12:00:00.000Z";

function createRepository() {
  const database = new DatabaseSync(":memory:");
  const context = new SqliteQueryContext(database, new SqliteMetadataSchema(database));
  return {
    database,
    repository: new SqliteTelemetryRepository(context, () => recordedAt),
  };
}

const invocation: AgentInvocationRecord = {
  agentName: "worker-a",
  agentRole: "implementation",
  cardKey: "work-item/example",
  completedAt: "2026-07-21T10:05:00.000Z",
  durationMs: 300_000,
  exitCode: 0,
  id: "invocation-a",
  logPath: "/tmp/invocation.log",
  model: "model-a",
  parentInvocationId: "parent-a",
  phaseNumber: 2,
  phaseTitle: "Boundary handling",
  provider: "provider-a",
  rawRefJson: "{}",
  receiptPath: "/tmp/receipt.json",
  reviewReportPath: "/tmp/review.md",
  startedAt: "2026-07-21T10:00:00.000Z",
  status: "completed",
  timeoutMarker: false,
  workflowCommand: "continue-implementing",
  workflowNodeId: "implementation",
  workflowRunId: "workflow-a",
  projectId: "project-a",
};

const event: NormalizedEventRecord = {
  agentRole: invocation.agentRole,
  cardKey: invocation.cardKey,
  eventType: "agent.finished",
  exitCode: 0,
  id: "event-a",
  invocationId: invocation.id,
  logPath: invocation.logPath,
  metadataJson: "{}",
  model: invocation.model,
  pid: 123,
  projectId: invocation.projectId,
  rawRefJson: "{}",
  receiptPath: invocation.receiptPath,
  timestamp: invocation.completedAt!,
  workflowCommand: invocation.workflowCommand,
  workflowNode: invocation.workflowNodeId,
  workflowRunId: invocation.workflowRunId,
  phase: "2",
};

describe("SqliteTelemetryRepository", () => {
  it("exposes only the telemetry persistence method inventory", () => {
    expect(
      Object.getOwnPropertyNames(SqliteTelemetryRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "queryAgentInvocations",
        "queryNormalizedEvents",
        "queryPhaseLifecycleEventsAfterCursor",
        "recordAgentInvocation",
        "recordNormalizedEvent",
        "recordPhaseLifecycleEvent",
      ].sort(),
    );
  });

  it("upserts invocations and applies every supported query filter", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordAgentInvocation({
        id: invocation.parentInvocationId!,
        projectId: invocation.projectId,
        startedAt: "2026-07-21T09:55:00.000Z",
        status: "completed",
      });
      await repository.recordAgentInvocation({
        ...invocation,
        completedAt: undefined,
        durationMs: undefined,
        status: "running",
      });
      await repository.recordAgentInvocation(invocation);
      const filters = {
        agentName: invocation.agentName,
        agentRole: invocation.agentRole,
        cardKey: invocation.cardKey,
        limit: 1,
        model: invocation.model,
        offset: 0,
        parentInvocationId: invocation.parentInvocationId,
        phaseNumber: invocation.phaseNumber,
        projectId: invocation.projectId,
        startedAfter: invocation.startedAt,
        startedBefore: invocation.startedAt,
        status: invocation.status,
        workflowRunId: invocation.workflowRunId,
      } as const;

      await expect(repository.queryAgentInvocations(filters)).resolves.toEqual([
        expect.objectContaining({
          completedAt: invocation.completedAt,
          createdAt: recordedAt,
          durationMs: invocation.durationMs,
          id: invocation.id,
          status: "completed",
          updatedAt: recordedAt,
        }),
      ]);
    } finally {
      database.close();
    }
  });

  it("records normalized events and applies every supported query filter", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordNormalizedEvent(event);
      await expect(
        repository.queryNormalizedEvents({
          cardKey: event.cardKey,
          eventType: event.eventType,
          invocationId: event.invocationId,
          limit: 1,
          offset: 0,
          projectId: event.projectId,
          startedAfter: event.timestamp,
          startedBefore: event.timestamp,
          workflowRunId: event.workflowRunId,
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          createdAt: recordedAt,
          eventType: event.eventType,
          id: event.id,
          invocationId: event.invocationId,
          metadataJson: event.metadataJson,
        }),
      ]);
    } finally {
      database.close();
    }
  });

  it("returns phase lifecycle events strictly after the ordered cursor", async () => {
    const { database, repository } = createRepository();
    const cursor: PhaseLifecycleEventRecord = {
      category: "phase",
      eventType: "started",
      id: "lifecycle-a",
      occurredAt: "2026-07-21T10:00:00.000Z",
      projectId: "project-a",
      summary: "Work started.",
    };
    const later: PhaseLifecycleEventRecord = {
      ...cursor,
      eventType: "completed",
      id: "lifecycle-b",
      metadata: { outcome: "passed" },
      occurredAt: "2026-07-21T10:01:00.000Z",
      phaseNumber: 2,
      phaseStatus: "completed",
      phaseTitle: "Boundary handling",
      runId: "workflow-a",
      summary: "Work completed.",
    };

    try {
      await repository.recordPhaseLifecycleEvent(cursor);
      await repository.recordPhaseLifecycleEvent(later);
      await expect(
        repository.queryPhaseLifecycleEventsAfterCursor(cursor.projectId, cursor.id),
      ).resolves.toEqual([
        expect.objectContaining({
          id: later.id,
          metadata: JSON.stringify(later.metadata),
          phaseStatus: later.phaseStatus,
        }),
      ]);
    } finally {
      database.close();
    }
  });
});
