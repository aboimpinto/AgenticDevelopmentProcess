import { describe, expect, it } from "vitest";
import {
  reconcilePhaseState,
  normalizeReconciliationPhaseStatus,
  type ReconciliationPhase,
} from "../src/phase-state-reconciliation-policy.js";

function phase(overrides: Partial<ReconciliationPhase> = {}): ReconciliationPhase {
  return {
    number: 1,
    title: "Implementation",
    documentExists: true,
    documentStatus: "PENDING",
    featureTasksStatus: "PENDING",
    tasks: [{ id: "phase-1.task-a", index: 0, checked: false }],
    taskRunCount: 0,
    gates: [
      { name: "changed_files", status: "satisfied", justification: "Exact changed paths recorded" },
      { name: "tests", status: "satisfied", justification: "vitest passed" },
      { name: "gherkin_e2e", status: "not_applicable", justification: "No browser behaviour changed" },
      { name: "code_review", status: "satisfied", justification: "review approved" },
    ],
    ...overrides,
  };
}

describe("phase-state reconciliation policy", () => {
  it("normalizes explanatory suffixes on the same awaiting-review lifecycle state", () => {
    expect(normalizeReconciliationPhaseStatus("AWAITING_REVIEW — fixes applied; rerun review")).toBe("AWAITING_REVIEW");
    expect(normalizeReconciliationPhaseStatus("AWAITING_REVIEW (review fixes applied)")).toBe("AWAITING_REVIEW");
  });

  it("selects the earliest incomplete phase even when a later phase looks complete", () => {
    const decision = reconcilePhaseState([
      phase({ number: 2, documentStatus: "COMPLETED", featureTasksStatus: "COMPLETED", tasks: [{ id: "p2", index: 0, checked: true }] }),
      phase({ number: 1, tasks: [{ id: "p1", index: 0, checked: false }] }),
    ]);

    expect(decision).toMatchObject({ kind: "select", phaseNumber: 1, taskId: "p1" });
  });

  it("initializes a fresh pending phase without a task ledger", () => {
    const decision = reconcilePhaseState([phase({ tasks: null })]);

    expect(decision).toMatchObject({ kind: "initialize", phaseNumber: 1 });
    expect(decision.reason).toContain("fresh pending phase");
  });

  it("reinitializes an in-progress phase interrupted before any task evidence was persisted", () => {
    const decision = reconcilePhaseState([phase({ documentStatus: "IN_PROGRESS", featureTasksStatus: "IN_PROGRESS", tasks: null })]);

    expect(decision).toMatchObject({ kind: "initialize", phaseNumber: 1 });
    expect(decision.reason).toContain("interrupted before any durable task-run evidence");
  });

  it("fails closed when an in-progress phase loses its ledger after a task was persisted", () => {
    const decision = reconcilePhaseState([
      phase({ documentStatus: "IN_PROGRESS", featureTasksStatus: "IN_PROGRESS", tasks: null, taskRunCount: 1 }),
    ]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("task ledger");
  });

  it("fails closed when the earliest phase lacks quality gates", () => {
    const decision = reconcilePhaseState([phase({ gates: null })]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("Quality Gate Evidence");
  });

  it("leaves a completed-task phase available for its orchestrator-owned review rerun", () => {
    const decision = reconcilePhaseState([
      phase({
        documentStatus: "AWAITING_REVIEW — review fixes applied",
        featureTasksStatus: "AWAITING_REVIEW (review fixes applied)",
        tasks: [{ id: "review-ready", index: 0, checked: true }],
        gates: [
          { name: "tests", status: "satisfied", justification: "Focused tests passed" },
          { name: "gherkin_e2e", status: "not_applicable", justification: "No browser change" },
          { name: "code_review", status: "missing", justification: null },
        ],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "select", phaseNumber: 1, taskId: "review-ready" });
    expect(decision.reason).toContain("awaiting the orchestrator-owned review gate");
  });

  it("fails with an actionable mismatch instead of selecting a checked task when a readable gate is missing", () => {
    const decision = reconcilePhaseState([
      phase({
        documentStatus: "IN_PROGRESS",
        featureTasksStatus: "IN_PROGRESS",
        tasks: [{ id: "verify-full-profile", index: 0, checked: true }],
        gates: [
          { name: "changed_files", status: "satisfied", justification: "Exact paths recorded." },
          { name: "tests", status: "missing", justification: "The prior worker stopped before full verification." },
          { name: "gherkin_e2e", status: "not_applicable", justification: "No browser interface changed." },
          { name: "code_review", status: "satisfied", justification: "No production changes after review." },
        ],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("tests quality gate is missing");
    expect(decision.reason).toContain("No unchecked declared task can repair that gate safely");
  });

  it("keeps an unreadable/missing gate row fail-closed rather than selecting a repair task", () => {
    const decision = reconcilePhaseState([
      phase({
        documentStatus: "IN_PROGRESS",
        featureTasksStatus: "IN_PROGRESS",
        tasks: [{ id: "verify-full-profile", index: 0, checked: true }],
        gates: [
          { name: "changed_files", status: "satisfied", justification: "Exact paths recorded." },
          { name: "tests", status: "satisfied", justification: "Full profile passed." },
          { name: "gherkin_e2e", status: "not_applicable", justification: "No browser interface changed." },
        ],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("missing the code_review quality gate");
  });

  it("recovers any no-production-change phase from stale awaiting-review state", () => {
    const decision = reconcilePhaseState([
      phase({
        number: 4,
        title: "Presentation Logic",
        autonomousCodeReviewRequired: false,
        documentStatus: "AWAITING_REVIEW",
        featureTasksStatus: "AWAITING_REVIEW",
        tasks: [{ id: "planning-complete", index: 0, checked: true }],
        gates: [
          { name: "changed_files", status: "not_applicable", justification: "Documentation-only planning." },
          { name: "tests", status: "not_applicable", justification: "Documentation-only planning." },
          { name: "gherkin_e2e", status: "not_applicable", justification: "No browser behaviour changed." },
          { name: "code_review", status: "waived", justification: "No production source changed." },
        ],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "promote", phaseNumber: 4, taskIds: ["planning-complete"] });
    expect(decision.reason).toContain("no production-source change");
  });

  it("does not recover a no-production-change phase while another evidence gate remains unsettled", () => {
    const decision = reconcilePhaseState([
      phase({
        number: 1,
        autonomousCodeReviewRequired: false,
        documentStatus: "AWAITING_REVIEW",
        featureTasksStatus: "AWAITING_REVIEW",
        tasks: [{ id: "planning-complete", index: 0, checked: true }],
        gates: [
          { name: "tests", status: "missing", justification: "No documentation validation recorded." },
          { name: "gherkin_e2e", status: "not_applicable", justification: "No browser behaviour changed." },
          { name: "code_review", status: "waived", justification: "Documentation-only Phase 1." },
        ],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "select", phaseNumber: 1 });
  });

  it("fails closed on contradictory document and FeatureTasks statuses", () => {
    const decision = reconcilePhaseState([phase({ documentStatus: "PENDING", featureTasksStatus: "COMPLETED" })]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("contradictory statuses");
  });

  it("promotes a stale in-progress phase when FeatureTasks is already completed and durable evidence agrees", () => {
    const decision = reconcilePhaseState([
      phase({
        documentStatus: "IN_PROGRESS",
        featureTasksStatus: "COMPLETED",
        tasks: [{ id: "done", index: 0, checked: true }],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "promote", phaseNumber: 1, taskIds: ["done"] });
  });

  it("does not let intentionally skipped scope-audit tasks block an earlier active phase", () => {
    const decision = reconcilePhaseState([
      phase({ number: 1, documentStatus: "IN_PROGRESS", featureTasksStatus: "IN_PROGRESS", tasks: [{ id: "phase-1.next", index: 0, checked: false }] }),
      phase({ number: 5, documentStatus: "SKIPPED", featureTasksStatus: "SKIPPED", tasks: [{ id: "phase-5.scope-audit", index: 0, checked: false }] }),
    ]);

    expect(decision).toMatchObject({ kind: "select", phaseNumber: 1, taskId: "phase-1.next" });
  });

  it("fails closed when a terminal phase still has an unchecked durable task", () => {
    const decision = reconcilePhaseState([
      phase({ documentStatus: "COMPLETED", featureTasksStatus: "COMPLETED" }),
    ]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("marked COMPLETED");
  });

  it("fails closed when a task-run ledger claims completion for an unchecked document task", () => {
    const decision = reconcilePhaseState([
      phase({ tasks: [{ id: "conflict", index: 0, checked: false, persistedStatus: "COMPLETED" }] }),
    ]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("unchecked in the phase document");
  });

  it("fails closed when a checked task appears after an unchecked task", () => {
    const decision = reconcilePhaseState([
      phase({
        tasks: [
          { id: "first", index: 0, checked: false },
          { id: "skipped-ahead", index: 1, checked: true },
        ],
      }),
    ]);

    expect(decision).toMatchObject({ kind: "blocked", phaseNumber: 1 });
    expect(decision.reason).toContain("out of order");
  });

  it("promotes only checked tasks with evidence-backed settled gates", () => {
    const decision = reconcilePhaseState([
      phase({ tasks: [{ id: "done", index: 0, checked: true }] }),
    ]);

    expect(decision).toMatchObject({ kind: "promote", phaseNumber: 1, taskIds: ["done"] });
  });
});
