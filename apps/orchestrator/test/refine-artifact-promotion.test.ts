import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRefineArtifacts } from "../src/refine-artifact-validator.js";
import { PHASE_EXECUTION_CONTRACT_VERSION } from "../src/phase-execution-contract.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createSpikeFixture() {
  const root = mkdtempSync(join(tmpdir(), "hepha-refine-spike-"));
  roots.push(root);
  mkdirSync(join(root, "Phases"), { recursive: true });
  const phases = [
    { id: "hypothesis", order: 0, document: "Phases/phase-0-hypothesis-lab.md", role: "planning" },
    { id: "experiment", order: 1, document: "Phases/phase-1-throwaway-benchmark.md", role: "implementation" },
  ] as const;
  writeFileSync(join(root, "PhaseExecutionContract.json"), JSON.stringify({
    schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
    phases: phases.map((phase) => ({
      ...phase,
      tasks: [{ id: `${phase.id}-work`, kind: "agent", required: true }],
      developmentValidation: "focused",
      codeReview: "never",
      finalValidation: "none",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    })),
  }));
  writeFileSync(join(root, "ArchitectureDebtTouchPlan.json"), JSON.stringify({
    schemaVersion: "hepha-architecture-debt-touch-plan/v1",
    projectId: "project-spike",
    featureId: "spike-001",
    paths: ["src/experiment.ts"],
    symbols: [],
    ruleTags: [],
  }));
  writeFileSync(join(root, "FeatureTasks.md"), `## Phase Inventory

| Contract ID | Document | Role | Status |
| --- | --- | --- | --- |
| hypothesis | Phases/phase-0-hypothesis-lab.md | planning | PENDING |
| experiment | Phases/phase-1-throwaway-benchmark.md | implementation | PENDING |
`);
  writeFileSync(join(root, "planning-analysis-report.md"), `## Phase Implementation Index

| Contract ID | Planning sections | Implementation obligations | Acceptance evidence |
| --- | --- | --- | --- |
| hypothesis | Question | Define falsifiable hypothesis | Written hypothesis |
| experiment | Benchmark | Run disposable prototype | Measurements |
`);
  for (const phase of phases) {
    writeFileSync(join(root, phase.document), `# Phase ${phase.order} — ${phase.id} can have any title

**Status:** PENDING

## Objective

Complete ${phase.id}.

## Phase Execution Contract

**Contract ID:** ${phase.id}
**Role:** ${phase.role}
**Development Validation:** focused
**Final Validation:** none
**Code Review Policy:** never
**Failure Policy:** repair_and_rerun
**Git Checkpoint:** commit_and_push

## Phase Task Ledger

- [ ] [contract:${phase.id}-work] [executor:agent] Execute the declared work.

## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Evidence pending. |
| Tests | missing | Evidence pending. |
| Gherkin/Playwright E2E | not applicable | No browser behavior. |
| Code review | not applicable | No code-review task is declared for this phase. |

## Git Checkpoint

Pending. HEPHA records the immutable phase commit after completion.
`);
  }
  return { root, phases };
}

describe("generic contract-first refinement promotion", () => {
  it("accepts a SPIKE topology with two arbitrarily named phases", () => {
    const { root } = createSpikeFixture();

    expect(validateRefineArtifacts(root)).toEqual({ valid: true, errors: [] });
  });

  it("reports the exact contract-declared random phase path when it is missing", () => {
    const { root, phases } = createSpikeFixture();
    rmSync(join(root, phases[1].document));

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_DOCUMENT_MISMATCH", path: phases[1].document }),
    ]));
  });

  it("rejects an extra phase with a valid prefix that the contract did not declare", () => {
    const { root } = createSpikeFixture();
    writeFileSync(join(root, "Phases", "phase-2-surprise-track.md"), "# Phase 2 — Surprise\n");

    expect(validateRefineArtifacts(root).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_DOCUMENT_MISMATCH", path: "Phases/phase-2-surprise-track.md" }),
    ]));
  });
});
