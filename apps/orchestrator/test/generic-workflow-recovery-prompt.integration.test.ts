import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowRecoveryPrompt,
  parseWorkflowRecoveryResult,
} from "../src/workflows/prompts/workflow-recovery-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-workflow-recovery-prompt.feature", import.meta.url));

describe("generic workflow recovery prompt Gherkin integration", () => {
  it("specifies safe retry, review routing, and external blockers without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A recoverable implementation failure is understood");
    expect(specification).toContain("Scenario: A review blocker returns to the same phase");
    expect(specification).toContain("Scenario: Recovery needs external authority");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer and result parser", () => {
    expect(typeof buildWorkflowRecoveryPrompt).toBe("function");
    expect(typeof parseWorkflowRecoveryResult).toBe("function");
  });
});
