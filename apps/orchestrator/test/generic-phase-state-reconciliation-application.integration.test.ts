import type { ImplementationTaskRunRecord, StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reconcilePhaseStateOnDisk } from "../src/phase-state-reconciliation-adapter.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { readPhaseTaskLedgerItems } from "../src/workflows/phases/phase-task-document-repository.js";
import { PhaseStateReconciliationApplication } from "../src/workflows/phases/phase-state-reconciliation-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-state-reconciliation-application.feature", import.meta.url));

describe("generic phase state reconciliation application Gherkin integration", () => {
  it("promotes checked arbitrary work on disk and converges after refresh", async () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-reconciliation-application-"));
    try {
      const documentPath = join(root, "phase-17-any-name.md");
      writeFileSync(join(root, "FeatureTasks.md"), "| Contract ID | Document | Role | Status |\n| --- | --- | --- | --- |\n| arbitrary-item | `Phases/phase-17-any-name.md` | implementation | IN_PROGRESS |\n");
      writeFileSync(documentPath, `# Any name\n\n**Status:** IN_PROGRESS\n\n## Phase Task Ledger\n\n- [x] Produce result\n\n## Quality Gate Evidence\n\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Changed files | not applicable | Evidence only. |\n| Tests | not applicable | No executable change. |\n| Gherkin/Playwright E2E | not applicable | No browser change. |\n| Code review | waived | No production code. |\n`);
      const phase = { documentPath, fileName: "phase-17-any-name.md", number: 17, status: "IN_PROGRESS", title: "Any" } as PhaseSummary & { number: number };
      const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
      const project = { id: "project", rootPath: root } as StoredProject;
      const records = new Map<string, StoredImplementationTaskRun>();
      const application = new PhaseStateReconciliationApplication({
        isReviewRequired: () => false,
        orderPhases: () => [phase],
        readTasks: readPhaseTaskLedgerItems,
        reconcileOnDisk: reconcilePhaseStateOnDisk,
        refreshFeature: async () => feature,
        store: {
          listImplementationTaskRuns: async () => [...records.values()],
          recordImplementationTaskRun: async (record: ImplementationTaskRunRecord) => {
            records.set(record.taskId, { ...record, completedAt: record.completedAt ?? null, currentStep: record.currentStep ?? null, error: record.error ?? null, sourceLine: record.sourceLine ?? null, startedAt: record.startedAt ?? null, summary: record.summary ?? null, updatedAt: "now" });
          },
        },
      });
      const result = await application.reconcile({ cardKey: "card", project, runId: "run" }, feature);
      expect(result.allTerminal).toBe(true);
      expect(result.decision.kind).toBe("all_terminal");
      expect(readFileSync(documentPath, "utf8")).toContain("**Status:** COMPLETED");
      expect(readFileSync(join(root, "FeatureTasks.md"), "utf8")).toContain("| arbitrary-item | `Phases/phase-17-any-name.md` | implementation | COMPLETED |");
      expect([...records.values()][0]).toMatchObject({ status: "COMPLETED", taskTitle: "Produce result" });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
