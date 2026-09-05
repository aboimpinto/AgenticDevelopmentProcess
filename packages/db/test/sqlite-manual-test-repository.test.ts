import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type {
  ManualTestResultRecord,
  ManualTestVerificationPackRecord,
  ManualTestVerificationReviewRecord,
} from "../src/contracts/index.js";
import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../src/sqlite/sqlite-query-context.js";
import { SqliteManualTestRepository } from "../src/sqlite/repositories/sqlite-manual-test-repository.js";

function createRepository() {
  const database = new DatabaseSync(":memory:");
  const context = new SqliteQueryContext(database, new SqliteMetadataSchema(database));
  return { context, database, repository: new SqliteManualTestRepository(context) };
}

const pack: ManualTestVerificationPackRecord = {
  cardKey: "feature/example",
  createdAt: "2026-07-21T10:00:00.000Z",
  id: "pack-a",
  manifestHash: "hash-a",
  markdownPath: "/tmp/manual-tests.md",
  pdfPath: null,
  projectId: "project-a",
  renderError: null,
  state: "current",
  supersededAt: null,
  version: "v1",
};

const review: ManualTestVerificationReviewRecord = {
  cardKey: pack.cardKey,
  id: "review-a",
  invalidatedAt: null,
  invalidatedReason: null,
  packId: pack.id,
  projectId: pack.projectId,
  reviewedAt: "2026-07-21T10:05:00.000Z",
  state: "current",
};

const result: ManualTestResultRecord = {
  actualResult: "Observed expected behavior",
  cardKey: pack.cardKey,
  findingId: null,
  id: "result-a",
  notes: null,
  packId: pack.id,
  projectId: pack.projectId,
  recordedAt: "2026-07-21T10:10:00.000Z",
  result: "pass",
  reviewId: review.id,
  testId: "manual-a",
};

describe("SqliteManualTestRepository", () => {
  it("exposes only the complete manual-test repository method inventory", () => {
    expect(
      Object.getOwnPropertyNames(SqliteManualTestRepository.prototype)
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "getCurrentManualTestPack",
        "getCurrentManualTestReview",
        "getManualTestPack",
        "invalidateManualTestReview",
        "listAllManualTestResults",
        "listManualTestPacks",
        "listManualTestResults",
        "markManualTestPackSuperseded",
        "recordManualTestPack",
        "recordManualTestResult",
        "recordManualTestReview",
        "setManualTestPackState",
      ].sort(),
    );
  });

  it("uses the shared query context for ensured run, get, and all operations", () => {
    const { context, database } = createRepository();

    try {
      context.ensure();
      context.run("insert into hepha_manual_test_packs (id, project_id, card_key, version, state, manifest_hash, markdown_path, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)", [
        "context-pack",
        "project-a",
        "feature/example",
        "v1",
        "current",
        "hash",
        "/tmp/tests.md",
        "2026-07-21T10:00:00.000Z",
      ]);

      expect(context.get<{ id: string }>("select id from hepha_manual_test_packs where id = ?", ["context-pack"])).toEqual({ id: "context-pack" });
      expect(context.all<{ id: string }>("select id from hepha_manual_test_packs")).toEqual([
        { id: "context-pack" },
      ]);
    } finally {
      database.close();
    }
  });

  it("commits successful query-context transactions and rolls back failures", () => {
    const { context, database } = createRepository();

    try {
      context.ensure();
      context.transaction(() => {
        context.run(
          "insert into hepha_manual_test_packs (id, project_id, card_key, version, state, manifest_hash, markdown_path, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            "committed-pack",
            "project-a",
            "feature/example",
            "v1",
            "current",
            "hash",
            "/tmp/tests.md",
            "2026-07-21T10:00:00.000Z",
          ],
        );
      });
      expect(context.get<{ id: string }>("select id from hepha_manual_test_packs")).toEqual({
        id: "committed-pack",
      });

      expect(() =>
        context.transaction(() => {
          context.run("delete from hepha_manual_test_packs");
          throw new Error("abort transaction");
        }),
      ).toThrow("abort transaction");
      expect(context.get<{ id: string }>("select id from hepha_manual_test_packs")).toEqual({
        id: "committed-pack",
      });
    } finally {
      database.close();
    }
  });

  it("records, updates, lists, and supersedes verification packs", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordManualTestPack(pack);
      expect(await repository.getCurrentManualTestPack(pack.projectId, pack.cardKey)).toEqual(pack);
      expect(await repository.getManualTestPack(pack.projectId, pack.cardKey, pack.id)).toEqual(pack);
      expect(await repository.listManualTestPacks(pack.projectId, pack.cardKey)).toEqual([pack]);

      await repository.setManualTestPackState(
        pack.projectId,
        pack.cardKey,
        pack.id,
        "render_failed",
        "renderer unavailable",
      );
      expect(await repository.getManualTestPack(pack.projectId, pack.cardKey, pack.id)).toMatchObject({
        renderError: "renderer unavailable",
        state: "render_failed",
      });

      await repository.markManualTestPackSuperseded(
        pack.projectId,
        pack.cardKey,
        pack.id,
        "2026-07-21T10:20:00.000Z",
      );
      expect(await repository.getCurrentManualTestPack(pack.projectId, pack.cardKey)).toBeNull();
    } finally {
      database.close();
    }
  });

  it("records and invalidates the current human review", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordManualTestPack(pack);
      await expect(repository.recordManualTestReview(review)).resolves.toBe(review);
      expect(await repository.getCurrentManualTestReview(pack.projectId, pack.cardKey)).toEqual(review);

      await repository.invalidateManualTestReview(
        pack.projectId,
        pack.cardKey,
        review.id,
        "2026-07-21T10:15:00.000Z",
        "implementation changed",
      );
      expect(await repository.getCurrentManualTestReview(pack.projectId, pack.cardKey)).toBeNull();
    } finally {
      database.close();
    }
  });

  it("stores idempotent manual results and supports pack and card projections", async () => {
    const { database, repository } = createRepository();

    try {
      await repository.recordManualTestPack(pack);
      await repository.recordManualTestReview(review);
      await repository.recordManualTestResult(result);
      await repository.recordManualTestResult({ ...result, actualResult: "ignored duplicate" });

      expect(await repository.listManualTestResults(pack.projectId, pack.cardKey, pack.id)).toEqual([
        result,
      ]);
      expect(await repository.listAllManualTestResults(pack.projectId, pack.cardKey)).toEqual([
        result,
      ]);
    } finally {
      database.close();
    }
  });
});
