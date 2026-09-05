#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

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
    "Usage: sync-deep-dive-state.mjs --project-root <path> --memory-bank <path> --item-id <EPIC-or-FEAT-ID> --source-document <path> [--run-id <id>] [--summary <text>]",
    "",
    "Synchronizes HEPHA SQLite metadata after direct Pi deep-dive document updates.",
    "The script is intentionally a no-op when the database, source document, or matching metadata row is absent.",
    "It will not overwrite a running non-deep-dive workflow for the same card.",
  ].join("\n");
}

function normalizePath(value) {
  return resolve(value).replace(/\\/g, "/");
}

function hashText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(usage());
    return;
  }

  const projectRoot = args["project-root"];
  const memoryBank = args["memory-bank"];
  const itemId = args["item-id"]?.toUpperCase();
  const sourceDocument = args["source-document"];

  if (!projectRoot || !memoryBank || !itemId || !sourceDocument) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const kind = itemId.startsWith("EPIC-") ? "epic" : itemId.startsWith("FEAT-") ? "feature" : null;

  if (!kind) {
    console.error(`HEPHA metadata sync skipped: item id must start with EPIC- or FEAT- (${itemId}).`);
    return;
  }

  const documentPath = resolve(sourceDocument);

  if (!existsSync(documentPath)) {
    console.log(`HEPHA metadata sync skipped: source document not found at ${documentPath}`);
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
  const markdown = readFileSync(documentPath, "utf8");
  const documentStats = statSync(documentPath);
  const documentHash = hashText(markdown);
  const documentUpdatedAt = documentStats.mtime.toISOString();
  const cardKey = `${kind}:${itemId}`;
  const workflowCommand = kind === "epic" ? "deep-dive-epic" : "deep-dive-feature";
  const normalizedMemoryBank = normalizePath(memoryBank);
  const normalizedDocumentPath = normalizePath(documentPath);
  const sourceLike = `${normalizedMemoryBank}/%`;
  const runId = args["run-id"] ?? `workflow-direct-deep-dive-${itemId.toLowerCase()}-${Date.now()}`;
  const summary = args.summary ?? `Completed ${itemId} Deep-Dive through direct Pi skill.`;

  const rows = db
    .prepare(
      `
      select project_id, card_key, workflow_command, workflow_status
      from hepha_card_metadata
      where card_key = ?
        and (
          source_document_path is null
          or replace(source_document_path, '\\', '/') = ?
          or replace(source_document_path, '\\', '/') like ?
        )
      `,
    )
    .all(cardKey, normalizedDocumentPath, sourceLike);

  if (rows.length === 0) {
    console.log(`HEPHA metadata sync skipped: no metadata row matched ${cardKey} under ${normalizedMemoryBank}`);
    db.close();
    return;
  }

  const syncableRows = rows.filter(
    (row) =>
      row.workflow_status !== "running" ||
      row.workflow_command === "deep-dive-epic" ||
      row.workflow_command === "deep-dive-feature",
  );
  const skippedRunningRows = rows.length - syncableRows.length;

  if (syncableRows.length === 0) {
    console.log(
      `HEPHA metadata sync skipped: ${cardKey} has a running non-deep-dive workflow in HEPHA metadata.`,
    );
    db.close();
    return;
  }

  const updateCard = db.prepare(
    `
    update hepha_card_metadata
    set
      source_document_path = ?,
      source_document_hash = ?,
      source_document_mtime = ?,
      source_document_size = ?,
      last_hepha_deep_dive_at = ?,
      last_hepha_deep_dive_run_id = ?,
      last_hepha_deep_dive_source_hash = ?,
      last_hepha_deep_dive_source_mtime = ?,
      workflow_command = ?,
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

  db.exec("begin");

  try {
    for (const row of syncableRows) {
      updateCard.run(
        documentPath,
        documentHash,
        documentUpdatedAt,
        documentStats.size,
        now,
        runId,
        documentHash,
        documentUpdatedAt,
        workflowCommand,
        runId,
        now,
        summary,
        now,
        row.project_id,
        row.card_key,
      );
    }

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }

  const skippedText =
    skippedRunningRows > 0 ? ` (${skippedRunningRows} running non-deep-dive row(s) skipped)` : "";
  console.log(`HEPHA metadata sync completed for ${syncableRows.length} ${cardKey} row(s)${skippedText}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
