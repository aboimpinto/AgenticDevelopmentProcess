import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateImplementationContinuationArtifacts,
  validatePhaseExecutionArtifacts,
  validateRefineArtifacts,
  validateRefinePromotionArtifacts,
} from "../src/refine-artifact-validator.js";
import {
  PHASE_EXECUTION_CONTRACT_VERSION,
  PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION,
} from "../src/phase-execution-contract.js";

const roots: string[] = [];
const gherkinPath = fileURLToPath(new URL("./refine-feature-artifact-contract.feature", import.meta.url));

afterEach(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
  roots.length = 0;
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "hepha-contract-refinement-"));
  roots.push(root);
  mkdirSync(join(root, "Phases"), { recursive: true });

  const phases = [
    {
      id: "intake",
      order: 0,
      document: "Phases/phase-0-question-framing.md",
      role: "entry_gate",
      tasks: [{ id: "baseline-proof", kind: "verification", profile: "full", required: true }],
      developmentValidation: "none",
      codeReview: "never",
      finalValidation: "full",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    },
    {
      id: "durable-policy",
      order: 1,
      document: "Phases/phase-1-disposable-policy-experiment.md",
      role: "implementation",
      tasks: [
        { id: "write-boundary", kind: "agent", required: true },
        { id: "inspect-boundary", kind: "code_review", condition: "when_production_code_changes", required: true },
        { id: "prove-boundary", kind: "verification", profile: "focused", required: true },
      ],
      developmentValidation: "focused",
      codeReview: "when_production_code_changes",
      finalValidation: "focused",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    },
    {
      id: "release-proof",
      order: 2,
      document: "Phases/phase-2-any-final-name.md",
      role: "final_checkpoint",
      tasks: [
        { id: "reconcile-release", kind: "agent", required: true },
        { id: "prove-release", kind: "verification", profile: "full", required: true },
      ],
      developmentValidation: "focused",
      codeReview: "never",
      finalValidation: "full",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    },
  ] as const;

  writeFileSync(join(root, "PhaseExecutionContract.json"), JSON.stringify({
    schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
    phases,
  }, null, 2));
  writeFileSync(join(root, "ArchitectureDebtTouchPlan.json"), JSON.stringify({
    schemaVersion: "hepha-architecture-debt-touch-plan/v1",
    projectId: "project-fixture",
    featureId: "feat-fixture",
    paths: ["apps/orchestrator/src/refine-artifact-validator.ts"],
    symbols: [],
    ruleTags: [],
  }, null, 2));
  writeFileSync(join(root, "FeatureTasks.md"), `# Tasks

## Phase Inventory

| Contract ID | Document | Role | Status |
| --- | --- | --- | --- |
| intake | Phases/phase-0-question-framing.md | entry_gate | PENDING |
| durable-policy | Phases/phase-1-disposable-policy-experiment.md | implementation | PENDING |
| release-proof | Phases/phase-2-any-final-name.md | final_checkpoint | PENDING |
`);
  writeFileSync(join(root, "planning-analysis-report.md"), `# Plan

## Phase Implementation Index

| Contract ID | Planning sections | Implementation obligations | Acceptance evidence |
| --- | --- | --- | --- |
| intake | ## Intake | Establish the baseline. | Full baseline proof. |
| durable-policy | ## Durable policy | Implement the public boundary. | Focused boundary verification. |
| release-proof | ## Release proof | Reconcile and verify the release. | Full verification and coverage receipt. |
`);

  for (const phase of phases) {
    const hasReviewTask = phase.tasks.some((task) => task.kind === "code_review");
    const decision = hasReviewTask ? "missing" : "not applicable";
    writeFileSync(join(root, phase.document), `# Phase ${phase.order} — ${phase.id} with an arbitrary title

**Status:** PENDING

## Objective

Deliver ${phase.id}.

## Phase Execution Contract

**Contract ID:** ${phase.id}
**Role:** ${phase.role}
**Development Validation:** ${phase.developmentValidation}
**Final Validation:** ${phase.finalValidation}
**Code Review Policy:** ${phase.codeReview}
**Failure Policy:** ${phase.failurePolicy}
**Git Checkpoint:** ${phase.gitCheckpoint}

## Phase Task Ledger

${phase.tasks.map((task) => `- [ ] [contract:${task.id}] [executor:${task.kind}] ${task.id}${phase.role === "final_checkpoint" && task === phase.tasks.at(-1) ? " full-verification test-coverage manual-review-ready" : ""}`).join("\n")}

## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Evidence pending. |
| Tests | missing | Evidence pending. |
| Gherkin/Playwright E2E | not applicable | No browser behavior in this scope. |
| Code review | ${decision} | ${hasReviewTask ? "Independent production-code review pending." : "No code-review task is declared for this phase."} |
${phase.role === "final_checkpoint" ? "| Test coverage | missing | Record FEAT changed-line and overall project coverage; advisory reference 80%, target 95-100%. |" : ""}

## Git Checkpoint

Pending. HEPHA records the immutable phase commit after completion.
`);
  }

  return { root, phases };
}

