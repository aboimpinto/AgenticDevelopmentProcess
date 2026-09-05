export interface ReviewRemediationFinding {
  readonly id: string;
  readonly severity: string;
}

export interface ReviewRemediationAssessment {
  readonly missingResponses: readonly string[];
  readonly readyForRerun: boolean;
}

const fixerDecisionPattern = "FIX_PROPOSED|REBUTTAL_PROPOSED|OUTSIDE_OF_SCOPE|ACCEPT_REFRAME|REJECT_REFRAME|BLOCKED_NEEDS_USER";

/**
 * The reviewer-owned finding section is immutable. Fixers append one response
 * for every blocking/required ID before Hepha permits a review rerun. A
 * rebuttal is a proposal, never a fixer-owned closure: the next reviewer must
 * explicitly accept or reject it.
 */
export function assessReviewRemediationContract(report: string): ReviewRemediationAssessment {
  const reviewerSection = report.split(/^##\s+Fixer Response\s*$/im, 1)[0] ?? report;
  const required = extractRequiredFindingIds(reviewerSection);
  const responseSection = report.match(/^##\s+Fixer Response\s*$([\s\S]*)$/im)?.[1] ?? "";
  const missingResponses = required
    .filter((finding) => !hasCompleteFixerResponse(responseSection, reviewerSection, finding.id))
    .map((finding) => finding.id);

  return { missingResponses, readyForRerun: missingResponses.length === 0 };
}

function extractRequiredFindingIds(markdown: string): ReviewRemediationFinding[] {
  const structuredFindings = [...markdown.matchAll(
    /^###\s+((?:NEW-)?F\d+)\b[^\n]*\n([\s\S]*?)(?=^###\s+|^##\s+|$(?![\s\S]))/gim,
  )]
    .map((match) => ({
      id: match[1]!.toUpperCase(),
      severity: match[2]?.match(/(?:^|\n)\s*(?:-\s+)?(?:\*\*)?Severity(?:\*\*)?\s*:\s*(BLOCKER|REQUIRED)\b/i)?.[1]?.toUpperCase() ?? "",
    }))
    .filter((finding) => finding.severity === "BLOCKER" || finding.severity === "REQUIRED");

  // New reports express each finding as its own vertical section. Prefer
  // those sections so the reviewer’s historical assessment table can never
  // be mistaken for a current fixer response requirement.
  if (structuredFindings.length > 0) {
    return structuredFindings;
  }

  const findings: ReviewRemediationFinding[] = [];
  let fallbackIndex = 1;

  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\|/.test(line) || /^\|\s*(?:-+|Severity|ID)\b/i.test(line)) continue;
    const columns = line.split("|").slice(1, -1).map((value) => value.trim());
    const severityIndex = columns.findIndex((value) => /^(BLOCKER|REQUIRED)$/i.test(value));
    if (severityIndex === -1) continue;
    const explicitId = columns.find((value) => /^(?:NEW-)?F\d+$/i.test(value)) ?? columns.join(" ").match(/\b((?:NEW-)?F\d+)\b/i)?.[1];
    findings.push({ id: (explicitId ?? `F${fallbackIndex}`).toUpperCase(), severity: columns[severityIndex]!.toUpperCase() });
    fallbackIndex += 1;
  }

  return findings;
}

