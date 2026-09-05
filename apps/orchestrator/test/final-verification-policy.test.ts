// Behavior suite: final verification.
// FEAT-044: Final Verification Runner — Business Logic Unit Tests
//
// Pure function tests for profile validation, serial execution planning,
// outcome classification, fail-fast, and aggregate decisions.

import { describe, expect, it } from "vitest";
import {
  normalizeChecks,
  selectChecksForCheckpoint,
  detectDuplicateCheckIds,
  detectUnsafeCommands,
  findMissingRequiredIntents,
  classifyOutcome,
  detectsZeroTestSelection,
  normalizeCoverageOutcome,
  buildExecutionPlan,
  shouldSuppressNextRequiredCheck,
  allRequiredChecksPassed,
  computeAggregateStatus,
  getFailedRequiredCheckIds,
  getBlockedReason,
  buildAggregateResult,
  type ClassifyOutcomeParams,
} from "../src/final-verification-policy.js";
import type {
  VerificationCheckDeclaration,
  CheckResult,
} from "../src/final-verification-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheck(overrides: Partial<VerificationCheckDeclaration> = {}): VerificationCheckDeclaration {
  return {
    id: "test-check",
    description: "Test check",
    intent: "test",
    command: ["echo", "ok"],
    workingDirectory: ".",
    timeout: 120_000,
    required: true,
    ...overrides,
  };
}

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    checkId: "test-check",
    intent: "test",
    description: "Test check",
    command: ["echo", "ok"],
    workingDirectory: ".",
    outcome: "passed",
    duration: 100,
    exitCode: 0,
    startedAt: "2026-01-01T00:00:00Z",
    outputSummary: "ok",
    required: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeChecks
// ---------------------------------------------------------------------------

describe("normalizeChecks", () => {
  it("returns checks in declared order", () => {
    const checks = [
      makeCheck({ id: "a" }),
      makeCheck({ id: "b" }),
      makeCheck({ id: "c" }),
    ];
    const normalized = normalizeChecks({ version: "1.0", description: "", checks });
    expect(normalized).toHaveLength(3);
    expect(normalized[0].id).toBe("a");
    expect(normalized[1].id).toBe("b");
    expect(normalized[2].id).toBe("c");
  });

  it("returns a new array (not reference)", () => {
    const checks = [makeCheck()];
    const normalized = normalizeChecks({ version: "1.0", description: "", checks });
    expect(normalized).not.toBe(checks);
  });
});

describe("selectChecksForCheckpoint", () => {
  it("runs final-checkpoint coverage only at the declared final checkpoint", () => {
    const checks = [
      makeCheck({ id: "unit" }),
      makeCheck({ id: "coverage", intent: "coverage", runAt: "final_checkpoint" }),
    ];
    expect(selectChecksForCheckpoint(checks, "phase").map((check) => check.id)).toEqual(["unit"]);
    expect(selectChecksForCheckpoint(checks, "final_checkpoint").map((check) => check.id)).toEqual(["unit", "coverage"]);
  });
});

// ---------------------------------------------------------------------------
// detectDuplicateCheckIds
// ---------------------------------------------------------------------------

