export interface CodeReviewFindingDecisionItem {
  decisionRequirement: string;
  id: string;
  location: string | null;
  requiredChange: string | null;
  severity: string;
  summary: string;
  type: string | null;
}

export function extractCodeReviewFindings(report: string): CodeReviewFindingDecisionItem[] {
  const findingsSection = extractMarkdownSection(report, "Findings");
  const notesSection = extractMarkdownSection(report, "Notes");
  const findings = [
    ...extractSectionItems(findingsSection, null),
    ...extractSectionItems(notesSection, "WITH_NOTES"),
  ];
  return findings.length > 0
    ? reindexFindings(findings).slice(0, 12)
    : extractSectionItems(report, null).slice(0, 12);
}

export function formatCodeReviewFindingForPrompt(finding: CodeReviewFindingDecisionItem): string {
  const metadata = [finding.severity, finding.type].filter(Boolean).join("/");
  return [
    `${finding.id} [${metadata || "UNCLASSIFIED"}]`,
    finding.location ? `Location: ${finding.location}.` : null,
    finding.summary ? `Finding: ${finding.summary}.` : null,
    finding.requiredChange ? `Required change: ${finding.requiredChange}.` : null,
    `Decision requirement: ${finding.decisionRequirement}`,
  ].filter(Boolean).join(" ");
}

