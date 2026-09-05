import type { StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseTaskCursorResolver } from "../src/workflows/phases/phase-task-cursor-resolver.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });

function phaseFixture(number: number, title: string, markdown: string, root?: string) {
  const featureRoot = root ?? mkdtempSync(join(tmpdir(), "hepha-task-cursor-"));
  if (!root) { roots.push(featureRoot); mkdirSync(join(featureRoot, "Phases")); }
  const documentPath = join(featureRoot, "Phases", `phase-${number}-arbitrary.md`);
  writeFileSync(documentPath, markdown, "utf8");
  return { documentPath, fileName: `phase-${number}-arbitrary.md`, number, status: "PENDING", title } as PhaseSummary & { number: number };
}

function harness(options: {
  phases?: Array<PhaseSummary & { number: number }>;
  runs?: StoredImplementationTaskRun[];
  planningMissing?: boolean;
  reviewRerun?: boolean;
  humanReview?: PhaseSummary & { number: number };
  missingGate?: { gates: string[]; phaseNumber: number | null } | null;
} = {}) {
  const phases = options.phases ?? [phaseFixture(0, "Any Name", "## Phase Task Ledger\n- [x] Preserved\n- [ ] Next work")];
  const rootPath = join(phases[0]!.documentPath, "..", "..");
  const feature = { externalId: "WORK", folderPath: rootPath, phases } as WorkItemCard;
  const project = { id: "project", rootPath } as StoredProject;
  const reconcile = vi.fn(async () => undefined);
  const resolver = new PhaseTaskCursorResolver({
    findFirstMissingQualityGate: () => options.missingGate ?? null,
    findHumanReviewPhase: () => options.humanReview,
    isAwaitingCodeReviewRerun: () => options.reviewRerun ?? false,
    isPhaseResolved: (phase) => /COMPLETED|SKIPPED/.test(phase.status),
    isPlanningArtifactMissing: () => options.planningMissing ?? false,
    listTaskRuns: async () => options.runs ?? [],
    orderPhases: () => phases,
    planningArtifactFileName: "planning-output.md",
    reconcileCheckedTasks: reconcile,
  });
  return { feature, input: { cardKey: "feature:WORK", feature, project, runId: "run" }, phases, reconcile, resolver };
}

describe("phase task cursor resolver", () => {
  it("selects the first unresolved durable item and identifies Markdown bootstrap", async () => {
    const target = harness();
    await expect(target.resolver.resolve(target.input)).resolves.toEqual({
      currentStep: "Phase 0 task 2/2",
      summary: "Phase Task Ledger: Next work (selected from existing phase Markdown checkboxes)",
    });
    expect(target.reconcile).toHaveBeenCalledOnce();
  });

  it("resumes an operationally active item before an earlier unchecked item", async () => {
    const phase = phaseFixture(0, "No Fixed Title", "## Phase Task Ledger\n- [ ] First\n- [ ] Active");
    const active = { taskId: "phase-0.phase-task-ledger.active", status: "IN_PROGRESS" } as StoredImplementationTaskRun;
    const target = harness({ phases: [phase], runs: [active] });
    expect((await target.resolver.resolve(target.input)).summary).toContain("Active");
  });

  it("routes review rerun, planning repair, and missing ledger before generic execution", async () => {
    const review = harness({ reviewRerun: true });
    expect((await review.resolver.resolve(review.input)).currentStep).toContain("rerunning review after fixes");
    const planning = harness({ planningMissing: true });
    expect((await planning.resolver.resolve(planning.input)).summary).toContain("planning-output.md");
    const noLedgerPhase = phaseFixture(0, "Empty Work", "# Empty Work");
    const noLedger = harness({ phases: [noLedgerPhase] });
    expect((await noLedger.resolver.resolve(noLedger.input)).summary).toContain("must add one");
  });

  it("routes settled tasks to phase gates", async () => {
    const phase = phaseFixture(0, "Settled", "## Phase Task Ledger\n- [x] Done");
    const target = harness({ phases: [phase] });
    expect((await target.resolver.resolve(target.input)).currentStep).toContain("checkpoint/review/finalization");
  });

  it("routes terminal feature state through human review, missing gates, then final verification", async () => {
    const completed = phaseFixture(0, "Completed", "## Phase Task Ledger\n- [x] Done");
    completed.status = "COMPLETED";
    const human = { ...completed, number: 9, status: "PENDING", title: "Human Review Findings" };
    const humanTarget = harness({ phases: [completed], humanReview: human });
    expect((await humanTarget.resolver.resolve(humanTarget.input)).summary).toContain("human review findings remain");
    const gateTarget = harness({ phases: [completed], missingGate: { gates: ["tests", "review"], phaseNumber: 0 } });
    expect((await gateTarget.resolver.resolve(gateTarget.input)).summary).toContain("Missing quality gates: tests, review");
    const finalTarget = harness({ phases: [completed] });
    expect((await finalTarget.resolver.resolve(finalTarget.input)).currentStep).toBe("Final full build and test verification");
  });

  it("allows an explicitly forced recovery phase to reenter after completion", async () => {
    const completed = phaseFixture(4, "Recovered", "## Phase Task Ledger\n- [ ] Repair evidence");
    completed.status = "COMPLETED";
    const target = harness({ phases: [completed] });
    const result = await target.resolver.resolve({ ...target.input, forcedRecoveryPhaseNumber: 4 });
    expect(result.currentStep).toBe("Phase 4 task 1/1");
  });
});
