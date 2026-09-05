import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-worker-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/phase-worker-applications.ts", import.meta.url)), "utf8");

describe("generic phase worker composition Gherkin integration", () => {
  it("specifies identity-blind completion, repair, and review-handoff paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds worker and remediation constructors to one root factory call", () => {
    expect(root).toContain("createPhaseWorkerApplications({");
    expect(root).not.toContain("new PhaseWorkerExecutionApplication");
    expect(root).not.toContain("new FixerResponseRepairApplication");
    expect(composition).toContain("new PhaseWorkerExecutionApplication");
    expect(composition).toContain("new PhaseWorkerResultApplication");
    expect(composition).toContain("new FixerResponseRepairApplication");
    expect(composition).toContain("new PhasePostWorkerReviewApplication");
  });
});
