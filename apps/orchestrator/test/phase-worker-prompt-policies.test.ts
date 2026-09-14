import { describe, expect, it } from "vitest";
import {
  cargoTimeoutSafetyRule,
  cargoValidationLadderRule,
  codeReviewFindingLedgerRule,
  epicAcceptanceTestsFileName,
  featurePlanningArtifactFileName,
  lessonsLearnedExecutionConstraintsRule,
  phaseTaskLedgerRule,
  serializedBuildCommandsSkillRule,
  sharedCodeQualityAssumptionsRule,
  validationEvidenceAccountingRule,
  windowsShellHygieneRule,
} from "../src/workflows/phases/phase-worker-prompt-policies.js";

describe("phase worker prompt policies", () => {
  it("exports the canonical planning and acceptance artifact names", () => {
    expect(featurePlanningArtifactFileName).toBe("planning-analysis-report.md");
    expect(epicAcceptanceTestsFileName).toBe("EpicAcceptanceTests.md");
  });

  it("keeps every generic execution safety policy available to prompt composers", () => {
    expect([
      cargoTimeoutSafetyRule,
      cargoValidationLadderRule,
      lessonsLearnedExecutionConstraintsRule,
      serializedBuildCommandsSkillRule,
      sharedCodeQualityAssumptionsRule,
      validationEvidenceAccountingRule,
      windowsShellHygieneRule,
    ].every((rule) => rule.startsWith("- "))).toBe(true);
  });

  it("keeps task and finding ownership in Hepha", () => {
    expect(phaseTaskLedgerRule).toContain("Hepha alone updates");
    expect(codeReviewFindingLedgerRule).toContain("Hepha owns those machine fields");
  });
});

it("takes validation commands and scope from declarations instead of a named package or phase category", () => {
  expect(cargoValidationLadderRule).not.toMatch(/cargo test -p [a-z]/);
  expect(cargoValidationLadderRule).not.toContain("only at phase checkpoint");
  expect(cargoValidationLadderRule).toContain("declared commands");
});
