// Behavior suite: final verification.
// FEAT-044: Final Verification Runner — Integration Tests
//
// Tests for the final verification adapter with fixture commands.
// Uses real process execution but with echo-based fixture commands.

import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { loadVerificationProfile, resolveProfilePath } from "../src/final-verification-profile-loader.js";
import { runFinalVerification } from "../src/final-verification-adapter.js";
import { buildExecutionPlan, computeAggregateStatus } from "../src/final-verification-policy.js";
import {
  formatAggregateSummary,
  formatCheckResultsBlock,
} from "../src/final-verification-presentation.js";
import type { VerificationProfile } from "../src/final-verification-types.js";

// ---------------------------------------------------------------------------
// Profile loader integration tests
// ---------------------------------------------------------------------------

describe("profile loader integration", () => {
  it("keeps the repository final-checkpoint profile executable and coverage-capable", () => {
    const result = loadVerificationProfile(resolveProfilePath(process.cwd()));
    expect(result).toEqual(expect.objectContaining({ valid: true, issues: [] }));
    expect(result.profile?.checks.filter((check) => check.intent === "coverage")).toHaveLength(2);
  });

  it("reports missing file as invalid", () => {
    const result = loadVerificationProfile("/nonexistent/profile.yaml");
    expect(result.valid).toBe(false);
    expect(result.issues[0].kind).toBe("missing-file");
  });

  it("rejects profile with missing required intents", () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "feat-044-test-"));
    const profilePath = resolve(tempDir, "profile.yaml");
    writeFileSync(profilePath, `version: "1.0"\nchecks:\n  - id: "only-build"\n    intent: "build"\n    command: ["true"]\n    required: true\n`);
    const result = loadVerificationProfile(profilePath);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.kind === "missing-required-intent")).toBe(true);
  });

  it("rejects empty checks array", () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "feat-044-test-"));
    const profilePath = resolve(tempDir, "profile.yaml");
    writeFileSync(profilePath, `version: "1.0"\nchecks: []\n`);
    const result = loadVerificationProfile(profilePath);
    expect(result.valid).toBe(false);
    expect(result.issues[0].kind).toBe("zero-checks");
  });

  it("rejects duplicate check IDs", () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "feat-044-test-"));
    const profilePath = resolve(tempDir, "profile.yaml");
    writeFileSync(profilePath, `version: "1.0"\nchecks:\n  - id: "dup"\n    intent: "build"\n    command: ["true"]\n    required: true\n  - id: "dup"\n    intent: "test"\n    command: ["true"]\n    required: true\n`);
    const result = loadVerificationProfile(profilePath);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.kind === "duplicate-check-id")).toBe(true);
  });

  it("defaults legacy coverage profiles to five non-blocking improvement attempts", () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "coverage-profile-test-"));
    const profilePath = resolve(tempDir, "profile.yaml");
    writeFileSync(profilePath, `version: "2.0"
checks:
  - { id: "build", intent: "build", command: ["true"], required: true }
  - { id: "test", intent: "test", command: ["true"], required: true }
  - { id: "lint", intent: "lint", command: ["true"], required: true }
  - id: "coverage"
    intent: "coverage"
    command: ["true"]
    required: true
    runAt: "final_checkpoint"
    coverage:
      reportPath: "coverage/lcov.info"
      format: "lcov"
      include: ["src/**/*.ts"]
      exclude: ["src/**/*.test.ts"]
      minimumPercent: 80
      targetPercent: 95
`);
    const result = loadVerificationProfile(profilePath);
    expect(result.valid).toBe(true);
    expect(result.profile?.checks.at(-1)).toEqual(expect.objectContaining({
      intent: "coverage",
      runAt: "final_checkpoint",
      coverage: expect.objectContaining({ improvementAttempts: 5, minimumPercent: 80, targetPercent: 95 }),
    }));
  });

  it("rejects a coverage intent without a machine-readable report contract", () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), "coverage-profile-test-"));
    const profilePath = resolve(tempDir, "profile.yaml");
    writeFileSync(profilePath, `version: "2.0"
checks:
  - { id: "build", intent: "build", command: ["true"], required: true }
  - { id: "test", intent: "test", command: ["true"], required: true }
  - { id: "lint", intent: "lint", command: ["true"], required: true }
  - { id: "coverage", intent: "coverage", command: ["true"], required: true, runAt: "final_checkpoint" }
`);
    const result = loadVerificationProfile(profilePath);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "invalid-coverage-contract", checkId: "coverage" }),
    ]));
  });
});

