import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkflowMachineStateRepository } from "../src/workflows/recovery/workflow-machine-state-repository.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-workflow-machine-state.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const phaseEntryCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-entry-applications.ts", import.meta.url)),
  "utf8",
);
const recoveryCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/implementation-recovery-applications.ts", import.meta.url)),
  "utf8",
);
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic workflow machine-state Gherkin integration", () => {
  it("specifies worker and recovery protection without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds phase workers and recovery agents to the extracted repository", () => {
    expect(new WorkflowMachineStateRepository()).toBeInstanceOf(WorkflowMachineStateRepository);
    expect(infrastructureSource).toContain("new WorkflowMachineStateRepository");
    expect(orchestratorSource).toContain("workflowMachineState: workflowMachineStateRepository");
    expect(phaseEntryCompositionSource).toContain("workflowMachineState.capturePhaseWorker");
    expect(phaseEntryCompositionSource).toContain("workflowMachineState.restorePhaseWorker");
    expect(recoveryCompositionSource).toContain("dependencies.machineState.captureRecovery");
    expect(recoveryCompositionSource).toContain("dependencies.machineState.restoreRecovery");
    expect(orchestratorSource).not.toContain("function captureWorkflowRecoveryMachineState");
  });
});
