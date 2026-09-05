import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const repositoryRoot = resolve(testRoot, "../../..");
const specification = readFileSync(resolve(testRoot, "generic-safety-contracts.feature"), "utf8");
const barrel = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const safetyContractRoot = resolve(repositoryRoot, "packages/shared/src/safety");
const pathContract = readFileSync(resolve(safetyContractRoot, "path-policy-contracts.ts"), "utf8");
const commandContract = readFileSync(resolve(safetyContractRoot, "command-policy-contracts.ts"), "utf8");
const serializationContract = readFileSync(resolve(safetyContractRoot, "serialization-contracts.ts"), "utf8");
const approvalContract = readFileSync(resolve(safetyContractRoot, "approval-contracts.ts"), "utf8");
const gitContract = readFileSync(resolve(safetyContractRoot, "git-guardrail-contracts.ts"), "utf8");

describe("generic workflow safety contracts Gherkin integration", () => {
  it("specifies four identity-blind safety decision paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps compatibility exports connected to their bounded shared contract owners", () => {
    for (const modulePath of [
      "path-policy-contracts.js",
      "command-policy-contracts.js",
      "serialization-contracts.js",
      "approval-contracts.js",
      "git-guardrail-contracts.js",
    ]) {
      expect(barrel).toContain(modulePath);
    }
    expect(barrel).not.toContain("export interface PathPolicyDecisionSummary");
    expect(pathContract).toContain("PathPolicyDecisionSummary");
    expect(commandContract).toContain("CommandPolicyDecisionSummary");
    expect(serializationContract).toContain("SerializationDecision");
    expect(approvalContract).toContain("ApprovalDTO");
    expect(gitContract).toContain("GitActionCategory");
  });
});
