/** Defines reviewer command safety, result classification, and non-mutating behavior. */
export function renderPhaseCodeReviewExecutionRules() {
  return [
    "- When rerunning documented Cargo commands, preserve the exact package/bin/filter and libtest separator from the documentation. For libtest flags such as `--test-threads=1`, use `cargo test ... -- --test-threads=1`; never pass libtest flags directly to Cargo or shorten a documented `-p ... --bin ...` command.",
    "- If your own verification command fails because of command syntax, retry once with the corrected syntax and classify the first failure as reviewer-tooling error. Do not turn a reviewer-owned shell typo into a project finding.",
  ];
}

/** Defines the terminal reviewer result and inspection boundary. */
export function renderPhaseCodeReviewResultRules() {
  return [
    "- Classify each finding with one Severity value: BLOCKER, REQUIRED, WITH_NOTES, NON_BLOCKING, POLISH, or OUT_OF_SCOPE.",
    "- Use Review Result: NEEDS_CHANGES only when at least one finding is BLOCKER or REQUIRED. Use APPROVED_WITH_NOTES when the remaining findings are WITH_NOTES, NON_BLOCKING, or POLISH.",
    "- Check production-code correctness, regressions, maintainability, and Boy Scout cleanup. Test coverage is assessed later as non-gating quality telemetry; do not review test code.",
    "- Use simple inspection commands with absolute paths from this prompt/context. Do not fail the review because an optional search has no matches or a shell/path typo occurs; retry with a corrected command or continue with the available evidence.",
    "- Avoid fragile shell headings such as `printf '--- heading ---\\n'`; put headings in your Markdown report instead. If an optional diagnostic search may return no matches, make it non-fatal with `|| true`.",
    "- If a tool call fails while gathering evidence, explain the limitation and keep reviewing from the files you can read. Never end the review without one exact `Review Result:` line.",
    "- Do not make code changes in this review step.",
    "- Do not push to remotes.",
  ];
}
