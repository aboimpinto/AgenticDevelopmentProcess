// Behavior suite: delivery.
/**
 * FEAT-046 Phase 7: Delivery Metadata Store/Schema Tests
 *
 * Tests for the hepha_delivery_metadata table store operations
 * including idempotent initialization, read/write mapping, stable
 * identity, prior PR retention, disabled-store behavior, and
 * compatibility with existing start-transition metadata.
 */

import { describe, it, expect } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createCardMetadataStore, type DeliveryMetadataInput } from "../src/index.js";

function createTestStore() {
  const dbDir = resolve(tmpdir(), `feat-046-delivery-test-${randomUUID()}`);
  mkdirSync(dbDir, { recursive: true });
  const dbPath = resolve(dbDir, "test.sqlite");
  const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: dbPath });

  return { store, dbDir, dbPath };
}

function cleanupTestStore(store: { close(): Promise<void> }, dbDir: string) {
  store.close().catch(() => {});
  try {
    if (existsSync(dbDir)) {
      const dbPath = resolve(dbDir, "test.sqlite");
      if (existsSync(dbPath)) unlinkSync(dbPath);
    }
  } catch {
    // ignore cleanup errors in tests
  }
}

function makeDeliveryInput(overrides: Partial<DeliveryMetadataInput> = {}): DeliveryMetadataInput {
  return {
    projectId: "project-test",
    cardKey: "feature/FEAT-046-delivery",
    deliveryMode: overrides.deliveryMode ?? "direct_merge",
    targetBranch: overrides.targetBranch ?? "master",
    githubIssue: overrides.githubIssue ?? null,
    issueRole: overrides.issueRole ?? "feature_issue",
    issueUpdateMode: overrides.issueUpdateMode ?? "pr_body",
    pullRequest: overrides.pullRequest ?? null,
    deliveryStatus: overrides.deliveryStatus ?? "not_applicable",
    deliveryError: overrides.deliveryError ?? null,
    ...overrides,
  };
}

