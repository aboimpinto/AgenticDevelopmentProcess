import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCardMetadataStore, type StartTransitionRecord } from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-delivery-repository.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-delivery-repository.ts"),
  "utf8",
);

describe("generic SQLite delivery repository Gherkin integration", () => {
  it("specifies four identity-blind transition and delivery paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists a transition through the production metadata-store facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const record: StartTransitionRecord = {
      baseBranch: "master",
      cardKey: "feature/example",
      completedAt: "2026-07-21T10:01:00.000Z",
      deliveryPolicy: "direct_merge",
      failureReason: null,
      implementationBranch: "feat/example",
      projectId: "project-a",
      repoRoot: "/tmp/repository",
      rolledBack: false,
      runId: "run-a",
      startCommit: "abc123",
      startedAt: "2026-07-21T10:00:00.000Z",
      transitionStatus: "transition_completed",
      transitionStep: "folder_moved",
      worktreePath: "/tmp/worktree",
    };

    try {
      await store.recordStartTransition(record);
      await expect(store.getStartTransition(record.cardKey, record.projectId, record.runId)).resolves.toEqual(record);
      expect(facade).toContain("new SqliteDeliveryRepository(this.query)");
      expect(facade).toContain("return this.delivery.recordStartTransition(record)");
      expect(repository).toContain("export class SqliteDeliveryRepository");
      expect(facade).not.toContain("insert or replace into hepha_start_transitions");
    } finally {
      await store.close();
    }
  });
});
