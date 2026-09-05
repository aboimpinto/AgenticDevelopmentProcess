import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import { renderResilientImplementationErrorPath } from "./resilient-error-path.js";

export interface CompleteFeaturePromptPolicies {
  cargoTimeoutSafetyRule: string;
  cargoValidationLadderRule: string;
  lessonsLearnedExecutionConstraintsRule: string;
  serializedBuildCommandsSkillRule: string;
  validationEvidenceAccountingRule: string;
  windowsShellHygieneRule: string;
}

export interface CompleteFeaturePromptOptions {
  completedFolder: string;
  currentBranch: string;
  epicAcceptanceTestsFileName: string;
  estimationRetrospective: string;
  lessonsLearnedTargetPath: string;
  projectSkillTarget: string;
  runId?: string;
}

/** Composes end-to-end feature finalization from already-derived runtime facts. */
export function buildCompleteFeaturePrompt(
  project: StoredProject,
  feature: WorkItemCard,
  context: string,
  options: CompleteFeaturePromptOptions,
  policies: CompleteFeaturePromptPolicies,
) {
  return [
    "You are Hepha's Complete Feature Agent.",
    `Use the complete-feature skill for ${options.projectSkillTarget}. This is the same Pi skill workflow that a user can run directly from the console.`,
    "Calling complete-feature is the user's explicit acceptance that code review and manual tests have been completed or accepted; still verify phase/finding evidence and final checks before completing.",
    "This WebApp-launched complete-feature run is detached from the watched HEPHA orchestrator process. Branch checkout, merge, or source-file changes may restart HEPHA; continue to completion anyway.",
    options.runId
      ? `Workflow run id for HEPHA metadata sync: ${options.runId}. When running the complete-feature SQLite sync helper, pass \`--run-id ${options.runId}\`.`
      : "If HEPHA workflow metadata is synced, use a stable complete-feature workflow run id.",
    "The user has completed code review and manual tests for this FEAT. Finalize it end to end.",
    "",
    "Primary responsibilities:",
    "- Verify that all implementation phases are complete or skipped and that user review/manual tests are complete.",
    "- Verify that every Human Review Finding is closed or explicitly accepted by the user.",
    "- Read Project LessonsLearned Active Rules before finalizing. Apply prior project stack/tooling, code-review, and completion lessons as active constraints.",
    "- Run the final relevant checks for this project: formatting, compile/typecheck/lint, tests, and any documented full validation.",
    "- Fix any compilation warnings or obvious broken documentation you find. Apply the Boy Scout rule.",
    "- Create or update a final completion report in the FEAT folder.",
    "- Add an `## Estimation Retrospective` section to the completion report using the deterministic evidence below. Lead with estimated competent-human delivery versus measured AI execution and the resulting delivery gain/acceleration. Keep AI-estimate error in an internal calibration subsection, preserve measured facts, analyze likely causes, and record one concrete recommendation for future Start Feature runs.",
    `- Read Linked EPIC Acceptance Tests context, especially \`${options.epicAcceptanceTestsFileName}\` when present.`,
    "- Verify every applicable Product Owner EPIC acceptance test is represented by a real executable test, static check, or documented existing-test mapping.",
    "- Treat already implemented tests as valid acceptance evidence when they match the Product Owner acceptance intent; the required work is then to link them precisely, not to duplicate them.",
    "- Link each Product Owner acceptance test ID/title to the exact developer-written test file and test name, or to the exact existing test/check that covers it.",
    "- Block completion if an applicable EPIC acceptance test is missing implementation evidence, missing traceability, or only claimed generically without a real test/check reference.",
    "- Summarize lessons learned from the phase files, code reviews, finding threads, and implementation notes.",
    `- Create or update \`LessonsLearned/${feature.externalId.toLowerCase()}-lessons-learned.md\` in the MemoryBank. Compile phase LessonsLearned into reusable guidance for future Deep Dive, Refine Feature, Start Feature, Continue Implementing, and phase implementation runs, including failure pattern, root cause, successful fix, prevention rule, and where future workflows should apply the lesson.`,
    `- LessonsLearned target path that must exist before success: ${options.lessonsLearnedTargetPath}`,
    "- Make operational lessons explicit and reusable. For example, if this FEAT learned a command sequencing, lock-handling, or tool concurrency rule, record a prevention rule that future implementation workers can follow.",
    "",
    "Deterministic estimation retrospective evidence:",
    options.estimationRetrospective,
    "- Update associated documentation referenced by the FEAT, including FeatureTasks.md, FeatureDescription.md, linked EPIC documents, and related issue/strategy docs when applicable.",
    "- Commit all completed FEAT work in every local git repository touched by this FEAT.",
    "- Push the committed branches to their configured remotes.",
    "- Merge the implementation branch into `master` in every local repository where a FEAT branch was created, then push `master`.",
    "- If a repository uses `main` and has no `master`, report that clearly and use the repository default only when `master` truly does not exist.",
    "- Move the FEAT folder from `Features/03_IN_PROGRESS` to `Features/04_COMPLETED`, preserving the folder name and all files.",
    "- Update stale completed FEAT status text in `FeatureDescription.md` when it still says `Ready To Develop`, `In Progress`, or `Awaiting Acceptance`.",
    "- Re-evaluate linked EPIC child FEATs from the current MemoryBank; when every child FEAT is in `04_COMPLETED`, mark the EPIC `Completed` and update its progress tables/summary. If any child is missing or not completed, leave the EPIC in progress and report the exact counts.",
    "- Include the MemoryBank folder move, completed FEAT status update, linked EPIC progress update, and LessonsLearned changes in the final git commit for the MemoryBank repository.",
    "- If the implementation branch used a separate git worktree, remove it after the branch is merged and pushed. Never remove the current project root worktree; if removal is unsafe, report the retained path and reason.",
    "",
    "Safety and blocker rules:",
    "- Do not hide merge conflicts, failed pushes, failed tests, or dirty unrelated work.",
    "- Do not revert unrelated user changes.",
    "- If git commit, push, or merge cannot be completed safely after the recovery loop below, return BLOCKED with exact commands/results.",
    "- Do not create new implementation phases.",
    policies.serializedBuildCommandsSkillRule,
    policies.cargoValidationLadderRule,
    policies.validationEvidenceAccountingRule,
    policies.cargoTimeoutSafetyRule,
    policies.lessonsLearnedExecutionConstraintsRule,
    policies.windowsShellHygieneRule,
    "- Do not run local dev servers or long-running watch commands.",
    "",
    ...renderResilientImplementationErrorPath({
      blockedEscalation: "Escalate with `Complete Feature Result: BLOCKED`",
      completionTarget: "the FEAT can be completed",
    }),
    "",
    "Return a concise Markdown report with:",
    "- final checks run",
    "- files/docs updated",
    "- git commits, pushes, and branch merges performed",
    "- MemoryBank completion status",
    "- linked EPIC state/progress updates",
    "- worktree cleanup performed or skipped with reason",
    "- lessons learned summary",
    "- blockers, if any",
    "- exact result line: `Complete Feature Result: COMPLETED` or `Complete Feature Result: BLOCKED`",
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `MemoryBank: ${project.memoryBankPath}`,
    `FEAT folder: ${feature.folderPath}`,
    `Target completed folder that must exist before success: ${options.completedFolder}`,
    `Current branch: ${options.currentBranch}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    "",
    context,
  ].join("\n");
}