describe("contract-first refinement validation", () => {
  it("keeps the generic Gherkin scenarios bound to executable refinement validation", () => {
    const feature = readFileSync(gherkinPath, "utf8");

    expect(feature).toContain("Scenario: A complete generic refinement handoff is accepted");
    expect(feature).toContain("Scenario: New refinement authoring requires the current phase contract");
    expect(feature).toContain("Scenario: Legitimate phase progress preserves continuation readiness");
    expect(feature).toContain("Scenario: Contract inventory remains authoritative during continuation");
    expect(feature).toContain("Scenario: Refinement-only satellite damage does not strand implementation");
    expect(feature).toContain("Scenario: A malformed execution contract still blocks continuation");
    expect(feature).toContain("Scenario: A valid plan with no matching debt needs no steward ceremony");
    expect(feature).toContain("Scenario: A missing touch plan blocks promotion");
    expect(feature).toContain("Scenario: A malformed touch plan blocks promotion");
    expect(feature).toContain("Scenario: A foreign touch plan blocks promotion");
    expect(feature).toContain("Scenario: A declared final checkpoint requires measurable test coverage");
    expect(feature).toContain("Scenario: Refinement provisions an unambiguous project coverage profile");
    expect(feature).toContain("Scenario: Ambiguous coverage configuration returns to Deep-Dive");
    expect(feature).toContain("Scenario: Valid project coverage configuration is reused");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|governance dashboard/i);
  });

  it("accepts arbitrary phase identities and filename suffixes projected from the execution contract", () => {
    const { root } = createFixture();

    expect(validateRefineArtifacts(root)).toEqual({ valid: true, errors: [] });
    expect(validateRefinePromotionArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("validates manual-test obligations against execution-contract task identity", () => {
    const { root } = createFixture();
    const path = join(root, "ManualTestObligations.json");
    const document = {
      schemaVersion: "hepha-manual-test-obligations/v1",
      featureId: "feat-fixture",
      obligations: [{
        id: "physical-release-proof",
        title: "Physical release proof",
        reason: "This test cannot be automated and the user needs to test it manually.",
        phaseNumber: 2,
        taskId: "prove-release",
        preconditions: ["A physical target is available."],
        steps: ["Run the release proof on the physical target."],
        expectedResult: "The release behavior is correct.",
        evidenceRequirements: ["Attach the target log."],
        status: "PENDING",
      }],
    };
    writeFileSync(path, JSON.stringify(document, null, 2));

    expect(validateRefinePromotionArtifacts(root, { projectId: "project-fixture", featureId: "feat-fixture" })).toEqual({ valid: true, errors: [] });

    document.obligations[0]!.taskId = "unknown-task";
    writeFileSync(path, JSON.stringify(document, null, 2));
    expect(validateRefinePromotionArtifacts(root, { projectId: "project-fixture", featureId: "feat-fixture" }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MANUAL_TEST_TRACEABILITY_MISMATCH", message: expect.stringContaining("unknown-task") }),
    ]));
  });

  it("rejects a declared final checkpoint without its 80 percent coverage telemetry declaration", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-2-any-final-name.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^\| Test coverage .*\n/m, ""));

    expect(validateRefinePromotionArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_COVERAGE_GATE_MISMATCH", path: "Phases/phase-2-any-final-name.md" }),
    ]));
  });

  it("rejects a declared final checkpoint whose final task does not request test coverage", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-2-any-final-name.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(" full-verification test-coverage manual-review-ready", " full-verification manual-review-ready"));

    expect(validateRefinePromotionArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_COVERAGE_GATE_MISMATCH", message: expect.stringContaining("test-coverage") }),
    ]));
  });

  it("rejects V2 as new refinement output while preserving historical read compatibility", () => {
    const { root } = createFixture();
    const contractPath = join(root, "PhaseExecutionContract.json");
    const contract = JSON.parse(readFileSync(contractPath, "utf8")) as { schemaVersion: string };
    contract.schemaVersion = PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION;
    writeFileSync(contractPath, JSON.stringify(contract, null, 2));

    expect(validateRefineArtifacts(root)).toEqual({ valid: true, errors: [] });
    expect(validatePhaseExecutionArtifacts(root)).toEqual({ valid: true, errors: [] });
    expect(validateRefinePromotionArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "OBSOLETE_PHASE_EXECUTION_CONTRACT",
        path: "PhaseExecutionContract.json",
        message: expect.stringContaining(PHASE_EXECUTION_CONTRACT_VERSION),
      }),
    ]));
  });

  it("requires the current execution contract instead of falling through to legacy no-contract discovery", () => {
    const { root } = createFixture();
    rmSync(join(root, "PhaseExecutionContract.json"));

    expect(validateRefinePromotionArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "MISSING_PHASE_EXECUTION_CONTRACT",
        path: "PhaseExecutionContract.json",
        message: expect.stringContaining(PHASE_EXECUTION_CONTRACT_VERSION),
      }),
    ]));
  });

  it("keeps the execution interface valid after a phase records legitimate progress", () => {
    const { root } = createFixture();
    const phasePath = join(root, "Phases", "phase-0-question-framing.md");
    const featureTasksPath = join(root, "FeatureTasks.md");

    writeFileSync(
      phasePath,
      readFileSync(phasePath, "utf8")
        .replace("**Status:** PENDING", "**Status:** IN_PROGRESS")
        .replace("- [ ] [contract:baseline-proof]", "- [x] [contract:baseline-proof]")
        .replace("| Changed files | missing |", "| Changed files | satisfied |")
        .replace("| Tests | missing |", "| Tests | satisfied |"),
    );
    writeFileSync(
      featureTasksPath,
      readFileSync(featureTasksPath, "utf8").replace(
        "| intake | Phases/phase-0-question-framing.md | entry_gate | PENDING |",
        "| intake | Phases/phase-0-question-framing.md | entry_gate | IN_PROGRESS |",
      ),
    );

    expect(validateRefineArtifacts(root).valid).toBe(false);
    expect(validatePhaseExecutionArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("keeps manual continuation available when only a refinement-time satellite becomes invalid", () => {
    const { root } = createFixture();
    writeFileSync(join(root, "ArchitectureDebtTouchPlan.json"), "{ malformed");
    rmSync(join(root, "planning-analysis-report.md"));

    expect(validateRefineArtifacts(root).valid).toBe(false);
    expect(validatePhaseExecutionArtifacts(root).valid).toBe(false);
    expect(validateImplementationContinuationArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("blocks manual continuation when the authoritative execution contract is malformed", () => {
    const { root } = createFixture();
    writeFileSync(join(root, "PhaseExecutionContract.json"), "{ malformed");

    expect(validateImplementationContinuationArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "INVALID_PHASE_EXECUTION_CONTRACT",
        path: "PhaseExecutionContract.json",
      }),
    ]));
  });

  it("selects the contract inventory by schema instead of accepting the first table in the section", () => {
    const { root } = createFixture();
    const featureTasksPath = join(root, "FeatureTasks.md");
    writeFileSync(
      featureTasksPath,
      readFileSync(featureTasksPath, "utf8").replace(
        "| Contract ID | Document | Role | Status |",
        [
          "| Phase | Work | Status | Evidence |",
          "| --- | --- | --- | --- |",
          "| 0 | Legacy projection | IN_PROGRESS | Historical compatibility only. |",
          "",
          "| Contract ID | Document | Role | Status |",
        ].join("\n"),
      ),
    );

    expect(validatePhaseExecutionArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("still rejects contract drift after implementation starts", () => {
    const { root } = createFixture();
    const phasePath = join(root, "Phases", "phase-0-question-framing.md");
    writeFileSync(
      phasePath,
      readFileSync(phasePath, "utf8").replace("[contract:baseline-proof]", "[contract:foreign-task]"),
    );

    expect(validatePhaseExecutionArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_TASK_LEDGER_MISMATCH" }),
    ]));
  });

  it("rejects a refinement handoff without the mandatory architecture-debt touch plan", () => {
    const { root } = createFixture();
    rmSync(join(root, "ArchitectureDebtTouchPlan.json"));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "MISSING_ARCHITECTURE_DEBT_TOUCH_PLAN",
        path: "ArchitectureDebtTouchPlan.json",
      }),
    ]));
  });

  it("rejects a malformed architecture-debt touch plan during refinement validation", () => {
    const { root } = createFixture();
    writeFileSync(join(root, "ArchitectureDebtTouchPlan.json"), JSON.stringify({
      schemaVersion: "hepha-architecture-debt-touch-plan/v1",
      projectId: "project-fixture",
      featureId: "feat-fixture",
      paths: [],
      symbols: [],
      ruleTags: [],
    }));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "INVALID_ARCHITECTURE_DEBT_TOUCH_PLAN",
        path: "ArchitectureDebtTouchPlan.json",
      }),
    ]));
  });

  it("rejects a structurally valid touch plan for a different project or feature", () => {
    const { root } = createFixture();

    expect(validateRefineArtifacts(root, {
      projectId: "different-project",
      featureId: "different-feature",
    }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "ARCHITECTURE_DEBT_TOUCH_PLAN_IDENTITY_MISMATCH",
        path: "ArchitectureDebtTouchPlan.json",
      }),
    ]));
  });

  it("rejects a phase document not declared by the execution contract", () => {
    const { root } = createFixture();
    writeFileSync(join(root, "Phases", "phase-2-uncontracted-random-name.md"), "# Phase 2 — stray\n");

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_DOCUMENT_MISMATCH", path: "Phases/phase-2-uncontracted-random-name.md" }),
    ]));
  });

  it("rejects task-ledger markers that do not exactly project the contract tasks", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-1-disposable-policy-experiment.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("[contract:prove-boundary]", "[contract:unknown-task]"));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_TASK_LEDGER_MISMATCH", path: "Phases/phase-1-disposable-policy-experiment.md" }),
    ]));
  });

  it("rejects an uncontracted checkbox inside the explicit task ledger", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-0-question-framing.md");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "## Phase Task Ledger\n\n",
        "## Phase Task Ledger\n\n- [ ] Capture a descriptive work bullet without a contract identity\n",
      ),
    );

    expect(validatePhaseExecutionArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "CONTRACT_TASK_LEDGER_MISMATCH",
        message: expect.stringContaining("Every Phase Task Ledger checkbox"),
      }),
    ]));
  });

  it("rejects a task ledger whose valid tasks are reordered", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-1-disposable-policy-experiment.md");
    const content = readFileSync(path, "utf8");
    const ledgerLines = [
      "- [ ] [contract:write-boundary] [executor:agent] write-boundary",
      "- [ ] [contract:inspect-boundary] [executor:code_review] inspect-boundary",
      "- [ ] [contract:prove-boundary] [executor:verification] prove-boundary",
    ];
    writeFileSync(path, content.replace(ledgerLines.join("\n"), [ledgerLines[1], ledgerLines[0], ledgerLines[2]].join("\n")));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "CONTRACT_TASK_LEDGER_MISMATCH",
        message: expect.stringContaining("exact order"),
      }),
    ]));
  });

  it("rejects a checked or non-checkbox task projection before implementation begins", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-0-question-framing.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("- [ ] [contract:baseline-proof]", "- [x] [contract:baseline-proof]"));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_TASK_LEDGER_MISMATCH", path: "Phases/phase-0-question-framing.md" }),
    ]));
  });

  it("rejects a code-review gate decision that conflicts with the declared policy", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-0-question-framing.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("| Code review | not applicable |", "| Code review | missing |"));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_GATE_POLICY_MISMATCH", path: "Phases/phase-0-question-framing.md" }),
    ]));
  });

  it("rejects a human-readable contract projection that drifts from its source contract", () => {
    const { root } = createFixture();
    const path = join(root, "Phases", "phase-1-disposable-policy-experiment.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("**Role:** implementation", "**Role:** integration"));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_DOCUMENT_MISMATCH", path: "Phases/phase-1-disposable-policy-experiment.md" }),
    ]));
  });

  it("rejects inventory and planning rows that drift from contract identities", () => {
    const { root } = createFixture();
    const inventory = join(root, "FeatureTasks.md");
    const planning = join(root, "planning-analysis-report.md");
    writeFileSync(inventory, readFileSync(inventory, "utf8").replace("durable-policy", "different-id"));
    writeFileSync(planning, readFileSync(planning, "utf8").replace("durable-policy", "different-id"));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_INVENTORY_MISMATCH" }),
      expect.objectContaining({ code: "CONTRACT_PLANNING_INDEX_MISMATCH" }),
    ]));
  });
});
