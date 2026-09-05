// Behavior suite: final verification.
// FEAT-044: Final Verification Runner — Presentation Contract Tests
//
// Tests for deterministic summary formatting, redaction, and truncation.

import { describe, expect, it } from "vitest";
import {
  formatCheckResultLine,
  formatAggregateSummary,
  formatCheckResultsBlock,
  buildVerificationPresentation,
  buildBlockedPresentation,
  redactSecrets,
  truncateOutput,
  safeOutputSummary,
  applyPersistenceWarning,
  buildPersistenceWarningSuffix,
} from "../src/final-verification-presentation.js";
import type {
  CheckResult,
  AggregateVerificationResult,
} from "../src/final-verification-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    checkId: "test-check",
    intent: "test",
    description: "Test check description",
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
// redactSecrets
// ---------------------------------------------------------------------------

describe("redactSecrets", () => {
  it("does not change normal text", () => {
    expect(redactSecrets("hello world")).toBe("hello world");
  });

  it("redacts API key patterns", () => {
    const result = redactSecrets("key=sk-abcdef1234567890abcdef1234567890"); // gitleaks:allow -- synthetic redaction fixture
    expect(result).not.toContain("sk-abcdef1234567890abcdef1234567890");
    expect(result).toContain("sk-a");
    expect(result).toContain("***");
  });

  it("redacts GitHub tokens", () => {
    // Use a bare GitHub token without prefix (otherwise token= catches it first)
    const result = redactSecrets("value ghp_abcdefghijklmnopqrstuvwxyz0123456789 end");
    expect(result).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result).toContain("ghp_");
    expect(result).toContain("***");
  });

  it("redacts AWS access keys", () => {
    // AKIA + 16 alphanumeric chars = 20 chars total
    const result = redactSecrets("value=AKIA1234567890ABCDEF");
    expect(result).not.toContain("AKIA1234567890ABCDEF");
    expect(result).toContain("AKIA");
    expect(result).toContain("***");
  });

  it("redacts JWT tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNvrP0TgGjLwCjv3Zg"; // gitleaks:allow -- synthetic redaction fixture
    const result = redactSecrets(`token=${jwt}`);
    expect(result).not.toContain(jwt);
    expect(result).toContain("***");
  });

  it("redacts patterns inline with text", () => {
    const result = redactSecrets("api_key=sk_test_abcdefghijklmnopqrstuvwx"); // gitleaks:allow -- synthetic redaction fixture
    expect(result).not.toContain("sk_test_abcdefghijklmnopqrstuvwx"); // gitleaks:allow -- synthetic redaction fixture
    expect(result).toContain("***");
  });
});

// ---------------------------------------------------------------------------
// truncateOutput
// ---------------------------------------------------------------------------