function extractSectionItems(markdown: string, defaultSeverity: string | null): CodeReviewFindingDecisionItem[] {
  if (!markdown.trim()) return [];
  const structured = extractStructuredFindings(markdown, defaultSeverity);
  if (structured.length > 0) return structured.slice(0, 12);
  const table = extractTableFindings(markdown, defaultSeverity);
  if (table.length > 0) return table.slice(0, 12);
  const headings = [...markdown.matchAll(/\n###\s+(.+)/g)]
    .map((match) => match[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
  if (headings.length > 0) {
    return headings.slice(0, 12).map((summary, index) => createFinding({
      index,
      severity: inferSeverity(summary) ?? defaultSeverity,
      summary,
    }));
  }
  return markdown.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .slice(0, 12)
    .map((line, index) => {
      const summary = line.replace(/^[-*]\s+/, "");
      return createFinding({ index, severity: inferSeverity(summary) ?? defaultSeverity, summary });
    });
}

function extractStructuredFindings(markdown: string, defaultSeverity: string | null): CodeReviewFindingDecisionItem[] {
  const matches = [...markdown.matchAll(/(?:^|\n)###\s+((?:NEW-)?F\d+)\s*(?:[—:-]\s*([^\n]+))?\n([\s\S]*?)(?=\n###\s+(?:NEW-)?F\d+\b|$)/gi)];
  return matches.map((match, index) => {
    const id = match[1]!.toUpperCase();
    const title = match[2]?.trim() ?? "";
    const body = match[3] ?? "";
    return {
      ...createFinding({
        index,
        location: extractField(body, "File / Line"),
        requiredChange: extractField(body, "Required Change"),
        severity: extractField(body, "Severity") ?? defaultSeverity,
        summary: (extractField(body, "Finding") ?? title) || id,
        type: extractField(body, "Type"),
      }),
      id,
    };
  });
}

function extractField(markdown: string, label: string): string | null {
  const escapedLabel = escapeRegExp(label);
  const match = markdown.match(new RegExp(
    `(?:^|\\n)(?:[-*]\\s+)?(?:\\*\\*)?${escapedLabel}(?:\\*\\*)?\\s*:(?:\\*\\*)?\\s*([^\\n]+)`,
    "i",
  ));
  return match?.[1]?.replace(/\*\*$/, "").trim() || null;
}

function extractMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^\\s*(#{1,6})\\s+(?:\\d+\\.?\\s+)?${escapeRegExp(heading)}\\b`, "i");
  const startIndex = lines.findIndex((line) => headingPattern.test(line));
  if (startIndex < 0) return "";
  const headingLevel = lines[startIndex]!.match(headingPattern)?.[1]?.length ?? 1;
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const nextHeading = lines[index]!.match(/^\s*(#{1,6})\s+/);
    if (nextHeading && nextHeading[1]!.length <= headingLevel) {
      endIndex = index;
      break;
    }
  }
  return lines.slice(startIndex + 1, endIndex).join("\n").trim();
}

function reindexFindings(findings: CodeReviewFindingDecisionItem[]): CodeReviewFindingDecisionItem[] {
  return findings.map((finding, index) => ({
    ...finding,
    id: /^(?:NEW-)?F\d+$/i.test(finding.id) ? finding.id.toUpperCase() : `F${index + 1}`,
  }));
}

function extractTableFindings(markdown: string, defaultSeverity: string | null): CodeReviewFindingDecisionItem[] {
  return markdown.split(/\r?\n/)
    .map(parseTableRow)
    .filter((columns): columns is string[] => Boolean(columns))
    .filter((columns) => !columns.every((column) => column.length === 0 || /^:?-{3,}:?$/.test(column)))
    .filter((columns) => !/^(?:id|severity)$/i.test(columns[0] ?? ""))
    .filter((columns) => columns.length >= 4)
    .map((columns, index) => {
      const hasId = /^(?:NEW-)?F\d+$/i.test(columns[0] ?? "");
      const offset = hasId ? 1 : 0;
      const finding = createFinding({
        index,
        location: columns[offset + 2],
        requiredChange: columns[offset + 4],
        severity: columns[offset] || defaultSeverity,
        summary: columns[offset + 3] ?? "",
        type: columns[offset + 1],
      });
      return hasId ? { ...finding, id: columns[0]!.toUpperCase() } : finding;
    });
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|")
    ? trimmed.slice(1, -1).split("|").map((column) => column.trim())
    : null;
}

function createFinding({
  index,
  location,
  requiredChange,
  severity,
  summary,
  type,
}: {
  index: number;
  location?: string | null;
  requiredChange?: string | null;
  severity?: string | null;
  summary: string;
  type?: string | null;
}): CodeReviewFindingDecisionItem {
  const normalizedSeverity = normalizeSeverity(severity ?? inferSeverity(summary));
  return {
    decisionRequirement: decisionRequirement(normalizedSeverity),
    id: `F${index + 1}`,
    location: normalizeOptionalValue(location),
    requiredChange: normalizeOptionalValue(requiredChange),
    severity: normalizedSeverity,
    summary: truncate(stripInlineMarkdown(summary), 300),
    type: normalizeOptionalValue(type),
  };
}

function normalizeSeverity(value: string | null | undefined): string {
  const normalized = stripInlineMarkdown(value ?? "").replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/gi, "").toUpperCase();
  if (!normalized) return "UNCLASSIFIED";
  if (["BLOCKER", "BLOCKING", "BLOCKED"].includes(normalized)) return "BLOCKER";
  if (["REQUIRED", "MUST_FIX", "MUSTFIX"].includes(normalized)) return "REQUIRED";
  if (["WITH_NOTES", "WITH_NOTE", "NOTE", "NOTES", "APPROVED_WITH_NOTES"].includes(normalized)) return "WITH_NOTES";
  if (["NON_BLOCKING", "NONBLOCKING", "NON_BLOCKER"].includes(normalized)) return "NON_BLOCKING";
  if (["OUT_OF_SCOPE", "OUTOFSCOPE"].includes(normalized)) return "OUT_OF_SCOPE";
  return normalized;
}

function inferSeverity(value: string): string | null {
  return value.match(/\b(BLOCKER|BLOCKING|REQUIRED|WITH[_\s-]?NOTES?|NON[_\s-]?BLOCKING|POLISH|OUT[_\s-]?OF[_\s-]?SCOPE)\b/i)?.[1] ?? null;
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  const normalized = stripInlineMarkdown(value ?? "");
  return !normalized || normalized === "-" || normalized === "—" || /^n\/a$/i.test(normalized)
    ? null
    : truncate(normalized, 220);
}

function decisionRequirement(severity: string): string {
  if (severity === "BLOCKER" || severity === "REQUIRED") {
    return "Fixer must propose a fix, a substantiated rebuttal, or blocked_needs_user. Only the reviewer can accept/defer a rebuttal; a rejected rebuttal keeps this same finding ID open for a code fix.";
  }
  if (["WITH_NOTES", "NON_BLOCKING", "POLISH", "OUT_OF_SCOPE"].includes(severity)) {
    return "Must be evaluated and recorded as fixed, deferred, accepted_risk, rebutted, or follow_up with evidence/rationale.";
  }
  return "Must be classified, evaluated, and assigned a decision before review rerun.";
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
