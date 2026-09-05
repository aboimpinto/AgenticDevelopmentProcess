import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePhaseFile, type ArtifactValidationError } from "../src/refine-artifact-validator.js";
import {
  PHASE_EXECUTION_CONTRACT_VERSION,
  parsePhaseExecutionContract,
} from "../src/phase-execution-contract.js";

const gherkinPath = fileURLToPath(new URL("./generic-phase-topology.feature", import.meta.url));

function contract(document: string, order = 0) {
  return JSON.stringify({
    schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
    phases: [{
      id: "arbitrary-contract-id",
      order,
      document,
      role: "implementation",
      tasks: [{ id: "arbitrary-task", kind: "agent", required: true }],
      developmentValidation: "focused",
      codeReview: "never",
      finalValidation: "none",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    }],
  });
}

function phaseMarkdown(number: number) {
  return `# Phase ${number} — A random R&D title

**Status:** PENDING

## Objective

Run the experiment.

## Phase Task Ledger

- [ ] Durable task.

## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Pending. |
| Tests | missing | Pending. |
| Gherkin/Playwright E2E | not applicable | No browser. |
| Code review | not applicable | No production change. |
`;
}

describe("generic phase topology Gherkin integration", () => {
  it("binds the generic scenarios to executable public validators", () => {
    const feature = readFileSync(gherkinPath, "utf8");

    expect(feature).toContain("Scenario: Arbitrary phase names and counts are accepted");
    expect(feature).toContain("Scenario: A phase document without the numeric prefix is rejected");
    expect(feature).toContain("Scenario: A heading number that differs from the filename is rejected");
    expect(feature).not.toMatch(/Data Layer|Business Logic|User Interface|Testing Polish|FEAT-\d+/i);
  });

  it("accepts a random suffix when the phase prefix matches contract order", () => {
    expect(parsePhaseExecutionContract(contract("Phases/phase-0-any-random-spike-name.md")).diagnostics).toEqual([]);
  });

  it("rejects a document path without the numeric phase prefix", () => {
    expect(parsePhaseExecutionContract(contract("Phases/anything-goes.md")).contract).toBeNull();
  });

  it("rejects a Markdown heading whose number differs from the filename prefix", () => {
    const errors: ArtifactValidationError[] = [];

    validatePhaseFile(phaseMarkdown(7), "Phases/phase-0-any-random-spike-name.md", errors);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_DOCUMENT_MISMATCH" }),
    ]));
  });
});