describe("detectDuplicateCheckIds", () => {
  it("returns empty array when no duplicates", () => {
    const checks = [
      makeCheck({ id: "a" }),
      makeCheck({ id: "b" }),
    ];
    expect(detectDuplicateCheckIds(checks)).toEqual([]);
  });

  it("detects duplicate IDs", () => {
    const checks = [
      makeCheck({ id: "a" }),
      makeCheck({ id: "b" }),
      makeCheck({ id: "a" }),
    ];
    expect(detectDuplicateCheckIds(checks)).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// detectUnsafeCommands
// ---------------------------------------------------------------------------

describe("detectUnsafeCommands", () => {
  it("returns empty for safe commands", () => {
    const checks = [
      makeCheck({ command: ["pnpm", "run", "test"] }),
    ];
    expect(detectUnsafeCommands(checks)).toEqual([]);
  });

  it("flags shell metacharacters in arguments", () => {
    const checks = [
      makeCheck({ id: "danger", command: ["sh", "-c", "echo hello | grep foo"] }),
    ];
    expect(detectUnsafeCommands(checks)).toEqual(["danger"]);
  });

  it("flags echo with redirect", () => {
    const checks = [
      makeCheck({ id: "danger", command: ["echo", "hello", ">", "file.txt"] }),
    ];
    expect(detectUnsafeCommands(checks)).toEqual(["danger"]);
  });

  it("returns multiple unsafe IDs", () => {
    const checks = [
      makeCheck({ id: "safe", command: ["echo", "hello"] }),
      makeCheck({ id: "unsafe1", command: ["bash", "-c", "ls; rm -rf /"] }),
      makeCheck({ id: "unsafe2", command: ["curl", "http://example.com", "|", "sh"] }),
    ];
    const unsafe = detectUnsafeCommands(checks);
    expect(unsafe).toContain("unsafe1");
    expect(unsafe).toContain("unsafe2");
    expect(unsafe).not.toContain("safe");
  });
});

// ---------------------------------------------------------------------------
// findMissingRequiredIntents
// ---------------------------------------------------------------------------

describe("findMissingRequiredIntents", () => {
  it("returns empty when build, test, lint, and coverage intents are covered", () => {
    const checks = [
      makeCheck({ id: "b", intent: "build", required: true }),
      makeCheck({ id: "t", intent: "test", required: true }),
      makeCheck({ id: "l", intent: "lint", required: true }),
      makeCheck({ id: "c", intent: "coverage", required: true }),
    ];
    expect(findMissingRequiredIntents(checks)).toEqual([]);
  });

  it("returns missing intents when coverage is partial", () => {
    const checks = [
      makeCheck({ id: "b", intent: "build", required: true }),
      makeCheck({ id: "t", intent: "test", required: true }),
    ];
    expect(findMissingRequiredIntents(checks)).toEqual(["lint", "coverage"]);
  });

  it("returns all three when no checks are required", () => {
    const checks = [
      makeCheck({ id: "b", intent: "build", required: false }),
    ];
    expect(findMissingRequiredIntents(checks)).toEqual(["build", "test", "lint", "coverage"]);
  });

  it("returns empty when intent is covered by multiple required checks", () => {
    const checks = [
      makeCheck({ id: "t1", intent: "test", required: true }),
      makeCheck({ id: "t2", intent: "test", required: true }),
      makeCheck({ id: "b", intent: "build", required: true }),
      makeCheck({ id: "l", intent: "lint", required: true }),
      makeCheck({ id: "c", intent: "coverage", required: true }),
    ];
    expect(findMissingRequiredIntents(checks)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// classifyOutcome
// ---------------------------------------------------------------------------

describe("classifyOutcome", () => {
  const base: ClassifyOutcomeParams = {
    exitCode: null,
    timedOut: false,
    policyBlocked: false,
    skipped: false,
    zeroSelection: false,
  };

  it("classifies exit code 0 as passed", () => {
    expect(classifyOutcome({ ...base, exitCode: 0 })).toBe("passed");
  });

  it("classifies non-zero exit code as failed", () => {
    expect(classifyOutcome({ ...base, exitCode: 1 })).toBe("failed");
  });

  it("classifies timeout", () => {
    expect(classifyOutcome({ ...base, timedOut: true })).toBe("timed-out");
  });

  it("classifies policy blocked", () => {
    expect(classifyOutcome({ ...base, policyBlocked: true })).toBe("policy-blocked");
  });

  it("classifies skipped", () => {
    expect(classifyOutcome({ ...base, skipped: true })).toBe("skipped");
  });

  it("classifies zero selection", () => {
    expect(classifyOutcome({ ...base, zeroSelection: true })).toBe("zero-selection");
  });

  it("timeout takes precedence over exit code", () => {
    expect(classifyOutcome({ ...base, exitCode: 0, timedOut: true })).toBe("timed-out");
  });

  it("policy block takes precedence over exit code", () => {
    expect(classifyOutcome({ ...base, exitCode: 0, policyBlocked: true })).toBe("policy-blocked");
  });

  it("null exit code with no flags defaults to skipped", () => {
    expect(classifyOutcome(base)).toBe("skipped");
  });

  it("explains a warning-only failure without claiming a non-zero exit", () => {
    expect(getBlockedReason([
      makeResult({ outcome: "failed", exitCode: 0 }),
    ], "failed")).toContain("emitted warnings");
  });
});

describe("detectsZeroTestSelection", () => {
  it.each([
    "No test matches the given testcase filter.",
    "No tests were discovered",
    "Total tests: 0",
    "Tests run: 0",
  ])("detects a zero-test success report: %s", (output) => {
    expect(detectsZeroTestSelection(output)).toBe(true);
  });

  it("does not confuse zero failures with zero discovered tests", () => {
    expect(detectsZeroTestSelection("127 passed, 0 failed")).toBe(false);
  });
});

describe("normalizeCoverageOutcome", () => {
  it.each(["failed", "timed-out", "policy-blocked", "skipped", "zero-selection"] as const)(
    "records coverage %s as unavailable telemetry instead of a lifecycle failure",
    (outcome) => {
      expect(normalizeCoverageOutcome("coverage", outcome)).toBe("coverage-unavailable");
    },
  );

  it("preserves a measured below-reference advisory for the improvement loop", () => {
    expect(normalizeCoverageOutcome("coverage", "advisory")).toBe("advisory");
  });

  it("does not weaken an independent failing test gate", () => {
    expect(normalizeCoverageOutcome("test", "failed")).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// buildExecutionPlan
// ---------------------------------------------------------------------------

describe("buildExecutionPlan", () => {
  it("returns checks in declared order", () => {
    const checks = [
      makeCheck({ id: "first" }),
      makeCheck({ id: "second" }),
    ];
    const plan = buildExecutionPlan(checks);
    expect(plan).toHaveLength(2);
    expect(plan[0].id).toBe("first");
    expect(plan[1].id).toBe("second");
  });
});

// ---------------------------------------------------------------------------
// shouldSuppressNextRequiredCheck
// ---------------------------------------------------------------------------

describe("shouldSuppressNextRequiredCheck", () => {
  it("returns false when all required checks passed", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed", required: true }),
      makeResult({ checkId: "b", outcome: "passed", required: true }),
    ];
    expect(shouldSuppressNextRequiredCheck(results)).toBe(false);
  });

  it("returns true when a required check failed", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed", required: true }),
      makeResult({ checkId: "b", outcome: "failed", required: true }),
    ];
    expect(shouldSuppressNextRequiredCheck(results)).toBe(true);
  });

  it("returns true when a required check timed out", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "timed-out", required: true }),
    ];
    expect(shouldSuppressNextRequiredCheck(results)).toBe(true);
  });

  it("returns true when a required check is policy-blocked", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "policy-blocked", required: true }),
    ];
    expect(shouldSuppressNextRequiredCheck(results)).toBe(true);
  });

  it("ignores non-required failures", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "failed", required: false }),
      makeResult({ checkId: "b", outcome: "passed", required: true }),
    ];
    expect(shouldSuppressNextRequiredCheck(results)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// allRequiredChecksPassed
// ---------------------------------------------------------------------------

describe("allRequiredChecksPassed", () => {
  it("returns true when all required passed", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed", required: true }),
      makeResult({ checkId: "b", outcome: "passed", required: true }),
    ];
    expect(allRequiredChecksPassed(results)).toBe(true);
  });

  it("returns false when a required check failed", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed", required: true }),
      makeResult({ checkId: "b", outcome: "failed", required: true }),
    ];
    expect(allRequiredChecksPassed(results)).toBe(false);
  });

  it("returns false when there are no results", () => {
    expect(allRequiredChecksPassed([])).toBe(false);
  });

  it("returns true when no required checks exist", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "failed", required: false }),
    ];
    expect(allRequiredChecksPassed(results)).toBe(true); // vacuously true
  });
});

