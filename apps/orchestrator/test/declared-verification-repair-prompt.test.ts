import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { AggregateVerificationResult, CheckResult } from "../src/final-verification-types.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import {
  buildDeclaredVerificationRepairPrompt,
  renderDeclaredVerificationEvidence,
} from "../src/workflows/prompts/declared-verification-repair-prompt.js";

const project = { name: "Arbitrary", rootPath: "/workspace" } as StoredProject;
const feature = { externalId: "ITEM-X", title: "Capability" } as WorkItemCard;
const phase = { documentPath: "/memory/phase-x.md", number: 44 } as PhaseSummary & { number: number };

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    checkId: "compile",
    command: ["tool", "build", "--strict"],
    description: "Compile",
    duration: 5,
    exitCode: 1,
    intent: "build",
    outcome: "failed",
    outputSummary: "one warning",
    required: true,
    startedAt: "now",
    workingDirectory: ".",
    ...overrides,
  };
}

function result(checks: CheckResult[]): AggregateVerificationResult {
  return {
    blockedReason: null,
    checks,
    duration: 5,
    failedRequiredChecks: checks.map((item) => item.checkId),
    persistenceWarning: null,
    startedAt: "now",
    status: "failed",
  };
}

describe("declared verification repair prompt", () => {
  it("binds the active task and exact failed evidence", () => {
    const prompt = buildDeclaredVerificationRepairPrompt(project, feature, phase, "verify-x", result([check()]));
    expect(prompt).toContain("Feature: ITEM-X - Capability");
    expect(prompt).toContain("Phase document: /memory/phase-x.md");
    expect(prompt).toContain("Active task: verify-x");
    expect(prompt).toContain("Command: tool build --strict");
    expect(prompt).toContain("Outcome: failed");
    expect(prompt).toContain("Evidence: one warning");
  });

  it("renders configured checks in declaration order without reclassification", () => {
    const evidence = renderDeclaredVerificationEvidence(result([
      check({ checkId: "lint", intent: "lint", outcome: "policy-blocked" }),
      check({ checkId: "tests", intent: "test", outcome: "timed-out" }),
    ]));
    expect(evidence.indexOf("Check: lint")).toBeLessThan(evidence.indexOf("Check: tests"));
    expect(evidence).toContain("Outcome: policy-blocked");
    expect(evidence).toContain("Outcome: timed-out");
  });

  it("uses explicit missing-output and missing-check evidence", () => {
    expect(renderDeclaredVerificationEvidence(result([check({ outputSummary: "" })]))).toContain("No output returned.");
    const prompt = buildDeclaredVerificationRepairPrompt(project, feature, phase, "verify-x", result([]));
    expect(prompt).toContain("No check evidence was returned");
  });

  it("keeps lifecycle mutation with HEPHA and exposes only repaired or blocked outcomes", () => {
    const prompt = buildDeclaredVerificationRepairPrompt(project, feature, phase, "verify-x", result([check()]));
    expect(prompt).toContain("phase and task remain IN_PROGRESS");
    expect(prompt).toContain("Do not mark the task or phase complete");
    expect(prompt).toContain("HEPHA reruns the complete declared verification profile");
    expect(prompt).toContain("Verification Repair Result: BLOCKED");
    expect(prompt).toContain("Verification Repair Result: REPAIRED");
  });
});
