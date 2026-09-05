import { describe, expect, it } from "vitest";
import {
  renderPhaseExecutionFinalizationRules,
  renderPhaseExecutionPreparationRules,
  renderPhasePostRemediationSafetyRules,
  type PhaseExecutionSafetyRules,
} from "../src/workflows/prompts/phase-execution-safety-prompt.js";

const safetyRules: PhaseExecutionSafetyRules = {
  cargoTimeoutSafety: "CARGO TIMEOUT SAFETY",
  cargoValidationLadder: "CARGO VALIDATION LADDER",
  lessonsLearnedExecutionConstraints: "LESSON EXECUTION CONSTRAINTS",
  serializedBuildCommandsSkill: "SERIALIZED BUILD COMMANDS",
  sharedCodeQualityAssumptions: "SHARED CODE QUALITY",
  validationEvidenceAccounting: "VALIDATION ACCOUNTING",
  windowsShellHygiene: "WINDOWS SHELL HYGIENE",
};

describe("phase execution safety prompt", () => {
  it("composes supplied project and tool constraints into preparation", () => {
    const rules = renderPhaseExecutionPreparationRules(safetyRules);

    for (const rule of Object.values(safetyRules)) {
      expect(rules).toContain(rule);
    }
    expect(rules.join("\n")).toContain("whole-project Boy Scout obligation");
    expect(rules.join("\n")).toContain("full-verification phase must resolve every configured-profile failure");
    expect(rules.join("\n")).toContain("Prefer relative paths");
    expect(rules.join("\n")).toContain("PENDING -> IN_PROGRESS -> COMPLETED/SKIPPED");
  });

  it("prevents unsafe post-remediation expansion and remote side effects", () => {
    const rules = renderPhasePostRemediationSafetyRules().join("\n");

    expect(rules).toContain("only outside code-review recovery scope");
    expect(rules).toContain("fix those warnings immediately");
    expect(rules).toContain("Do not run local dev servers");
    expect(rules).toContain("Do not push to remotes");
    expect(rules).toContain("Routing Override");
  });

  it("requires durable gate evidence without weakening executable coverage", () => {
    const rules = renderPhaseExecutionFinalizationRules("EXACT GATE HANDOFF").join("\n");

    expect(rules).toContain("EXACT GATE HANDOFF");
    expect(rules).toContain("repair_and_rerun");
    expect(rules).toContain("preserve every pre-existing executable test/Scenario title");
    expect(rules).toContain("may not reduce assertions");
    expect(rules).toContain("## LessonsLearned");
    expect(rules).toContain("Return a concise Markdown summary");
  });
});
