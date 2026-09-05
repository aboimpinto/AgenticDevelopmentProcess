import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

const uiRequirementClassifierVersion = "ui-requirement-v2-command-refactor-no-ui";

export function buildUiRequirementPrompt(feature: WorkItemCard) {
  return [
    "You are Hepha's feature workflow router.",
    'Answer the question: "Does this FEAT need a UI requirement?"',
    "Return JSON only. Do not include Markdown fences or commentary.",
    "",
    "JSON shape:",
    '{ "decision": "requires_ui | no_ui", "reason": "short reason" }',
    "",
    "Decision rules:",
    "- Choose requires_ui when the FEAT changes screens, forms, navigation, visual states, interaction flows, UX copy, accessibility behavior, or frontend presentation.",
    "- Choose no_ui when the FEAT is backend-only, command-line/internal behavior, TUI command routing, slash command behavior, command palette metadata, completion metadata, help metadata, tests, data/model work, infrastructure, documentation-only, or invisible refactoring.",
    "- Do not choose requires_ui only because behavior is user-facing. For CLI/TUI command refactors, choose no_ui unless the FEAT explicitly asks to change screen layout, visual presentation, interaction design, UX copy, accessibility behavior, or a rendered UI component.",
    "- If uncertain and the FEAT is primarily maintenance, refactoring, command dispatch, parser, registry, completion, palette metadata, or test coverage work, choose no_ui.",
    "- If uncertain and the FEAT clearly introduces or changes a visual screen, form, navigation path, or interaction flow, choose requires_ui.",
    "",
    `FEAT: ${feature.externalId} - ${feature.title}`,
    "",
    "FeatureDescription.md:",
    "```markdown",
    feature.specMarkdown,
    "```",
  ].join("\n");
}

