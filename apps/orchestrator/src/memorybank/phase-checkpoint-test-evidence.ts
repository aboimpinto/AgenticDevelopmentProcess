import type { FeaturePhaseQualityGateDecision } from "@hepha/shared";
import { cleanInlineMarkdown, extractMarkdownSection, isMarkdownTableSeparator } from "./markdown-parsing.js";

export interface CheckpointExecutionRow { label: string; command: string; result: string }

// Use the same counted-unit vocabulary for row discovery, passing execution and
// failure detection. A suite's noun must not change its recorded outcome.
const countedUnit = "(?:tests?|test cases?|fixtures?|checks?|cases?|scenarios?|specs?)";
const countedResult = new RegExp(`\\b\\d+(?:/\\d+)?\\s+(?:${countedUnit}\\s+)?(?:passed|failed|ok)\\b`, "i");
const passedResult = new RegExp(`(?<![\\d/])\\b([1-9]\\d*)(?:/(\\d+))?\\s+(?:${countedUnit}\\s+)?(?:passed|ok)\\b`, "i");
const failedResult = new RegExp(`\\b[1-9]\\d*\\s+(?:${countedUnit}\\s+)?(?:failed|failures|errors?|warnings?)\\b`, "i");
const reversedFailure = new RegExp(`\\b(?:failed|failures|errors?|warnings?)\\s*(?:${countedUnit}\\s*)?[:=]?\\s*[1-9]\\d*\\b`, "i");

/** Expected outcomes are never execution results. Keep legacy table adaptation
 * separate from native JSON evidence and independent of runner/suite names. */
export function readCheckpointExecutionRows(markdown: string): CheckpointExecutionRow[] {
  const section = extractMarkdownSection(markdown, heading => /^(?:phase checkpoint\b|test verification\b|verification results$|quality gates$)/i.test(heading));
  const lines = section.split(/\r?\n/);
  const rows: CheckpointExecutionRow[] = [];
  const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(value => value.trim());
  for (let index = 0; index < lines.length - 1; index++) {
    if (!isMarkdownTableSeparator(lines[index + 1]!)) continue;
    const headings = cells(lines[index]!).map(value => cleanInlineMarkdown(value).toLowerCase());
    const nameIndex = headings.findIndex(value => /^(?:gate|suite|check|test)$/.test(value));
    const commandIndex = headings.indexOf("command");
    const resultIndex = headings.findIndex(value => /^(?:result|outcome|actual)$/.test(value));
    if ([nameIndex, commandIndex, resultIndex].some(value => value < 0)) continue;
    for (let row = index + 2; row < lines.length && /^\s*\|/.test(lines[row]!); row++) {
      const values = cells(lines[row]!);
      const label = cleanInlineMarkdown(values[nameIndex] ?? "");
      const command = (values[commandIndex] ?? "").replace(/^`+|`+$/g, "");
      const result = cleanInlineMarkdown(values[resultIndex] ?? "");
      rows.push({ label, command, result });
    }
  }
  return rows;
}

/** Import recorded checkpoint execution into the phase projection, not fresh
 * readiness certification. Column positions and runner names are not fixed. */
export function readCheckpointTestEvidence(markdown: string): FeaturePhaseQualityGateDecision | undefined {
  const decisions: Array<FeaturePhaseQualityGateDecision & { supportingSummary: boolean }> = [];
  for (const { label, command, result } of readCheckpointExecutionRows(markdown)) {
    // Suite names describe intent, not necessarily the test runner. Recorded
    // counts and explicit test commands also identify verification rows.
    if (/coverage|supporting|compile|discovery|e2e|gherkin|playwright/i.test(label)) continue;
    const testRow = /\b(?:tests?|units?|regressions?|fixtures?|suite)\b/i.test(label)
      || /(?:^|[\s/])(?:--test|test|pytest|vitest|jest)(?:\s|$)|\btest_[^/\s]+\.py\b/i.test(command)
      || countedResult.test(result);
    if (!testRow) continue;
    const failed = /^(?:fail(?:ed)?|blocked|not executed)\b/i.test(result)
      || failedResult.test(result)
      || reversedFailure.test(result)
      || /\bexit(?: code)?\s*[:=]?\s*[1-9]\d*\b/i.test(result)
      || /(?:required (?:tests?|coverage).*?(?:missing|skipped|ignored|not executed)|missing (?:required )?coverage)/i.test(result);
    const passedCount = passedResult.exec(result)
      ?? /(?<![\d/])\b([1-9]\d*)\/(\d+)(?=\s*(?:[,;]|$))/i.exec(result);
    const discoveryOnly = /(?:^|\s)--(?:list(?:Tests)?|list-tests|collect-only|no-run)(?:\s|=|$)/i.test(command);
    const executed = !!command && !discoveryOnly
      && /^(?:pass(?:ed)?|ok)\b/i.test(result)
      && (passedCount ? (!passedCount[2] || Number(passedCount[1]) === Number(passedCount[2])) : hasPassingPartitions(result));
    const supportingSummary = !!command && !discoveryOnly && !failed && !/required/i.test(result) && /\bexit 0\b/i.test(result)
      && (/\b(?:no(?: [\w-]+)?|0|zero) tests\b/i.test(result)
        || /^pass(?:ed)?\s*[-—:]?\s*exit 0(?:,\s*(?:0|zero) warnings)?$/i.test(result));
    decisions.push({ supportingSummary, gate: "tests", status: failed ? "missing" : executed ? "satisfied" : "unknown",
      evidencePaths: [], justification: `Recorded checkpoint execution: ${label}; ${command}; ${result}` });
  }
  if (!decisions.length) return undefined;
  const hasExecution = decisions.some(d => d.status === "satisfied");
  return { gate: "tests", evidencePaths: [], status: decisions.some(d => d.status === "missing") ? "missing"
    : !hasExecution || decisions.some(d => d.status === "unknown" && !d.supportingSummary) ? "unknown" : "satisfied",
    justification: decisions.map(d => d.justification).join("\n") };
}

/** A PASS summary may give named partition counts rather than repeat "passed"
 * after each count. Require explicit zero failures and positive execution
 * partitions; timing, retries and skipped counts cannot supply that evidence. */
function hasPassingPartitions(result: string): boolean {
  if (!/\b0 (?:failed|failures)\b/i.test(result)) return false;
  const partitions = result.replace(/^pass(?:ed)?\s*[-—:]?\s*/i, "").split(/[,;]/)
    .map(part => /^\s*([a-z][\w -]*?)\s+(\d+)\s*$/i.exec(part));
  return partitions.some(part => part && Number(part[2]) > 0
    && !/\b(?:skip\w*|ignor\w*|fail\w*|warn\w*|duration|elapsed|time|retries|retry|exit|seed|total|discovered|listed|collected)\b/i.test(part[1]!));
}
