import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCardMetadataStore, type ScannedCardMetadata } from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(testDir, "../src/index.ts"), "utf8");
const workflowRunRepositorySource = readFileSync(
  resolve(testDir, "../src/sqlite/repositories/sqlite-workflow-run-repository.ts"),
  "utf8",
);
const cardRepositorySource = readFileSync(
  resolve(testDir, "../src/sqlite/repositories/sqlite-card-repository.ts"),
  "utf8",
);
const schemaSource = readFileSync(
  resolve(testDir, "../src/sqlite/sqlite-metadata-schema.ts"),
  "utf8",
);

function commaSeparatedItems(block: string) {
  return block
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

describe("card metadata SQL", () => {
  it("confirms refined source hashes without replacing the Deep-Dive identity", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const card: ScannedCardMetadata = {
      cardKey: "feature:FEAT-022",
      documentHash: "hash-before-refine",
      documentPath: "/tmp/FeatureDescription.md",
      documentSize: 10,
      documentUpdatedAt: "2026-07-06T19:38:47.006Z",
      externalId: "FEAT-022",
      kind: "feature",
      projectId: "project-1",
      stateFolder: "01_SUBMITTED",
      title: "Minimum Viable Run Receipts",
    };

    try {
      await store.reconcileScannedCards([card]);
      await store.recordHephaDeepDive({
        cardKey: card.cardKey,
        projectId: card.projectId,
        runId: "workflow-deep-dive",
        sourceDocumentHash: "hash-before-refine",
        sourceDocumentUpdatedAt: "2026-07-06T19:38:47.006Z",
        semanticSource: "# FEAT-022\n\nScope remains bounded.",
      });
      await store.recordFeatureUiRequirement({
        cardKey: card.cardKey,
        decision: "no_ui",
        projectId: card.projectId,
        reason: "No user-facing UI change.",
        sourceDocumentHash: "ui-requirement-v2-command-refactor-no-ui:hash-before-refine",
      });

      const before = (await store.reconcileScannedCards([card])).get(card.cardKey);

      await store.confirmFeatureReadinessSource({
        cardKey: card.cardKey,
        projectId: card.projectId,
        sourceDocumentHash: "hash-after-refine",
        sourceDocumentUpdatedAt: "2026-07-06T19:45:41.289Z",
        semanticSource: "# FEAT-022\n\nScope remains bounded.",
        uiRequirementSourceHash: "ui-requirement-v2-command-refactor-no-ui:hash-after-refine",
      });

      const after = (await store.reconcileScannedCards([
        {
          ...card,
          documentHash: "hash-after-refine",
          documentUpdatedAt: "2026-07-06T19:45:41.289Z",
          stateFolder: "02_READY_TO_DEVELOP",
        },
      ])).get(card.cardKey);

      expect(after?.lastDeepDiveAt).toBe(before?.lastDeepDiveAt);
      expect(after?.lastDeepDiveRunId).toBe("workflow-deep-dive");
      expect(after?.lastDeepDiveSourceHash).toBe("hash-after-refine");
      expect(after?.lastDeepDiveSourceUpdatedAt).toBe("2026-07-06T19:45:41.289Z");
      expect(after?.lastDeepDiveSemanticSource).toBe("# FEAT-022\n\nScope remains bounded.");
      expect(after?.uiRequirementDecision).toBe("no_ui");
      expect(after?.uiRequirementSourceHash).toBe("ui-requirement-v2-command-refactor-no-ui:hash-after-refine");
    } finally {
      await store.close();
    }
  });

  it("migrates legacy workflow status constraints before recording cancelled runs", async () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "hepha-card-metadata-"));
    const databasePath = resolve(tempDir, "legacy.sqlite");
    const legacyDatabase = new DatabaseSync(databasePath);

    try {
      legacyDatabase.exec(`
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
          workflow_command text check (workflow_command in ('deep-dive-epic', 'deep-dive-feature', 'design-feature', 'refine-feature', 'start-implementing', 'continue-implementing', 'complete-feature')),
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
          project_id,
          card_key,
          kind,
          external_id,
          title,
          state_folder,
          source_document_path,
          source_document_hash,
          source_document_mtime,
          source_document_size,
          created_at,
          updated_at
        ) values (
          'project-1',
          'feature:FEAT-001',
          'feature',
          'FEAT-001',
          'Example',
          '03_IN_PROGRESS',
          '/tmp/FeatureDescription.md',
          'hash-1',
          '2026-07-01T07:00:00.000Z',
          10,
          '2026-07-01T07:00:00.000Z',
          '2026-07-01T07:00:00.000Z'
        );
      `);
    } finally {
      legacyDatabase.close();
    }

    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: databasePath });
    const card: ScannedCardMetadata = {
      cardKey: "feature:FEAT-001",
      documentHash: "hash-1",
      documentPath: "/tmp/FeatureDescription.md",
      documentSize: 10,
      documentUpdatedAt: "2026-07-01T07:00:00.000Z",
      externalId: "FEAT-001",
      kind: "feature",
      projectId: "project-1",
      stateFolder: "03_IN_PROGRESS",
      title: "Example",
    };

    try {
      await store.recordFeatureWorkflowRun({
        cardKey: card.cardKey,
        command: "start-implementing",
        currentStep: "Cancelled by user",
        error: "Cancelled workflow.",
        projectId: card.projectId,
        runId: "workflow-example",
        status: "cancelled",
        summary: "Cancelled workflow.",
      });

      const metadata = (await store.reconcileScannedCards([card])).get(card.cardKey);

      expect(metadata?.workflowStatus).toBe("cancelled");
      expect(metadata?.workflowError).toBe("Cancelled workflow.");
    } finally {
      await store.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("persists failed workflow runs instead of leaving active metadata behind", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const card: ScannedCardMetadata = {
      cardKey: "feature:FEAT-001",
      documentHash: "hash-1",
      documentPath: "/tmp/FeatureDescription.md",
      documentSize: 10,
      documentUpdatedAt: "2026-07-01T07:00:00.000Z",
      externalId: "FEAT-001",
      kind: "feature",
      projectId: "project-1",
      stateFolder: "03_IN_PROGRESS",
      title: "Example",
    };

    try {
      await store.reconcileScannedCards([card]);
      await store.recordFeatureWorkflowRun({
        cardKey: card.cardKey,
        command: "complete-feature",
        currentNodeId: "finalize-feature",
        currentStep: "Running complete-feature finalization",
        projectId: card.projectId,
        runId: "workflow-example",
        status: "running",
        summary: "Finalizing",
      });
      await store.recordFeatureWorkflowRun({
        cardKey: card.cardKey,
        command: "complete-feature",
        currentNodeId: "finalize-feature",
        currentStep: "Workflow process lost",
        error: "No live Pi process is attached.",
        projectId: card.projectId,
        runId: "workflow-example",
        status: "failed",
        summary: "Workflow process lost",
      });

      const metadata = (await store.reconcileScannedCards([card])).get(card.cardKey);

      expect(metadata?.workflowStatus).toBe("failed");
      expect(metadata?.workflowRunId).toBe("workflow-example");
      expect(metadata?.workflowError).toBe("No live Pi process is attached.");
      expect(metadata?.workflowCompletedAt).not.toBeNull();
    } finally {
      await store.close();
    }
  });

  it("keeps reconcile insert columns and values aligned", () => {
    const match =
      /insert into hepha_card_metadata\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*on conflict/.exec(
        cardRepositorySource,
      );

    expect(match).not.toBeNull();

    const columns = commaSeparatedItems(match?.[1] ?? "");
    const values = commaSeparatedItems(match?.[2] ?? "");

    expect(values).toHaveLength(columns.length);
    expect(columns).toContain("user_code_review_completed_at");
    expect(columns).toContain("manual_tests_completed_at");
  });

  it("selects human review timestamps after reconciliation", () => {
    expect(cardRepositorySource).toContain("user_code_review_completed_at");
    expect(cardRepositorySource).toContain("manual_tests_completed_at");
    expect(cardRepositorySource).toContain("cardMetadataSelect(false)");
  });

  it("allows the complete-feature workflow command", () => {
    const commandCheck =
      /workflow_command text check \(workflow_command in \(([\s\S]*?)\)\)/.exec(
        schemaSource,
      )?.[1] ?? "";

    expect(commandCheck).toContain("'complete-feature'");
    expect(commandCheck).toContain("'deep-dive-epic'");
    expect(commandCheck).toContain("'deep-dive-feature'");
  });

  it("keeps latest implementation phase model history across workflow attempts", () => {
    const listPhaseRunsSource =
      /async listImplementationPhaseRuns\([\s\S]*?async listImplementationAgentRuns/.exec(
        workflowRunRepositorySource,
      )?.[0] ?? "";

    expect(listPhaseRunsSource).toContain("not exists");
    expect(listPhaseRunsSource).toContain("newer.phase_number = phase_run.phase_number");
    expect(listPhaseRunsSource).toContain("newer.updated_at > phase_run.updated_at");
    expect(listPhaseRunsSource).not.toContain("and workflow_run_id = (");
  });

  it("returns all persisted implementation agent runs for feature-level timing", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });

    try {
      await store.recordImplementationAgentRun({
        id: "postprocess-run",
        projectId: "project-1",
        cardKey: "feature:FEAT-001",
        workflowRunId: "start-run",
        agentRole: "start-feature-postprocess",
        agentName: "Start Feature Postprocess Agent",
        model: "deepseek-v4",
        status: "completed",
      });
      await store.recordImplementationAgentRun({
        id: "recovery-run",
        projectId: "project-1",
        cardKey: "feature:FEAT-001",
        workflowRunId: "continue-run",
        agentRole: "workflow-recovery",
        agentName: "Workflow Recovery Agent",
        model: "deepseek-v4",
        status: "running",
      });

      const runs = (await store.listImplementationAgentRuns("project-1", ["feature:FEAT-001"])).get("feature:FEAT-001") ?? [];

      expect(runs).toHaveLength(2);
      expect(runs.map((run) => run.agentRole)).toEqual(["start-feature-postprocess", "workflow-recovery"]);
      expect(runs[0]?.completedAt).not.toBeNull();
      expect(runs[1]?.completedAt).toBeNull();
    } finally {
      await store.close();
    }
  });

  it("persists implementation task runs independently of workflow attempts", () => {
    expect(schemaSource).toContain("create table if not exists hepha_implementation_task_runs");
    expect(schemaSource).toContain("primary key (project_id, card_key, phase_number, task_id)");
    expect(schemaSource).toContain("status text not null check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'))");
    expect(workflowRunRepositorySource).toContain("async listImplementationTaskRuns");
    expect(workflowRunRepositorySource).toContain("async recordImplementationTaskRun");
    expect(workflowRunRepositorySource).toContain("started_at = excluded.started_at");
    expect(workflowRunRepositorySource).toContain("completed_at = excluded.completed_at");
    expect(source).toContain("return this.workflowRuns.recordImplementationTaskRun(record)");
  });
});
