import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

/** Builds the report-only contract used to repair missing canonical fixer responses. */
export function buildFixerResponseRepairPrompt(
  project: StoredProject,
  feature: WorkItemCard,
  options: { missingResponseIds: readonly string[]; reportPath: string },
) {
  return [
    "You are Hepha's constrained Fixer Response Repair Agent.",
    "This is report-contract repair only, not normal phase implementation or a code-review rerun.",
    "",
    "Non-negotiable scope:",
    `- Edit only this latest review report: ${options.reportPath}`,
    `- Required missing Fixer Response IDs: ${options.missingResponseIds.join(", ")}`,
    "- Do not edit source code, tests, FeatureTasks.md, phase documents, review findings, review result, or any file other than that report.",
    "- The reviewer-owned report content is immutable: do not alter, delete, reorder, or paraphrase findings or their table.",
    "- The only canonical response container is an exact top-level `## Fixer Response` heading. A `### Review Finding Decision Ledger`, a table row, or `### F1` headings outside that container do not count. If the exact heading is absent, append `## Fixer Response` before adding or repairing entries. Preserve all existing complete canonical entries exactly; append missing `### <ID>` entries under that heading, or repair only an incomplete canonical entry for one listed ID.",
    "- Use one exact `Fixer Decision` token per listed ID: `FIX_PROPOSED`, `REBUTTAL_PROPOSED`, `OUTSIDE_OF_SCOPE`, `ACCEPT_REFRAME`, `REJECT_REFRAME`, or `BLOCKED_NEEDS_USER`. Do not write Fixed, Rebutted, Deferred, Accepted, or other synonyms. Every entry must include Files or Files / symbols and Verification with the exact focused command/result. A `FIX_PROPOSED` or `ACCEPT_REFRAME` must also include `Acceptance evidence` (or `Measured evidence`) mapping every original reviewer acceptance-evidence item to an exact executed, passing test/check; generic green-suite claims are insufficient. `REBUTTAL_PROPOSED`, `OUTSIDE_OF_SCOPE`, and `REJECT_REFRAME` must also include a detailed Argument/Contract basis/Scope basis and Acceptance evidence or Measured evidence. A rebuttal is only a proposal: do not claim it is accepted, deferred, or closed.",
    "- Do not request, perform, or claim a review rerun. Do not resume ordinary phase work.",
    "- Before returning, verify that the exact `## Fixer Response` heading exists and every listed ID is beneath it with its complete decision-specific field set: Files / symbols and Verification for every decision; Acceptance evidence or Measured evidence for `FIX_PROPOSED`/`ACCEPT_REFRAME`; and Argument/Contract basis/Scope basis plus Acceptance evidence or Measured evidence for `REBUTTAL_PROPOSED`/`OUTSIDE_OF_SCOPE`/`REJECT_REFRAME`.",
    "",
    `Project: ${project.name}`,
    `Project root: ${project.rootPath}`,
    `FEAT: ${feature.externalId} - ${feature.title}`,
    "",
    "Return a concise Markdown summary with the report path, IDs repaired, and validation performed.",
  ].join("\n");
}
