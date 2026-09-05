import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  renderPhaseExecutionFinalizationRules,
  renderPhaseExecutionPreparationRules,
  renderPhasePostRemediationSafetyRules,
} from "../src/workflows/prompts/phase-execution-safety-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-execution-safety-prompt.feature", import.meta.url));

describe("generic phase execution safety prompt Gherkin integration", () => {
  it("documents generic safety behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A configured full-profile check fails");
    expect(specification).toContain("Scenario: A repair exposes existing executable coverage");
    expect(specification).toContain("Scenario: A review remediation is narrowly scoped");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("composes arbitrary project constraints and exact gate evidence", () => {
    const preparation = renderPhaseExecutionPreparationRules({
      cargoTimeoutSafety: "TIMEOUT",
      cargoValidationLadder: "LADDER",
      lessonsLearnedExecutionConstraints: "LESSONS",
      serializedBuildCommandsSkill: "SERIAL",
      sharedCodeQualityAssumptions: "QUALITY",
      validationEvidenceAccounting: "ACCOUNTING",
      windowsShellHygiene: "SHELL",
    });
    const finalization = renderPhaseExecutionFinalizationRules("GATE HANDOFF");

    expect(preparation).toEqual(expect.arrayContaining(["TIMEOUT", "LADDER", "LESSONS", "SERIAL", "QUALITY", "ACCOUNTING", "SHELL"]));
    expect(renderPhasePostRemediationSafetyRules().join("\n")).toContain("Do not push to remotes");
    expect(finalization).toContain("GATE HANDOFF");
  });
});