function hasCompleteFixerResponse(responseSection: string, reviewerSection: string, findingId: string) {
  const match = responseSection.match(new RegExp(`^###\\s+[^\\n]*\\b${findingId}\\b[^\\n]*([\\s\\S]*?)(?=^###\\s+|(?!(?:[\\s\\S])))`, "im"));
  if (!match) return false;
  const response = match[1] ?? "";

  // A field label can be a bullet, a Markdown heading, or a table cell.  The
  // writer-facing prompt uses conventional Markdown such as
  // `**Fixer Decision:**` and `#### Verification:`; accepting only a colon
  // *inside* bold text makes Hepha reject the format it asks agents to write.
  const decision = response.match(new RegExp("(?:^\\s*(?:-\\s+)?(?:\\*\\*(?:Fixer )?Decision:?\\*\\*:?|(?:Fixer )?Decision:)\\s*(?:✅\\s*)?|^\\s*#{3,6}\\s+(?:Fixer )?Decision\\s*:?\\s*(?:✅\\s*)?|^\\s*\\|\\s*(?:Fixer )?Decision\\s*\\|\\s*)`?(" + fixerDecisionPattern + ")\\b`?", "im"))?.[1]?.toUpperCase();
  if (!decision) return false;

  const reviewerHasReframed = hasReviewerReframe(reviewerSection, findingId);
  // Scope arbitration is deliberately a one-shot protocol. A developer can
  // reject a fresh out-of-scope request, or accept/reject the reviewer's one
  // evidence-backed reframe, but cannot bounce between the two states.
  if ((decision === "ACCEPT_REFRAME" || decision === "REJECT_REFRAME") && !reviewerHasReframed) return false;
  if (decision === "OUTSIDE_OF_SCOPE" && reviewerHasReframed) return false;

  // A fixer may describe the same concrete evidence as "File changes" or
  // "Changed production symbols".  Those labels remain verifiable file/symbol
  // evidence and must not create a false missing-response repair loop.
  // File/symbol evidence is often a readable heading followed by a bounded
  // bullet list. Requiring the first path on the heading line falsely marks a
  // complete response as missing and creates an unnecessary repair loop.
  const hasFiles = /(?:^\s*(?:-\s+)?(?:\*\*(?:Files|Files \/ symbols|File changes|Changed production symbols)(?: changed)?:?\*\*:?|(?:Files|Files \/ symbols|File changes|Changed production symbols)(?: changed)?:)|^\s*#{3,6}\s+(?:Files|Files \/ symbols|File changes|Changed production symbols)(?: changed)?\s*:?|^\s*\|\s*(?:Files|Files \/ symbols|File changes|Changed production symbols)\s*\|\s*)/im.test(response);
  const hasVerification = /(?:^\s*(?:-\s+)?(?:\*\*Verification(?:\s*\([^)]*\))?:?\*\*:?|Verification(?:\s*\([^)]*\))?:)\s*|^\s*#{3,6}\s+Verification(?:\s*\([^)]*\))?\s*:?\s*|^\s*\|\s*Verification(?:\s*\([^)]*\))?\s*\|\s*)\S/im.test(response);
  if (!hasFiles || !hasVerification) return false;

  // A code-fix proposal cannot be ready for an independent review merely by
  // claiming that a generic test ran. It must connect the reviewer-owned
  // acceptance contract to an executed, passing result. The reviewer still
  // owns acceptance and reruns this evidence independently.
  if (decision === "FIX_PROPOSED" || decision === "ACCEPT_REFRAME") {
    // Fixer evidence commonly qualifies the heading, for example
    // `**Acceptance evidence (mapped to acceptance matrix):**`.  That is
    // still the canonical evidence field; do not send a complete response
    // into a repair loop merely because its label adds useful clarification.
    // Keep the evidence field semantic rather than brittle about its readable
    // qualifier: `Acceptance evidence mapping (reviewer matrix):` is the
    // same required field as `Acceptance evidence:`.
    const hasAcceptanceEvidence = /(?:^\s*(?:-\s+)?(?:\*\*(?:Acceptance(?: evidence)?|Measured evidence)[^:\n]*:?\*\*:?|(?:Acceptance(?: evidence)?|Measured evidence)[^:\n]*:)|^\s*#{3,6}\s+(?:Acceptance(?: evidence)?|Measured evidence)[^:\n]*:?|^\s*\|\s*(?:Acceptance(?: evidence)?|Measured evidence)\s*\|\s*)/im.test(response);
    // Verification is normally a heading followed by one or more evidence
    // bullets. The prior expression inspected only the heading line, so a
    // legitimate `Verification:` block whose PASS result appeared below it
    // was repeatedly misclassified as incomplete and sent into repair loops.
    const hasPassingResult = /\b(?:pass(?:ed|es)?|green|0\s+fail(?:ures?)?)\b/im.test(response);
    if (!hasAcceptanceEvidence || !hasPassingResult) return false;
  }

  const needsDetailedJustification = decision === "REBUTTAL_PROPOSED" || decision === "OUTSIDE_OF_SCOPE" || decision === "REJECT_REFRAME";
  return !needsDetailedJustification || (
    /(?:\*\*(?:Argument(?: or Contract basis)?|Contract basis|Rationale|Scope basis|Out-of-scope rationale|Reframe rejection rationale):?\*\*:?|^\s*#{3,6}\s+(?:Argument(?: or Contract basis)?|Contract basis|Rationale|Scope basis|Out-of-scope rationale|Reframe rejection rationale)\s*:?|^\s*\|\s*(?:Argument(?: or Contract basis)?|Contract basis|Rationale|Scope basis|Out-of-scope rationale|Reframe rejection rationale)\s*\|\s*)[\s\S]*?\S/im.test(response) &&
    /(?:\*\*(?:Acceptance evidence|Measured evidence):?\*\*:?|^\s*#{3,6}\s+(?:Acceptance evidence|Measured evidence)\s*:?|^\s*\|\s*(?:Acceptance evidence|Measured evidence)\s*\|\s*)[\s\S]*?\S/im.test(response)
  );
}

function hasReviewerReframe(reviewerSection: string, findingId: string) {
  const finding = reviewerSection.match(new RegExp(`^###\\s+[^\\n]*\\b${findingId}\\b[^\\n]*([\\s\\S]*?)(?=^###\\s+|^##\\s+|$(?![\\s\\S]))`, "im"));
  return /\bREFRAME_INTO_SCOPE\b/.test(finding?.[1] ?? reviewerSection);
}
