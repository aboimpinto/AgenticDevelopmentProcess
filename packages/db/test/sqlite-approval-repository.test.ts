import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type { StoredApprovalRequest } from "../src/contracts/index.js";
import { SqliteApprovalRepository } from "../src/sqlite/repositories/sqlite-approval-repository.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";

const resolvedAt = "2026-07-21T12:00:00.000Z";

function createRepository() {
  const database = new DatabaseSync(":memory:");
  const context = new SqliteQueryContext(database, new SqliteMetadataSchema(database));
  return {
    database,
    repository: new SqliteApprovalRepository(context, () => resolvedAt),
  };
}

function approval(
  id: string,
  requestedAt: string,
  timeoutDeadline: string | null = null,
): StoredApprovalRequest {
  return {
    actionSummary: "Publish prepared changes",
    cardKey: "work-item/example",
    id,
    matchedRuleId: "remote-write",
    policyDecisionJson: '{"decision":"approval_required"}',
    policyReason: "Remote mutation requires human authorization.",
    projectId: "project-a",
    requestedAt,
    resolutionReason: null,
    resolvedAt: null,
    resolvedBy: null,
    riskCategory: "remote_mutation",
    runId: "agent-run-a",
    safeCommandSummary: "Push the current branch",
    status: "pending",
    timeoutDeadline,
    updatedAt: requestedAt,
    workflowRunId: "workflow-a",
  };
}

describe("SqliteApprovalRepository", () => {
  it("exposes only the approval persistence method inventory", () => {
    expect(
      Object.getOwnPropertyNames(SqliteApprovalRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "createApprovalRequest",
        "finalizeTimedOutApprovals",
        "getApprovalRequest",
        "listApprovalRequests",
        "listApprovalRequestsByCard",
        "resolveApprovalRequest",
      ].sort(),
    );
  });

  it("creates, retrieves, filters, limits, and orders approval requests", async () => {
    const { database, repository } = createRepository();
    const earlier = approval("approval-a", "2026-07-21T10:00:00.000Z");
    const later = approval("approval-b", "2026-07-21T11:00:00.000Z");

    try {
      await expect(repository.createApprovalRequest(earlier)).resolves.toEqual(earlier);
      await repository.createApprovalRequest(later);
      await expect(repository.getApprovalRequest(earlier.id)).resolves.toEqual(earlier);
      await expect(repository.listApprovalRequests(earlier.projectId)).resolves.toEqual([
        later,
        earlier,
      ]);
      await expect(repository.listApprovalRequests(earlier.projectId, "all", 1)).resolves.toEqual([
        later,
      ]);
      await expect(
        repository.listApprovalRequestsByCard(earlier.projectId, earlier.cardKey),
      ).resolves.toEqual([later, earlier]);
    } finally {
      database.close();
    }
  });

  it("resolves pending approvals once and preserves the first final decision", async () => {
    const { database, repository } = createRepository();
    const pending = approval("approval-a", "2026-07-21T10:00:00.000Z");

    try {
      await repository.createApprovalRequest(pending);
      await expect(
        repository.resolveApprovalRequest(
          pending.id,
          "approved",
          "operator",
          "The proposed action is expected.",
        ),
      ).resolves.toEqual({
        ...pending,
        resolutionReason: "The proposed action is expected.",
        resolvedAt,
        resolvedBy: "operator",
        status: "approved",
        updatedAt: resolvedAt,
      });
      await expect(
        repository.resolveApprovalRequest(pending.id, "denied", "another-operator", null),
      ).resolves.toMatchObject({ resolvedBy: "operator", status: "approved" });
      await expect(
        repository.resolveApprovalRequest("missing", "denied", "operator", null),
      ).resolves.toBeNull();
    } finally {
      database.close();
    }
  });

  it("finalizes only pending approvals whose deadline has elapsed", async () => {
    const { database, repository } = createRepository();
    const expired = approval(
      "approval-expired",
      "2026-07-21T09:00:00.000Z",
      "2026-07-21T10:00:00.000Z",
    );
    const current = approval(
      "approval-current",
      "2026-07-21T10:00:00.000Z",
      "2026-07-21T13:00:00.000Z",
    );

    try {
      await repository.createApprovalRequest(expired);
      await repository.createApprovalRequest(current);
      await expect(repository.finalizeTimedOutApprovals(resolvedAt)).resolves.toBe(1);
      await expect(repository.getApprovalRequest(expired.id)).resolves.toMatchObject({
        resolutionReason: "Approval deadline elapsed",
        resolvedAt,
        resolvedBy: "timeout",
        status: "timed_out",
      });
      await expect(repository.getApprovalRequest(current.id)).resolves.toMatchObject({
        status: "pending",
      });
    } finally {
      database.close();
    }
  });
});
