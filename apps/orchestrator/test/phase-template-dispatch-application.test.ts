import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseTemplateDispatchApplication } from "../src/workflows/phases/phase-template-dispatch-application.js";

const valid = { kind: "valid" as const, featureId: "WORK", validation: { diagnostics: [], valid: true, version: "hepha-phase-template/v1" as const } };
const diagnostic = { actual: "absent", code: "phase_template_invalid" as const, expected: "task ledger", file: "Phases/phase-4-any.md", line: 3 };
const repair = { kind: "repair_required" as const, featureId: "WORK", version: "hepha-phase-template/v1" as const, canonicalTemplate: { featureTasks: [], phaseDocument: [], skippedPhase: [] }, diagnostics: [diagnostic], prompt: "repair exact structure" };

function fixture() {
  const project = { id: "project" } as StoredProject;
  const phase = { documentPath: "/work/phase.md", number: 4, status: "PENDING", title: "Anything" } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/work", phases: [phase] } as WorkItemCard;
  const refreshedPhase = { ...phase, title: "Refreshed" };
  const refreshed = { ...feature, phases: [refreshedPhase] } as WorkItemCard;
  const dependencies = {
    assertDispatchAllowed: vi.fn(),
    normalize: vi.fn((): string[] => []),
    prepareRepair: vi.fn(() => valid),
    recordProgress: vi.fn(async () => undefined),
    refreshFeature: vi.fn(async () => refreshed),
    runWorker: vi.fn(async () => undefined),
    verifyRepair: vi.fn(() => valid),
  };
  const input = { cardKey: "card", command: "continue-implementing" as const, feature, model: handoffPlan("model"), phase, project, runId: "run" };
  return { application: new PhaseTemplateDispatchApplication(dependencies), dependencies, feature, input, phase, refreshed, refreshedPhase };
}

describe("phase template dispatch application", () => {
  it("normalizes safe machine fields, refreshes, and applies the selected dispatch gate", async () => {
    const target = fixture();
    target.dependencies.normalize.mockReturnValue(["Phases/phase-4-any.md"]);
    const result = await target.application.prepare(target.input);
    expect(result.feature).toBe(target.refreshed);
    expect(result.phase).toBe(target.refreshedPhase);
    expect(result.summaries).toEqual(["Phase 4: Hepha normalized invalid machine fields in Phases/phase-4-any.md."]);
    expect(target.dependencies.runWorker).not.toHaveBeenCalled();
    expect(target.dependencies.assertDispatchAllowed).toHaveBeenCalledWith("/work", 4);
  });

  it("runs the constrained repair worker, verifies, refreshes, and reports repair context", async () => {
    const target = fixture();
    target.dependencies.prepareRepair.mockReturnValue(repair);
    const onRepairStarted = vi.fn();
    const result = await target.application.prepare({ ...target.input, onRepairStarted });
    expect(onRepairStarted).toHaveBeenCalledWith(expect.objectContaining({ agent: "Phase Template Alignment Agent", phase: target.phase }));
    expect(target.dependencies.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "implementing", phase: target.phase }));
    expect(target.dependencies.runWorker).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "phase-template-alignment", phaseNumber: 4, prompt: "repair exact structure",
    }));
    expect(target.dependencies.verifyRepair).toHaveBeenCalledWith("WORK", "/work");
    expect(result).toMatchObject({ feature: target.refreshed, phase: target.refreshedPhase, summaries: ["Phase 4: repaired phase-template diagnostics before dispatch."] });
  });

  it("fails closed with exact remaining diagnostics and never opens normal dispatch", async () => {
    const target = fixture();
    target.dependencies.prepareRepair.mockReturnValue(repair);
    target.dependencies.verifyRepair.mockReturnValue(repair);
    await expect(target.application.prepare(target.input)).rejects.toThrow(
      "Phases/phase-4-any.md:3 expected task ledger; actual absent",
    );
    expect(target.dependencies.assertDispatchAllowed).not.toHaveBeenCalled();
    expect(target.dependencies.refreshFeature).not.toHaveBeenCalled();
  });

  it("propagates selected-phase dispatch denial without launching an alignment worker", async () => {
    const target = fixture();
    target.dependencies.assertDispatchAllowed.mockImplementation(() => { throw new Error("invalid selected phase"); });
    await expect(target.application.prepare(target.input)).rejects.toThrow("invalid selected phase");
    expect(target.dependencies.runWorker).not.toHaveBeenCalled();
  });
});
