import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCardMetadataStore, type ManualTestVerificationPackRecord } from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-manual-test-repository.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-manual-test-repository.ts"),
  "utf8",
);

describe("generic SQLite manual-test repository Gherkin integration", () => {
  it("specifies four identity-blind manual-verification paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists a pack through the production metadata-store facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
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

    try {
      await store.recordManualTestPack(pack);
      await expect(store.getCurrentManualTestPack(pack.projectId, pack.cardKey)).resolves.toEqual(pack);
      expect(facade).toContain("new SqliteManualTestRepository");
      expect(facade).toContain("return this.manualTests.recordManualTestPack(record)");
      expect(repository).toContain("export class SqliteManualTestRepository");
      expect(facade).not.toContain("insert into hepha_manual_test_packs");
    } finally {
      await store.close();
    }
  });
});
