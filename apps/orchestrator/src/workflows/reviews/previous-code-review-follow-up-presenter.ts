import { resolve } from "node:path";
import type { CodeReviewFailureContextRepository } from "./code-review-failure-context-repository.js";
import {
  extractCodeReviewFindings,
  formatCodeReviewFindingForPrompt,
} from "./code-review-finding-parser.js";

/** Renders reviewer instructions from the newest durable same-phase report. */
export class PreviousCodeReviewFollowUpPresenter {
  constructor(private readonly repository: Pick<CodeReviewFailureContextRepository, "extract" | "findLatest">) {}

  render(featureFolderPath: string, phaseNumber: number, previousFailureBrief: string | null | undefined): string {
    const persistedReport = this.repository.findLatest(featureFolderPath, phaseNumber);
    const context = persistedReport
      ? {
          findings: extractCodeReviewFindings(persistedReport.markdown),
          phaseNumber,
          reportPath: persistedReport.path,
          reviewResult: persistedReport.result,
        }
      : this.repository.extract(previousFailureBrief ?? "");

    if (!context) {
      return [
        "Previous code-review blocker: None detected in the workflow context.",
        "Still include `Previous Review Follow-up: None` in the report.",
      ].join("\n");
    }

    const lines = [
      "Previous code-review blocker detected.",
      `Previous review report: ${context.reportPath}`,
      `Previous review result: ${context.reviewResult}`,
      "",
      "Before writing new findings:",
      `- Read ${context.reportPath} if it exists.`,
      `- Read every persisted Phase ${phaseNumber} code-review report under ${resolve(featureFolderPath, "code-reviews")} newest to oldest. For each finding ID, the latest persisted \`## Fixer Response\` is its fixer position; do not infer or overwrite it from a phase note or decision ledger.`,
      "- Re-check each prior finding against the current workspace.",
      "- In the human-readable `Previous Review Follow-up`, preferably include columns or equivalent prose for: Prior finding, Fixer Decision, Reviewer Decision, Progress since predecessor, Accepted this cycle, Still outstanding, and Evidence / justification.",
      "- For reader clarity, prefer `REDUCED`, `UNCHANGED`, `REGRESSED`, or `RESOLVED` and name the independently verified original obligations accepted in this cycle plus the residual obligations. Stable finding identity does not mean unchanged scope.",
      "- Progress presentation is best-effort and non-authoritative. Its presence, labels, order, columns, or exact wording must not be parsed, validated, used as gate evidence, or cause review/phase failure. The authoritative Reviewer Decision and V1 manifest contract remain unchanged.",
      "- Use exactly one Reviewer Decision token for every prior finding: `FIX_ACCEPTED`, `REBUTTAL_ACCEPTED_DEFERRED`, `REBUTTAL_REJECTED`, `REFRAME_INTO_SCOPE`, `FINDING_OPEN`, `NOT_APPLICABLE`, or `BLOCKED_NEEDS_USER`.",
      "- A `REBUTTAL_PROPOSED` fixer response must be assessed explicitly. `REBUTTAL_ACCEPTED_DEFERRED` records the accepted argument, measurable evidence, deferred risk/owner, and why the phase may proceed. `REBUTTAL_REJECTED` keeps the same finding ID open, states the unmet acceptance evidence, and requires `FIX_PROPOSED`; it is never a NEW finding.",
      "- An `OUTSIDE_OF_SCOPE` fixer response must be assessed explicitly against the approved phase scope. If correct, use `NOT_APPLICABLE` and create the detailed TechnicalDebt entry; if incorrect, issue exactly one fully specified `REFRAME_INTO_SCOPE`. An `ACCEPT_REFRAME` returns to normal fixed-finding verification. A `REJECT_REFRAME` is terminal for this review cycle: use `NOT_APPLICABLE`, create TechnicalDebt, and do not reframe again.",
      "- A `FIX_PROPOSED` response becomes `FIX_ACCEPTED` only after the reviewer independently executes or directly verifies every acceptance-evidence item against the current production code. A failed, skipped, non-executing, or crashing acceptance test is evidence missing: use `FINDING_OPEN`, do not accept the claim, and state the exact remaining work. Do not accept a production change merely because pre-existing tests are green; assess it against the original acceptance contract and its required positive and negative cases.",
      "- If every prior finding is accepted or explicitly deferred by reviewer decision, say so before listing genuinely new findings.",
    ];
    if (context.findings.length > 0) {
      lines.push("", "Prior findings to verify:");
      for (const finding of context.findings) lines.push(`- ${formatCodeReviewFindingForPrompt(finding)}`);
    }
    return lines.join("\n");
  }
}
