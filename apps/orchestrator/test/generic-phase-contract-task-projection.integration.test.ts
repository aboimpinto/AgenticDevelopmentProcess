import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getActivePhaseContractTask,
  getNextUnresolvedPhaseContractTask,
  isPhaseContractReadyForIndependentReview,
} from "../src/workflows/phases/phase-contract-task-projection.js";

const featurePath = fileURLToPath(new URL("./generic-phase-contract-task-projection.feature", import.meta.url));

describe("generic phase contract task projection Gherkin integration", () => {
  it("specifies ordered, legacy-contract, and contract-free projections without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A declared task remains unresolved");
    expect(specification).toContain("Scenario: An uncontracted ledger checkbox rejects phase admission");
    expect(specification).toContain("CONTRACT_TASK_LEDGER_MISMATCH");
    expect(specification).toContain("no task, gate, checkpoint, or next phase transition runs");
    expect(specification).toContain("Scenario: An ordered phase reaches independent review");
    expect(specification).toContain("Scenario: An older contract reaches its review boundary");
    expect(specification).toContain("Scenario: A contract-free phase uses compatibility policy");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports each production projection boundary", () => {
    expect(typeof getNextUnresolvedPhaseContractTask).toBe("function");
    expect(typeof getActivePhaseContractTask).toBe("function");
    expect(typeof isPhaseContractReadyForIndependentReview).toBe("function");
  });
});
