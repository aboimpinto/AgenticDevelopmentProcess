import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REVIEW_GOVERNANCE_MIGRATIONS,
  applyReviewGovernanceMigrations,
} from "../src/review-governance/migrations/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-review-governance-migrations.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review governance migration Gherkin integration", () => {
  it("specifies four identity-blind migration behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("executes the production migration boundary against a new database", () => {
    const database = new DatabaseSync(":memory:");
    applyReviewGovernanceMigrations(database, () => "2026-07-21T08:00:00.000Z");

    expect(database.prepare(
      "select version from hepha_review_schema_migrations order by version",
    ).all()).toEqual(REVIEW_GOVERNANCE_MIGRATIONS.map(({ version }) => ({ version })));
    database.close();
  });

  it("keeps SQL ownership outside the production facade", () => {
    expect(facade).toContain(
      'import { applyReviewGovernanceMigrations } from "./review-governance/migrations/index.js"',
    );
    expect(facade).toContain("applyReviewGovernanceMigrations(this.database)");
    expect(facade).not.toContain("create table if not exists hepha_review_artifacts");
    expect(facade).not.toContain("MIGRATION_V1_SQL");
  });
});
