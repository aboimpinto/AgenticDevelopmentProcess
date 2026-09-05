import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  REVIEW_GOVERNANCE_MIGRATIONS,
  applyReviewGovernanceMigrations,
} from "../src/review-governance/migrations/index.js";

const appliedAt = "2026-07-21T08:00:00.000Z";

describe("review governance migrations", () => {
  it("declares the immutable migrations once and in version order", () => {
    expect(REVIEW_GOVERNANCE_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2, 3]);
    for (const migration of REVIEW_GOVERNANCE_MIGRATIONS) {
      expect(migration.sql.trim().length).toBeGreaterThan(0);
    }
  });

  it("applies every version and records deterministic ledger entries", () => {
    const database = new DatabaseSync(":memory:");
    applyReviewGovernanceMigrations(database, () => appliedAt);

    expect(database.prepare(
      "select version, applied_at as appliedAt from hepha_review_schema_migrations order by version",
    ).all()).toEqual([
      { version: 1, appliedAt },
      { version: 2, appliedAt },
      { version: 3, appliedAt },
    ]);
    expect(database.prepare(
      "select name from sqlite_master where type = 'table' and name = 'hepha_review_replan_requests'",
    ).get()).toEqual({ name: "hepha_review_replan_requests" });
    database.close();
  });

  it("is idempotent and preserves existing immutable evidence", () => {
    const database = new DatabaseSync(":memory:");
    applyReviewGovernanceMigrations(database, () => appliedAt);
    database.prepare(
      `insert into hepha_review_safe_incidents
       (incident_id, project_id, stage, incident_code, created_at)
       values (?, ?, ?, ?, ?)`,
    ).run("incident-alpha", "project-alpha", "storage", "safe", appliedAt);

    applyReviewGovernanceMigrations(database, () => "2026-07-21T09:00:00.000Z");

    expect(database.prepare("select count(*) as count from hepha_review_schema_migrations").get())
      .toEqual({ count: 3 });
    expect(database.prepare("select incident_id as incidentId from hepha_review_safe_incidents").all())
      .toEqual([{ incidentId: "incident-alpha" }]);
    database.close();
  });

  it("rolls back a failed version without recording it", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      create table hepha_review_schema_migrations (
        version integer primary key,
        applied_at text not null
      );
      insert into hepha_review_schema_migrations values (1, '${appliedAt}');
      insert into hepha_review_schema_migrations values (2, '${appliedAt}');
      create table hepha_review_defect_class_observations (incompatible text);
    `);

    expect(() => applyReviewGovernanceMigrations(database, () => appliedAt))
      .toThrow(/^REVIEW_GOVERNANCE_SCHEMA_FAILED:/);
    expect(database.prepare("select version from hepha_review_schema_migrations order by version").all())
      .toEqual([{ version: 1 }, { version: 2 }]);
    expect(database.prepare(
      "select name from sqlite_master where type = 'table' and name = 'hepha_review_replan_requests'",
    ).get()).toBeUndefined();
    database.close();
  });
});
