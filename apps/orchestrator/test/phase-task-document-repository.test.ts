import type { StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PHASE_EXECUTION_CONTRACT_VERSION } from "../src/phase-execution-contract.js";
import {
  markImplementationPhaseInProgress,
  readPhaseTaskLedgerItems,
  renderPhaseTaskStateTable,
  setPhaseTaskCheckbox,
  syncPhaseTaskStateSection,
} from "../src/workflows/phases/phase-task-document-repository.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture(markdown: string) {
  const root = mkdtempSync(join(tmpdir(), "hepha-phase-task-doc-"));
  roots.push(root);
  const phases = join(root, "Phases");
  mkdirSync(phases, { recursive: true });
  const documentPath = join(phases, "phase-0-any-name.md");
  writeFileSync(documentPath, markdown, "utf8");
  const phase = { documentPath, fileName: "phase-0-any-name.md", number: 0, status: "PENDING", title: "Any Name" } as PhaseSummary & { number: number };
  return { root, phase, feature: { folderPath: root } as WorkItemCard };
}

function writeContract(root: string) {
  writeFileSync(join(root, "PhaseExecutionContract.json"), JSON.stringify({
    schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
    phases: [{
      id: "arbitrary", order: 0, document: "Phases/phase-0-any-name.md", role: "implementation",
      tasks: [
        { id: "second", kind: "agent", required: true },
        { id: "first", kind: "agent", required: true },
      ],
      developmentValidation: "focused", codeReview: "never", finalValidation: "none",
      failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push",
    }],
  }), "utf8");
}

describe("phase task document repository", () => {
  it("reads only contract-declared ledger tasks in declared order", () => {
    const target = fixture([
      "## Acceptance Criteria", "- [ ] [contract:ignored] Documentation checkbox",
      "## Phase Task Ledger", "- [ ] [contract:second] [executor:agent] Second in markdown", "- [ ] [contract:first] [executor:agent] First in markdown",
    ].join("\n"));
    writeContract(target.root);
    expect(readPhaseTaskLedgerItems(target.phase).map((item) => item.text)).toEqual([
      "[contract:second] [executor:agent] Second in markdown", "[contract:first] [executor:agent] First in markdown",
    ]);
  });

  it("refuses an ordered contract ledger with an uncontracted checkbox", () => {
    const target = fixture([
      "## Phase Task Ledger",
      "- [ ] [contract:first] [executor:agent] First declared task",
      "- [ ] Describe extra work without a contract identity",
      "- [ ] [contract:second] [executor:agent] Second declared task",
    ].join("\n"));
    writeContract(target.root);

    expect(() => readPhaseTaskLedgerItems(target.phase)).toThrow("CONTRACT_TASK_LEDGER_MISMATCH");
  });

  it("marks the phase and matching FeatureTasks row in progress", () => {
    const target = fixture("# Arbitrary\n\n**Status:** PENDING\n\n- [ ] Work");
    writeFileSync(join(target.root, "FeatureTasks.md"), [
      "| Phase | Name | Status |", "| --- | --- | --- |", "| 0 | Arbitrary | PENDING |", "| 1 | Other | PENDING |",
    ].join("\n"), "utf8");
    markImplementationPhaseInProgress(target.feature, target.phase);
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("**Status:** IN_PROGRESS");
    expect(readFileSync(join(target.root, "FeatureTasks.md"), "utf8")).toContain("| 0 | Arbitrary | IN_PROGRESS |");
    expect(readFileSync(join(target.root, "FeatureTasks.md"), "utf8")).toContain("| 1 | Other | PENDING |");
  });

  it("marks the matching contract inventory row in progress", () => {
    const target = fixture("# Arbitrary\n\n**Status:** PENDING\n\n- [ ] Work");
    writeFileSync(join(target.root, "FeatureTasks.md"), [
      "| Contract ID | Document | Role | Status |", "| --- | --- | --- | --- |",
      "| arbitrary | `Phases/phase-0-any-name.md` | implementation | PENDING |",
      "| other | `Phases/phase-1-other.md` | integration | PENDING |",
    ].join("\n"), "utf8");

    markImplementationPhaseInProgress(target.feature, target.phase);
    const featureTasks = readFileSync(join(target.root, "FeatureTasks.md"), "utf8");
    expect(featureTasks).toContain("| arbitrary | `Phases/phase-0-any-name.md` | implementation | IN_PROGRESS |");
    expect(featureTasks).toContain("| other | `Phases/phase-1-other.md` | integration | PENDING |");
  });

  it("updates a task checkbox by stable identity", () => {
    const target = fixture("## Queue\n- [ ] One\n- [ ] Two");
    const task = readPhaseTaskLedgerItems(target.phase)[1]!;
    writeFileSync(target.phase.documentPath, "Intro\n## Queue\n- [ ] One\n- [ ] Two", "utf8");
    setPhaseTaskCheckbox(target.phase, task, true);
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("- [x] Two");
    expect(readFileSync(target.phase.documentPath, "utf8")).toContain("- [ ] One");
  });

  it("projects persisted state, timestamps, duration, and escaped task text", () => {
    const target = fixture("## Queue\n- [ ] Build | verify");
    const items = readPhaseTaskLedgerItems(target.phase);
    const run = {
      taskId: items[0]!.id, status: "COMPLETED", startedAt: "2026-07-21T10:00:00.000Z", completedAt: "2026-07-21T10:01:05.000Z",
    } as StoredImplementationTaskRun;
    const table = renderPhaseTaskStateTable(items, new Map([[run.taskId, run]]));
    expect(table).toContain("Build \\| verify");
    expect(table).toContain("| COMPLETED | 2026-07-21T10:00:00.000Z | 2026-07-21T10:01:05.000Z | 1m 5s |");
    syncPhaseTaskStateSection(target.phase, items, [run]);
    syncPhaseTaskStateSection(target.phase, items, [run]);
    expect(readFileSync(target.phase.documentPath, "utf8").match(/## Hepha Task State/g)).toHaveLength(1);
  });
});
