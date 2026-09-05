import { describe, expect, it, vi } from "vitest";
import { ImplementationCompletionApplication } from "../src/workflows/phases/implementation-completion-application.js";

const feature = { externalId: "ITEM", title: "Any delivery" } as any;
const base = {
  cardKey: "card", command: "continue-implementing" as const, feature, project: {} as any,
  runId: "run", summaries: ["Phase complete"], usesOrderedPhaseWorkflow: true,
};

function target(overrides: Record<string, unknown> = {}) {
  const recordProgress = vi.fn().mockResolvedValue(undefined);
  const runFinalVerification = vi.fn().mockResolvedValue({ aggregate: { status: "passed" }, summaryLine: "all green" });
  return {
    application: new ImplementationCompletionApplication({
      allPhasesResolved: () => true, recordProgress, refreshFeature: async () => feature,
      runFinalVerification, ...overrides,
    } as any),
    recordProgress,
    runFinalVerification,
  };
}

describe("ImplementationCompletionApplication", () => {
  it("closes an ordered workflow without inventing another final checkpoint", async () => {
    const item = target();
    await expect(item.application.complete(base)).resolves.toBe(
      "Phase complete\nAll declared tasks in all contract phases are resolved.",
    );
    expect(item.runFinalVerification).not.toHaveBeenCalled();
  });

  it("runs and reports the legacy final verification when ordered tasks do not own it", async () => {
    const item = target();
    await expect(item.application.complete({ ...base, usesOrderedPhaseWorkflow: false })).resolves.toBe(
      "Phase complete\nFinal verification: all green",
    );
    expect(item.recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Final full build and test verification",
    }));
    expect(item.runFinalVerification).toHaveBeenCalledOnce();
  });

  it("fails closed when refreshed durable state still has unresolved phases", async () => {
    const item = target({ allPhasesResolved: () => false });
    await expect(item.application.complete(base)).rejects.toThrow("stopped before every numbered phase reached COMPLETED or SKIPPED");
  });

  it("rejects a non-green legacy final verification", async () => {
    const item = target({
      runFinalVerification: vi.fn().mockResolvedValue({ aggregate: { status: "failed" }, summaryLine: "one test red" }),
    });
    await expect(item.application.complete({ ...base, usesOrderedPhaseWorkflow: false })).rejects.toThrow(
      "Final verification did not pass: one test red",
    );
  });
});
