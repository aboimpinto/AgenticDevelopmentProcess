import type { DatabaseSync } from "node:sqlite";
import { REVIEW_GOVERNANCE_MIGRATION_V1_SQL } from "./v1.js";
import { REVIEW_GOVERNANCE_MIGRATION_V2_SQL } from "./v2.js";
import { REVIEW_GOVERNANCE_MIGRATION_V3_SQL } from "./v3.js";

export interface ReviewGovernanceMigration {
  readonly version: number;
  readonly sql: string;
}
export const REVIEW_GOVERNANCE_MIGRATIONS: readonly ReviewGovernanceMigration[] = [
  { version: 1, sql: REVIEW_GOVERNANCE_MIGRATION_V1_SQL },
  { version: 2, sql: REVIEW_GOVERNANCE_MIGRATION_V2_SQL },
  { version: 3, sql: REVIEW_GOVERNANCE_MIGRATION_V3_SQL },
];

/**
 * Applies missing review-governance migrations in version order.
 * Each version is atomic and recorded only after its SQL succeeds.
 */
export function applyReviewGovernanceMigrations(
  database: DatabaseSync,
  now: () => string = () => new Date().toISOString(),
): void {
  database.exec(`
    create table if not exists hepha_review_schema_migrations (
      version integer primary key,
      applied_at text not null
    )
  `);

  const hasMigration = (version: number): boolean => Boolean(database
    .prepare("select version from hepha_review_schema_migrations where version = ?")
    .get(version));

  try {
    for (const migration of REVIEW_GOVERNANCE_MIGRATIONS) {
      if (hasMigration(migration.version)) continue;
      database.exec("begin immediate");
      database.exec(migration.sql);
      database
        .prepare("insert into hepha_review_schema_migrations (version, applied_at) values (?, ?)")
        .run(migration.version, now());
      database.exec("commit");
    }
  } catch (error) {
    try {
      database.exec("rollback");
    } catch {
      // No active transaction to roll back.
    }
    throw new Error(
      `REVIEW_GOVERNANCE_SCHEMA_FAILED: schema migrations could not be applied: ${String(error)}`,
    );
  }
}
