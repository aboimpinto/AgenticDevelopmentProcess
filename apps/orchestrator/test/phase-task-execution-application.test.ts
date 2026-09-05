import type { ImplementationTaskRunRecord, StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhaseExecutionContractPhase } from "../src/phase-execution-contract.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import {
  PhaseTaskExecutionApplication,
  isPhaseTaskResolved,
  type PhaseTaskRunStore,
} from "../src/workflows/phases/phase-task-execution-application.js";
import { readPhaseTaskLedgerItems } from "../src/workflows/phases/phase-task-document-repository.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

class MemoryTaskRunStore implements PhaseTaskRunStore {
  records: StoredImplementationTaskRun[] = [];
  writes: ImplementationTaskRunRecord[] = [];

  async listImplementationTaskRuns() { return [...this.records]; }
  async recordImplementationTaskRun(record: ImplementationTaskRunRecord) {
    this.writes.push(record);
    const previous = this.records.find((item) => item.taskId === record.taskId);
    const now = "2026-07-21T13:00:00.000Z";
    const stored = {
      ...record,
      completedAt: record.completedAt ?? (record.status === "COMPLETED" || record.status === "SKIPPED" ? now : null),
      currentStep: record.currentStep ?? null,
      error: record.error ?? null,
      sourceLine: record.sourceLine ?? null,
      startedAt: record.startedAt ?? previous?.startedAt ?? (record.status === "IN_PROGRESS" ? now : null),
      summary: record.summary ?? null,
      updatedAt: now,
    } as StoredImplementationTaskRun;
    this.records = [...this.records.filter((item) => item.taskId !== stored.taskId), stored];
  }
}

function fixture(markdown = "**Status:** PENDING\n\n## Phase Task Ledger\n- [x] Existing evidence\n- [ ] Perform arbitrary work\n- [ ] Perform later work") {
  const root = mkdtempSync(join(tmpdir(), "hepha-phase-execution-"));
  roots.push(root);
  mkdirSync(join(root, "Phases"));
  const documentPath = join(root, "Phases", "phase-0-any-title.md");
  writeFileSync(documentPath, markdown, "utf8");
  writeFileSync(join(root, "FeatureTasks.md"), "| Phase | Status |\n| --- | --- |\n| 0 | PENDING |", "utf8");
  const phase = { documentPath, fileName: "phase-0-any-title.md", number: 0, status: "PENDING", title: "Anything At All" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: root, phases: [phase] } as WorkItemCard;
  const project = { id: "project", rootPath: root } as StoredProject;
  const store = new MemoryTaskRunStore();
  const progress = vi.fn(async () => undefined);
  const application = new PhaseTaskExecutionApplication({ recordWorkflowProgress: progress, store });
  const input = { cardKey: "feature:WORK", command: "continue-implementing" as const, feature, phase, project, runId: "run" };
  return { application, feature, input, phase, progress, project, root, store };
}

describe("phase task execution application", () => {
  it("reconciles checked Markdown before claiming the first unresolved task", async () => {
    const target = fixture();
    const selected = await target.application.begin(target.input);
    expect(selected?.text).toBe("Perform arbitrary work");
    expect(target.store.writes.map((record) => record.status)).toEqual(["COMPLETED", "IN_PROGRESS"]);
    expect(target.progress).toHaveBeenCalledWith(expect.objectContaining({ currentStep: "Phase 0 task 2/3", summary: "Perform arbitrary work" }));
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("**Status:** IN_PROGRESS");
  });

  it("resumes an existing in-progress task before another unchecked task", async () => {
    const target = fixture();
    const items = readPhaseTaskLedgerItems(target.phase);
    await target.store.recordImplementationTaskRun({
      cardKey: "feature:WORK", phaseNumber: 0, phaseTitle: target.phase.title, projectId: "project",
      section: items[2]!.section, status: "IN_PROGRESS", taskId: items[2]!.id, taskIndex: items[2]!.taskIndex,
      taskTitle: items[2]!.text, workflowRunId: "older",
    });
    expect((await target.application.begin(target.input))?.id).toBe(items[2]!.id);
  });

  it("completes only the selected task and records its evidence", async () => {
    const target = fixture("## Phase Task Ledger\n- [ ] First\n- [ ] Second");
    const selected = await target.application.begin(target.input);
    await target.application.complete({ ...target.input, activeTask: selected, summary: "Evidence captured" });
    expect(target.store.records.find((run) => run.taskId === selected?.id)?.status).toBe("COMPLETED");
    const markdown = readFileSync(target.phase.documentPath, "utf8");
    expect(markdown).toContain("- [x] First");
    expect(markdown).toContain("- [ ] Second");
    expect(markdown).toContain("## Hepha Task State");
  });

  it("records recoverable failure without resolving the checkbox", async () => {
    const target = fixture("## Phase Task Ledger\n- [ ] Retry this");
    const selected = await target.application.begin(target.input);
    await target.application.recordFailure({ ...target.input, activeTask: selected, error: "Transient failure" });
    expect(target.store.records[0]?.status).toBe("IN_PROGRESS");
    expect(target.store.records[0]?.error).toBe("Transient failure");
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("- [ ] Retry this");
  });

  it("skips an explicitly identified declared task and checks it durably", async () => {
    const target = fixture("## Phase Task Ledger\n- [ ] [contract:optional-work] [executor:agent] Optional work");
    await target.application.skip({ ...target.input, taskId: "optional-work", summary: "Condition not met" });
    expect(target.store.records[0]?.status).toBe("SKIPPED");
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("- [x] [contract:optional-work]");
  });

  it("completes a review task only when it is next in declared order", async () => {
    const target = fixture("## Phase Task Ledger\n- [x] [contract:work] Work\n- [ ] [contract:review] Review");
    const contract = {
      tasks: [
        { id: "work", kind: "agent", required: true },
        { id: "review", kind: "code_review", condition: "always", required: true },
      ],
    } as PhaseExecutionContractPhase;
    expect(await target.application.completeNextCodeReview({ ...target.input, contract, summary: "Approved" })).toBe(true);
    expect(target.store.records.find((record) => record.taskTitle.includes("Review"))?.status).toBe("COMPLETED");
    const firstTarget = fixture("## Phase Task Ledger\n- [ ] [contract:work] Work\n- [ ] [contract:review] Review");
    expect(await firstTarget.application.completeNextCodeReview({ ...firstTarget.input, contract, summary: "Approved" })).toBe(false);
  });

  it("treats checked, completed, and skipped tasks as resolved", () => {
    const target = fixture("## Queue\n- [x] Done\n- [ ] Other");
    const [checked, other] = readPhaseTaskLedgerItems(target.phase);
    expect(isPhaseTaskResolved(checked!, undefined)).toBe(true);
    expect(isPhaseTaskResolved(other!, { status: "COMPLETED" } as StoredImplementationTaskRun)).toBe(true);
    expect(isPhaseTaskResolved(other!, { status: "SKIPPED" } as StoredImplementationTaskRun)).toBe(true);
    expect(isPhaseTaskResolved(other!, { status: "IN_PROGRESS" } as StoredImplementationTaskRun)).toBe(false);
  });
});
