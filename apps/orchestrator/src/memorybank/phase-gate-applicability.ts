import type { FeaturePhaseQualityGateDecision, FeatureQualityGateKind } from "@hepha/shared";
import { cleanInlineMarkdown, extractMarkdownSection } from "./markdown-parsing.js";

/** Compatibility recipes declare applicability in checkpoint sections rather
 * than the native Quality Gate Evidence table. Import obligations, not claimed
 * passes: execution/review evidence must still go through its own validation. */
export function readCompatibilityGateDeclarations(markdown: string) {
  const declarations = new Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>();
  const headings: [FeatureQualityGateKind, RegExp][] = [
    ["tests", /^test verification(?:\s*\([^)]*\))?$/i],
    ["code_review", /^code review(?:\s*\([^)]*\))?$/i],
    ["gherkin_e2e", /^(?:gherkin\/playwright e2e|e2e verification)(?:\s*\([^)]*\))?$/i],
  ];
  for (const [gate, heading] of headings) {
    const section = extractMarkdownSection(markdown, title => heading.test(title));
    const lines = section.split(/\r?\n/).map(line => cleanInlineMarkdown(line)
      .replace(/^[-*]\s+(?:\[[ xX]\]\s*)?/, ""));
    const failure = lines.find(line => /^(?:(?:current code review status|latest review result|status|result)\s*:\s*)?(?:failed|needs changes|blocked|not executed|zero tests discovered)\b/i.test(line));
    const notApplicable = lines.find(line => /^(?:not applicable|not required|n\/a)(?:\s*[:(—–-]|$)/i.test(line));
    const required = lines.find(line => /^required(?:\s*:|\s+(?:for|because|and)\b)/i.test(line));
    if (failure) {
      declarations.set(gate, { gate, status: "missing", evidencePaths: [], justification: `Recorded unresolved gate: ${failure}` });
    } else if (notApplicable) {
      const reason = notApplicable.replace(/^(?:not applicable|not required|n\/a)\s*[:(—–-]?\s*/i, "").replace(/\)\.?$/, "").trim();
      declarations.set(gate, { gate, status: reason ? "not_applicable" : "unknown", evidencePaths: [],
        justification: reason || "Not Applicable was declared without an applicability reason. Verify the phase's deliverable and gate policy." });
    } else if (required) {
      declarations.set(gate, { gate, status: "missing", evidencePaths: [], justification: required });
    }
  }
  const tests = extractMarkdownSection(markdown, title => /^test verification(?:\s*\([^)]*\))?$/i.test(title));
  if (!declarations.has("tests") && /^\s*\*{0,2}commands?\*{0,2}\s*:/im.test(tests)) {
    declarations.set("tests", { gate: "tests", status: "missing", evidencePaths: [], justification: "Configured test commands require execution evidence independently of code review." });
  }
  return declarations;
}

export function reconcileGateApplicability(
  declarations: Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>,
  _codeFiles: string[],
  _hasUiCode: boolean,
) {
  for (const [gate, declaration] of declarations) {
    if (declaration.status !== "not_applicable") continue;
    if (!declaration.justification?.trim()) {
      declarations.set(gate, { ...declaration, status: "unknown",
        justification: "Not Applicable was declared without an applicability reason. Verify the phase's declared gate policy.",
      });
    }
  }
}
