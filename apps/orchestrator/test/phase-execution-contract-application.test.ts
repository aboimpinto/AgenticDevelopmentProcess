import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhaseExecutionContractApplication } from "../src/workflows/phases/phase-execution-contract-application.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function fixture() {
  const folderPath = mkdtempSync(join(tmpdir(), "hepha-phase-contract-"));
  temporaryDirectories.push(folderPath);
  mkdirSync(join(folderPath, "Phases"));
  const phases = [0, 1].map((number) => ({
    documentPath: join(folderPath, "Phases", `phase-${number}-arbitrary-name.md`),
    number,
    status: "PENDING",
    title: `Arbitrary ${number}`,
  } as PhaseSummary & { number: number }));
  writeFileSync(join(folderPath, "PhaseExecutionContract.json"), JSON.stringify({
    schemaVersion: "hepha-phase-execution/v2",
    phases: phases.map((phase, index) => ({
      codeReview: "never",
      developmentValidation: "none",
      document: `Phases/phase-${index}-arbitrary-name.md`,
      failurePolicy: "repair_and_rerun",
      finalValidation: index === 0 ? "none" : "full",
      gitCheckpoint: index === 0 ? undefined : "commit_and_push",
      id: `step-${index}`,
      order: index,
      role: index === 0 ? "planning" : "final_checkpoint",
      tasks: [{ id: `task-${index}`, kind: "verification", profile: "full", required: true }],
    })),
  }));
  const feature = { externalId: "WORK-ANY", folderPath, phases } as WorkItemCard;
  const isGitCheckpointSatisfied = vi.fn(() => false);
  const application = new PhaseExecutionContractApplication({
    getNumberedPhases: () => phases,
    isGitCheckpointSatisfied,
  });
  return { application, feature, folderPath, isGitCheckpointSatisfied, phases };
}

describe("phase execution contract application", () => {
  it("resolves each arbitrary phase document to its declared contract role", () => {
    const current = fixture();
    expect(current.application.get(current.feature, current.phases[0]!)).toEqual(
      expect.objectContaining({ order: 0, role: "planning" }),
    );
    expect(current.application.require(current.feature).phases).toHaveLength(2);
  });

  it("fails closed with contract diagnostics when refinement omitted the contract", () => {
    const current = fixture();
    rmSync(join(current.folderPath, "PhaseExecutionContract.json"));
    expect(() => current.application.require(current.feature)).toThrow(
      /WORK-ANY require PhaseExecutionContract\.json: PhaseExecutionContract\.json: missing phase execution contract/,
    );
  });

  it("counts only declared unsatisfied Git checkpoints", () => {
    const current = fixture();
    const project = { memoryBankPath: "/memory-bank", rootPath: "/project" } as never;
    expect(current.application.countMissingGitCheckpoints(project, current.feature, "branch-any")).toBe(1);
    expect(current.isGitCheckpointSatisfied).toHaveBeenCalledOnce();
    expect(current.isGitCheckpointSatisfied).toHaveBeenCalledWith(expect.objectContaining({
      branchName: "branch-any",
      phaseDocumentPath: current.phases[1]!.documentPath,
    }));
  });
});
