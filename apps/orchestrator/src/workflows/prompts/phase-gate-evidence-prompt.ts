/** Protects durable workflow fields from free-form worker edits. */
export function renderPhaseMachineOwnedStateRule() {
  return "- Do not edit reserved machine fields: `**Status:**`, FeatureTasks.md Status cells, the entire Phase Task Ledger, `## Hepha Task State`, or any Quality Gate Evidence cell. Hepha writes those deterministically from durable workflow events. Return gate evidence in your worker result; Hepha persists it after validating the handoff. You may update normal narrative/traceability sections only.";
}

/** Defines the only accepted decision vocabulary and physical Markdown row shape. */
export function renderPhaseQualityGateEvidenceRules() {
  return [
    "- Quality Gate Evidence decision values are case-insensitive but must begin with exactly one canonical value: `missing`, `satisfied`, `waived`, or `not applicable`. Do not write `pass`, `passed`, `recorded`, `complete`, `approved`, or any other synonym in the Decision column. Use `satisfied` when the gate has passed and include the exact evidence/command in the third column.",
    "- Keep every Quality Gate Evidence entry on one physical Markdown table row: start and end it with `|`, keep exactly the three template columns, and place all evidence in the third cell. Never wrap or continue a gate row onto a following line. Preserve exact underscore lifecycle tokens (`IN_PROGRESS`, `AWAITING_REVIEW`, etc.) in phase metadata and the FeatureTasks status cell; do not use display text such as `IN PROGRESS`.",
  ];
}

/** Requires the exact worker-to-orchestrator gate evidence response contract. */
export function renderPhaseGateEvidenceHandoffRule() {
  return [
    "- For every phase-worker response, end with this exact machine-readable handoff (do not edit phase-table decision cells yourself): `## Hepha Gate Evidence Handoff`, then `| Gate | Result | Evidence |`, `| --- | --- | --- |`, `| Changed files | recorded | <exact changed production/test/document paths, or explicit no-change audit> |`, `| Tests | passed/failed/not_applicable | <exact commands and observed results or applicability justification> |`, and `| Gherkin/Playwright E2E | passed/failed/not_applicable | <exact commands and observed results or applicability justification> |`. Results are exact tokens. Any executed failing, timed-out, skipped, or crashing required check must be `failed`; Hepha persists it as `missing` and does not complete the task. An omitted or malformed handoff also fails before task completion.",
    "",
    "### Output Schema",
    "Your response must end with a Markdown table following this exact schema. The `Result` column uses a different vocabulary than the phase document's `Decision` column:",
    "",
    "```",
    "## Hepha Gate Evidence Handoff",
    "",
    "| Gate | Result | Evidence |",
    "| --- | --- | --- |",
    "| Changed files | recorded | <paths or 'no production/test source files changed'> |",
    "| Tests | passed | <summary of test results> |",
    "| Gherkin/Playwright E2E | not_applicable | <summary of E2E state> |",
    "```",
    "",
    "Valid Result values:",
    "- `passed` — all checks passed",
    "- `failed` — some checks failed, timed out, or crashed",
    "- `not_applicable` — gate does not apply to this phase",
    "",
    "These are NOT the same as the Quality Gate Decision values (`satisfied`, `missing`, `waived`, `not applicable`). Use the handoff vocabulary above.",
  ];
}
