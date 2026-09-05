export type CodeReviewReportResult =
  | "APPROVED"
  | "APPROVED_WITH_NOTES"
  | "BLOCKED"
  | "NEEDS_CHANGES"
  | "UNKNOWN";

const recognisedResults = new Set<CodeReviewReportResult>([
  "APPROVED",
  "APPROVED_WITH_NOTES",
  "BLOCKED",
  "NEEDS_CHANGES",
]);

/**
 * Reads the decision from both legacy review markdown and the authoritative
 * V1 review projection. Presentation labels differ, but both represent the
 * same workflow decision and must route through the same fixer circuit.
 */
export function parseCodeReviewReportResult(report: string): CodeReviewReportResult {
  const normalized = report.replaceAll("**", "");
  const value = normalized.match(/(?:^|\n)\s*(?:-\s*)?(?:Review|Safe) Result:\s*([A-Z_]+)/im)?.[1]?.toUpperCase();

  if (value && recognisedResults.has(value as CodeReviewReportResult)) {
    return value as CodeReviewReportResult;
  }

  // A report with a Fixer Response section is a response to a review that
  // found issues — the review's NEEDS_CHANGES result is implicit.
  if (/^##\s+Fixer Response\s*$/im.test(report)) {
    return "NEEDS_CHANGES";
  }

  return "UNKNOWN";
}