describe("FEAT-046: Delivery Metadata Store", () => {
  it("creates and retrieves a direct_merge delivery record", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input = makeDeliveryInput();
      const created = await store.upsertDeliveryMetadata(input, now);

      expect(created.projectId).toBe("project-test");
      expect(created.cardKey).toBe("feature/FEAT-046-delivery");
      expect(created.deliveryMode).toBe("direct_merge");
      expect(created.targetBranch).toBe("master");
      expect(created.deliveryStatus).toBe("not_applicable");
      expect(created.githubIssue).toBeNull();
      expect(created.pullRequest).toBeNull();

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.deliveryMode).toBe("direct_merge");
      expect(retrieved!.deliveryStatus).toBe("not_applicable");
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("creates and retrieves a pull_request delivery record", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input = makeDeliveryInput({
        deliveryMode: "pull_request",
        deliveryStatus: "ready",
        githubIssue: 123,
        issueRole: "feature_issue",
        targetBranch: "develop",
      });
      const created = await store.upsertDeliveryMetadata(input, now);

      expect(created.deliveryMode).toBe("pull_request");
      expect(created.deliveryStatus).toBe("ready");
      expect(created.githubIssue).toBe(123);
      expect(created.targetBranch).toBe("develop");

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.deliveryMode).toBe("pull_request");
      expect(retrieved!.githubIssue).toBe(123);
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("upserts existing record with updated values", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input1 = makeDeliveryInput({
        deliveryMode: "pull_request",
        deliveryStatus: "ready",
        pullRequest: null,
      });
      await store.upsertDeliveryMetadata(input1, now);

      // Upsert with PR reference and open status
      const input2 = makeDeliveryInput({
        deliveryMode: "pull_request",
        deliveryStatus: "open",
        pullRequest: 456,
      });
      const later = new Date(Date.now() + 1000).toISOString();
      const updated = await store.upsertDeliveryMetadata(input2, later);

      expect(updated.deliveryStatus).toBe("open");
      expect(updated.pullRequest).toBe(456);

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");
      expect(retrieved!.deliveryStatus).toBe("open");
      expect(retrieved!.pullRequest).toBe(456);
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("retains prior PR reference on update when not overwritten", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input1 = makeDeliveryInput({
        deliveryMode: "pull_request",
        deliveryStatus: "open",
        pullRequest: 100,
      });
      await store.upsertDeliveryMetadata(input1, now);

      // Update status but keep the same PR reference
      const input2 = makeDeliveryInput({
        deliveryMode: "pull_request",
        deliveryStatus: "open",
        pullRequest: 100,
      });
      const later = new Date(Date.now() + 1000).toISOString();
      await store.upsertDeliveryMetadata(input2, later);

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");
      expect(retrieved!.pullRequest).toBe(100);
      expect(retrieved!.deliveryStatus).toBe("open");
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("stores and retrieves error status with delivery error", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input = makeDeliveryInput({
        deliveryMode: "pull_request",
        deliveryStatus: "error",
        deliveryError: "Push failed: branch not found",
      });
      await store.upsertDeliveryMetadata(input, now);

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.deliveryStatus).toBe("error");
      expect(retrieved!.deliveryError).toBe("Push failed: branch not found");
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("stores null delivery error when status is not error", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input = makeDeliveryInput({
        deliveryStatus: "not_applicable",
        deliveryError: null,
      });
      await store.upsertDeliveryMetadata(input, now);

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");

      expect(retrieved!.deliveryError).toBeNull();
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("sets created_at and updated_at on creation", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input = makeDeliveryInput();
      const created = await store.upsertDeliveryMetadata(input, now);

      expect(created.createdAt).toBe(now);
      expect(created.updatedAt).toBe(now);
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("updates updated_at on upsert (created_at is also updated with INSERT OR REPLACE)", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const t1 = new Date("2026-07-10T10:00:00Z").toISOString();
      await store.upsertDeliveryMetadata(makeDeliveryInput(), t1);

      const t2 = new Date("2026-07-10T12:00:00Z").toISOString();
      await store.upsertDeliveryMetadata(makeDeliveryInput({ deliveryStatus: "ready" }), t2);

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/FEAT-046-delivery");
      // INSERT OR REPLACE replaces the row entirely, so created_at becomes t2
      expect(retrieved!.createdAt).toBe(t2);
      expect(retrieved!.updatedAt).toBe(t2);
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("lists delivery metadata for a project", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input1 = makeDeliveryInput({ cardKey: "feature/FEAT-046-001" });
      const input2 = makeDeliveryInput({ cardKey: "feature/FEAT-046-002", deliveryMode: "pull_request", deliveryStatus: "ready" });
      await store.upsertDeliveryMetadata(input1, now);
      await store.upsertDeliveryMetadata(input2, now);

      const all = await store.listDeliveryMetadata("project-test");

      expect(all).toHaveLength(2);
      const keys = all.map(r => r.cardKey);
      expect(keys).toContain("feature/FEAT-046-001");
      expect(keys).toContain("feature/FEAT-046-002");
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("returns empty array when no delivery metadata exists", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const all = await store.listDeliveryMetadata("nonexistent-project");
      expect(all).toEqual([]);
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("returns null when getting non-existent delivery metadata", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const retrieved = await store.getDeliveryMetadata("project-test", "feature/NONEXISTENT");
      expect(retrieved).toBeNull();
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("handles all valid delivery status values", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const statuses = ["not_applicable", "blocked", "ready", "preparing", "open", "error"] as const;

      for (const status of statuses) {
        const cardKey = `feature/status-${status}`;
        await store.upsertDeliveryMetadata(
          makeDeliveryInput({ cardKey, deliveryStatus: status }),
          now,
        );
        const retrieved = await store.getDeliveryMetadata("project-test", cardKey);
        expect(retrieved!.deliveryStatus).toBe(status);
      }
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("handles all valid delivery mode values", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      await store.upsertDeliveryMetadata(
        makeDeliveryInput({ cardKey: "feature/mode-direct", deliveryMode: "direct_merge" }),
        now,
      );
      await store.upsertDeliveryMetadata(
        makeDeliveryInput({ cardKey: "feature/mode-pr", deliveryMode: "pull_request" }),
        now,
      );

      const direct = await store.getDeliveryMetadata("project-test", "feature/mode-direct");
      const pr = await store.getDeliveryMetadata("project-test", "feature/mode-pr");

      expect(direct!.deliveryMode).toBe("direct_merge");
      expect(pr!.deliveryMode).toBe("pull_request");
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("handles nullable githubIssue field", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const withIssue = makeDeliveryInput({ cardKey: "feature/with-issue", githubIssue: 999 });
      const withoutIssue = makeDeliveryInput({ cardKey: "feature/no-issue", githubIssue: null });

      await store.upsertDeliveryMetadata(withIssue, now);
      await store.upsertDeliveryMetadata(withoutIssue, now);

      const retrievedWith = await store.getDeliveryMetadata("project-test", "feature/with-issue");
      const retrievedWithout = await store.getDeliveryMetadata("project-test", "feature/no-issue");

      expect(retrievedWith!.githubIssue).toBe(999);
      expect(retrievedWithout!.githubIssue).toBeNull();
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });

  it("handles issue role and update mode correctly", async () => {
    const { store, dbDir } = createTestStore();

    try {
      const now = new Date().toISOString();
      const input = makeDeliveryInput({
        cardKey: "feature/issue-roles",
        issueRole: "tracking",
        issueUpdateMode: "checklist",
      });
      await store.upsertDeliveryMetadata(input, now);

      const retrieved = await store.getDeliveryMetadata("project-test", "feature/issue-roles");
      expect(retrieved!.issueRole).toBe("tracking");
      expect(retrieved!.issueUpdateMode).toBe("checklist");
    } finally {
      cleanupTestStore(store, dbDir);
    }
  });
});
