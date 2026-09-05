export interface PhaseExecutionSafetyRules {
  cargoTimeoutSafety: string;
  cargoValidationLadder: string;
  lessonsLearnedExecutionConstraints: string;
  serializedBuildCommandsSkill: string;
  sharedCodeQualityAssumptions: string;
  validationEvidenceAccounting: string;
  windowsShellHygiene: string;
}

/** Defines preparation and command-safety constraints for an implementation worker. */
export function renderPhaseExecutionPreparationRules(rules: PhaseExecutionSafetyRules) {
  return [
    "- Read Project LessonsLearned Active Rules and source documents before changing code. Apply project stack/tooling lessons and prior code-review suggestions as active constraints.",
    "- If this phase or FeatureTasks.md missed a relevant prior lesson, update the planning docs with a concise prevention note or gate before implementation.",
    "- Treat operational lessons as constraints for your commands and checks. For example, if prior lessons define command serialization or lock-handling rules, follow them even if the phase file is silent.",
    rules.sharedCodeQualityAssumptions,
    "- Every phase whose execution contract declares final validation `full`, and every declared entry-gate full profile, has a whole-project Boy Scout obligation. Every configured full build, typecheck, lint, or test failure is a current regression or exposed contract drift: diagnose and repair it, prove the repair with focused checks, then rerun the configured full profile. Do not complete, waive, or downgrade that gate while any configured full-profile check fails.",
    "- In recovery mode, avoid repeating a broad validation command only when this phase does not declare `full-verification`. A full-verification phase must resolve every configured-profile failure before it can continue toward review or completion.",
    rules.serializedBuildCommandsSkill,
    rules.cargoValidationLadder,
    rules.validationEvidenceAccounting,
    rules.cargoTimeoutSafety,
    "- The worker starts with cwd set to the project root. Prefer relative paths; do not `cd` to a Windows drive path inside bash.",
    "- If the available shell is bash on Windows, use POSIX paths such as `/d/...` and redirect to `/dev/null`, not `nul`.",
    rules.windowsShellHygiene,
    rules.lessonsLearnedExecutionConstraints,
    "- Keep task status current: PENDING -> IN_PROGRESS -> COMPLETED/SKIPPED.",
  ];
}

/** Defines safety boundaries that apply after a review-remediation contract. */
export function renderPhasePostRemediationSafetyRules() {
  return [
    "- Apply the Boy Scout rule only outside code-review recovery scope, or when fixing a local check failure that is directly caused by the touched BLOCKER/REQUIRED fix or selected note decision.",
    "- If any local check exposes compilation warnings, fix those warnings immediately even if they appear outside the current phase's nominal scope.",
    "- Do not run local dev servers or long-running watch commands.",
    "- Do not push to remotes.",
    "- If this assigned agent/model is not the best fit, append a Routing Override entry before proceeding.",
    "- Routing Override entries must keep the previous recommendation and include the selected route, decision maker, timestamp, reason, and expected impact.",
  ];
}

/** Defines durable evidence and worker reporting after resilient error handling. */
export function renderPhaseExecutionFinalizationRules(gateEvidenceHandoff: string) {
  return [
    "- End by updating FeatureTasks.md and the phase file with the latest phase/task/checkpoint status.",
    "- A validation selected by the current phase is owned by that phase. When its Failure Policy is `repair_and_rerun`, repair the directly responsible production code, test, fixture, configuration, or shared contract and rerun it. The phase's expected-file list is a delivery forecast, not permission to ignore or relabel a configured validation failure.",
    "- A repair must preserve every pre-existing executable test/Scenario title and may not reduce assertions. Do not delete, rename, merge, replace with unrelated smoke coverage, skip, or weaken an existing scenario to obtain green verification. Hepha snapshots test coverage before the worker and restores/denies any reduction.",
    gateEvidenceHandoff,
    "- If you used a Previous Workflow Failure Brief or discovered an error pattern during this phase, record it in this phase file under `## LessonsLearned` with bullets for failure, cause, fix, and prevention.",
    "",
    "Return a concise Markdown summary with:",
    "- files changed",
    "- tests/checks run",
    "- task status changes",
    "- blockers, if any",
  ];
}
