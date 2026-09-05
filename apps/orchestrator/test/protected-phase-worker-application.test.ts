import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { ProtectedPhaseWorkerApplication } from "../src/workflows/phases/protected-phase-worker-application.js";

function fixture() {
  const phase = { number: 745, status: "IN_PROGRESS", title: "Work" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/project/feature" } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const events: string[] = [];
  const restoreMachineState = vi.fn((): string[] => []);
  const recordWorkflowProgress = vi.fn(async () => undefined);
  const application = new ProtectedPhaseWorkerApplication({
    captureCoverage: () => ({ projectRoot: "/project", artifacts: [] }),
    captureMachineState: () => ({ marker: "before" }),
    enforceCoverage: () => { events.push("coverage"); return { kind: "allowed" as const }; },
    recordWorkflowProgress,
    restoreMachineState: (snapshot) => { events.push(`restore:${snapshot.marker}`); return restoreMachineState(); },
  });
  const input = {
    cardKey: "feature:WORK", command: "continue-implementing" as const, feature, phase,
    phaseRef: "Phase 745", project, run: vi.fn(async () => { events.push("worker"); return "OUTPUT"; }), runId: "run",
  };
  return { application, events, input, recordWorkflowProgress, restoreMachineState };
}

describe("protected phase worker application", () => {
  it("enforces coverage and restores machine state after a successful worker", async () => {
    const target = fixture();
    const result = await target.application.execute(target.input);
    expect(result).toEqual({ output: "OUTPUT", testCoverage: { kind: "allowed" } });
    expect(target.events).toEqual(["worker", "coverage", "restore:before"]);
  });

  it("restores protections before propagating a worker failure", async () => {
    const target = fixture();
    target.input.run.mockImplementationOnce(async () => { target.events.push("worker"); throw new Error("worker failed"); });
    await expect(target.application.execute(target.input)).rejects.toThrow("worker failed");
    expect(target.events).toEqual(["worker", "coverage", "restore:before"]);
  });

  it("records restored machine-owned paths", async () => {
    const target = fixture();
    target.restoreMachineState.mockReturnValueOnce(["phase.md", "FeatureTasks.md"]);
    await target.application.execute(target.input);
    expect(target.recordWorkflowProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Phase 745: protected workflow state restored",
      summary: "Hepha restored worker mutations to machine-owned state: phase.md, FeatureTasks.md.",
    }));
  });

  it("rejects a successful worker invocation that returns no output", async () => {
    const target = fixture();
    target.input.run.mockResolvedValueOnce(null);
    await expect(target.application.execute(target.input)).rejects.toThrow("Phase 745 worker returned no output");
    expect(target.events).toEqual(["coverage", "restore:before"]);
  });
});
