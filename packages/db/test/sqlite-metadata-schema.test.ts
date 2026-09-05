import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { SqliteMetadataSchema } from "../src/sqlite/sqlite-metadata-schema.js";

function names(database: DatabaseSync, type: "index" | "table") {
  return database
    .prepare("select name from sqlite_schema where type = ? order by name")
    .all(type)
    .map((row) => (row as { name: string }).name);
}

describe("SqliteMetadataSchema", () => {
  it("creates the complete metadata schema and remains idempotent", () => {
    const database = new DatabaseSync(":memory:");

    try {
      const schema = new SqliteMetadataSchema(database);
      schema.ensure();
      schema.ensure();

      expect(names(database, "table")).toEqual(
        expect.arrayContaining([
          "hepha_agent_invocations",
          "hepha_approval_requests",
          "hepha_card_metadata",
          "hepha_deep_dive_sessions",
          "hepha_delivery_metadata",
          "hepha_feature_findings",
          "hepha_final_verification_checks",
          "hepha_implementation_phase_runs",
          "hepha_manual_test_results",
          "hepha_normalized_events",
          "hepha_phase_lifecycle_events",
          "hepha_review_finding_ledger",
          "hepha_start_transitions",
        ]),
      );
      expect(names(database, "index")).toEqual(
        expect.arrayContaining([
          "hepha_agent_invocations_project_idx",
          "hepha_card_metadata_project_external_idx",
          "hepha_manual_test_results_pack_idx",
          "hepha_phase_lifecycle_events_replay_idx",
          "hepha_review_finding_ledger_fingerprint_idx",
        ]),
      );
    } finally {
      database.close();
    }
  });

  it("adds newly required columns to an existing compatible table", () => {
    const database = new DatabaseSync(":memory:");

    try {
      database.exec(`
        create table hepha_implementation_agent_runs (
          id text primary key,
          project_id text not null,
          card_key text not null,
          workflow_run_id text not null,
          phase_number integer,
          agent_role text not null,
          agent_name text not null,
          model text not null
        );
      `);

      new SqliteMetadataSchema(database).ensure();

      const columns = database
        .prepare("pragma table_info(hepha_implementation_agent_runs)")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(columns).toContain("invocation_id");
    } finally {
      database.close();
    }
  });

  it("migrates legacy workflow constraints without losing card metadata", () => {
    const database = new DatabaseSync(":memory:");

    try {
      database.exec(`
        create table hepha_card_metadata (
          project_id text not null,
          card_key text not null,
          kind text not null check (kind in ('epic', 'feature')),
          external_id text not null,
          title text not null,
          state_folder text not null,
          source_document_path text,
          source_document_hash text,
          source_document_mtime text,
          source_document_size integer,
          last_hepha_deep_dive_at text,
          last_hepha_deep_dive_run_id text,
          last_hepha_deep_dive_source_hash text,
          last_hepha_deep_dive_source_mtime text,
          workflow_command text check (workflow_command in ('start-implementing', 'continue-implementing')),
          workflow_status text check (workflow_status in ('running', 'completed', 'failed')),
          workflow_run_id text,
          workflow_started_at text,
          workflow_completed_at text,
          workflow_current_step text,
          workflow_summary text,
          workflow_error text,
          created_at text not null,
          updated_at text not null,
          primary key (project_id, card_key)
        );

        insert into hepha_card_metadata (
          project_id, card_key, kind, external_id, title, state_folder, created_at, updated_at
        ) values (
          'project-a', 'feature/example', 'feature', 'EXAMPLE', 'Example', 'in-progress',
          '2026-07-21T10:00:00.000Z', '2026-07-21T10:00:00.000Z'
        );
      `);

      new SqliteMetadataSchema(database).ensure();

      const definition = database
        .prepare("select sql from sqlite_schema where type = 'table' and name = 'hepha_card_metadata'")
        .get() as { sql: string };
      const row = database
        .prepare("select project_id, card_key, title from hepha_card_metadata")
        .get();

      expect(definition.sql).toContain("'blocked'");
      expect(definition.sql).toContain("'cancelled'");
      expect(definition.sql).toContain("'deep-dive-epic'");
      expect(row).toEqual({ card_key: "feature/example", project_id: "project-a", title: "Example" });
    } finally {
      database.close();
    }
  });
});
