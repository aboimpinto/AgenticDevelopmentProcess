import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface HumanReviewFindingsPromptPolicies {
  lessonsLearnedExecutionConstraintsRule: string;
  windowsShellHygieneRule: string;
}

export interface HumanReviewFindingsPromptOptions {
  branchName: string;
  phase: PhaseSummary & { number: number };
  phaseMarkdown: string;
}

/** Composes continuation of the single declared human-review findings phase. */
export function buildHumanReviewFindingsPhasePrompt(
  project: StoredProject,
  feature: WorkItemCard,
  context: string,
  options: HumanReviewFindingsPromptOptions,
  policies: HumanReviewFindingsPromptPolicies,
) {
  return [
    "You are Hepha's Human Review Findings Agent.",
    "Continue the existing Human Review Findings phase for this FEAT.",
    "",
    "Goal:",
    "- Review every open finding recorded in the one Human Review Findings phase file.",
    "- Fix reported bugs or missing behavior in the current workspace with the smallest correct change.",
    "- If a finding says everything works, record validation evidence and do not invent code changes.",
    "- Update the same phase file with what you did, verification intent/evidence, and remaining manual verification.",
    "- Leave the phase as AWAITING_USER_ACCEPTANCE when fixes are ready for user verification.",
    "",
    "Rules:",
    "- Do not create another Human Review Findings phase.",
    "- Read Project LessonsLearned Active Rules and source documents before changing code. Apply project stack/tooling lessons and prior code-review suggestions as active constraints.",
    "- Every open finding must have a `**Finding Tasks:**` checklist under its section. Create missing checklists before solving.",
    "- Check off finding tasks only after the work or explicit no-change assessment is actually done.",
    "- For test or coverage findings, add or update real tests unless equivalent tests already exist; if they already exist, cite the exact file and test names.",
    "- Do not mark findings solved; only the user can mark them solved.",
    "- Do not mark this phase COMPLETED unless every finding is already explicitly solved by the user.",
    "- Preserve the Checkpoints section at the end of the phase file.",
    "- Preserve the Verification Intent, Required Evidence, and Completion Gate sections.",
    "- Record verification intent labels and configured verification evidence; do not turn the phase file into a stack-specific command recipe.",
    "- Use the project verification profile when available. If no configured check exists for a finding, record that as a blocker instead of inventing commands.",
    "- Apply the Boy Scout rule: if local checks expose compilation warnings, fix those warnings immediately.",
    "- Run the configured checks relevant to each fix when available.",
    policies.lessonsLearnedExecutionConstraintsRule,
    "- Do not leave the phase as AWAITING_USER_ACCEPTANCE unless every open finding has complete tasks, an agent response, configured verification evidence, and remaining manual verification recorded.",
    policies.windowsShellHygieneRule,
    "- Do not run local dev servers or long-running watch commands.",
    "- Do not push to remotes.",
    "",
    "Return a Markdown response with:",
    "- findings addressed",
    "- changes made",
    "- verification intent labels addressed",
    "- configured verification evidence recorded",
    "- remaining manual verification",
    "- exact result line: `Human Review Findings Result: READY_FOR_USER`, `Human Review Findings Result: COMPLETED`, `Human Review Findings Result: NEEDS_MORE_INFO`, or `Human Review Findings Result: BLOCKED`",
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `MemoryBank: ${project.memoryBankPath}`,
    `Branch: ${options.branchName}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    `Human review phase: Phases/${options.phase.fileName}`,
    `Human review phase path: ${options.phase.documentPath}`,
    "",
    "## Current Human Review Findings Phase",
    "```markdown",
    options.phaseMarkdown,
    "```",
    "",
    context,
  ].join("\n");
}