// ---------------------------------------------------------------------------
// Real command execution tests (smoke tests)
// ---------------------------------------------------------------------------

describe("real command execution — echo fixture", () => {
  it("executes echo commands in order", async () => {
    const { execFileSync } = await import("node:child_process");
    const stdout = execFileSync("echo", ["hello", "world"], { encoding: "utf-8" });
    expect(stdout.trim()).toBe("hello world");
  });

  it("reports non-zero exit as failure", async () => {
    const { execFileSync } = await import("node:child_process");
    let failed = false;
    try {
      execFileSync("test", ["1", "-eq", "0"], { encoding: "utf-8" });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("times out on a long-running command", async () => {
    const { execFileSync } = await import("node:child_process");
    let timedOut = false;
    try {
      execFileSync("sleep", ["30"], {
        encoding: "utf-8",
        timeout: 50,
        windowsHide: true,
      });
    } catch (error: unknown) {
      const e = error as NodeJS.ErrnoException & { killed?: boolean };
      // On Linux, killed is set; on some systems we check the error code
      timedOut = e.killed === true || e.code === "ETIMEDOUT";
    }
    expect(timedOut).toBe(true);
  });
});

describe("coverage execution remains decision-support telemetry", () => {
  function projectWithCoverageCommand(command: string[]): string {
    const root = mkdtempSync(resolve(tmpdir(), "coverage-runtime-test-"));
    mkdirSync(resolve(root, ".hepha/safety"), { recursive: true });
    const yamlCommand = JSON.stringify(command);
    writeFileSync(resolveProfilePath(root), `version: "2.0"
checks:
  - { id: "build", intent: "build", command: ["node", "-e", "process.exit(0)"], required: true }
  - { id: "test", intent: "test", command: ["node", "-e", "process.exit(0)"], required: true }
  - id: "coverage"
    intent: "coverage"
    command: ${yamlCommand}
    required: true
    runAt: "final_checkpoint"
    coverage:
      reportPath: "coverage/lcov.info"
      format: "lcov"
      include: ["src/**/*.ts"]
      exclude: ["src/**/*.test.ts"]
      minimumPercent: 80
      targetPercent: 95
      improvementAttempts: 3
  - { id: "lint-after-coverage", intent: "lint", command: ["node", "-e", "process.exit(0)"], required: true }
`);
    return root;
  }

  function store(startTransitions: unknown[] = []) {
    return {
      enabled: true,
      listStartTransitions: async () => startTransitions,
      recordFinalVerificationRun: async (record: unknown) => record,
      recordFinalVerificationCheck: async (record: unknown) => record,
    } as any;
  }

  it("records a red coverage command as a remark while independent gates pass", async () => {
    const root = projectWithCoverageCommand(["node", "-e", "process.stderr.write('coverage command error'); process.exit(2)"]);
    const result = await runFinalVerification({
      projectRoot: root, projectId: "project", cardKey: "card", workflowRunId: "run",
      store: store([{ startCommit: "a".repeat(40), rolledBack: false, transitionStatus: "prerequisites_ready" }]),
    });
    expect(result.aggregate.status).toBe("passed");
    expect(result.aggregate.checks.find((check) => check.intent === "coverage")).toEqual(expect.objectContaining({
      intent: "coverage",
      outcome: "coverage-unavailable",
      advisoryRepairLimit: undefined,
    }));
    expect(result.aggregate.checks.find((check) => check.intent === "coverage")?.outputSummary).toContain("coverage command error");
    expect(result.aggregate.checks.at(-1)).toEqual(expect.objectContaining({
      checkId: "lint-after-coverage",
      outcome: "passed",
    }));
    expect(result.summaryLine).toContain("coverage measurement remark");
  });

  it("records a missing baseline or report as a remark without creating an improvement attempt", async () => {
    const root = projectWithCoverageCommand(["node", "-e", "process.exit(0)"]);
    const result = await runFinalVerification({
      projectRoot: root, projectId: "project", cardKey: "card", workflowRunId: "run",
      store: store(),
    });
    expect(result.aggregate.status).toBe("passed");
    expect(result.aggregate.checks.find((check) => check.intent === "coverage")).toEqual(expect.objectContaining({
      outcome: "coverage-unavailable",
      advisoryRepairLimit: undefined,
    }));
    expect(result.aggregate.checks.find((check) => check.intent === "coverage")?.outputSummary).toContain("baseline commit is unavailable");
    expect(result.aggregate.checks.at(-1)).toEqual(expect.objectContaining({
      checkId: "lint-after-coverage",
      outcome: "passed",
    }));
  });
});

describe("test discovery is authoritative", () => {
  it("records exit-zero no-match output as zero-selection rather than passed", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "zero-selection-runtime-test-"));
    mkdirSync(resolve(root, ".hepha/safety"), { recursive: true });
    writeFileSync(resolveProfilePath(root), `version: "1.0"
checks:
  - { id: "build", intent: "build", command: ["node", "-e", "process.exit(0)"], required: true }
  - { id: "filtered-tests", intent: "test", command: ["node", "-e", "console.log('No test matches the given testcase filter.'); process.exit(0)"], required: true }
  - { id: "lint", intent: "lint", command: ["node", "-e", "process.exit(0)"], required: true }
  - id: "coverage"
    intent: "coverage"
    command: ["node", "-e", "process.exit(0)"]
    required: true
    coverage:
      reportPath: "coverage/lcov.info"
      format: "lcov"
      include: ["src/**/*.ts"]
      exclude: ["src/**/*.test.ts"]
      minimumPercent: 80
      targetPercent: 95
      improvementAttempts: 1
`);
    const store = {
      listStartTransitions: async () => [],
      recordFinalVerificationRun: async (record: unknown) => record,
      recordFinalVerificationCheck: async (record: unknown) => record,
    } as any;
    const result = await runFinalVerification({
      projectRoot: root, projectId: "project", cardKey: "card", workflowRunId: "run", store,
    });
    expect(result.aggregate.status).toBe("failed");
    expect(result.aggregate.checks.find((check) => check.checkId === "filtered-tests")?.outcome).toBe("zero-selection");
    expect(result.aggregate.failedRequiredChecks).toContain("filtered-tests");
  });
});

