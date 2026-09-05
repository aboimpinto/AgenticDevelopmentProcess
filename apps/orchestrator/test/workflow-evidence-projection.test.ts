import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { PhaseSummary } from "@hepha/shared";
import { afterEach, describe, expect, it } from "vitest";
import type { AggregateVerificationResult } from "../src/final-verification-types.js";
import { getFeatureLessonsLearnedPath } from "../src/application/features/feature-lessons-learned-path-policy.js";
import { applyCoverageMeasurementGate, PhaseCheckpointProjectionRepository } from "../src/workflows/phases/phase-checkpoint-projection-repository.js";
import { summarizeWorkflowOutput } from "../src/workflows/workflow-output-summary.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

const verification = {
  blockedReason: null,
  checks: [],
  duration: 1,
  failedRequiredChecks: [],
  persistenceWarning: null,
  startedAt: "start",
  status: "passed",
} as AggregateVerificationResult;

describe("workflow evidence projection", () => {
  it("persists a deterministic checkpoint projection only for an existing phase document", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "hepha-checkpoint-"));
    temporaryDirectories.push(directory);
    const path = resolve(directory, "phase-any.md");
    writeFileSync(path, "# Arbitrary Phase\n", "utf8");
    const repository = new PhaseCheckpointProjectionRepository(() => "2026-07-21T00:00:00.000Z");
    repository.persist({ documentPath: path, number: 42 } as PhaseSummary & { number: number }, verification, "hash-any");
    const markdown = readFileSync(path, "utf8");
    expect(markdown).toContain("## Phase Checkpoint");
    expect(markdown).toContain("2026-07-21T00:00:00.000Z");
    expect(markdown).toContain("hash-any");
    expect(() => repository.persist(
      { documentPath: resolve(directory, "missing.md"), number: 7 } as PhaseSummary & { number: number },
      verification,
      null,
    )).not.toThrow();
  });

  it("settles the Test coverage row for a measured advisory without claiming the percentage reached its reference", () => {
    const markdown = "## Quality Gate Evidence\n\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Test coverage | missing | pending |\n";
    const result = {
      ...verification,
      checks: [{
        checkId: "coverage",
        command: ["test", "--coverage"],
        description: "Coverage",
        duration: 1,
        exitCode: 0,
        intent: "coverage",
        outcome: "advisory",
        outputSummary: "HEPHA_COVERAGE_MEASUREMENT_V1:{}\nFEAT coverage is 70%; reminder recorded.",
        required: true,
        startedAt: "now",
        workingDirectory: ".",
      }],
    } as AggregateVerificationResult;
    expect(applyCoverageMeasurementGate(markdown, result)).toContain(
      "| Test coverage | satisfied | FEAT coverage is 70%; reminder recorded. |",
    );
  });

  it("keeps Test coverage missing and records the exact non-blocking unavailable remark", () => {
    const markdown = "## Quality Gate Evidence\n\n| Gate | Decision | Evidence / Justification |\n| --- | --- | --- |\n| Test coverage | missing | pending |\n";
    const result = {
      ...verification,
      checks: [{
        checkId: "coverage",
        command: ["test", "--coverage"],
        description: "Coverage",
        duration: 1,
        exitCode: 2,
        intent: "coverage",
        outcome: "coverage-unavailable",
        outputSummary: "Test coverage was not measured. Reason: baseline unavailable.",
        required: true,
        startedAt: "now",
        workingDirectory: ".",
      }],
    } as AggregateVerificationResult;
    expect(applyCoverageMeasurementGate(markdown, result)).toContain(
      "| Test coverage | missing | Test coverage was not measured. Reason: baseline unavailable. |",
    );
  });

  it("derives a stable lower-case feature lessons path", () => {
    const path = getFeatureLessonsLearnedPath(
      { memoryBankPath: "/memory" } as StoredProject,
      { externalId: "FEAT-ANY" },
    );
    expect(path).toBe("/memory/LessonsLearned/feat-any-lessons-learned.md");
  });

  it("normalizes fenced multiline output and retains at most six non-empty lines", () => {
    const summary = summarizeWorkflowOutput("```markdown\n one \n\n two\nthree\nfour\nfive\nsix\nseven\n```", "fallback");
    expect(summary).toBe("one two three four five six");
  });

  it("uses the fallback for empty output and bounds durable summaries", () => {
    expect(summarizeWorkflowOutput("   ", "fallback")).toBe("fallback");
    expect(summarizeWorkflowOutput("x".repeat(700), "fallback")).toHaveLength(602);
    expect(summarizeWorkflowOutput("x".repeat(700), "fallback")).toMatch(/\.\.\.$/);
  });
});