// ---------------------------------------------------------------------------
// computeAggregateStatus
// ---------------------------------------------------------------------------

describe("computeAggregateStatus", () => {
  it("returns passed when all required checks pass", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed" }),
      makeResult({ checkId: "b", outcome: "passed" }),
    ];
    expect(computeAggregateStatus(results)).toBe("passed");
  });

  it("treats a successfully measured coverage advisory as non-blocking", () => {
    const results = [
      makeResult({ checkId: "tests", outcome: "passed" }),
      makeResult({ checkId: "coverage", intent: "coverage", outcome: "advisory" }),
    ];
    expect(computeAggregateStatus(results)).toBe("passed");
    expect(getFailedRequiredCheckIds(results)).toEqual([]);
    expect(shouldSuppressNextRequiredCheck(results)).toBe(false);
    expect(allRequiredChecksPassed(results)).toBe(true);
  });

  it("treats unavailable coverage measurement as a non-blocking recorded remark", () => {
    const results = [
      makeResult({ checkId: "tests", outcome: "passed" }),
      makeResult({ checkId: "coverage", intent: "coverage", outcome: "coverage-unavailable" }),
    ];
    expect(computeAggregateStatus(results)).toBe("passed");
    expect(getFailedRequiredCheckIds(results)).toEqual([]);
    expect(shouldSuppressNextRequiredCheck(results)).toBe(false);
    expect(allRequiredChecksPassed(results)).toBe(true);
  });

  it("returns failed when a required check fails", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed" }),
      makeResult({ checkId: "b", outcome: "failed" }),
    ];
    expect(computeAggregateStatus(results)).toBe("failed");
  });

  it("returns blocked on timeout", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "timed-out" }),
    ];
    expect(computeAggregateStatus(results)).toBe("blocked");
  });

  it("returns blocked on policy block", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "policy-blocked" }),
    ];
    expect(computeAggregateStatus(results)).toBe("blocked");
  });

  it("returns skipped for empty results", () => {
    expect(computeAggregateStatus([])).toBe("skipped");
  });

  it("returns skipped when no required checks exist (all non-required)", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed", required: false }),
      makeResult({ checkId: "b", outcome: "failed", required: false }),
    ];
    expect(computeAggregateStatus(results)).toBe("skipped");
  });

  it("returns blocked on zero-selection", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "zero-selection" }),
    ];
    expect(computeAggregateStatus(results)).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// getFailedRequiredCheckIds
