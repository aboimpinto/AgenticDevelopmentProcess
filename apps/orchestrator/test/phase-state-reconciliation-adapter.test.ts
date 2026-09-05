import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcilePhaseStateOnDisk, type ReconciliationTaskRun } from "../src/phase-state-reconciliation-adapter.js";
import { reconcilePhaseState } from "../src/phase-state-reconciliation-policy.js";

const roots: string[] = [];
const timestamp = "2026-07-11T12:00:00.000Z";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(phaseOneTasks = "- [x] Implement durable update\n"): { root: string; featureTasksPath: string; phaseOnePath: string; phaseTwoPath: string } {
  const root = mkdtempSync(join(tmpdir(), "phase-state-reconciliation-"));
  roots.push(root);
  const featureTasksPath = join(root, "FeatureTasks.md");
  const phaseOnePath = join(root, "phase-1.md");
  const phaseTwoPath = join(root, "phase-2.md");
  writeFileSync(featureTasksPath, [
    "| Phase | Title | Status |",
    "| --- | --- | --- |",
    "| 1 | Data | PENDING |",
    "| 2 | API | PENDING |",
  ].join("\n"));
  writeFileSync(phaseOnePath, phaseMarkdown(1, "PENDING", phaseOneTasks));
  writeFileSync(phaseTwoPath, phaseMarkdown(2, "PENDING", "- [ ] Build API\n"));
  return { root, featureTasksPath, phaseOnePath, phaseTwoPath };
}

function phaseMarkdown(number: number, status: string, tasks: string, includeGates = true) {
  return [
    `# Phase ${number}`,
    "",
    `**Status:** ${status}`,
    "",
    "## Task Ledger",
    "",
    tasks.trimEnd(),
    "",
    ...(includeGates ? [
      "## Quality Gate Evidence",
      "",
      "| Gate | Decision | Evidence / Justification |",
      "| --- | --- | --- |",
      "| Changed files | satisfied | `apps/orchestrator/src/data.ts` changed. |",
      "| Tests | satisfied | Focused Vitest passed. |",
      "| Gherkin/Playwright E2E | not applicable | No browser behaviour changed. |",
      "| Code review | satisfied | Reviewed source and tests. |",
    ] : []),
    "",
  ].join("\n");
}

function tasks(path: string) {
  return readFileSync(path, "utf8").split(/\r?\n/).flatMap((line, index) => {
    const match = /^- \[([ x])\] (.+)$/.exec(line);
    return match ? [{ id: `phase-${path.endsWith("phase-1.md") ? 1 : 2}.task-${index}`, index, checked: match[1] === "x", lineNumber: index + 1, section: "Task Ledger", text: match[2] }] : [];
  });
}

function memoryStore() {
  const runs = new Map<number, ReconciliationTaskRun[]>();
  const writes: string[] = [];
  return {
    writes,
    store: {
      listTaskRuns: async (phaseNumber: number) => runs.get(phaseNumber) ?? [],
      resetTaskRun: async ({ phase, task }: { phase: { number: number }; task: { id: string } }) => {
        runs.set(phase.number, (runs.get(phase.number) ?? []).map((run) =>
          run.taskId === task.id
            ? { ...run, status: "NOT_STARTED", startedAt: null, completedAt: null }
            : run,
        ));
      },
      recordCompletedTask: async ({ completedAt, phase, task }: { completedAt: string; phase: { number: number }; task: { id: string } }) => {
        writes.push(task.id);
        runs.set(phase.number, [...(runs.get(phase.number) ?? []), { taskId: task.id, status: "COMPLETED", startedAt: completedAt, completedAt }]);
      },
    },
  };
}

