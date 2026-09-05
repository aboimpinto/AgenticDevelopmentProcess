import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clearWorkflowCancellation,
  requestWorkflowCancellation,
  throwIfWorkflowCancelled,
} from "../src/workflow-cancellation.js";

const featurePath = fileURLToPath(new URL("./workflow-cancellation.feature", import.meta.url));
const implementationCompositionPath = fileURLToPath(new URL("../src/bootstrap/implementation-worker-applications.ts", import.meta.url));
const autonomousWorkflowPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const phaseExecutionAuditPath = fileURLToPath(new URL("../src/workflows/phases/phase-execution-audit.ts", import.meta.url));

describe("cooperative cancellation Gherkin integration", () => {
  it("documents generic cancellation without feature or phase-specific routing", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Cancel a workflow with no attached worker process");
    expect(feature).toContain("Scenario: A same-phase retry loop yields to the control plane");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|migration audit/i);
  });

  it("connects cancellation and the autonomous loop to the cooperative signal", () => {
    requestWorkflowCancellation("generic-run");
    expect(() => throwIfWorkflowCancelled("generic-run")).toThrow(/was cancelled/);
    clearWorkflowCancellation("generic-run");

    const implementationComposition = readFileSync(implementationCompositionPath, "utf8");
    const autonomousWorkflow = readFileSync(autonomousWorkflowPath, "utf8");
    const auditSource = readFileSync(phaseExecutionAuditPath, "utf8");
    expect(implementationComposition).toContain("yieldControl: yieldToWorkflowControlPlane");
    expect(implementationComposition).toContain("isCancelled: isWorkflowCancelledError");
    expect(autonomousWorkflow).toContain("this.dependencies.yieldControl(input.runId)");
    expect(autonomousWorkflow).toContain("this.dependencies.isCancelled(error)");
    expect(auditSource).toContain('"phase_progress"');
    expect(autonomousWorkflow).not.toContain('? "pi_attempt_started"');
  });
});
