import { describe, expect, it } from "vitest";
import { buildStartFeaturePostProcessPrompt } from "../src/workflows/prompts/start-feature-post-process-prompt.js";

const project = { name: "Project", rootPath: "/project", memoryBankPath: "/project/bank" } as any;
const feature = { externalId: "ITEM-X", title: "Capability", specMarkdown: "scope" } as any;
const options = {
  branchMessage: "Branch ready",
  branchName: "feat/item-x",
  defaultImplementationModelLabel: "Provider / Model",
  detectedStack: ["Node.js", "Rust"],
  epicAcceptanceTestsFileName: "Acceptance.md",
  estimationCalibration: "Median ratio: 1.2",
  featurePlanningArtifactFileName: "plan.md",
  phaseTaskLedgerRule: "PRESERVE THE DECLARED LEDGER",
};

describe("start feature post-process prompt", () => {
  it("limits the worker to readiness enrichment", () => {
    const prompt = buildStartFeaturePostProcessPrompt(project, feature, "CONTEXT", options);
    expect(prompt).toContain("readiness enrichment, not refinement");
    expect(prompt).toContain("Do not add new phases or tasks");
    expect(prompt).toContain("Only enrich FeatureTasks.md and existing Phases/*.md");
  });

  it("preserves task-ledger, planning, acceptance, and lessons contracts", () => {
    const prompt = buildStartFeaturePostProcessPrompt(project, feature, "CONTEXT", options);
    expect(prompt).toContain("PRESERVE THE DECLARED LEDGER");
    expect(prompt).toContain("PhaseExecutionContract.json is the machine task authority");
    expect(prompt).toContain("Never add an uncontracted checkbox to that ledger");
    expect(prompt).toContain("## Detailed Work");
    expect(prompt).toContain("`plan.md`");
    expect(prompt).toContain("`Acceptance.md`");
    expect(prompt).toContain("If Refine Feature missed a relevant prior lesson");
    expect(prompt).toContain("add the exact test file/name mapping");
  });

  it("requires calibrated human and AI estimates without invented actuals", () => {
    const prompt = buildStartFeaturePostProcessPrompt(project, feature, "CONTEXT", options);
    expect(prompt).toContain("Calculate and write both Estimated Human Time and Estimated AI Time");
    expect(prompt).toContain("Actual AI execution time is recorded later by Hepha");
    expect(prompt).toContain("ASCII hyphen-minus (`-`, U+002D)");
    expect(prompt).toContain("never an en dash (`–`, U+2013)");
    expect(prompt).toContain("replace any typographic range dash with the ASCII hyphen-minus");
    expect(prompt).toContain("Median ratio: 1.2");
  });

  it("renders runtime discoveries and canonical workflow context", () => {
    const prompt = buildStartFeaturePostProcessPrompt(project, feature, "CONTEXT", options);
    expect(prompt).toContain("FEAT default implementation model: Provider / Model");
    expect(prompt).toContain("Detected stack: Node.js, Rust");
    expect(prompt).toContain("Branch: feat/item-x");
    expect(prompt).toContain("Branch result: Branch ready");
    expect(prompt).toContain("Project root: /project");
    expect(prompt).toContain("CONTEXT");
  });

  it("renders an unknown stack when runtime discovery is empty", () => {
    expect(buildStartFeaturePostProcessPrompt(project, feature, "CONTEXT", {
      ...options,
      detectedStack: [],
    })).toContain("Detected stack: unknown");
  });
});
