import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type {
  DeliveryMetadataInput,
  StartTransitionExceptionRecord,
  StartTransitionRecord,
} from "../src/contracts/index.js";
import { SqliteDeliveryRepository } from "../src/sqlite/repositories/sqlite-delivery-repository.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";

function createRepository() {
  const database = new DatabaseSync(":memory:");
  const context = new SqliteQueryContext(database, new SqliteMetadataSchema(database));
  return { context, database, repository: new SqliteDeliveryRepository(context) };
}

function transition(runId: string, startedAt: string): StartTransitionRecord {
  return {
    baseBranch: "master",
    cardKey: "feature/example",
    completedAt: startedAt,
    deliveryPolicy: "direct_merge",
    failureReason: null,
    implementationBranch: "feat/example",
    projectId: "project-a",
    repoRoot: "/tmp/repository",
    rolledBack: false,
    runId,
    startCommit: "abc123",
    startedAt,
    transitionStatus: "transition_completed",
    transitionStep: "folder_moved",
    worktreePath: "/tmp/worktree",
  };
}

const delivery: DeliveryMetadataInput = {
  cardKey: "feature/example",
  deliveryError: null,
  deliveryMode: "direct_merge",
  deliveryStatus: "not_applicable",
  githubIssue: null,
  issueRole: "feature_issue",
  issueUpdateMode: "pr_body",
  projectId: "project-a",
  pullRequest: null,
  targetBranch: "master",
};

describe("SqliteDeliveryRepository", () => {
  it("exposes only the complete transition and delivery method inventory", () => {
    expect(
      Object.getOwnPropertyNames(SqliteDeliveryRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "getDeliveryMetadata",
        "getStartTransition",
        "listDeliveryMetadata",
        "listStartTransitions",
        "recordStartTransition",
        "recordStartTransitionException",
        "upsertDeliveryMetadata",
      ].sort(),
    );
  });

  it("records, retrieves, and orders start-transition evidence", async () => {
    const { database, repository } = createRepository();
    const earlier = transition("run-a", "2026-07-21T10:00:00.000Z");
    const later = transition("run-b", "2026-07-21T11:00:00.000Z");

    try {
      await repository.recordStartTransition(earlier);
      await repository.recordStartTransition(later);

      await expect(
        repository.getStartTransition(earlier.cardKey, earlier.projectId, earlier.runId),
      ).resolves.toEqual(earlier);
      await expect(
        repository.listStartTransitions(earlier.cardKey, earlier.projectId),
      ).resolves.toEqual([later, earlier]);
    } finally {
      database.close();
    }
  });

  it("records cleanup evidence after a partial start-transition failure", async () => {
    const { context, database, repository } = createRepository();
    const exception: StartTransitionExceptionRecord = {
      cardKey: "feature/example",
      cleanedAt: "2026-07-21T10:05:00.000Z",
      effectiveStateAfter: "ready",
      failedAtStep: "folder_move",
      failureReason: "target unavailable",
      projectId: "project-a",
      rolledBack: true,
      runId: "run-a",
    };

    try {
      await repository.recordStartTransitionException(exception);
      expect(
        context.get<{ failure_reason: string; rolled_back: number }>(
          "select failure_reason, rolled_back from hepha_start_transition_exceptions where run_id = ?",
          [exception.runId],
        ),
      ).toEqual({ failure_reason: "target unavailable", rolled_back: 1 });
    } finally {
      database.close();
    }
  });

  it("upserts, retrieves, and lists delivery metadata", async () => {
    const { database, repository } = createRepository();
    const clockNow = "2026-07-21T10:00:00.000Z";

    try {
      const created = await repository.upsertDeliveryMetadata(delivery, clockNow);
      expect(created).toEqual({ ...delivery, createdAt: clockNow, updatedAt: clockNow });
      await expect(
        repository.getDeliveryMetadata(delivery.projectId, delivery.cardKey),
      ).resolves.toEqual(created);
      await expect(repository.listDeliveryMetadata(delivery.projectId)).resolves.toEqual([created]);
    } finally {
      database.close();
    }
  });
});