// ---------------------------------------------------------------------------

describe("getFailedRequiredCheckIds", () => {
  it("returns empty when all passed", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed" }),
    ];
    expect(getFailedRequiredCheckIds(results)).toEqual([]);
  });

  it("returns IDs of failed required checks", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed" }),
      makeResult({ checkId: "b", outcome: "failed" }),
      makeResult({ checkId: "c", outcome: "failed", required: false }), // non-required ignored
    ];
    expect(getFailedRequiredCheckIds(results)).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------------------
// getBlockedReason
// ---------------------------------------------------------------------------

describe("getBlockedReason", () => {
  it("returns null for passed status", () => {
    expect(getBlockedReason([], "passed")).toBeNull();
  });

  it("returns policy block reason", () => {
    const results = [makeResult({ checkId: "a", outcome: "policy-blocked" })];
    const reason = getBlockedReason(results, "blocked");
    expect(reason).toContain("policy");
  });

  it("returns timeout reason", () => {
    const results = [makeResult({ checkId: "a", outcome: "timed-out", duration: 5000 })];
    const reason = getBlockedReason(results, "blocked");
    expect(reason).toContain("timed out");
  });

  it("returns fail reason", () => {
    const results = [makeResult({ checkId: "a", outcome: "failed", exitCode: 1 })];
    const reason = getBlockedReason(results, "failed");
    expect(reason).toContain("exited with code");
  });
});

// ---------------------------------------------------------------------------
// buildAggregateResult
// ---------------------------------------------------------------------------

describe("buildAggregateResult", () => {
  it("builds a passing aggregate", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed", duration: 100 }),
      makeResult({ checkId: "b", outcome: "passed", duration: 200 }),
    ];
    const aggregate = buildAggregateResult(results, "2026-01-01T00:00:00Z", null);
    expect(aggregate.status).toBe("passed");
    expect(aggregate.duration).toBe(300);
    expect(aggregate.failedRequiredChecks).toEqual([]);
    expect(aggregate.blockedReason).toBeNull();
    expect(aggregate.persistenceWarning).toBeNull();
  });

  it("builds a failing aggregate", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed" }),
      makeResult({ checkId: "b", outcome: "failed" }),
    ];
    const aggregate = buildAggregateResult(results, "2026-01-01T00:00:00Z", "store failed");
    expect(aggregate.status).toBe("failed");
    expect(aggregate.failedRequiredChecks).toEqual(["b"]);
    expect(aggregate.persistenceWarning).toBe("store failed");
  });
});
