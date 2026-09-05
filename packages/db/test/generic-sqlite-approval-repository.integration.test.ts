import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCardMetadataStore, type StoredApprovalRequest } from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-approval-repository.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-approval-repository.ts"),
  "utf8",
);

describe("generic SQLite approval repository Gherkin integration", () => {
  it("specifies four identity-blind approval persistence paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists and resolves authorization through the production facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const request: StoredApprovalRequest = {
      actionSummary: "Publish prepared changes",
      cardKey: "work-item/example",
      id: "approval-a",
      matchedRuleId: "remote-write",
      policyDecisionJson: '{"decision":"approval_required"}',
      policyReason: "Remote mutation requires authorization.",
      projectId: "project-a",
      requestedAt: "2026-07-21T10:00:00.000Z",
      resolutionReason: null,
      resolvedAt: null,
      resolvedBy: null,
      riskCategory: "remote_mutation",
      runId: "agent-run-a",
      safeCommandSummary: "Push the current branch",
      status: "pending",
      timeoutDeadline: null,
      updatedAt: "2026-07-21T10:00:00.000Z",
      workflowRunId: "workflow-a",
    };

    try {
      await store.createApprovalRequest(request);
      await expect(store.getApprovalRequest(request.id)).resolves.toEqual(request);
      await expect(
        store.resolveApprovalRequest(request.id, "approved", "operator", "Action confirmed."),
      ).resolves.toMatchObject({
        resolutionReason: "Action confirmed.",
        resolvedBy: "operator",
        status: "approved",
      });

      expect(facade).toContain("new SqliteApprovalRepository(this.query)");
      expect(facade).toContain("return this.approvals.createApprovalRequest(request)");
      expect(repository).toContain("export class SqliteApprovalRepository");
      expect(facade).not.toContain("insert into hepha_approval_requests");
    } finally {
      await store.close();
    }
  });
});
