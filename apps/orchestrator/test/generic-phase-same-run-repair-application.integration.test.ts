import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-phase-same-run-repair-application.feature", import.meta.url));
const applicationPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-same-run-repair-application.ts", import.meta.url),
);
const workerResultPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-worker-result-application.ts", import.meta.url),
);
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const workerCompositionPath = fileURLToPath(
  new URL("../src/bootstrap/phase-worker-applications.ts", import.meta.url),
);

describe("generic same-run phase repair Gherkin integration", () => {
  it("binds every generic scenario to the production repair application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const workerResult = readFileSync(workerResultPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const workerComposition = readFileSync(workerCompositionPath, "utf8");

    expect(feature).toContain("Scenario: A repairable worker result retries the active phase");
    expect(feature).toContain("Scenario: A phase without a checkbox-backed task can be repaired");
    expect(feature).toContain("Scenario: A phase contract denies automatic repair");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.evaluate({");
    expect(application).toContain("this.dependencies.recordTaskFailure({");
    expect(application).toContain('status: "implementing"');
    expect(application).toContain("## Same-Run Phase Repair");
    expect(orchestrator).toContain("phaseSameRunRepairApplication,");
    expect(workerComposition).toContain("prepareRepair: (input) => phaseSameRunRepairApplication.prepare(input)");
    expect(workerResult).toContain("this.dependencies.prepareRepair({");
  });
});
