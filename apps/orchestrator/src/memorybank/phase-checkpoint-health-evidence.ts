import type { FeaturePhaseQualityGateDecision } from "@hepha/shared";
import { cleanInlineMarkdown, extractMarkdownSection, isMarkdownTableSeparator } from "./markdown-parsing.js";
import { readCheckpointExecutionRows } from "./phase-checkpoint-test-evidence.js";

type HealthGate = "build" | "lint";
const healthGate = (label: string): HealthGate | undefined => {
  const value = label.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (/^(?:(?:strict|workspace) )?lint(?: typecheck)?$/.test(value) || value === "typecheck") return "lint";
  if (/^(?:build(?: compile| compilation| verification)?|compilation|compile)$/.test(value)) return "build";
  return undefined;
};

/** Legacy recorded outcomes, never fresh execution certification. Quality
 * Metrics is an explicit result table, just like Quality Gate Evidence; a
 * refinement contract or Expected column only declares obligations. */
export function readCheckpointHealthEvidence(markdown: string): FeaturePhaseQualityGateDecision[] {
  const rows = readCheckpointExecutionRows(markdown);
  const metrics = extractMarkdownSection(markdown, heading => /^quality metrics$/i.test(heading)).split(/\r?\n/);
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cleanInlineMarkdown(cell.trim()));
  for (let i = 0; i < metrics.length - 1; i++) {
    if (!isMarkdownTableSeparator(metrics[i + 1]!)) continue;
    const headers = cells(metrics[i]!).map(value => value.toLowerCase());
    const nameIndex = headers.findIndex(value => /^(?:metric|gate|check)$/.test(value));
    const resultIndex = headers.findIndex(value => /^(?:value|result|outcome|actual)$/.test(value));
    if (nameIndex < 0 || resultIndex < 0) continue;
    for (let row = i + 2; row < metrics.length && /^\s*\|/.test(metrics[row]!); row++) {
      const values = cells(metrics[row]!);
      rows.push({ label: values[nameIndex] ?? "", result: values[resultIndex] ?? "", command: "" });
    }
  }
  const decisions = new Map<HealthGate, FeaturePhaseQualityGateDecision>();
  for (const { label, command, result } of rows) {
    const gate = healthGate(label);
    if (!gate) continue;
    const failed = /^(?:fail(?:ed)?|error|blocked|not executed)\b/i.test(result)
      || /\b[1-9]\d*\s+(?:errors?|failed|failures|warnings?)\b/i.test(result)
      || /\b(?:failed|failures|errors?|warnings?)\s*[:=]?\s*[1-9]\d*\b/i.test(result)
      || /\bexit(?: code)?\s*[:=]?\s*[1-9]\d*\b/i.test(result);
    const applicability = /^(?:n\/?a|not applicable|not required)\b\s*[:(—-]?\s*(.+)/i.exec(result);
    const status = failed ? "missing" : applicability?.[1]?.replace(/[).\s]/g, "") ? "not_applicable"
      : /^(?:pass(?:ed)?|ok|satisfied)\b/i.test(result) ? "satisfied" : "unknown";
    const previous = decisions.get(gate);
    // A current unresolved result is not erased by a green summary elsewhere.
    if (previous?.status === "missing" || (previous?.status === "unknown" && status === "satisfied")) continue;
    decisions.set(gate, { gate, status, evidencePaths: [],
      justification: `${failed ? "Recorded unresolved gate:" : "Recorded checkpoint execution:"} ${label}; ${command}; ${result}` });
  }
  return [...decisions.values()];
}
