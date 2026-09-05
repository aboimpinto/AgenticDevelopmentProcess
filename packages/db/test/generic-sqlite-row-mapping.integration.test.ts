import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-sqlite-row-mapping.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repositoriesRoot = resolve(testRoot, "../src/sqlite/repositories");
const persistenceSources = [
  facade,
  ...readdirSync(repositoriesRoot)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(resolve(repositoriesRoot, name), "utf8")),
].join("\n");

describe("generic SQLite row-mapping Gherkin integration", () => {
  it("specifies four identity-blind row-mapping paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("keeps SQLite persistence connected to every bounded mapper family", () => {
    for (const moduleName of ["approval", "card", "delivery", "manual-test", "review", "telemetry", "workflow"]) {
      expect(persistenceSources).toContain(`row-mappers/${moduleName}-row-mapper`);
    }
    expect(facade).not.toContain("interface StoredCardMetadataRow");
    expect(facade).not.toContain("function mapReviewFindingLedgerRow");
  });
});
