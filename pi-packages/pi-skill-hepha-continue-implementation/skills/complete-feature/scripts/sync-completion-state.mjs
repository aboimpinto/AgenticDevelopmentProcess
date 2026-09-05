#!/usr/bin/env node
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      args[key] = "1";
      continue;
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function usage() {
  return [
    "Usage: sync-completion-state.mjs --project-root <path> --memory-bank <path> --feat-id <FEAT-ID> --feat-folder <folder> [--summary <text>] [--run-id <id>]",
    "",
    "Synchronizes HEPHA SQLite metadata after direct Pi complete-feature finalization.",
    "The script is intentionally a no-op when the database or matching metadata row is absent.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(usage());
    return;
  }

  const projectRoot = args["project-root"];
  const memoryBank = args["memory-bank"];
  const featId = args["feat-id"]?.toUpperCase();
  const featFolder = args["feat-folder"];

  if (!projectRoot || !memoryBank || !featId || !featFolder) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const databasePath = args.database
    ? resolve(args.database)
    : resolve(projectRoot, ".hepha", "hepha.sqlite");

  if (!existsSync(databasePath)) {
    console.log(`HEPHA metadata sync skipped: database not found at ${databasePath}`);
    return;
  }

  let sqliteModule;

  try {
    sqliteModule = await import("node:sqlite");
  } catch (error) {
    console.log(`HEPHA metadata sync skipped: node:sqlite unavailable (${error.message})`);
    return;
  }

  const { DatabaseSync } = sqliteModule;
  const db = new DatabaseSync(databasePath);
  const now = new Date().toISOString();
  const cardKey = `feature:${featId}`;
  const normalizedMemoryBank = resolve(memoryBank);
  const completedDocumentPath = resolve(
    normalizedMemoryBank,
    "Features",
    "04_COMPLETED",
    basename(featFolder),
    "FeatureDescription.md",
  );
  const sourceLike = `${normalizedMemoryBank.replace(/\\/g, "/")}/%`;
  const summary = args.summary ?? `Completed ${featId} through direct Pi complete-feature skill.`;
  const runId = args["run-id"] ?? `workflow-direct-complete-feature-${featId.toLowerCase()}-${Date.now()}`;

  const rows = db
    .prepare(
      `
      select project_id, card_key
      from hepha_card_metadata
      where card_key = ?
        and (
          source_document_path is null
          or replace(source_document_path, '\\', '/') like ?
        )
      `,
    )
    .all(cardKey, sourceLike);

  if (rows.length === 0) {
    console.log(`HEPHA metadata sync skipped: no metadata row matched ${cardKey} under ${normalizedMemoryBank}`);
    db.close();
    return;
  }

  const updateCard = db.prepare(
    `
    update hepha_card_metadata
    set
      state_folder = '04_COMPLETED',
      source_document_path = ?,
      user_code_review_completed_at = coalesce(user_code_review_completed_at, ?),
      manual_tests_completed_at = coalesce(manual_tests_completed_at, ?),
      workflow_command = 'complete-feature',
      workflow_status = 'completed',
      workflow_run_id = ?,
      workflow_completed_at = ?,
      workflow_current_node_id = null,
      workflow_current_step = null,
      workflow_summary = ?,
      workflow_error = null,
      updated_at = ?
    where project_id = ?
      and card_key = ?
    `,
  );
  const updateAgents = db.prepare(
    `
    update hepha_implementation_agent_runs
    set
      status = 'completed',
      current_step = 'Complete Feature completed from direct Pi skill',
      summary = ?,
      error = null,
      completed_at = ?,
      updated_at = ?
    where project_id = ?
      and card_key = ?
      and agent_role = 'complete-feature'
      and status = 'running'
    `,
  );

  db.exec("begin");

  try {
    for (const row of rows) {
      updateCard.run(completedDocumentPath, now, now, runId, now, summary, now, row.project_id, row.card_key);
      updateAgents.run(summary, now, now, row.project_id, row.card_key);
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }

  console.log(`HEPHA metadata sync completed for ${rows.length} ${cardKey} row(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
