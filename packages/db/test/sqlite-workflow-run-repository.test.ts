import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type {
  ImplementationAgentRunRecord,
  ImplementationPhaseRunRecord,
  ImplementationTaskRunRecord,
} from "../src/contracts/index.js";
import { SqliteWorkflowRunRepository } from "../src/sqlite/repositories/sqlite-workflow-run-repository.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";

function createRepository() {
  const database = new DatabaseSync(":memory:");
  const schema = new SqliteMetadataSchema(database);
  const context = new SqliteQueryContext(database, schema);
  const times = [
    "2026-07-21T10:00:00.000Z",
    "2026-07-21T10:01:00.000Z",
    "2026-07-21T10:02:00.000Z",
    "2026-07-21T10:03:00.000Z",
  ];
  const repository = new SqliteWorkflowRunRepository(
    context,
    () => times.shift() ?? "2026-07-21T10:04:00.000Z",
  );
  return { context, database, repository, schema };
}

function seedCard(context: SqliteQueryContext) {
  context.ensure();
  context.run(
    `insert into hepha_card_metadata (
      project_id, card_key, kind, external_id, title, state_folder, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "project-a",
      "work-item/example",
      "feature",
      "example",
      "Example",
      "03_IN_PROGRESS",
      "2026-07-21T09:00:00.000Z",
      "2026-07-21T09:00:00.000Z",
    ],
  );
}

const phaseRun: ImplementationPhaseRunRecord = {
  agent: "worker-a",
  cardKey: "work-item/example",
  currentStep: "Implementing",
  model: "model-a",
  phaseNumber: 2,
  phaseTitle: "Boundary handling",
  projectId: "project-a",
  status: "implementing",
  workflowRunId: "workflow-a",
};

const taskRun: ImplementationTaskRunRecord = {
  cardKey: phaseRun.cardKey,
  phaseNumber: phaseRun.phaseNumber,
  phaseTitle: phaseRun.phaseTitle,
  projectId: phaseRun.projectId,
  section: "Tasks",
  status: "IN_PROGRESS",
  taskId: "task-a",
  taskIndex: 0,
  taskTitle: "Implement boundary",
  workflowRunId: phaseRun.workflowRunId,
};

const agentRun: ImplementationAgentRunRecord = {
  agentName: "Worker A",
  agentRole: "implementation",
  cardKey: phaseRun.cardKey,
  id: "agent-run-a",
  model: "model-a",
  phaseNumber: phaseRun.phaseNumber,
  phaseTitle: phaseRun.phaseTitle,
  projectId: phaseRun.projectId,
  status: "running",
  workflowRunId: phaseRun.workflowRunId,
};

describe("SqliteWorkflowRunRepository", () => {
  it("exposes only the workflow-run persistence method inventory", () => {
    expect(
      Object.getOwnPropertyNames(SqliteWorkflowRunRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "listImplementationAgentRuns",
        "listImplementationPhaseRuns",
        "listImplementationTaskRuns",
        "recordFeatureWorkflowCompletion",
        "recordFeatureWorkflowRun",
        "recordImplementationAgentRun",
        "recordImplementationPhaseRun",
        "recordImplementationTaskRun",
      ].sort(),
    );
  });

  it("projects running, failed, and explicitly completed feature workflows", async () => {
    const { context, database, repository } = createRepository();
    seedCard(context);

    try {
      await repository.recordFeatureWorkflowRun({
        cardKey: phaseRun.cardKey,
        command: "start-implementing",
        currentNodeId: "implementation",
        currentStep: "Starting",
        projectId: phaseRun.projectId,
        runId: phaseRun.workflowRunId,
        status: "running",
      });
      await repository.recordFeatureWorkflowRun({
        cardKey: phaseRun.cardKey,
        command: "continue-implementing",
        error: "Worker unavailable",
        projectId: phaseRun.projectId,
        runId: phaseRun.workflowRunId,
        status: "failed",
      });
      expect(
        context.get<{ workflow_status: string; workflow_error: string }>(
          "select workflow_status, workflow_error from hepha_card_metadata where project_id = ? and card_key = ?",
          [phaseRun.projectId, phaseRun.cardKey],
        ),
      ).toEqual({ workflow_error: "Worker unavailable", workflow_status: "failed" });

      await repository.recordFeatureWorkflowCompletion({
        cardKey: phaseRun.cardKey,
        command: "refine-feature",
        projectId: phaseRun.projectId,
        runId: "workflow-refine",
        summary: "Refinement complete.",
      });
      expect(
        context.get<{ refine_feature_completed_at: string; workflow_status: string }>(
          "select refine_feature_completed_at, workflow_status from hepha_card_metadata where project_id = ? and card_key = ?",
          [phaseRun.projectId, phaseRun.cardKey],
        ),
      ).toEqual({
        refine_feature_completed_at: "2026-07-21T10:02:00.000Z",
        workflow_status: "completed",
      });
    } finally {
      database.close();
    }
  });

  it("records phase and task lifecycles with terminal timestamps", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordImplementationPhaseRun(phaseRun);
      await repository.recordImplementationPhaseRun({ ...phaseRun, status: "completed" });
      await expect(
        repository.listImplementationPhaseRuns(phaseRun.projectId, [phaseRun.cardKey]),
      ).resolves.toEqual(
        new Map([
          [
            phaseRun.cardKey,
            [expect.objectContaining({ completedAt: expect.any(String), status: "completed" })],
          ],
        ]),
      );
      await expect(repository.listImplementationPhaseRuns(phaseRun.projectId, [])).resolves.toEqual(
        new Map(),
      );

      await repository.recordImplementationTaskRun(taskRun);
      await repository.recordImplementationTaskRun({ ...taskRun, status: "COMPLETED" });
      await expect(
        repository.listImplementationTaskRuns(
          taskRun.projectId,
          taskRun.cardKey,
          taskRun.phaseNumber,
        ),
      ).resolves.toEqual([
        expect.objectContaining({ completedAt: expect.any(String), status: "COMPLETED" }),
      ]);
    } finally {
      database.close();
    }
  });

  it("upserts and groups agent runs while preserving their first start time", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordImplementationAgentRun(agentRun);
      await repository.recordImplementationAgentRun({ ...agentRun, status: "completed" });
      const runs = await repository.listImplementationAgentRuns(agentRun.projectId, [agentRun.cardKey]);
      expect(runs.get(agentRun.cardKey)).toEqual([
        expect.objectContaining({
          completedAt: "2026-07-21T10:01:00.000Z",
          startedAt: "2026-07-21T10:00:00.000Z",
          status: "completed",
        }),
      ]);
      await expect(repository.listImplementationAgentRuns(agentRun.projectId, [])).resolves.toEqual(
        new Map(),
      );
    } finally {
      database.close();
    }
  });
});
