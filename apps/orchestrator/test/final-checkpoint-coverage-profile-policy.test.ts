import { describe, expect, it } from "vitest";

import { getFinalCheckpointCoverageProfileIssue } from "../src/final-checkpoint-coverage-profile-policy.js";
import type { PhaseExecutionContract } from "../src/phase-execution-contract.js";

function contract(role: "implementation" | "final_checkpoint"): PhaseExecutionContract {
  return {
    schemaVersion: "hepha-phase-execution/v3",
    phases: [{
      id: "arbitrary",
      order: 0,
      document: "Phases/phase-0-arbitrary.md",
      role,
      tasks: [{ id: "work", kind: "agent", required: true }],
      developmentValidation: "focused",
      codeReview: "never",
      finalValidation: "full",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    }],
  };
}

describe("final checkpoint coverage profile policy", () => {
  it("does not require or mutate a coverage profile when no final checkpoint is declared", () => {
    expect(getFinalCheckpointCoverageProfileIssue(contract("implementation"), {
      valid: false,
      profile: null,
      issues: [{ kind: "missing-file", message: "profile absent" }],
    })).toBeNull();
  });

  it("rejects promotion when a declared final checkpoint has no executable profile", () => {
    expect(getFinalCheckpointCoverageProfileIssue(contract("final_checkpoint"), {
      valid: false,
      profile: null,
      issues: [{ kind: "missing-file", message: "profile absent" }],
    })).toContain("no executable coverage profile");
  });

  it("accepts a required final-only LCOV check with the generic advisory reference and target", () => {
    expect(getFinalCheckpointCoverageProfileIssue(contract("final_checkpoint"), {
      valid: true,
      issues: [],
      profile: {
        version: "2.0",
        description: "arbitrary stack",
        checks: [{
          id: "stack-coverage",
          intent: "coverage",
          command: ["test-tool", "coverage"],
          workingDirectory: ".",
          timeout: 60_000,
          required: true,
          runAt: "final_checkpoint",
          coverage: {
            reportPath: "coverage/lcov.info",
            format: "lcov",
            include: ["src/**"],
            exclude: ["test/**"],
            minimumPercent: 80,
            targetPercent: 95,
            improvementAttempts: 3,
          },
        }],
      },
    })).toBeNull();
  });
});
