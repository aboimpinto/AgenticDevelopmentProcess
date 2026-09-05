import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyPhaseGateEvidenceHandoff,
  assertPhaseGateEvidencePassed,
  parsePhaseGateEvidenceHandoff,
} from "../src/phase-gate-evidence-handoff.js";

const featurePath = fileURLToPath(new URL("./phase-gate-evidence-handoff.feature", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const applicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-gate-evidence-application.ts", import.meta.url));
const workerResultPath = fileURLToPath(new URL("../src/workflows/phases/phase-worker-result-application.ts", import.meta.url));
const phaseDocument = `## Quality Gate Evidence
| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | pending |
| Tests | missing | pending |
| Gherkin/Playwright E2E | missing | pending |
| Code review | not applicable | no production change |
`;

function handoff(result: "passed" | "failed" | "not_applicable") {
  return `## Hepha Gate Evidence Handoff
| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | no changed source files |
| Tests | passed | focused verification passed |
| Gherkin/Playwright E2E | ${result} | observed browser verification result |
`;
}

describe("generic phase gate handoff Gherkin integration", () => {
  it("keeps the behavior specification and generic executor boundary wired", () => {
    const feature = readFileSync(featurePath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const workerResult = readFileSync(workerResultPath, "utf8");

    expect(feature).toContain("Scenario: A failed Playwright result blocks phase completion");
    expect(feature).toContain("Scenario: Repeated failed evidence remains an idempotent repair result");
    expect(feature).toContain("Scenario: Passed browser verification satisfies the gate");
    expect(feature).toContain("Scenario: Explicit non-applicability settles a non-browser phase");
    expect(feature).toContain("Scenario: Legacy evidence-only handoffs fail closed");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(orchestrator).toContain("this.dependencies.workerResult.process({");
    expect(workerResult).toContain("this.dependencies.applyGateEvidence({");
    expect(application).toContain("this.dependencies.assertPassed(evidence)");
  });

  it("denies failed E2E evidence before the active task can complete", () => {
    const evidence = parsePhaseGateEvidenceHandoff(handoff("failed"));
    expect(applyPhaseGateEvidenceHandoff(phaseDocument, evidence)).toContain(
      "| Gherkin/Playwright E2E | missing | observed browser verification result |",
    );
    expect(() => assertPhaseGateEvidencePassed(evidence)).toThrow("Gherkin/Playwright E2E");
  });

  it("accepts repeated failed evidence idempotently so repair can continue", () => {
    const evidence = parsePhaseGateEvidenceHandoff(handoff("failed"));
    const first = applyPhaseGateEvidenceHandoff(phaseDocument, evidence);
    const repeated = applyPhaseGateEvidenceHandoff(first, evidence);

    expect(repeated).toBe(first);
    expect(() => assertPhaseGateEvidencePassed(evidence)).toThrow("Gherkin/Playwright E2E");
  });

  it("maps passed and not-applicable E2E results deterministically", () => {
    expect(applyPhaseGateEvidenceHandoff(phaseDocument, parsePhaseGateEvidenceHandoff(handoff("passed"))))
      .toContain("| Gherkin/Playwright E2E | satisfied | observed browser verification result |");
    expect(applyPhaseGateEvidenceHandoff(phaseDocument, parsePhaseGateEvidenceHandoff(handoff("not_applicable"))))
      .toContain("| Gherkin/Playwright E2E | not applicable | observed browser verification result |");
  });
});
