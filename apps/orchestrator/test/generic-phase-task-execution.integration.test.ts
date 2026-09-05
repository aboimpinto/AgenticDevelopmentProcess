import type { ImplementationTaskRunRecord, StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseTaskExecutionApplication, type PhaseTaskRunStore } from "../src/workflows/phases/phase-task-execution-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-task-execution.feature", import.meta.url));

describe("generic phase task execution Gherkin integration", () => {
  it("resumes a failed active item before advancing", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-generic-task-execution-"));
    try {
      mkdirSync(join(root, "Phases"));
      const documentPath = join(root, "Phases", "phase-0-unknown-domain.md");
      writeFileSync(documentPath, "## Phase Task Ledger\n- [ ] Discover fact\n- [ ] Record fact", "utf8");
      const phase = { documentPath, fileName: "phase-0-unknown-domain.md", number: 0, status: "PENDING", title: "Unknown Domain" } as PhaseSummary & { number: number };
      const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
      const project = { id: "project", rootPath: root } as StoredProject;
      let records: StoredImplementationTaskRun[] = [];
      const store: PhaseTaskRunStore = {
        listImplementationTaskRuns: async () => [...records],
        recordImplementationTaskRun: async (record: ImplementationTaskRunRecord) => {
          const previous = records.find((item) => item.taskId === record.taskId);
          records = [...records.filter((item) => item.taskId !== record.taskId), {
            ...record, completedAt: record.status === "COMPLETED" ? "2026-07-21T14:01:00.000Z" : null,
            currentStep: record.currentStep ?? null, error: record.error ?? null, sourceLine: record.sourceLine ?? null,
            startedAt: previous?.startedAt ?? "2026-07-21T14:00:00.000Z", summary: record.summary ?? null,
            updatedAt: "2026-07-21T14:01:00.000Z",
          } as StoredImplementationTaskRun];
        },
      };
      const application = new PhaseTaskExecutionApplication({ recordWorkflowProgress: async () => undefined, store });
      const input = { cardKey: "feature:WORK", command: "continue-implementing" as const, feature, phase, project, runId: "run" };
      const first = await application.begin(input);
      await application.recordFailure({ ...input, activeTask: first, error: "Recoverable" });
      expect((await application.begin(input))?.id).toBe(first?.id);
      await application.complete({ ...input, activeTask: first, summary: "Recovered" });
      expect((await application.begin(input))?.text).toBe("Record fact");
      expect(readFileSync(documentPath, "utf8")).toContain("- [x] Discover fact");
      expect(records.find((record) => record.taskId === first?.id)?.status).toBe("COMPLETED");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
