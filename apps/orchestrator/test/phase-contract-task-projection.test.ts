import type { PhaseSummary } from "@hepha/shared";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PhaseExecutionContractPhase } from "../src/phase-execution-contract.js";
import {
  getActivePhaseContractTask,
  getNextUnresolvedPhaseContractTask,
  isPhaseContractReadyForIndependentReview,
} from "../src/workflows/phases/phase-contract-task-projection.js";
import { readPhaseTaskLedgerItems } from "../src/workflows/phases/phase-task-document-repository.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture(markdown: string) {
  const root = mkdtempSync(join(tmpdir(), "hepha-phase-contract-projection-"));
  roots.push(root);
  const documentPath = join(root, "phase-731-any-name.md");
  writeFileSync(documentPath, markdown, "utf8");
  return { documentPath, fileName: "phase-731-any-name.md", number: 731, status: "IN_PROGRESS", title: "Any Name" } as PhaseSummary & { number: number };
}

function contract(tasks: PhaseExecutionContractPhase["tasks"]): PhaseExecutionContractPhase {
  return {
    codeReview: "when_production_code_changes",
    developmentValidation: "focused",
    document: "Phases/phase-731-any-name.md",
    failurePolicy: "repair_and_rerun",
    finalValidation: "full",
    id: "arbitrary-phase",
    order: 731,
    role: "implementation",
    tasks,
  };
}

describe("phase contract task projection", () => {
  it("selects the first unchecked task in declared contract order", () => {
    const phase = fixture("## Phase Task Ledger\n- [ ] [contract:later] Later in Markdown\n- [x] [contract:first] First in Markdown");
    const declaration = contract([
      { id: "first", kind: "agent", required: true },
      { id: "later", kind: "verification", profile: "full", required: true },
    ]);
    expect(getNextUnresolvedPhaseContractTask(phase, declaration)?.id).toBe("later");
  });

  it("maps an active ledger task back to its declaration", () => {
    const phase = fixture("## Phase Task Ledger\n- [ ] [contract:review] Independent review");
    const item = readPhaseTaskLedgerItems(phase)[0]!;
    expect(getActivePhaseContractTask(item, contract([
      { id: "review", kind: "code_review", condition: "always", required: true },
    ]))?.kind).toBe("code_review");
    expect(getActivePhaseContractTask(item, null)).toBeNull();
  });

  it("allows ordered independent review only when review is the next task", () => {
    const ready = fixture("## Phase Task Ledger\n- [x] [contract:work] Work\n- [ ] [contract:review] Review");
    const blocked = fixture("## Phase Task Ledger\n- [ ] [contract:work] Work\n- [ ] [contract:review] Review");
    const declaration = contract([
      { id: "work", kind: "agent", required: true },
      { id: "review", kind: "code_review", condition: "always", required: true },
    ]);
    expect(isPhaseContractReadyForIndependentReview(ready, declaration, () => false)).toBe(true);
    expect(isPhaseContractReadyForIndependentReview(blocked, declaration, () => true)).toBe(false);
  });

  it("delegates a contract-free phase to its legacy checked-ledger policy", () => {
    const phase = fixture("## Tasks\n- [x] Documentation");
    expect(isPhaseContractReadyForIndependentReview(phase, null, () => true)).toBe(true);
    expect(isPhaseContractReadyForIndependentReview(phase, null, () => false)).toBe(false);
  });

  it("requires the complete legacy-contract ledger including one final task", () => {
    const ready = fixture("## Phase Task Ledger\n- [x] [contract:work] Work\n- [x] [contract:final] Final");
    const incomplete = fixture("## Phase Task Ledger\n- [x] [contract:work] Work\n- [ ] [contract:final] Final");
    const declaration = contract([
      { id: "work", kind: "work", required: true },
      { id: "final", kind: "final_validation", profile: "full", required: true },
    ]);
    expect(isPhaseContractReadyForIndependentReview(ready, declaration, () => false)).toBe(true);
    expect(isPhaseContractReadyForIndependentReview(incomplete, declaration, () => true)).toBe(false);
  });
});
