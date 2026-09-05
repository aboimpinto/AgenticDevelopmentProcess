import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseWorkerContinuationApplication } from "../src/workflows/phases/phase-worker-continuation-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-continuation-application.feature", import.meta.url));

describe("generic phase worker continuation Gherkin integration", () => {
  it("specifies completion, same-phase continuation, and failure without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Reconciled phase is complete");
    expect(specification).toContain("Scenario: Reconciled phase has another task");
    expect(specification).toContain("Scenario: Durable state cannot continue safely");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseWorkerContinuationApplication).toBe("function");
  });
});
