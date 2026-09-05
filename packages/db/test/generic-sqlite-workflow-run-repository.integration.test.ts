import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCardMetadataStore,
  type ImplementationPhaseRunRecord,
} from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-workflow-run-repository.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-workflow-run-repository.ts"),
  "utf8",
);

describe("generic SQLite workflow-run repository Gherkin integration", () => {
  it("specifies four identity-blind execution persistence paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists a phase lifecycle through the production facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const run: ImplementationPhaseRunRecord = {
      cardKey: "work-item/example",
      phaseNumber: 2,
      phaseTitle: "Boundary handling",
      projectId: "project-a",
      status: "implementing",
      workflowRunId: "workflow-a",
    };

    try {
      await store.recordImplementationPhaseRun(run);
      await store.recordImplementationPhaseRun({ ...run, status: "completed" });
      const stored = await store.listImplementationPhaseRuns(run.projectId, [run.cardKey]);
      expect(stored.get(run.cardKey)).toEqual([
        expect.objectContaining({ status: "completed", workflowRunId: run.workflowRunId }),
      ]);

      expect(facade).toContain("new SqliteWorkflowRunRepository(this.query)");
      expect(facade).toContain("return this.workflowRuns.recordImplementationPhaseRun(record)");
      expect(repository).toContain("export class SqliteWorkflowRunRepository");
      expect(facade).not.toContain("insert into hepha_implementation_phase_runs");
      expect(facade).not.toContain("insert into hepha_implementation_task_runs");
    } finally {
      await store.close();
    }
  });
});