// ---------------------------------------------------------------------------
// Pure policy integration (composition)
// ---------------------------------------------------------------------------

describe("pure policy integration — execution plan + aggregate", () => {
  it("execution plan preserves declared order", () => {
    const profile: VerificationProfile = {
      version: "1.0",
      description: "Test",
      checks: [
        { id: "build", description: "B", intent: "build", command: ["true"], workingDirectory: ".", timeout: 30000, required: true },
        { id: "test", description: "T", intent: "test", command: ["true"], workingDirectory: ".", timeout: 30000, required: true },
        { id: "lint", description: "L", intent: "lint", command: ["true"], workingDirectory: ".", timeout: 30000, required: true },
      ],
    };
    const plan = buildExecutionPlan(profile.checks);
    expect(plan.map((c) => c.id)).toEqual(["build", "test", "lint"]);
  });

  it("aggregate with all green passes", () => {
    const results = [
      { checkId: "build", intent: "build" as const, description: "B", command: ["true"], workingDirectory: ".", outcome: "passed" as const, duration: 100, exitCode: 0, startedAt: "", outputSummary: "", required: true },
      { checkId: "test", intent: "test" as const, description: "T", command: ["true"], workingDirectory: ".", outcome: "passed" as const, duration: 200, exitCode: 0, startedAt: "", outputSummary: "", required: true },
      { checkId: "lint", intent: "lint" as const, description: "L", command: ["true"], workingDirectory: ".", outcome: "passed" as const, duration: 50, exitCode: 0, startedAt: "", outputSummary: "", required: true },
    ];
    expect(computeAggregateStatus(results)).toBe("passed");
  });

  it("aggregate with one fail is failed", () => {
    const results = [
      { checkId: "build", intent: "build" as const, description: "B", command: ["true"], workingDirectory: ".", outcome: "passed" as const, duration: 100, exitCode: 0, startedAt: "", outputSummary: "", required: true },
      { checkId: "test", intent: "test" as const, description: "T", command: ["true"], workingDirectory: ".", outcome: "failed" as const, duration: 50, exitCode: 1, startedAt: "", outputSummary: "error", required: true },
    ];
    expect(computeAggregateStatus(results)).toBe("failed");
  });

  it("aggregate with blocked due to timeout is blocked", () => {
    const results = [
      { checkId: "build", intent: "build" as const, description: "B", command: ["true"], workingDirectory: ".", outcome: "passed" as const, duration: 100, exitCode: 0, startedAt: "", outputSummary: "", required: true },
      { checkId: "slow", intent: "test" as const, description: "S", command: ["true"], workingDirectory: ".", outcome: "timed-out" as const, duration: 50000, exitCode: null, startedAt: "", outputSummary: "timed out", required: true },
    ];
    expect(computeAggregateStatus(results)).toBe("blocked");
  });

  it("aggregate with policy blocked is blocked", () => {
    const results = [
      { checkId: "blocked", intent: "lint" as const, description: "B", command: ["rm", "-rf"], workingDirectory: ".", outcome: "policy-blocked" as const, duration: 0, exitCode: null, startedAt: "", outputSummary: "blocked by policy", required: true },
    ];
    expect(computeAggregateStatus(results)).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// Presentation format integration
// ---------------------------------------------------------------------------

describe("presentation formatting integration", () => {
  it("builds a readable check block", () => {
    const results = [
      { checkId: "build", intent: "build" as const, description: "Build check", command: ["pnpm", "run", "build"], workingDirectory: ".", outcome: "passed" as const, duration: 5000, exitCode: 0, startedAt: "", outputSummary: "build ok", required: true },
      { checkId: "test", intent: "test" as const, description: "Test check", command: ["pnpm", "run", "test"], workingDirectory: ".", outcome: "failed" as const, duration: 3000, exitCode: 1, startedAt: "", outputSummary: "test failed", required: true },
    ];
    const block = formatCheckResultsBlock(results);
    expect(block).toContain("[PASS]");
    expect(block).toContain("[FAIL]");
    expect(block).toContain("Build check");
    expect(block).toContain("Test check");
  });

  it("builds a clear aggregate summary", () => {
    const aggregate = {
      status: "failed" as const,
      failedRequiredChecks: ["test"],
      blockedReason: "check 'test' exited with code 1",
      persistenceWarning: null,
      checks: [
        { checkId: "build", intent: "build" as const, description: "B", command: ["true"], workingDirectory: ".", outcome: "passed" as const, duration: 100, exitCode: 0, startedAt: "", outputSummary: "", required: true },
        { checkId: "test", intent: "test" as const, description: "T", command: ["false"], workingDirectory: ".", outcome: "failed" as const, duration: 50, exitCode: 1, startedAt: "", outputSummary: "", required: true },
      ],
      duration: 150,
      startedAt: "",
    };
    const summary = formatAggregateSummary(aggregate);
    expect(summary).toContain("FAILED");
    expect(summary).toContain("test");
  });
});
