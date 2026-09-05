import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { buildPhaseImplementationPrompt } from "../src/workflows/prompts/phase-implementation-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-implementation-prompt.feature", import.meta.url));

describe("generic phase implementation prompt Gherkin integration", () => {
  it("documents generic composition without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A contracted phase starts from a selected task");
    expect(specification).toContain("Scenario: A legacy phase has no execution contract");
    expect(specification).toContain("Scenario: A worker reaches final evidence");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps runtime identity arbitrary while retaining orchestrator ownership", () => {
    const project = { name: "P", rootPath: "/p", memoryBankPath: "/m" } as StoredProject;
    const feature = { externalId: "ITEM-X", title: "T" } as WorkItemCard;
    const phase = { number: 23, title: "Random suffix", status: "IN_PROGRESS" } as PhaseSummary & { number: number };
    const prompt = buildPhaseImplementationPrompt(project, feature, "CTX", {
      assignedAgent: "A",
      assignedModelLabel: "M",
      branchName: "b",
      developerAgentName: "D",
      isCodePhase: false,
      phase,
      phaseContract: null,
      phaseStatus: "IN_PROGRESS",
    }, {
      codeReviewFindingLedgerRule: "FINDINGS",
      epicAcceptanceTestsFileName: "acceptance.md",
      featurePlanningArtifactFileName: "plan.md",
      phaseTaskLedgerRule: "TASKS",
      safetyRules: {
        cargoTimeoutSafety: "TIMEOUT",
        cargoValidationLadder: "LADDER",
        lessonsLearnedExecutionConstraints: "LESSONS",
        serializedBuildCommandsSkill: "SERIAL",
        sharedCodeQualityAssumptions: "QUALITY",
        validationEvidenceAccounting: "ACCOUNTING",
        windowsShellHygiene: "SHELL",
      },
    });

    expect(prompt).toContain("Phase 23 - Random suffix");
    expect(prompt).toContain("Hepha owns phase advancement");
    expect(prompt).toContain("explicit tasks and gates");
  });
});
