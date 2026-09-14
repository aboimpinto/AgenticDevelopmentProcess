import { describe, expect, it } from "vitest";
import { verificationContract } from "../src/workflows/prompts/verification-contract.js";
import {
  buildContinueImplementingPrompt,
  buildDesignFeaturePrompt,
  buildRefineFeaturePrompt,
  buildStartImplementingPrompt,
  buildUiRequirementPrompt,
  classifyNoUiMaintenanceFeature,
  createUiRequirementSourceHash,
  formatProjectSkillTarget,
  parseUiRequirementDecision,
} from "../src/workflows/prompts/feature-entry-prompts.js";

const feature = {
  externalId: "ITEM-41",
  title: "Arbitrary capability",
  specMarkdown: "The implementation changes an internal command registry.",
} as any;
const project = {
  id: "project-id",
  name: "AnyProject",
  rootPath: "/workspace/project",
  memoryBankPath: "/workspace/project/MemoryBank",
} as any;

describe("feature entry prompts", () => {
  it("classifies non-visual command maintenance locally", () => {
    expect(classifyNoUiMaintenanceFeature(feature)).toEqual({
      decision: "no_ui",
      reason: expect.stringContaining("command-boundary"),
    });
  });

  it("does not bypass routing when explicit visual work is declared", () => {
    expect(classifyNoUiMaintenanceFeature({
      ...feature,
      specMarkdown: "Refactor the command registry and update the React screen layout.",
    })).toBeNull();
  });

  it("builds the UI decision contract with feature evidence", () => {
    const prompt = buildUiRequirementPrompt(feature);
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("ITEM-41 - Arbitrary capability");
    expect(prompt).toContain(feature.specMarkdown);
  });

  it("normalizes explicit UI decisions and rejects unknown decisions", () => {
    expect(parseUiRequirementDecision('```json\n{"decision":"REQUIRES_UI"}\n```')).toEqual({
      decision: "requires_ui",
      reason: "The FEAT appears to involve user-facing UI or interaction changes.",
    });
    expect(() => parseUiRequirementDecision('{"decision":"unexpected"}')).toThrow("explicitly return");
    expect(() => parseUiRequirementDecision('{}')).toThrow("explicitly return");
  });

  it("rejects responses without an object contract", () => {
    expect(() => parseUiRequirementDecision("no decision")).toThrow("did not include a JSON object");
    expect(() => parseUiRequirementDecision("[1, 2]")).toThrow("did not include a JSON object");
  });

  it("versions the source hash so routing-policy changes invalidate old decisions", () => {
    expect(createUiRequirementSourceHash("document-hash")).toBe(
      "ui-requirement-v3-explicit-decision:document-hash",
    );
  });

  it("formats the canonical skill target once for every feature-entry command", () => {
    const target = "AnyProject ITEM-41. Project root: /workspace/project. MemoryBank: /workspace/project/MemoryBank";
    expect(formatProjectSkillTarget(project, feature, "")).toBe(target);
    expect(buildDesignFeaturePrompt(project, feature)).toBe(`design-feature ${target}`);
    expect(buildRefineFeaturePrompt(project, feature)).toBe(
      `refine-feature ${target}. Project id: project-id. Canonical feature id: item-41. ` +
      `${verificationContract(true)} ` +
      "Author PhaseExecutionContract.json only as hepha-phase-execution/v3; every phase must declare gitCheckpoint commit_and_push outside its ordered task ledger. V1/V2 are historical read compatibility and are invalid new refinement output. " +
      "When the accepted topology declares a final checkpoint, its final task runs the project-owned verification commands and logically assesses existing tests against FEAT and EPIC acceptance criteria. Reuse assertion mappings from earlier phases and inspect their shared fixtures and current implementation. Numeric coverage reports, percentages, LCOV instrumentation and coverage profiles are optional advisory telemetry; their absence does not block refinement or require Deep-Dive. Do not install instrumentation or introduce a measurement obligation. Preserve explicitly configured project checks and independent human acceptance. Do not invent a final checkpoint or change the accepted gate declarations. " +
      "Classify every acceptance criterion as MANUAL, AUTOMATED, DEFERRED, or UNCOVERED. Use MANUAL_TEST_REQUIRED only when a real human-operable surface exists and successful execution inherently needs a user-provided physical device, qualified GUI/session, hardware capability, external ceremony, or manual interaction that the autonomous executor cannot supply. Never create manual tests for internal models, architecture dependencies, static catalogue contents, schema/digest validation, immutable data structures, startup validation, unit tests, or source-code properties; map those to automated evidence. Do not create a blocking executable implementation gate for manual work. Record the phase task as SKIPPED with reason 'This test cannot be automated and the user needs to test it manually.' and create ManualTestObligations.json using schema hepha-manual-test-obligations/v1. Every obligation must name the concrete application/interface in its first action, exact preconditions, required account/test data or an explicit none-required statement, specific executable actions, observable expected results, and evidence requirements. Generic instructions such as 'navigate to the feature area' or 'perform the expected workflow' are forbidden. Missing manual evidence blocks release readiness, not implementation completion. Refinement remains documentation-only: determine automation feasibility from feature requirements, repository manifests/workflows, configured environments, and existing harness documentation without executing any build, test, package-manager, compiler, device, or environment probe. " +
      "Return exactly one Refine Feature Result V1 JSON object: COMPLETED with feature-folder-relative artifact paths, or NEEDS_DEEP_DIVE with the reason and interactive decision questions. COMPLETED.files entries must be exactly FeatureTasks.md, planning-analysis-report.md, PhaseExecutionContract.json, ArchitectureDebtTouchPlan.json, ManualTestObligations.json when created, or contract-declared Phases/phase-<number> Markdown paths; never prefix them with the project root, MemoryBank/Features, lifecycle folder, or FEAT folder. " +
      "An unresolved user decision is a blocked Deep-Dive handoff, never a failed refinement. Do not limit the number of Deep-Dive/refinement rounds.",
    );
  });

  it("selects start and continue skills while preserving autonomous mode", () => {
    const options = { autonomous: true, branchMessage: "unused", branchName: "unused" };
    const autonomousTarget = "AnyProject ITEM-41 autonomous. Project root: /workspace/project. MemoryBank: /workspace/project/MemoryBank";
    expect(buildStartImplementingPrompt(project, feature, "context", options)).toBe(
      `Use the start-feature skill for ${autonomousTarget}.`,
    );
    expect(buildContinueImplementingPrompt(project, feature, "context", options)).toBe(
      `Use the continue-implementation skill for ${autonomousTarget}.`,
    );
  });
});
