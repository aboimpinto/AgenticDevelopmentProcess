import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import {
  buildPhaseImplementationPrompt,
  type PhaseImplementationPromptPolicies,
  type PhaseImplementationPromptOptions,
} from "../src/workflows/prompts/phase-implementation-prompt.js";

const project: StoredProject = {
  id: "project-arbitrary",
  createdAt: "2026-01-01T00:00:00.000Z",
  memoryBankPath: "/workspace/memory",
  name: "Arbitrary Project",
  rootPath: "/workspace/project",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const feature = { externalId: "ITEM-ALPHA", title: "Arbitrary capability" } as WorkItemCard;
const phase = { number: 4, status: "IN_PROGRESS", title: "Any named work" } as PhaseSummary & { number: number };
const policies: PhaseImplementationPromptPolicies = {
  codeReviewFindingLedgerRule: "FINDING LEDGER",
  epicAcceptanceTestsFileName: "Acceptance.md",
  featurePlanningArtifactFileName: "Plan.md",
  phaseTaskLedgerRule: "TASK LEDGER",
  safetyRules: {
    cargoTimeoutSafety: "TIMEOUT SAFETY",
    cargoValidationLadder: "VALIDATION LADDER",
    lessonsLearnedExecutionConstraints: "LESSON CONSTRAINTS",
    serializedBuildCommandsSkill: "SERIAL BUILD",
    sharedCodeQualityAssumptions: "QUALITY ASSUMPTIONS",
    validationEvidenceAccounting: "EVIDENCE ACCOUNTING",
    windowsShellHygiene: "SHELL HYGIENE",
  },
};
const options: PhaseImplementationPromptOptions = {
  assignedAgent: "Implementation Agent",
  assignedModelLabel: "Model Label",
  branchName: "feature/arbitrary",
  developerAgentName: "Developer Agent",
  isCodePhase: true,
  phase,
  phaseContract: null,
  phaseStatus: "IN_PROGRESS",
};

describe("phase implementation prompt composition", () => {
  it("binds arbitrary runtime identity and legacy execution context", () => {
    const prompt = buildPhaseImplementationPrompt(project, feature, "WORKFLOW CONTEXT", options, policies);

    expect(prompt).toContain("Developer Agent running Phase 4");
    expect(prompt).toContain("Current phase: Phase 4 - Any named work");
    expect(prompt).toContain("Assigned model: Model Label");
    expect(prompt).toContain("Branch: feature/arbitrary");
    expect(prompt).toContain("This legacy FEAT has no PhaseExecutionContract.json");
    expect(prompt).toContain("WORKFLOW CONTEXT");
  });

  it("preserves ordered policy composition around resilient recovery", () => {
    const prompt = buildPhaseImplementationPrompt(project, feature, "CONTEXT", options, policies);

    expect(prompt.indexOf("TASK LEDGER")).toBeLessThan(prompt.indexOf("FINDING LEDGER"));
    expect(prompt.indexOf("FINDING LEDGER")).toBeLessThan(prompt.indexOf("SERIAL BUILD"));
    expect(prompt.indexOf("SERIAL BUILD")).toBeLessThan(prompt.indexOf("Resilient error path"));
    expect(prompt.indexOf("Resilient error path")).toBeLessThan(prompt.indexOf("Hepha Gate Evidence Handoff"));
    expect(prompt).toContain("Return a concise Markdown summary");
  });

  it("renders contract role and selected task without inferring from the title", () => {
    const prompt = buildPhaseImplementationPrompt(project, feature, "CONTEXT", {
      ...options,
      activeTask: {
        checked: false,
        id: "task-arbitrary",
        lineNumber: 12,
        section: "Work",
        status: "NOT_STARTED",
        taskIndex: 0,
        text: "Document the arbitrary boundary",
      },
      phaseContract: {
        codeReview: "never",
        developmentValidation: "focused",
        document: "Phases/phase-4-anything.md",
        failurePolicy: "repair_and_rerun",
        finalValidation: "full",
        id: "phase-any",
        order: 4,
        role: "planning",
        tasks: [],
      },
    }, policies);

    expect(prompt).toContain("role=planning");
    expect(prompt).toContain("Orchestrator-selected active task");
    expect(prompt).toContain("task-arbitrary");
    expect(prompt).toContain("This contract declares the planning role. Create or update `Plan.md`");
  });
});
