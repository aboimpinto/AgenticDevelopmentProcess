import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { buildCompleteFeaturePrompt } from "../src/workflows/prompts/complete-feature-prompt.js";

const project = { name: "Arbitrary", rootPath: "/workspace", memoryBankPath: "/memory" } as StoredProject;
const feature = { externalId: "ITEM-X", folderPath: "/memory/in-progress/item-x", title: "Capability" } as WorkItemCard;
const options = {
  completedFolder: "/memory/completed/item-x",
  currentBranch: "feature/item-x",
  epicAcceptanceTestsFileName: "Acceptance.md",
  estimationRetrospective: "HUMAN_VS_AI_EVIDENCE",
  lessonsLearnedTargetPath: "/memory/LessonsLearned/item-x.md",
  projectSkillTarget: "PROJECT_SKILL_TARGET",
  runId: "run-x",
};
const policies = {
  cargoTimeoutSafetyRule: "TIMEOUT_POLICY",
  cargoValidationLadderRule: "LADDER_POLICY",
  lessonsLearnedExecutionConstraintsRule: "LESSONS_POLICY",
  serializedBuildCommandsSkillRule: "SERIAL_POLICY",
  validationEvidenceAccountingRule: "EVIDENCE_POLICY",
  windowsShellHygieneRule: "SHELL_POLICY",
};

function compose(overrides: Partial<typeof options> = {}) {
  return buildCompleteFeaturePrompt(project, feature, "COLLECTED_CONTEXT", { ...options, ...overrides }, policies);
}

describe("complete feature prompt", () => {
  it("binds derived runtime facts, policies, and collected context", () => {
    const prompt = compose();
    expect(prompt).toContain("Use the complete-feature skill for PROJECT_SKILL_TARGET");
    expect(prompt).toContain("Workflow run id for HEPHA metadata sync: run-x");
    expect(prompt).toContain("Target completed folder that must exist before success: /memory/completed/item-x");
    expect(prompt).toContain("Current branch: feature/item-x");
    expect(prompt).toContain("HUMAN_VS_AI_EVIDENCE");
    for (const policy of Object.values(policies)) expect(prompt).toContain(policy);
    expect(prompt).toContain("COLLECTED_CONTEXT");
  });

  it("uses a stable metadata instruction when no run id is supplied", () => {
    const { runId: _runId, ...withoutRunId } = options;
    const prompt = buildCompleteFeaturePrompt(project, feature, "CTX", withoutRunId, policies);
    expect(prompt).toContain("use a stable complete-feature workflow run id");
    expect(prompt).not.toContain("--run-id");
  });

  it("requires phase, finding, acceptance-test, and final-check evidence", () => {
    const prompt = compose();
    expect(prompt).toContain("all implementation phases are complete or skipped");
    expect(prompt).toContain("every Human Review Finding is closed or explicitly accepted by the user");
    expect(prompt).toContain("Product Owner EPIC acceptance test");
    expect(prompt).toContain("missing traceability");
    expect(prompt).toContain("formatting, compile/typecheck/lint, tests");
  });

  it("requires estimation learning, durable completion, git delivery, and EPIC reconciliation", () => {
    const prompt = compose();
    expect(prompt).toContain("## Estimation Retrospective");
    expect(prompt).toContain("estimated competent-human delivery versus measured AI execution");
    expect(prompt).toContain("LessonsLearned target path that must exist before success: /memory/LessonsLearned/item-x.md");
    expect(prompt).toContain("Commit all completed FEAT work");
    expect(prompt).toContain("Merge the implementation branch into `master`");
    expect(prompt).toContain("mark the EPIC `Completed`");
  });

  it("uses the resilient recovery path before an explicit completed or blocked result", () => {
    const prompt = compose();
    expect(prompt).toContain("Resilient error path:");
    expect(prompt).toContain("diagnose -> fix -> verify");
    expect(prompt).toContain("Complete Feature Result: COMPLETED");
    expect(prompt).toContain("Complete Feature Result: BLOCKED");
  });
});