export function parseUiRequirementDecision(output: string) {
  const normalizedOutput = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const jsonStart = normalizedOutput.indexOf("{");
  const jsonEnd = normalizedOutput.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error("The agent response did not include a JSON object.");
  }
  const parsed = JSON.parse(normalizedOutput.slice(jsonStart, jsonEnd + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The agent response JSON must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const rawDecision = typeof record.decision === "string" ? record.decision.trim().toLowerCase() : "";
  const decision: "requires_ui" | "no_ui" = rawDecision === "requires_ui" ? "requires_ui" : "no_ui";
  const reason = typeof record.reason === "string" && record.reason.trim()
    ? record.reason.trim()
    : decision === "requires_ui"
      ? "The FEAT appears to involve user-facing UI or interaction changes."
      : "The FEAT appears to be backend, internal, or non-visual work.";
  return { decision, reason };
}

export function classifyNoUiMaintenanceFeature(feature: WorkItemCard): { decision: "no_ui"; reason: string } | null {
  const source = `${feature.title}\n${feature.specMarkdown}`.toLowerCase();
  const commandMaintenanceSignals = [
    /\bcommand\b/, /\bcommands\b/, /\bslash\b/, /\bdispatch\b/, /\bparser\b/, /\bparse\b/,
    /\bregistry\b/, /\balias\b/, /\bfrontmatter\b/, /\bmetadata\b/, /\bcompletion\b/,
    /\bautocomplete\b/, /\bcommand palette\b/, /\bhelp text\b/, /\btui\b/, /\bcli\b/,
    /\brefactor\b/, /\bboundary\b/,
  ];
  const explicitUiChangeSignals = [
    /\bscreen\b/, /\bscreens\b/, /\bform\b/, /\bforms\b/, /\bmodal\b/, /\blayout\b/,
    /\bwireframe\b/, /\bvisual\b/, /\bstyling\b/, /\bcss\b/, /\bhtml\b/, /\breact\b/,
    /\bfrontend\b/, /\bcomponent\b/, /\bcomponents\b/, /\baccessibility\b/, /\bnavigation\b/,
    /\bux copy\b/, /\binteraction design\b/,
  ];
  if (commandMaintenanceSignals.some((pattern) => pattern.test(source)) &&
      !explicitUiChangeSignals.some((pattern) => pattern.test(source))) {
    return {
      decision: "no_ui",
      reason: "This FEAT is command-boundary, parser/registry, completion/palette metadata, or test coverage work; it does not explicitly change visual UI requirements.",
    };
  }
  return null;
}

export function createUiRequirementSourceHash(documentHash: string) {
  return `${uiRequirementClassifierVersion}:${documentHash}`;
}

export function formatProjectSkillTarget(project: StoredProject, feature: WorkItemCard, modeSuffix: string) {
  return `${project.name} ${feature.externalId}${modeSuffix}. Project root: ${project.rootPath}. MemoryBank: ${project.memoryBankPath}`;
}

export function buildDesignFeaturePrompt(project: StoredProject, feature: WorkItemCard) {
  return `design-feature ${formatProjectSkillTarget(project, feature, "")}`;
}

export function buildRefineFeaturePrompt(project: StoredProject, feature: WorkItemCard) {
  return [
    `refine-feature ${formatProjectSkillTarget(project, feature, "")}.`,
    `Project id: ${project.id}. Canonical feature id: ${feature.externalId.toLowerCase()}.`,
    "Author PhaseExecutionContract.json only as hepha-phase-execution/v3; every phase must declare gitCheckpoint commit_and_push outside its ordered task ledger. V1/V2 are historical read compatibility and are invalid new refinement output.",
    "When the declared topology contains a final_checkpoint role, its last ordered task must be a required full verification that requests full-verification, test-coverage, and manual-review-ready evidence. Add a final Test coverage quality row that records FEAT changed-line coverage against an advisory 80% reference and a 95-100% target, plus overall project coverage as context. Percentage thresholds never fail a phase or FEAT. A coverage command, timeout, baseline, report, or instrumentation error also never fails the phase: record the exact reason as a non-blocking coverage-unavailable remark and continue using the independent build, lint/typecheck, and test gates. Only a successfully measured below-reference FEAT result enters the bounded FEAT-scoped improvement loop. Configure those improvement attempts to change only production code/tests owned by the current FEAT; remaining low coverage becomes a reminder. Reuse a valid project-owned .hepha/safety/final-verification-profile.yaml across every FEAT without asking again. Create or update it only when existing project configuration already makes the LCOV command, report paths, source includes/excludes, improvement-attempt policy, and multi-stack ownership unambiguous. If project-level coverage is not configured, do not guess or install tooling: return NEEDS_DEEP_DIVE once for those exact project decisions, then persist the answer in the project profile. Preserve existing checks. Do not invent a final checkpoint or mutate coverage configuration when the accepted workflow declares none.",
    "Classify every acceptance criterion as MANUAL, AUTOMATED, DEFERRED, or UNCOVERED. Use MANUAL_TEST_REQUIRED only when a real human-operable surface exists and successful execution inherently needs a user-provided physical device, qualified GUI/session, hardware capability, external ceremony, or manual interaction that the autonomous executor cannot supply. Never create manual tests for internal models, architecture dependencies, static catalogue contents, schema/digest validation, immutable data structures, startup validation, unit tests, or source-code properties; map those to automated evidence. Do not create a blocking executable implementation gate for manual work. Record the phase task as SKIPPED with reason 'This test cannot be automated and the user needs to test it manually.' and create ManualTestObligations.json using schema hepha-manual-test-obligations/v1. Every obligation must name the concrete application/interface in its first action, exact preconditions, required account/test data or an explicit none-required statement, specific executable actions, observable expected results, and evidence requirements. Generic instructions such as 'navigate to the feature area' or 'perform the expected workflow' are forbidden. Missing manual evidence blocks release readiness, not implementation completion.",
    "Refinement remains documentation-only: determine automation feasibility from feature requirements, repository manifests/workflows, configured environments, and existing harness documentation without executing any build, test, package-manager, compiler, device, or environment probe.",
    "Return exactly one Refine Feature Result V1 JSON object: COMPLETED with feature-folder-relative artifact paths, or NEEDS_DEEP_DIVE with the reason and interactive decision questions. COMPLETED.files entries must be exactly FeatureTasks.md, planning-analysis-report.md, PhaseExecutionContract.json, ArchitectureDebtTouchPlan.json, ManualTestObligations.json when created, or contract-declared Phases/phase-<number> Markdown paths; never prefix them with the project root, MemoryBank/Features, lifecycle folder, or FEAT folder.",
    "An unresolved user decision is a blocked Deep-Dive handoff, never a failed refinement. Do not limit the number of Deep-Dive/refinement rounds.",
  ].join(" ");
}

interface ImplementationPromptOptions {
  autonomous: boolean;
  branchMessage: string;
  branchName: string;
}

export function buildStartImplementingPrompt(
  project: StoredProject, feature: WorkItemCard, _context: string, options: ImplementationPromptOptions,
) {
  const modeSuffix = options.autonomous ? " autonomous" : "";
  return `Use the start-feature skill for ${formatProjectSkillTarget(project, feature, modeSuffix)}.`;
}

export function buildContinueImplementingPrompt(
  project: StoredProject, feature: WorkItemCard, _context: string, options: ImplementationPromptOptions,
) {
  const modeSuffix = options.autonomous ? " autonomous" : "";
  return `Use the continue-implementation skill for ${formatProjectSkillTarget(project, feature, modeSuffix)}.`;
}
