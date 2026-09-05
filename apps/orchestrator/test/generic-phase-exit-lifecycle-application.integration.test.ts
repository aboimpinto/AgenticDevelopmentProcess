import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseExitLifecycleApplication } from "../src/workflows/phases/phase-exit-lifecycle-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-exit-lifecycle-application.feature", import.meta.url));

describe("generic phase exit lifecycle Gherkin integration", () => {
  it("specifies review-task recovery, authorized exit, and non-fatal git boundaries without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Durable approval completes a declared review task");
    expect(specification).toContain("Scenario: Phase exit is authorized");
    expect(specification).toContain("Scenario: Git checkpoint remains pending");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseExitLifecycleApplication).toBe("function");
  });
});
