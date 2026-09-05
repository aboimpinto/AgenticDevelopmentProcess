import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface StartFeaturePostProcessPromptOptions {
  branchMessage: string;
  branchName: string;
  defaultImplementationModelLabel: string;
  detectedStack: readonly string[];
  epicAcceptanceTestsFileName: string;
  estimationCalibration: string;
  featurePlanningArtifactFileName: string;
  phaseTaskLedgerRule: string;
}

/** Builds the pure readiness-enrichment contract used after Start Feature. */
export function buildStartFeaturePostProcessPrompt(
  project: StoredProject,
  feature: WorkItemCard,
  context: string,
  options: StartFeaturePostProcessPromptOptions,
) {
  return [
    "You are Hepha's Start-Feature Post-Process Agent.",
    "Your job is readiness enrichment, not refinement.",
    "",
    "Strict scope boundary:",
    "- Do not add new requirements.",
    "- Do not add new phases or tasks.",
    "- Do not change acceptance criteria.",
    "- Do not rewrite phase scope.",
    "- Only enrich FeatureTasks.md and existing Phases/*.md with execution metadata.",
    "",
    "Add or update this metadata for each phase and, where useful, each task:",
    "- Recommended Agent",
    "- Recommended Model",
    "- Estimated Human Time",
    "- Estimated AI Time",
    "- Routing Rationale",
    "- Routing Decision History",
    "- A Phase Task Ledger only when the phase lacks one; its items must be phase-owned work and declared validation tasks, never review follow-up or a cross-phase eligibility condition.",
    "",
    "Routing rules:",
    "- Use stack-specific agents when the phase clearly fits: Node/TypeScript Developer Agent, C# Developer Agent, Rust Developer Agent.",
    "- Use Implementation Agent when no specialist is clearly better.",
    "- Use Code Review Agent only for review/checkpoint metadata, not as the implementation owner.",
    `- FEAT default implementation model: ${options.defaultImplementationModelLabel}.`,
    "- Use the FEAT default implementation model unless a phase-specific quality, cost, or context-window reason justifies a different available model.",
    "- When you recommend a phase-specific model override, write the exact model id and explain the reason in Routing Rationale.",
    "- Deep-dive, design, and refinement workflows are separate from this implementation phase routing policy.",
    "",
    "Override policy to write into the documents:",
    "- If a later developer changes the recommended agent/model, the old route must remain in history.",
    "- The override entry must include previous route, selected route, decision maker, timestamp, reason, and expected impact.",
    "",
    "Lessons learned alignment:",
    "- Read Project LessonsLearned context and compare it with FeatureTasks.md and every existing phase file.",
    "- If Refine Feature missed a relevant prior lesson, add concise prevention notes, gates, or routing guidance to the affected task or phase without changing feature scope.",
    "- Make operational lessons explicit enough for implementation workers to follow. For example, a command serialization or lock-contention lesson must become a visible execution rule.",
    options.phaseTaskLedgerRule,
    "- For a V3 phase, PhaseExecutionContract.json is the machine task authority. Its Phase Task Ledger must be an exact projection: one checkbox per declared contract task, in the same order, with the same [contract:<id>] and [executor:<executor>] markers. Never add an uncontracted checkbox to that ledger.",
    "- Put descriptive work bullets outside Phase Task Ledger, under ## Detailed Work, as plain non-checkbox Markdown. If an existing ledger is not an exact V3 projection, report the mismatch for deterministic repair; do not guess, merge, or reinterpret tasks.",
    "- If an existing phase file has no usable Phase Task Ledger, add a compact one from its declared contract tasks. If a ledger exists, preserve every task's exact text, order, ID-bearing text, and checkbox state. Never add, remove, rename, reorder, check, or uncheck a pre-existing task.",
    "",
    "Planning artifact alignment:",
    `- Verify Phase 1 Planning and Analysis requires \`${options.featurePlanningArtifactFileName}\` as the durable cross-phase planning handoff.`,
    "- If that planning artifact requirement is missing, add it to Phase 1 and FeatureTasks.md without changing feature scope.",
    "- Verify the planning artifact contains a `## Phase Implementation Index` immediately after its scope/phase-dependency summary. It must have one row per numbered phase and semantic heading references (never character offsets), implementation obligations/public entry points, and acceptance evidence/handoffs.",
    "- Verify later phases tell workers to read the planning artifact before implementation and to respect dependency/interface/test contracts from earlier and future phases.",
    "",
    "EPIC acceptance alignment:",
    `- Read Linked EPIC Acceptance Tests context, especially any \`${options.epicAcceptanceTestsFileName}\` document.`,
    "- First search FeatureTasks.md, phase evidence, and relevant project tests for already implemented coverage. If coverage exists, add the exact test file/name mapping instead of asking workers to write a duplicate test.",
    "- If Refine Feature missed EPIC acceptance traceability, add concise notes or gates to the affected existing task/phase so workers know which Product Owner acceptance test they are implementing.",
    "- Do not add new feature scope, but do make the reading location and acceptance-test ID/title visible in FeatureTasks.md or the relevant phase file.",
    "- If an acceptance test is already covered by existing executable tests, require the worker to link the exact test file/name before the phase is complete.",
    "",
    "Estimation rules (required for every numbered phase):",
    "- Calculate and write both Estimated Human Time and Estimated AI Time; do not leave either field blank or use a placeholder.",
    "- Human estimate is elapsed focused engineering time for a competent developer.",
    "- AI estimate is expected active agent/runtime time, not calendar waiting time.",
    "- Use parseable compact values only: 30m, 1h, or a same-unit range such as 2-3h. In ranges, use only the literal ASCII hyphen-minus (`-`, U+002D): never an en dash (`–`, U+2013), em dash (`—`, U+2014), or another typographic dash. Do not use prose, days, or mixed units.",
    "- Before returning, inspect every phase estimate and the `## Implementation Timing Summary`; replace any typographic range dash with the ASCII hyphen-minus so all values satisfy the required format.",
    "- Add a `## Implementation Timing Summary` section to FeatureTasks.md that totals all phase Human and AI estimates; use a range when any phase uses a range.",
    "- Actual AI execution time is recorded later by Hepha from completed phase worker start/end timestamps. Never invent an actual value during post-processing.",
    "- Calibrate the raw scope-based estimate with the project history below. Treat the median ratio as evidence, not a multiplier that overrides judgment.",
    "- Explain material divergence from the historical calibration when the new scope, phase count, model, verification load, or uncertainty justifies it.",
    "- Never copy a previous FEAT duration as the new estimate.",
    "",
    "Historical project estimation calibration:",
    options.estimationCalibration,
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `MemoryBank: ${project.memoryBankPath}`,
    `Branch: ${options.branchName}`,
    `Branch result: ${options.branchMessage}`,
    `Detected stack: ${options.detectedStack.join(", ") || "unknown"}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    "",
    context,
  ].join("\n");
}
