import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseFailureRecordingApplication } from "../src/workflows/phases/phase-failure-recording-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-failure-recording.feature", import.meta.url));

describe("generic phase failure recording Gherkin integration", () => {
  it("documents generic failure publication without fixed workflow names", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: An implementation task fails");
    expect(specification).toContain("Scenario: A phase document is structurally invalid");
    expect(specification).toContain("Scenario: Failure telemetry is unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("keeps an arbitrary selected task open when template validation blocks the phase", async () => {
    const progress: unknown[] = [];
    const taskFailures: unknown[] = [];
    const application = new PhaseFailureRecordingApplication({
      isTemplateInvalid: () => true,
      recordProgress: async (entry) => { progress.push(entry); },
      recordTaskFailure: async (entry) => { taskFailures.push(entry); },
      shouldRecord: () => true,
    });
    await application.record({
      activePhase: { number: 37, title: "Any work" } as any, activeTask: { id: "selected" } as any,
      cardKey: "card", command: "start-implementing", error: new Error("template invalid"),
      failureContext: null, fallbackModel: "model", feature: {} as any, project: {} as any, runId: "run",
    });
    expect(progress).toEqual([expect.objectContaining({ status: "blocked" })]);
    expect(taskFailures).toEqual([]);
  });
});
