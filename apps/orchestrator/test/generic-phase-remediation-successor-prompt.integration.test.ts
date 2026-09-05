import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPhaseRemediationSuccessorPrompt } from "../src/workflows/prompts/phase-remediation-successor-prompt.js";

const path = fileURLToPath(new URL("./generic-phase-remediation-successor-prompt.feature", import.meta.url));
describe("generic remediation successor prompt Gherkin integration", () => {
  it("documents generic successor behavior", () => {
    const specification = readFileSync(path, "utf8");
    expect(specification).toContain("Scenario: No authoritative predecessor exists");
    expect(specification).toContain("Scenario: An authoritative predecessor exists");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });
  it("omits successor rules without a predecessor", () => {
    expect(renderPhaseRemediationSuccessorPrompt()).toEqual([]);
  });
});
