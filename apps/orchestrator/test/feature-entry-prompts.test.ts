import { describe, expect, it } from "vitest";
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

  it("normalizes fenced UI decisions and supplies safe defaults", () => {
    expect(parseUiRequirementDecision('```json\n{"decision":"REQUIRES_UI"}\n```')).toEqual({
      decision: "requires_ui",
      reason: "The FEAT appears to involve user-facing UI or interaction changes.",
    });
    expect(parseUiRequirementDecision('{"decision":"unexpected"}')).toEqual({
      decision: "no_ui",
      reason: "The FEAT appears to be backend, internal, or non-visual work.",
    });
  });

  it("rejects responses without an object contract", () => {
    expect(() => parseUiRequirementDecision("no decision")).toThrow("did not include a JSON object");
    expect(() => parseUiRequirementDecision("[1, 2]")).toThrow("did not include a JSON object");
  });

  it("versions the source hash so routing-policy changes invalidate old decisions", () => {
    expect(createUiRequirementSourceHash("document-hash")).toBe(
      "ui-requirement-v2-command-refactor-no-ui:document-hash",
    );
  });

  it("formats the canonical skill target once for every feature-entry command", () => {
    const target = "AnyProject ITEM-41. Project root: /workspace/project. MemoryBank: /workspace/project/MemoryBank";
    expect(formatProjectSkillTarget(project, feature, "")).toBe(target);
    expect(buildDesignFeaturePrompt(project, feature)).toBe(`design-feature ${target}`);
    expect(buildRefineFeaturePrompt(project, feature)).toBe(
      `refine-feature ${target}. Project id: project-id. Canonical feature id: item-41. ` +
      "Author PhaseExecutionContract.json only as hepha-phase-execution/v3; every phase must declare gitCheckpoint commit_and_push outside its ordered task ledger. V1/V2 are historical read compatibility and are invalid new refinement output. " +
      "When the declared topology contains a final_checkpoint role, its last ordered task must be a required full verification that requests full-verification, test-coverage, and manual-review-ready evidence. Add a final Test coverage quality row that records FEAT changed-line coverage against an advisory 80% reference and a 95-100% target, plus overall project coverage as context. Percentage thresholds never fail a phase or FEAT. A coverage command, timeout, baseline, report, or instrumentation error also never fails the phase: record the exact reason as a non-blocking coverage-unavailable remark and continue using the independent build, lint/typecheck, and test gates. Only a successfully measured below-reference FEAT result enters the bounded FEAT-scoped improvement loop. Configure those improvement attempts to change only production code/tests owned by the current FEAT; remaining low coverage becomes a reminder. Reuse a valid project-owned .hepha/safety/final-verification-profile.yaml across every FEAT without asking again. Create or update it only when existing project configuration already makes the LCOV command, report paths, source includes/excludes, improvement-attempt policy, and multi-stack ownership unambiguous. If project-level coverage is not configured, do not guess or install tooling: return NEEDS_DEEP_DIVE once for those exact project decisions, then persist the answer in the project profile. Preserve existing checks. Do not invent a final checkpoint or mutate coverage configuration when the accepted workflow declares none. " +
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
