import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDeclaredVerificationRepairPrompt,
  renderDeclaredVerificationEvidence,
} from "../src/workflows/prompts/declared-verification-repair-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-declared-verification-repair-prompt.feature", import.meta.url));

describe("generic declared-verification repair prompt Gherkin integration", () => {
  it("specifies evidence, rerun, and blocker behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: One or more configured checks fail");
    expect(specification).toContain("Scenario: A repair is possible");
    expect(specification).toContain("Scenario: A genuine external blocker prevents repair");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer and evidence renderer", () => {
    expect(typeof buildDeclaredVerificationRepairPrompt).toBe("function");
    expect(typeof renderDeclaredVerificationEvidence).toBe("function");
  });
});
