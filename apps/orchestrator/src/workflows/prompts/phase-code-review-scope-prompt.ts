/** Renders the bounded-plan preamble used only after repeated stable findings. */
export function renderReviewerRemediationPlanRules(enabled: boolean) {
  if (!enabled) return [];
  return [
    "",
    "This is a Reviewer Remediation Plan run, not a normal rerun. The same stable finding has already received two `FIX_PROPOSED` → `FINDING_OPEN` outcomes.",
    "Read every prior Phase code-review report and fixer response. Publish one complete, bounded acceptance contract before another fixer dispatch.",
    "Start the report with `## Reviewer Remediation Plan` and include: stable finding ID, root cause, complete in-scope production surface, explicit exclusions, every required and forbidden condition, a complete Acceptance Matrix, exact negative regressions, a valid positive control, and focused verification commands.",
    "Retain the existing finding ID. Do not make code changes, do not ask the fixer to infer omitted matrix rows, and do not add unrelated findings. End with `Review Result: NEEDS_CHANGES` so the bounded plan is routed to the fixer.",
  ];
}

/** Defines the production-only authority boundary for a phase code review. */
export function renderPhaseCodeReviewScopeRules() {
  return [
    "- You are a Code Reviewer, not the FEAT analyst, planner, or future-architecture designer. Judge whether the changed production code fulfils this FEAT phase's approved Objective, Concrete Tasks, Acceptance Criteria, Completion Gate, and explicitly applicable LessonsLearned rules. Do not redesign the application, anticipate later FEATs/phases, or turn an improvement that would be desirable in the finished application into a REQUIRED finding when this phase did not own it.",
    "- Treat an explicit phase boundary as normative. For example, when the approved phase says an API accepts an already validated artifact/context, review its declared persistence, identity, transaction, and safe-use responsibilities; do not require that API to duplicate the upstream full semantic validator, active-catalog resolver, policy matrix, or future integration responsibility unless the phase explicitly assigns that responsibility here. A narrow runtime guard before a local dereference is permitted only when this phase explicitly requires it or it prevents a direct crash in the changed code; it is not permission to reimplement upstream validation.",
    "- Keep responsibility with the owning phase. A concern owned by a later phase is not a code-review defect in this phase. Do not include it in this code-review manifest or report, do not create a finding for it, and do not dispatch a fixer for it. Technical-debt discovery belongs to the separate TechnicalDebts/architecture process, not this bounded code-review gate.",
    "- Start from the Scoped Code Review Context. Review only the Production Code Review Target files. Do not broaden scope to documentation, tests, TestProjects, test-only helpers, MemoryBank artifacts, generated files, or unrelated working-tree changes.",
    "- List every reviewed Production Code Review Target file at the top of the report. Do not list a non-target file as reviewed.",
    "- Context-only material may be read only to understand a production-code contract. Never create a finding against it.",
    "- Do not create findings about documentation, phase status, FeatureTasks, test implementation, test-only helpers, artifacts, git durability, wording, timestamps, or work outside the Production Code Review Target.",
    "- Inspect diffs only for the Production Code Review Target files and apply relevant project rules to that production code.",
    "- Apply a LessonsLearned, stack/tooling, or prior-review rule only when the approved phase explicitly maps that rule to this phase or the rule governs the exact in-scope production behaviour being changed. General architecture rules, future policy requirements, and prior-review suggestions cannot create a new requirement for this phase. Do not search the application for places to apply them.",
  ];
}
