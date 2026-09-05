import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseProgressRecorder } from "../src/workflows/phases/phase-progress-recorder.js";

const featurePath = fileURLToPath(new URL("./generic-phase-progress-recording.feature", import.meta.url));

describe("generic phase progress recording Gherkin integration", () => {
  it("documents generic ordered persistence without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: An active workflow publishes phase progress");
    expect(specification).toContain("Scenario: The workflow was cancelled");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("publishes an arbitrary transition in audit-to-phase-to-workflow order", async () => {
    const order: string[] = [];
    const recorder = new PhaseProgressRecorder({
      appendAudit: () => { order.push("audit"); }, assertRunActive: () => { order.push("active"); },
      recordPhaseRun: async () => { order.push("phase"); },
      recordWorkflowProgress: async () => { order.push("workflow"); },
    });
    await recorder.record({
      agent: "Any", cardKey: "card", command: "start-implementing", currentStep: "Executing",
      feature: {} as any, model: "model", phase: { number: 73, title: "Random" } as any,
      project: { id: "project" } as any, runId: "run", status: "implementing", summary: "Running",
    });
    expect(order).toEqual(["active", "audit", "phase", "workflow"]);
  });
});
