import type { FeaturePhaseQualityGateDecision, FeatureQualityGateKind } from "@hepha/shared";
import type { PhaseGateFlags } from "../exchanges/phase-gates.js";
import { extractMarkdownSection } from "./markdown-parsing.js";

/** Portable applicability declarations are not execution receipts. Canonical
 * gate records and independently configured execution results remain authoritative. */
export function applyPhaseGateDeclarations(
  markdown: string,
  documentPath: string,
  gates: Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>,
  preserveTestExecution: boolean,
  reviewEvidenceAvailable = false,
) {
  const section = extractMarkdownSection(markdown, heading => /^phase gate declarations$/i.test(heading));
  if (!section.trim()) return;
  const blocks = [...section.matchAll(/^```json\s*\r?\n([\s\S]*?)^```\s*$/gm)];
  let flags: Partial<PhaseGateFlags> = {};
  try {
    const value: unknown = blocks.length === 1 ? JSON.parse(blocks[0]![1]!) : null;
    if (value && typeof value === "object" && !Array.isArray(value)) flags = value;
  } catch { /* Invalid declarations remain unresolved; never coerce a waiver. */ }
  const reason = section.match(/^\*\*Scope justification:\*\*[ \t]*(\S[^\r\n]*)/m)?.[1]?.trim();
  for (const [gate, flag] of [["tests", "needTestCoverage"], ["code_review", "needCodeReview"]] as const) {
    const recorded = gates.get(gate);
    // False coverage does not waive independently assigned regression execution.
    if ((gate === "tests" && preserveTestExecution) || recorded?.justification?.startsWith("Recorded unresolved gate:")) continue;
    const required = flags[flag];
    if (typeof required !== "boolean" || (!required && !reason)) {
      gates.set(gate, { gate, status: "unknown", evidencePaths: [documentPath],
        justification: `Phase Gate Declarations must provide boolean ${flag} and a scope justification for non-applicability.` });
    } else if (!required) {
      gates.set(gate, { gate, status: "not_applicable", evidencePaths: [documentPath], justification: `${flag}: false. ${reason}` });
    } else if (!recorded || ["not_applicable", "waived"].includes(recorded.status)) {
      // Required is an obligation, not a verdict. Let the indexed report
      // evaluator decide approval/rejection rather than shadowing it here.
      if (gate === "code_review" && reviewEvidenceAvailable) { gates.delete(gate); continue; }
      gates.set(gate, { gate, status: "missing", evidencePaths: [documentPath],
        justification: `${flag}: true. Record the required ${gate === "tests" ? "test/acceptance-coverage" : "code-review"} evidence.` });
    }
  }
}
