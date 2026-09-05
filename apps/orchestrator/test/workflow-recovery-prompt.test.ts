import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import {
  buildWorkflowRecoveryPrompt,
  parseWorkflowRecoveryResult,
} from "../src/workflows/prompts/workflow-recovery-prompt.js";

const project = { name: "Arbitrary", rootPath: "/workspace", memoryBankPath: "/memory" } as StoredProject;
const feature = { externalId: "ITEM-X", title: "Capability" } as WorkItemCard;
const options = {
  commandLabel: "Continue Implementing",
  consoleSummary: "CONSOLE_EVIDENCE",
  failureBrief: "FAILURE_BRIEF",
  lessonsLearnedContext: "LESSON_CONTEXT",
  preparedRecoverySummary: "HOST_RECOVERY",
  rawError: "RAW_ERROR",
  runId: "run-x",
};

describe("workflow recovery prompt", () => {
  it("binds derived failure evidence, lessons, host recovery, and runtime identity", () => {
    const prompt = buildWorkflowRecoveryPrompt(project, feature, options, "EXECUTION_POLICY");
    expect(prompt).toContain("Failed command: Continue Implementing");
    expect(prompt).toContain("Workflow run: run-x");
    expect(prompt).toContain("Raw orchestrator error: RAW_ERROR");
    expect(prompt).toContain("Host-side recovery prepared: HOST_RECOVERY");
    expect(prompt).toContain("LESSON_CONTEXT");
    expect(prompt).toContain("FAILURE_BRIEF");
    expect(prompt).toContain("CONSOLE_EVIDENCE");
    expect(prompt).toContain("EXECUTION_POLICY");
  });

  it("keeps the recovery worker diagnostic-only for machine-owned state", () => {
    const prompt = buildWorkflowRecoveryPrompt(project, feature, options, "POLICY");
    expect(prompt).toContain("diagnostic-only for machine-owned workflow state");
    expect(prompt).toContain("Never edit a phase document, FeatureTasks.md");
    expect(prompt).toContain("do not edit production code, tests, or FEAT implementation artifacts");
    expect(prompt).toContain("Do not run broad validation");
    expect(prompt).toContain("Do not push to remotes");
  });

  it("treats ordinary review blockers as retryable same-phase gates", () => {
    const prompt = buildWorkflowRecoveryPrompt(project, feature, options, "POLICY");
    expect(prompt).toContain("Code Review Blocker");
    expect(prompt).toContain("same phase will be retried");
    expect(prompt).toContain("enter Resolve Findings");
    expect(prompt).toContain("then Hepha must run review again before advancing");
  });

  it("requires understood recovery for retry and genuine external need for blocked", () => {
    const prompt = buildWorkflowRecoveryPrompt(project, feature, options, "POLICY");
    expect(prompt).toContain("Return RETRY only when the failure cause is understood");
    expect(prompt).toContain("Return BLOCKED if recovery needs human judgment, credentials");
    expect(prompt).toContain("Recovery Result: RETRY");
    expect(prompt).toContain("Recovery Result: BLOCKED");
  });
});

describe("workflow recovery result parser", () => {
  it.each([
    ["Recovery Result: RETRY", "retry"],
    ["Recovery Result: `RETRY`", "retry"],
    ["Recovery Result: **retry**", "retry"],
    ["Recovery Result: BLOCKED", "blocked"],
    ["no decision", "blocked"],
  ])("parses %s", (output, expected) => {
    expect(parseWorkflowRecoveryResult(output)).toBe(expected);
  });
});
