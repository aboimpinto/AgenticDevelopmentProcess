import type { StoredFeatureFinding } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface FeatureFindingPromptPolicies {
  lessonsLearnedExecutionConstraintsRule: string;
  windowsShellHygieneRule: string;
}

export interface FeatureFindingPhaseIdentity {
  fileName: string;
  path: string;
}

/** Composes one human-review finding repair from durable finding history. */
export function buildFeatureFindingPrompt(
  project: StoredProject,
  feature: WorkItemCard,
  context: string,
  finding: StoredFeatureFinding,
  findingPhase: FeatureFindingPhaseIdentity,
  policies: FeatureFindingPromptPolicies,
) {
  return [
    "You are Hepha's Human Review Finding Agent.",
    "A human tester submitted feedback after all numbered implementation phases for this FEAT were completed or skipped.",
    "",
    "Goal:",
    "- Understand this one finding in the context of the FEAT and everything already implemented.",
    "- If it reports a bug or missing behavior, fix it in the current workspace with the smallest correct change.",
    "- If it reports that everything works, do not invent changes; record useful validation evidence instead.",
    "- If the finding cannot be fixed safely, explain exactly what is blocking it and what information is needed.",
    "- Update the existing Human Review Findings phase file with what you did, verification intent/evidence, and remaining manual verification.",
    "- Keep a `**Finding Tasks:**` checklist under this finding. Create it first if it is missing.",
    "- Check off finding tasks only after the work or explicit no-change assessment is actually done.",
    "- For test or coverage findings, add or update real tests unless equivalent tests already exist; if they already exist, cite the exact file and test names.",
    "",
    "Rules:",
    "- Stay inside the scope of this FEAT and its implemented behavior.",
    "- Read Project LessonsLearned Active Rules and source documents before changing code. Apply project stack/tooling lessons and prior code-review suggestions as active constraints.",
    "- Use the full finding thread: initial finding, previous agent solutions, and user follow-up details.",
    "- Do not reopen completed/skipped implementation phase statuses unless a MemoryBank correction is required by the fix.",
    "- Keep user code review and manual testing as human gates; do not mark them complete yourself.",
    "- All findings for this FEAT live in this one Human Review Findings phase file; do not create another findings phase.",
    "- Keep the finding phase status synchronized with the current finding state.",
    "- Preserve the Checkpoints section at the end of the phase file.",
    "- Preserve the Verification Intent, Required Evidence, and Completion Gate sections.",
    "- Record verification intent labels and configured verification evidence; do not turn the phase file into a stack-specific command recipe.",
    "- Use the project verification profile when available. If no configured check exists for the finding, record that as a blocker instead of inventing commands.",
    "- Apply the Boy Scout rule: if local checks expose compilation warnings, fix those warnings immediately.",
    "- Run the configured checks relevant to the fix when available.",
    policies.lessonsLearnedExecutionConstraintsRule,
    "- Do not move the finding to AWAITING_USER_ACCEPTANCE until its finding tasks are complete and evidence is recorded.",
    policies.windowsShellHygieneRule,
    "- Do not run local dev servers or long-running watch commands.",
    "- Do not push to remotes.",
    "",
    "Return a Markdown response with:",
    "- finding understood",
    "- changes made",
    "- verification intent labels addressed",
    "- configured verification evidence recorded",
    "- remaining manual verification",
    "- exact result line: `Finding Result: FIXED`, `Finding Result: NO_CHANGE_NEEDED`, `Finding Result: NEEDS_MORE_INFO`, or `Finding Result: BLOCKED`",
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `MemoryBank: ${project.memoryBankPath}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    `Finding ID: ${finding.id}`,
    `Finding title: ${finding.title}`,
    `Human review phase: Phases/${findingPhase.fileName}`,
    `Human review phase path: ${findingPhase.path}`,
    "",
    "## Finding Thread",
    renderFindingThread(finding),
    "",
    context,
  ].join("\n");
}

/** Renders all durable finding events in chronological order with human roles. */
export function renderFindingThread(finding: StoredFeatureFinding) {
  return finding.events
    .map((event, index) => {
      const speaker =
        event.role === "agent"
          ? "Agent solution"
          : event.role === "system"
            ? "System note"
            : event.kind === "follow_up"
              ? "User follow-up"
              : "Initial user finding";

      return [
        `### ${index + 1}. ${speaker}`,
        `Date: ${event.createdAt}`,
        `Kind: ${event.kind}`,
        "",
        event.content,
      ].join("\n");
    })
    .join("\n\n");
}