describe("phase-state reconciliation adapter", () => {
  it("reconciles and updates the authoritative contract inventory without a legacy phase table", async () => {
    const files = fixture();
    writeFileSync(files.featureTasksPath, [
      "## Phase Inventory",
      "",
      "| Contract ID | Document | Role | Status |",
      "| --- | --- | --- | --- |",
      "| arbitrary-data | `Phases/phase-1-any-name.md` | implementation | PENDING |",
      "| arbitrary-api | `Phases/phase-2-another-name.md` | integration | PENDING |",
    ].join("\n"));
    const { store } = memoryStore();

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result).toMatchObject({ changed: true, decision: { kind: "promote", phaseNumber: 1 } });
    expect(readFileSync(files.featureTasksPath, "utf8")).toContain(
      "| arbitrary-data | `Phases/phase-1-any-name.md` | implementation | COMPLETED |",
    );
  });

  it("recovers a stale checked phase, persists evidence, and selects the next phase task", async () => {
    const files = fixture();
    const { store, writes } = memoryStore();
    const input = {
      featureTasksPath: files.featureTasksPath,
      phases: [
        { number: 1, title: "Data", documentPath: files.phaseOnePath },
        { number: 2, title: "API", documentPath: files.phaseTwoPath },
      ],
      readTasks: (phase: { documentPath: string }) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    };

    const result = await reconcilePhaseStateOnDisk(input);
    expect(result).toMatchObject({ changed: true, promotedAt: timestamp, decision: { kind: "promote", phaseNumber: 1 } });
    expect(writes).toHaveLength(1);
    expect(readFileSync(files.phaseOnePath, "utf8")).toContain(`**Completed At:** ${timestamp}`);
    expect(readFileSync(files.featureTasksPath, "utf8")).toContain("| 1 | Data | COMPLETED |");

    const next = reconcilePhaseState([
      { number: 1, title: "Data", documentExists: true, documentStatus: "COMPLETED", featureTasksStatus: "COMPLETED", tasks: [{ id: "done", index: 0, checked: true }], gates: [] },
      { number: 2, title: "API", documentExists: true, documentStatus: "PENDING", featureTasksStatus: "PENDING", tasks: [{ id: "next", index: 0, checked: false }], gates: [] },
    ]);
    expect(next).toMatchObject({ kind: "select", phaseNumber: 2, taskId: "next" });
  });

  it("reads a post-processed readable FeatureTasks phase label", async () => {
    const files = fixture("- [ ] Continue planning\n");
    writeFileSync(files.featureTasksPath, [
      "| Phase | Tasks | Status |",
      "| --- | --- | --- |",
      "| 1 — Planning And Analysis | Plan | IN_PROGRESS — T1.1 complete |",
      "| 2 — Data Layer | Data | PENDING |",
    ].join("\n"));
    const store = { listTaskRuns: async () => [], resetTaskRun: async () => undefined, recordCompletedTask: async () => undefined };

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ number: 1, title: "Planning", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result.decision).toMatchObject({ kind: "select", phaseNumber: 1 });
  });

  it("repairs the actual stale-marker pattern: FeatureTasks completed but phase document in progress", async () => {
    const files = fixture();
    writeFileSync(files.featureTasksPath, [
      "| Phase | Title | Status |",
      "| --- | --- | --- |",
      "| 1 | Data | COMPLETED |",
      "| 2 | API | PENDING |",
    ].join("\n"));
    writeFileSync(files.phaseOnePath, phaseMarkdown(1, "IN_PROGRESS", "- [x] Implement durable update\n"));
    const { store } = memoryStore();

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result).toMatchObject({ changed: true, decision: { kind: "promote", phaseNumber: 1 } });
    expect(readFileSync(files.phaseOnePath, "utf8")).toContain("**Status:** COMPLETED");
  });

  it("keeps advisory test coverage separate from the blocking Tests gate", async () => {
    const files = fixture();
    writeFileSync(files.phaseOnePath, phaseMarkdown(1, "IN_PROGRESS", "- [x] Implement durable update\n")
      .replace(
        "| Code review | satisfied | Reviewed source and tests. |",
        "| Code review | satisfied | Reviewed source and tests. |\n| Test coverage | missing | Coverage measurement was unavailable and is non-blocking. |",
      ));
    writeFileSync(files.featureTasksPath, [
      "| Phase | Title | Status |",
      "| --- | --- | --- |",
      "| 1 | Data | IN_PROGRESS |",
    ].join("\n"));
    const { store } = memoryStore();

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result).toMatchObject({ changed: true, decision: { kind: "promote", phaseNumber: 1 } });
    expect(readFileSync(files.phaseOnePath, "utf8")).toContain("**Status:** COMPLETED");
  });

  it("recovers any no-production-change phase awaiting stale review without changing historical reports", async () => {
    const files = fixture();
    writeFileSync(files.featureTasksPath, [
      "| Phase | Title | Status |",
      "| --- | --- | --- |",
      "| 1 | Planning and Analysis | AWAITING_REVIEW |",
      "| 2 | API | PENDING |",
    ].join("\n"));
    writeFileSync(files.phaseOnePath, phaseMarkdown(1, "AWAITING_REVIEW", "- [x] Complete planning artifact\n")
      .replace("| Changed files | satisfied | `apps/orchestrator/src/data.ts` changed. |", "| Changed files | not applicable | Documentation-only planning artifact changed. |")
      .replace("| Tests | satisfied | Focused Vitest passed. |", "| Tests | not applicable | Documentation-only planning artifact validated. |")
      .replace("| Code review | satisfied | Reviewed source and tests. |", "| Code review | waived | Documentation-only Phase 1; no source code changed. |"));
    const reportsPath = join(files.root, "code-reviews");
    mkdirSync(reportsPath);
    const historicalReportPath = join(reportsPath, "phase-1-code-review-historical.md");
    writeFileSync(historicalReportPath, "Historical PlanReviewer report; must remain untouched.\n");
    const historicalReport = readFileSync(historicalReportPath, "utf8");
    const { store, writes } = memoryStore();

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ autonomousCodeReviewRequired: false, number: 1, title: "Planning and Analysis", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result).toMatchObject({ changed: true, decision: { kind: "promote", phaseNumber: 1 } });
    expect(readFileSync(files.phaseOnePath, "utf8")).toContain("**Status:** COMPLETED");
    expect(readFileSync(files.featureTasksPath, "utf8")).toContain("| 1 | Planning and Analysis | COMPLETED |");
    expect(readFileSync(historicalReportPath, "utf8")).toBe(historicalReport);
    expect(writes).toHaveLength(1);
  });

  it("is idempotent after a successful promotion", async () => {
    const files = fixture();
    const { store, writes } = memoryStore();
    const input = { featureTasksPath: files.featureTasksPath, phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }], readTasks: (phase: { documentPath: string }) => tasks(phase.documentPath), store, now: () => new Date(timestamp) };

    await reconcilePhaseStateOnDisk(input);
    const once = readFileSync(files.phaseOnePath, "utf8");
    const second = await reconcilePhaseStateOnDisk(input);
    expect(second).toMatchObject({ changed: false, decision: { kind: "all_terminal" } });
    expect(readFileSync(files.phaseOnePath, "utf8")).toBe(once);
    expect(writes).toHaveLength(1);
  });

  it("selects the next same-phase task after a worker durably checks only its current task", async () => {
    const files = fixture("- [x] Implement durable update\n- [ ] Verify durable update\n");
    writeFileSync(files.featureTasksPath, [
      "| Phase | Title | Status |",
      "| --- | --- | --- |",
      "| 1 | Data | IN_PROGRESS |",
      "| 2 | API | PENDING |",
    ].join("\n"));
    writeFileSync(files.phaseOnePath, phaseMarkdown(1, "IN_PROGRESS", "- [x] Implement durable update\n- [ ] Verify durable update\n"));
    const { store, writes } = memoryStore();
    await store.recordCompletedTask({
      completedAt: timestamp,
      phase: { number: 1, title: "Data", documentPath: files.phaseOnePath },
      task: tasks(files.phaseOnePath)[0]!,
    });

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result).toMatchObject({ changed: false, decision: { kind: "select", phaseNumber: 1 } });
    expect(result.decision.kind === "select" && result.decision.taskId).toBe(tasks(files.phaseOnePath)[1]!.id);
    expect(readFileSync(files.phaseOnePath, "utf8")).toContain("**Status:** IN_PROGRESS");
    expect(writes).toHaveLength(1);
  });

  it("resets a stale completed task-run when the durable ledger declares it unchecked", async () => {
    const files = fixture("- [ ] Implement durable update\n");
    const { store } = memoryStore();
    const task = tasks(files.phaseOnePath)[0]!;
    await store.recordCompletedTask({
      completedAt: timestamp,
      phase: { number: 1, title: "Data", documentPath: files.phaseOnePath },
      task,
    });

    const result = await reconcilePhaseStateOnDisk({
      featureTasksPath: files.featureTasksPath,
      phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }],
      readTasks: (phase) => tasks(phase.documentPath),
      store,
      now: () => new Date(timestamp),
    });

    expect(result).toMatchObject({ changed: true, decision: { kind: "initialize", phaseNumber: 1 } });
    expect((await store.listTaskRuns(1))[0]).toMatchObject({ status: "NOT_STARTED", startedAt: null, completedAt: null });
    expect(readFileSync(files.phaseOnePath, "utf8")).toContain("- [ ] Implement durable update");
  });

  it("fails closed without changing documents or calling the store when gates are missing", async () => {
    const files = fixture();
    writeFileSync(files.phaseOnePath, phaseMarkdown(1, "PENDING", "- [x] Implement durable update\n", false));
    const before = readFileSync(files.phaseOnePath, "utf8");
    const { store, writes } = memoryStore();
    const result = await reconcilePhaseStateOnDisk({ featureTasksPath: files.featureTasksPath, phases: [{ number: 1, title: "Data", documentPath: files.phaseOnePath }], readTasks: (phase) => tasks(phase.documentPath), store, now: () => new Date(timestamp) });

    expect(result.decision.kind).toBe("blocked");
    expect(readFileSync(files.phaseOnePath, "utf8")).toBe(before);
    expect(writes).toEqual([]);
  });
});
