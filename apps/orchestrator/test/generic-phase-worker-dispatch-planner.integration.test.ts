import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planPhaseWorkerDispatch } from "../src/workflows/phases/phase-worker-dispatch-planner.js";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-dispatch-planner.feature", import.meta.url));

describe("generic phase worker dispatch planner Gherkin integration", () => {
  it("specifies implementation, planning, fixer, and fallback dispatch without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Implementation work is dispatched");
    expect(specification).toContain("Scenario: Planning work is dispatched");
    expect(specification).toContain("Scenario: Review findings are dispatched");
    expect(specification).toContain("Scenario: No worker recommendation exists");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production planner", () => {
    expect(typeof planPhaseWorkerDispatch).toBe("function");
  });
});
