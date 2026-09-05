import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { derivePhaseState } from "../src/workflows/phases/phase-lifecycle-policy.js";

const featurePath = fileURLToPath(new URL("./generic-derived-phase-state.feature", import.meta.url));

describe("generic derived-phase-state Gherkin integration", () => {
  it("specifies all phase state derivations without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: All tasks done, no code review needed");
    expect(specification).toContain("Scenario: All tasks done, code review needed but not started");
    expect(specification).toContain("Scenario: All tasks done, code review exists and is APPROVED, autonomous");
    expect(specification).toContain("Scenario: All tasks done, code review exists and is APPROVED, non-autonomous");
    expect(specification).toContain("Scenario: All tasks done, code review exists and requested changes");
    expect(specification).toContain("Scenario: Not all tasks are complete");
    expect(specification).toContain("Scenario: All tasks done, code review exists and is BLOCKED");
    expect(specification).toContain("Scenario: All tasks done, code review exists with N/A state");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production derivePhaseState function", () => {
    expect(typeof derivePhaseState).toBe("function");
  });
});
