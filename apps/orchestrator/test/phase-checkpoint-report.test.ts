import { describe, expect, it } from "vitest";

import {
  renderPhaseCheckpointReport,
  upsertPhaseCheckpointReport,
} from "../src/phase-checkpoint-report.js";
import type { AggregateVerificationResult } from "../src/final-verification-types.js";

function verification(status: "passed" | "failed" = "passed"): AggregateVerificationResult {
  return {
    status,
    failedRequiredChecks: status === "passed" ? [] : ["build"],
    blockedReason: status === "passed" ? null : "build failed",
    persistenceWarning: null,
    duration: 25,
    startedAt: "2026-07-20T10:00:00.000Z",
    checks: [{
      checkId: "build",
      intent: "build",
      description: "Build",
      command: ["tool", "build"],
      workingDirectory: ".",
      outcome: status,
      duration: 25,
      exitCode: status === "passed" ? 0 : 1,
      startedAt: "2026-07-20T10:00:00.000Z",
      outputSummary: status === "passed" ? "0 errors, 0 warnings" : "warning | compile failed",
      required: true,
    }],
  };
}

function verificationWithCoverage(): AggregateVerificationResult {
  const result = verification();
  return {
    ...result,
    checks: [...result.checks, {
      ...result.checks[0]!,
      checkId: "changed-code-coverage",
      intent: "coverage",
      description: "Changed production coverage",
      command: ["tool", "coverage"],
      outputSummary: "Test coverage passed: changed-line coverage is 96%; minimum 80%; target achieved.",
    }],
  };
}

describe("phase checkpoint Markdown projection", () => {
  it("records commands, results, review binding, and sign-off", () => {
    const report = renderPhaseCheckpointReport({
      completedTasks: true,
      executedAt: "2026-07-20T10:01:00.000Z",
      reviewArtifactHash: "a".repeat(64),
      reviewSatisfied: true,
      verification: verification(),
    });

    expect(report).toContain("**Status**: COMPLETED");
    expect(report).toContain("| build | build | tool build | passed | 0 errors, 0 warnings |");
    expect(report).toContain(`**Review Artifact Hash**: ${"a".repeat(64)}`);
    expect(report).toContain("- [x] Ready for next phase");
  });

  it("renders failed evidence as repair-required", () => {
    const report = renderPhaseCheckpointReport({
      completedTasks: true,
      executedAt: "2026-07-20T10:01:00.000Z",
      reviewArtifactHash: null,
      reviewSatisfied: true,
      verification: verification("failed"),
    });

    expect(report).toContain("**Status**: REPAIR_REQUIRED");
    expect(report).toContain("warning / compile failed");
    expect(report).toContain("- [ ] Ready for next phase");
  });

  it("records the final changed-code coverage sign-off", () => {
    const report = renderPhaseCheckpointReport({
      completedTasks: true,
      executedAt: "2026-07-20T10:01:00.000Z",
      reviewArtifactHash: null,
      reviewSatisfied: true,
      verification: verificationWithCoverage(),
    });

    expect(report).toContain("| changed-code-coverage | coverage | tool coverage | passed |");
    expect(report).toContain("- [x] FEAT changed-line and overall project coverage were measured and recorded (80% advisory reference; target 95-100%)");
  });

  it("completes executable gates while leaving measurement sign-off open for unavailable coverage", () => {
    const result = verificationWithCoverage();
    result.checks[1] = {
      ...result.checks[1]!,
      outcome: "coverage-unavailable",
      outputSummary: "Test coverage was not measured. Reason: LCOV report missing.",
    };
    const report = renderPhaseCheckpointReport({
      completedTasks: true,
      executedAt: "2026-07-20T10:01:00.000Z",
      reviewArtifactHash: null,
      reviewSatisfied: true,
      verification: result,
    });
    expect(report).toContain("**Status**: COMPLETED");
    expect(report).toContain("| changed-code-coverage | coverage | tool coverage | coverage-unavailable |");
    expect(report).toContain("- [x] Full configured build, lint/typecheck, and tests are green");
    expect(report).toContain("- [ ] FEAT changed-line and overall project coverage were measured and recorded");
    expect(report).toContain("- [x] Ready for next phase");
  });

  it("upserts independently of malformed surrounding Markdown", () => {
    const malformed = "# Arbitrary Phase\n\n| broken | table\n\nprose";
    const first = upsertPhaseCheckpointReport(malformed, renderPhaseCheckpointReport({
      completedTasks: true,
      executedAt: "one",
      reviewArtifactHash: null,
      reviewSatisfied: true,
      verification: verification("failed"),
    }));
    const second = upsertPhaseCheckpointReport(first, renderPhaseCheckpointReport({
      completedTasks: true,
      executedAt: "two",
      reviewArtifactHash: null,
      reviewSatisfied: true,
      verification: verification(),
    }));

    expect(second).toContain("| broken | table");
    expect(second.match(/hepha:phase-checkpoint:start/g)).toHaveLength(1);
    expect(second).toContain("**Checkpoint Date**: two");
    expect(second).not.toContain("**Checkpoint Date**: one");
  });
});
