import { describe, expect, it, vi } from "vitest";
import { PhaseEntryPreparationApplication } from "../src/workflows/phases/phase-entry-preparation-application.js";

const selectedPhase = { documentPath: "/phase.md", number: 731, status: "PENDING", title: "Arbitrary" } as never;
const refreshedPhase = { documentPath: "/phase.md", number: 731, status: "COMPLETED", title: "Arbitrary" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const refreshedFeature = { externalId: "arbitrary-feature", phases: [refreshedPhase] } as never;
const project = { id: "arbitrary-project", memoryBankPath: "/memory", rootPath: "/project" } as never;

function createTarget(options: {
  gitSatisfied?: boolean;
  missingGates?: string[];
  planningMissing?: boolean;
  resolved?: boolean;
} = {}) {
  const prepareTemplate = vi.fn(async () => ({
    feature: refreshedFeature,
    phase: refreshedPhase,
    summaries: ["Template aligned."],
  }));
  return {
    application: new PhaseEntryPreparationApplication({
      getContract: () => ({ gitCheckpoint: "commit_and_push" }),
      getMissingGates: () => options.missingGates ?? [],
      isGitCheckpointSatisfied: () => options.gitSatisfied ?? true,
      isPlanningArtifactMissing: () => options.planningMissing ?? false,
      isResolved: () => options.resolved ?? true,
      normalizeStatus: (status) => status ?? "UNKNOWN",
      prepareTemplate,
      refreshFeature: async () => refreshedFeature,
      requiresGitCheckpoint: () => true,
      resolvePhase: () => refreshedPhase,
    }),
    prepareTemplate,
  };
}

const input = {
  branchName: "arbitrary-branch",
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  feature,
  forcedRecoveryPhaseNumber: null,
  model: "arbitrary-model",
  onRepairStarted: vi.fn(),
  phase: selectedPhase,
  project,
  runId: "arbitrary-run",
};

describe("PhaseEntryPreparationApplication", () => {
  it("refreshes and template-validates before skipping already settled work", async () => {
    const target = createTarget();

    await expect(target.application.prepare(input)).resolves.toEqual({
      feature: refreshedFeature,
      kind: "skip",
      missingQualityGates: [],
      phase: refreshedPhase,
      summaries: ["Template aligned."],
      summary: "Phase 731: already completed.",
    });
    expect(target.prepareTemplate).toHaveBeenCalledWith(expect.objectContaining({ phase: refreshedPhase }));
  });

  it.each([
    ["forced recovery", { forcedRecoveryPhaseNumber: 731 }, {}],
    ["missing gate", {}, { missingGates: ["tests"] }],
    ["missing planning artifact", {}, { planningMissing: true }],
    ["missing git checkpoint", {}, { gitSatisfied: false }],
    ["unresolved phase", {}, { resolved: false }],
  ])("executes rather than skips for %s", async (_name, inputOverride, options) => {
    const target = createTarget(options);

    const result = await target.application.prepare({ ...input, ...inputOverride });

    expect(result.kind).toBe("execute");
  });

  it("does not inspect future gates for unresolved work", async () => {
    const target = createTarget({ missingGates: ["tests"], resolved: false });

    const result = await target.application.prepare(input);

    expect(result.missingQualityGates).toEqual([]);
  });
});
