import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  renderPhaseGateEvidenceHandoffRule,
  renderPhaseMachineOwnedStateRule,
} from "../src/workflows/prompts/phase-gate-evidence-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-phase-gate-evidence-prompt.feature", import.meta.url));

describe("generic phase gate evidence prompt Gherkin integration", () => {
  it("documents the generic gate contract without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A worker reports successful evidence");
    expect(specification).toContain("Scenario: A required check does not pass");
    expect(specification).toContain("Scenario: A gate table is updated by the orchestrator");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("keeps arbitrary worker output separate from durable state mutation", () => {
    expect(renderPhaseMachineOwnedStateRule()).toContain("Return gate evidence in your worker result");
    expect(renderPhaseGateEvidenceHandoffRule().join("\n")).toContain("do not edit phase-table decision cells yourself");
  });
});
