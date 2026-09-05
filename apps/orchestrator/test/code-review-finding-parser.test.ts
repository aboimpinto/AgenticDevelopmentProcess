import { describe, expect, it } from "vitest";
import {
  extractCodeReviewFindings,
  formatCodeReviewFindingForPrompt,
} from "../src/workflows/reviews/code-review-finding-parser.js";

describe("code review finding parser", () => {
  it("parses structured findings while preserving stable identities and required fields", () => {
    const findings = extractCodeReviewFindings([
      "## Findings",
      "### F7 — Unsafe transition",
      "**Severity:** BLOCKER",
      "**Type:** Correctness",
      "**File / Line:** `src/flow.ts:42`",
      "**Finding:** A transition can skip validation.",
      "**Required Change:** Route through the generic gate.",
      "## Conclusion",
      "Changes are required.",
    ].join("\n"));

    expect(findings).toEqual([expect.objectContaining({
      decisionRequirement: expect.stringContaining("Fixer must propose a fix"),
      id: "F7",
      location: "src/flow.ts:42",
      requiredChange: "Route through the generic gate.",
      severity: "BLOCKER",
      summary: "A transition can skip validation.",
      type: "Correctness",
    })]);
  });

  it("combines finding and note tables and classifies their decision requirements", () => {
    const findings = extractCodeReviewFindings([
      "## Findings",
      "| ID | Severity | Type | Location | Finding | Required Change |",
      "| --- | --- | --- | --- | --- | --- |",
      "| NEW-F2 | MUST FIX | Behavior | src/a.ts | Required behavior | Add the guard |",
      "## Notes",
      "| Severity | Type | Location | Finding | Required Change |",
      "| --- | --- | --- | --- | --- |",
      "| POLISH | Style | src/b.ts | Simplify wording | - |",
    ].join("\n"));

    expect(findings.map(({ id, severity }) => ({ id, severity }))).toEqual([
      { id: "NEW-F2", severity: "REQUIRED" },
      { id: "F1", severity: "POLISH" },
    ]);
    expect(findings[1]?.decisionRequirement).toContain("evaluated and recorded");
  });

  it("falls back to bullet findings, strips inline Markdown, and limits the result", () => {
    const report = `## Findings\n${Array.from({ length: 14 }, (_, index) => `- **REQUIRED** \`item-${index}\``).join("\n")}`;
    const findings = extractCodeReviewFindings(report);

    expect(findings).toHaveLength(12);
    expect(findings[0]).toEqual(expect.objectContaining({ id: "F1", severity: "REQUIRED", summary: "REQUIRED item-0" }));
    expect(findings[11]?.id).toBe("F12");
  });

  it("renders all decision metadata for a worker prompt", () => {
    const [finding] = extractCodeReviewFindings([
      "## Findings",
      "### F3: Missing evidence",
      "Severity: NON-BLOCKING",
      "Type: Test",
      "File / Line: src/check.ts:9",
      "Finding: Evidence is incomplete",
      "Required Change: Record the command output",
    ].join("\n"));

    expect(formatCodeReviewFindingForPrompt(finding!)).toContain(
      "F3 [NON_BLOCKING/Test] Location: src/check.ts:9. Finding: Evidence is incomplete. Required change: Record the command output.",
    );
  });
});