describe("truncateOutput", () => {
  it("does not truncate short strings", () => {
    expect(truncateOutput("hello", 100)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    const long = "a".repeat(100);
    const result = truncateOutput(long, 10);
    expect(result).toHaveLength(10);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("uses default max length", () => {
    const long = "a".repeat(3000);
    const result = truncateOutput(long);
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// safeOutputSummary
// ---------------------------------------------------------------------------

describe("safeOutputSummary", () => {
  it("redacts secrets then truncates", () => {
    const output = "Result: sk-abcdef1234567890abcdef1234567890 " + "x".repeat(5000);
    const result = safeOutputSummary(output);
    expect(result).not.toContain("sk-abcdef1234567890abcdef1234567890");
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// formatCheckResultLine
// ---------------------------------------------------------------------------

describe("formatCheckResultLine", () => {
  it("formats a passed check", () => {
    const cr = makeResult({ checkId: "build", description: "Build check", duration: 1234 });
    expect(formatCheckResultLine(cr)).toContain("[PASS]");
    expect(formatCheckResultLine(cr)).toContain("build");
    expect(formatCheckResultLine(cr)).toContain("Build check");
    expect(formatCheckResultLine(cr)).toContain("1.2s");
  });

  it("formats a failed check with exit code", () => {
    const cr = makeResult({ checkId: "test", outcome: "failed", exitCode: 1, duration: 500 });
    expect(formatCheckResultLine(cr)).toContain("[FAIL]");
    expect(formatCheckResultLine(cr)).toContain("exit code 1");
  });

  it("formats a timed-out check", () => {
    const cr = makeResult({ checkId: "slow", outcome: "timed-out", duration: 60000 });
    expect(formatCheckResultLine(cr)).toContain("[TIMEOUT]");
    expect(formatCheckResultLine(cr)).toContain("timeout after");
  });

  it("formats a policy-blocked check", () => {
    const cr = makeResult({ checkId: "blocked", outcome: "policy-blocked" });
    expect(formatCheckResultLine(cr)).toContain("[BLOCKED]");
    expect(formatCheckResultLine(cr)).toContain("blocked by command policy");
  });

  it("formats unavailable coverage as a non-blocking remark", () => {
    const cr = makeResult({ checkId: "coverage", intent: "coverage", outcome: "coverage-unavailable" });
    expect(formatCheckResultLine(cr)).toContain("[REMARK]");
    expect(formatCheckResultLine(cr)).toContain("measurement unavailable");
    expect(formatCheckResultLine(cr)).toContain("completion allowed");
  });

  it("formats a skipped check", () => {
    const cr = makeResult({ checkId: "optional", outcome: "skipped" });
    expect(formatCheckResultLine(cr)).toContain("[SKIP]");
  });

  it("formats zero-selection", () => {
    const cr = makeResult({ checkId: "empty", outcome: "zero-selection" });
    expect(formatCheckResultLine(cr)).toContain("[ZERO]");
    expect(formatCheckResultLine(cr)).toContain("zero tests selected");
  });

  it("shows milliseconds for short durations", () => {
    const cr = makeResult({ duration: 50 });
    expect(formatCheckResultLine(cr)).toContain("50ms");
  });

  it("shows minutes and seconds for long durations", () => {
    const cr = makeResult({ duration: 125_000 });
    expect(formatCheckResultLine(cr)).toContain("2m");
  });
});

// ---------------------------------------------------------------------------
// formatCheckResultsBlock
// ---------------------------------------------------------------------------

describe("formatCheckResultsBlock", () => {
  it("returns message for empty list", () => {
    expect(formatCheckResultsBlock([])).toBe("No verification checks executed.");
  });

  it("formats multiple checks", () => {
    const results = [
      makeResult({ checkId: "a", outcome: "passed" }),
      makeResult({ checkId: "b", outcome: "failed" }),
    ];
    const block = formatCheckResultsBlock(results);
    expect(block).toContain("[PASS]");
    expect(block).toContain("[FAIL]");
  });
});

// ---------------------------------------------------------------------------
// formatAggregateSummary
// ---------------------------------------------------------------------------

describe("formatAggregateSummary", () => {
  function makeAggregate(overrides: Partial<AggregateVerificationResult> = {}): AggregateVerificationResult {
    return {
      status: "passed",
      failedRequiredChecks: [],
      blockedReason: null,
      persistenceWarning: null,
      checks: [makeResult({ outcome: "passed" })],
      duration: 1000,
      startedAt: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("formats passed summary", () => {
    const summary = formatAggregateSummary(makeAggregate());
    expect(summary).toContain("passed");
    expect(summary).toContain("1/1 checks");
  });

  it("keeps a passed summary while counting an unavailable coverage remark", () => {
    const summary = formatAggregateSummary(makeAggregate({
      checks: [
        makeResult({ checkId: "tests", outcome: "passed" }),
        makeResult({ checkId: "coverage", intent: "coverage", outcome: "coverage-unavailable" }),
      ],
    }));
    expect(summary).toContain("passed");
    expect(summary).toContain("2/2 checks");
    expect(summary).toContain("1 coverage measurement remark");
  });

  it("formats failed summary", () => {
    const aggregate = makeAggregate({
      status: "failed",
      blockedReason: "check 'test' exited with code 1",
    });
    const summary = formatAggregateSummary(aggregate);
    expect(summary).toContain("FAILED");
    expect(summary).toContain("test");
  });

  it("formats blocked summary", () => {
    const aggregate = makeAggregate({
      status: "blocked",
      blockedReason: "profile not found",
    });
    const summary = formatAggregateSummary(aggregate);
    expect(summary).toContain("BLOCKED");
    expect(summary).toContain("profile not found");
  });

  it("formats skipped summary", () => {
    const aggregate = makeAggregate({ status: "skipped", checks: [] });
    const summary = formatAggregateSummary(aggregate);
    expect(summary).toContain("SKIPPED");
  });
});

// ---------------------------------------------------------------------------
// buildVerificationPresentation
// ---------------------------------------------------------------------------

describe("buildVerificationPresentation", () => {
  it("returns summary line for passed", () => {
    const aggregate: AggregateVerificationResult = {
      status: "passed",
      failedRequiredChecks: [],
      blockedReason: null,
      persistenceWarning: null,
      checks: [makeResult({ outcome: "passed" })],
      duration: 100,
      startedAt: "2026-01-01T00:00:00Z",
    };
    const pres = buildVerificationPresentation(aggregate);
    expect(pres.status).toBe("passed");
    expect(pres.line).toContain("passed");
    expect(pres.detail).toBeNull();
  });

  it("returns detail for failed", () => {
    const aggregate: AggregateVerificationResult = {
      status: "failed",
      failedRequiredChecks: ["test-a"],
      blockedReason: "check 'test-a' exited with code 1",
      persistenceWarning: null,
      checks: [makeResult({ checkId: "test-a", outcome: "failed" })],
      duration: 100,
      startedAt: "2026-01-01T00:00:00Z",
    };
    const pres = buildVerificationPresentation(aggregate);
    expect(pres.status).toBe("failed");
    expect(pres.detail).toBeTruthy();
    expect(pres.detail).toContain("[FAIL]");
  });
});

// ---------------------------------------------------------------------------
// buildBlockedPresentation
// ---------------------------------------------------------------------------

describe("buildBlockedPresentation", () => {
  it("builds a blocked presentation", () => {
    const pres = buildBlockedPresentation("profile not found at /path");
    expect(pres.status).toBe("blocked");
    expect(pres.line).toContain("BLOCKED");
    expect(pres.line).toContain("profile not found");
  });
});

// ---------------------------------------------------------------------------
// Persistence warning helpers
// ---------------------------------------------------------------------------

describe("persistence warning helpers", () => {
  it("buildPersistenceWarningSuffix returns expected string", () => {
    expect(buildPersistenceWarningSuffix()).toBe(" (audit persistence warning)");
  });

  it("applyPersistenceWarning appends suffix", () => {
    expect(applyPersistenceWarning("Final verification passed")).toBe(
      "Final verification passed (audit persistence warning)",
    );
  });

  it("applyPersistenceWarning does not double-append", () => {
    const already = "Final verification passed (audit persistence warning)";
    expect(applyPersistenceWarning(already)).toBe(already);
  });
});
