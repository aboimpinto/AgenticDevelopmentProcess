// ---------------------------------------------------------------------------
// manual-test-verification-presentation.ts — FEAT-045 Phase 4: Presentation
//
// Deterministic rendering of manual test verification content.
// No I/O, no filesystem access, no HTTP handling.
// ---------------------------------------------------------------------------

import type {
  AutomatedEvidenceSummary,
  ManualTestPackStatus,
  ManualTestSourceManifestEntry,
  ManualTestResultRecord,
} from "./manual-test-verification-types.js";
import type { ManualTestCase, CoverageMapEntry } from "./manual-test-verification-policy.js";

// ---------------------------------------------------------------------------
// Markdown Rendering
// ---------------------------------------------------------------------------

/**
 * Options for rendering the full verification pack Markdown.
 */
export interface PackMarkdownOptions {
  readonly featId: string;
  readonly featTitle: string;
  readonly epicId: string | null;
  readonly packVersion: string;
  readonly generatedAt: string;
  readonly stateLabel: string;
  readonly applicability?: "applicable" | "not_applicable" | "incomplete";
  readonly manifestEntries: readonly ManualTestSourceManifestEntry[];
  readonly coverageMap: readonly CoverageMapEntry[];
  readonly tests: readonly ManualTestCase[];
  readonly invalidManualTests?: readonly { readonly id: string; readonly errors: readonly string[] }[];
  readonly automatedEvidence?: readonly AutomatedEvidenceSummary[];
  readonly deferredSurfaces?: readonly string[];
  readonly failedTests: readonly ManualTestResultRecord[];
  readonly howToFailInstructions: string;
}

/**
 * Render the full deterministic Markdown verification pack.
 */
export function renderPackMarkdown(options: PackMarkdownOptions): string {
  const {
    featId,
    featTitle,
    epicId,
    packVersion,
    generatedAt,
    stateLabel,
    applicability: explicitApplicability,
    manifestEntries,
    coverageMap,
    tests,
    failedTests,
    howToFailInstructions,
    invalidManualTests = [],
    automatedEvidence = [],
    deferredSurfaces = [],
  } = options;
  const applicability = explicitApplicability ?? (tests.length > 0 ? "applicable" : "incomplete");

  const lines: string[] = [];

  // Header
  lines.push(`# Manual Test Verification Pack`);
  lines.push(``);
  lines.push(`**Feature:** ${escapeMdText(featId)} — ${escapeMdText(featTitle)}`);
  if (epicId) lines.push(`**Epic:** ${escapeMdText(epicId)}`);
  lines.push(`**Pack Version:** ${escapeMdText(packVersion)}`);
  lines.push(`**Generated:** ${escapeMdText(generatedAt)}`);
  lines.push(`**Status:** ${escapeMdText(stateLabel)}`);
  lines.push(`**Manual Testing:** ${applicability === "not_applicable" ? "NOT APPLICABLE" : applicability === "applicable" ? "APPLICABLE" : "INCOMPLETE"}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Source Manifest
  lines.push(`## Source Manifest`);
  lines.push(``);
  lines.push(`The following source criteria were used to generate this pack:`);
  lines.push(``);
  lines.push(`| Source ID | Category | Criterion (preview) |`);
  lines.push(`| --- | --- | --- |`);
  for (const entry of manifestEntries) {
    const preview = escapeMdTableText(entry.criterionPreview);
    lines.push(`| ${escapeMdTableText(entry.sourceId)} | ${escapeMdTableText(entry.category)} | ${preview} |`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Coverage Map
  lines.push(`## Acceptance Criterion Classification`);
  lines.push(``);
  lines.push(`| Source ID | Classification | Manual Test | Evidence / Rationale |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (let index = 0; index < coverageMap.length; index += 1) {
    const entry = coverageMap[index]!;
    if (index > 0 && index % 12 === 0) {
      lines.push(``);
      if (index % 24 === 0) lines.push(`<!-- page-break -->`);
      lines.push(`| Source ID | Classification | Manual Test | Evidence / Rationale |`);
      lines.push(`| --- | --- | --- | --- |`);
    }
    const status = entry.coverageStatus === "manual" ? "Manual" :
      entry.coverageStatus === "automated" ? "Automated" :
      entry.coverageStatus === "deferred" ? "Deferred" : "Uncovered";
    const testId = entry.manualTestId ?? "—";
    const evidence = entry.evidence ?? [];
    const rationale = evidence.length > 0
      ? escapeMdTableText(evidence.map(compactEvidenceReference).join("; "))
      : entry.rationale ? escapeMdTableText(entry.rationale) : "—";
    lines.push(`| ${escapeMdTableText(entry.sourceId)} | ${status} | ${escapeMdTableText(testId)} | ${rationale} |`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  lines.push(`## Automated Evidence`);
  lines.push(``);
  if (automatedEvidence.length === 0) {
    lines.push(`No authoritative automated execution results were discovered.`);
  } else {
    lines.push(`| Check | Execution Status | Detail |`);
    lines.push(`| --- | --- | --- |`);
    for (const evidence of automatedEvidence) {
      const status = evidence.status === "executed-passed" ? "Executed - Passed"
        : evidence.status === "executed-failed" ? "Executed - Failed"
          : evidence.status === "zero-tests-discovered" ? "Zero tests discovered"
            : "Not executed";
      const source = evidence.sourcePath ? ` Source: ${compactPath(evidence.sourcePath)}.` : "";
      lines.push(`| ${escapeMdTableText(evidence.title)} | ${status} | ${escapeMdTableText(`${evidence.detail}${source}`)} |`);
    }
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  if (deferredSurfaces.length > 0) {
    lines.push(`## Deferred Surfaces`);
    lines.push(``);
    for (const surface of deferredSurfaces) lines.push(`- ${escapeMdText(surface)}`);
    lines.push(``);
    lines.push(`These surfaces are not implemented by this feature and must not be presented as its manual tests.`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Failed Tests Summary (if any)
  if (failedTests.length > 0) {
    lines.push(`## Failed Tests Summary`);
    lines.push(``);
    lines.push(`The following tests failed during manual verification:`);
    lines.push(``);
    lines.push(`| Test ID | Result | Actual Result | Finding ID |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const result of failedTests) {
      const findingId = result.findingId ?? "—";
      lines.push(`| ${escapeMdTableText(result.testId)} | FAIL | ${escapeMdTableText(result.actualResult ?? "—")} | ${escapeMdTableText(findingId)} |`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  if (tests.length > 0) {
    lines.push(`## Recording Test Failures`);
    lines.push(``);
    lines.push(howToFailInstructions);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Test Cases
  lines.push(`## Manual Test Cases`);
  lines.push(``);

  if (applicability === "not_applicable") {
    lines.push(`Manual Tests: Not Applicable. No human-operable surface is implemented by this feature; use the automated evidence above.`);
    lines.push(``);
  } else if (tests.length === 0) {
    lines.push(`No valid executable manual test cases were generated. This package is not ready.`);
    lines.push(``);
  }

  if (invalidManualTests.length > 0) {
    lines.push(`### Rejected Manual Case Definitions`);
    lines.push(``);
    for (const invalid of invalidManualTests) {
      lines.push(`- ${escapeMdText(invalid.id)}: ${escapeMdText(invalid.errors.join(" "))}`);
    }
    lines.push(``);
  }

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    lines.push(`### ${escapeMdText(test.id)}: ${escapeMdText(test.title)}`);
    lines.push(``);
    lines.push(`**Purpose:** ${escapeMdText(test.purpose)}`);
    lines.push(``);
    if (test.sourceIds.length > 0) {
      lines.push(`**Source Criteria:** ${test.sourceIds.map((s) => `\`${escapeMdText(s)}\``).join(", ")}`);
      lines.push(``);
    }
    lines.push(`**Role:** ${escapeMdText(test.role)}`);
    lines.push(``);
    lines.push(`**Application / Interface:** ${escapeMdText(test.application)}`);
    lines.push(``);
    if (test.preconditions.length > 0) {
      lines.push(`**Preconditions:**`);
      for (const pre of test.preconditions) {
        lines.push(`- ${escapeMdText(pre)}`);
      }
      lines.push(``);
    }
    lines.push(`**Test Account / Setup Data:** ${escapeMdText(test.setupData ?? "Not specified")}`);
    lines.push(``);
    lines.push(`**Steps:**`);
    for (let s = 0; s < test.steps.length; s++) {
      const step = test.steps[s];
      if (step !== undefined) {
        lines.push(`${s + 1}. ${escapeMdText(step)}`);
      }
    }
    lines.push(``);
    lines.push(`**Expected Result:** ${escapeMdText(test.expectedResult)}`);
    lines.push(``);
    lines.push(`**Result:** \`[ ] PASS\`  \`[ ] FAIL\``);
    lines.push(``);
    lines.push(`**Actual Result:**`);
    lines.push(``);
    lines.push(` `);
    lines.push(``);
    lines.push(`**Notes / Evidence:**`);
    lines.push(``);
    lines.push(` `);
    lines.push(``);
    if (i < tests.length - 1) {
      lines.push(`---`);
      lines.push(``);
    }
  }

  // Footer
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Generated by Hepha Manual Test Verification — ${escapeMdText(packVersion)}*`);
  lines.push(``);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// HTML Rendering (for PDF conversion)
// ---------------------------------------------------------------------------

/**
 * Render print-safe HTML from the verification pack Markdown content.
 * Designed for PDF generation via Playwright's page.pdf().
 */
export function renderPackHtml(markdownContent: string, _packVersion: string): string {
  return renderMarkdownDocumentHtml(
    markdownContent,
    "",
  );
}

/** Render trusted local Markdown as print-safe HTML without browser headers or footers. */
export function renderMarkdownDocumentHtml(markdownContent: string, footerNote: string): string {
  const escapedTitle = escapeHtml(markdownContent.split("\n")[0] ?? "Manual Test Verification Pack");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapedTitle}</title>
<style>
  @page {
    margin: 20mm 15mm;
    @bottom-center {
      content: counter(page) " / " counter(pages);
      font-size: 9pt;
      color: #666;
    }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
    max-width: 210mm;
    margin: 0 auto;
    padding: 0;
  }
  h1 { font-size: 18pt; border-bottom: 2px solid #333; padding-bottom: 4pt; margin-top: 0; }
  h2 { font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; margin-top: 24pt; break-after: avoid; page-break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 18pt; break-after: avoid; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 12pt 0; font-size: 10pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #ccc; padding: 4pt 8pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #f5f5f5; font-weight: 600; }
  .classification-table th:nth-child(1) { width: 12%; }
  .classification-table th:nth-child(2) { width: 15%; }
  .classification-table th:nth-child(3) { width: 14%; }
  .classification-table th:nth-child(4) { width: 59%; }
  .classification-table th:nth-child(-n+3), .classification-table td:nth-child(-n+3) { overflow-wrap: normal; }
  .classification-table { break-inside: avoid; page-break-inside: avoid; }
  code { background: #f0f0f0; padding: 1pt 3pt; border-radius: 2pt; font-size: 10pt; }
  pre { background: #f8f8f8; padding: 8pt; border: 1px solid #ddd; border-radius: 4pt; font-size: 9pt; }
  hr { border: none; border-top: 1px solid #ddd; margin: 18pt 0; }
  .page-break { page-break-before: always; }
  .footer-note { color: #888; font-size: 9pt; text-align: center; margin-top: 24pt; }
  ul, ol { margin: 6pt 0; padding-left: 24pt; }
  li { margin: 3pt 0; }
  strong { font-weight: 600; }
</style>
</head>
<body>
${renderMarkdownToSafeHtml(markdownContent)}
${footerNote ? `<div class="footer-note">${escapeHtml(footerNote)}</div>` : ""}
</body>
</html>`;
}

/**
 * Simple Markdown-to-safe-HTML converter for the pack template.
 * This is intentionally limited — only the subset used in pack templates.
 * For full Markdown rendering the adapter may use a proper library.
 */
export function renderMarkdownToSafeHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlLines: string[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableAlign = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = parseMarkdownTableCells(trimmed)
        .map((cell) => renderInlineMarkdown(cell.trim()));

      // Alignment row
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        tableAlign = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
        const tableClass = tableHeaders.includes("Classification") ? " class=\"classification-table\"" : "";
        htmlLines.push(`<table${tableClass}>`);
        htmlLines.push("<thead><tr>" + tableHeaders.map((h) => `<th>${h}</th>`).join("") + "</tr></thead>");
        htmlLines.push("<tbody>");
      } else {
        htmlLines.push("<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>");
      }
      continue;
    }

    // Close table if we were in one
    if (inTable) {
      htmlLines.push("</tbody></table>");
      inTable = false;
      tableAlign = false;
    }

    // Headings
    const h1Match = trimmed.match(/^# (.+)$/);
    if (h1Match) {
      htmlLines.push(`<h1>${renderInlineMarkdown(h1Match[1]!)}</h1>`);
      continue;
    }

    const h2Match = trimmed.match(/^## (.+)$/);
    if (h2Match) {
      htmlLines.push(`<h2>${renderInlineMarkdown(h2Match[1]!)}</h2>`);
      continue;
    }

    const h3Match = trimmed.match(/^### (.+)$/);
    if (h3Match) {
      htmlLines.push(`<h3>${renderInlineMarkdown(h3Match[1]!)}</h3>`);
      continue;
    }

    // Horizontal rule
    if (trimmed === "---") {
      htmlLines.push("<hr>");
      continue;
    }

    if (trimmed === "<!-- page-break -->") {
      htmlLines.push('<div class="page-break"></div>');
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      htmlLines.push(`<ol><li>${renderInlineMarkdown(olMatch[1]!)}</li></ol>`);
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^-\s+(.+)$/);
    if (ulMatch) {
      htmlLines.push(`<ul><li>${renderInlineMarkdown(ulMatch[1]!)}</li></ul>`);
      continue;
    }

    // Inline code
    const codeMatch = trimmed.match(/^`([^`]+)`$/);
    if (codeMatch) {
      htmlLines.push(`<p><code>${escapeHtml(codeMatch[1]!)}</code></p>`);
      continue;
    }

    // Bold text
    const boldMatch = trimmed.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      htmlLines.push(`<p><strong>${escapeHtml(boldMatch[1]!)}</strong></p>`);
      continue;
    }

    // Empty line / paragraph
    if (trimmed === "") {
      // Skip consecutive empty lines
      const nextLine = lines[i + 1];
      const prevLine = i > 0 ? lines[i - 1] : "";
      if (prevLine?.trim() !== "" && nextLine?.trim() !== "") {
        // Empty line between paragraphs is handled by paragraph spacing
      }
      continue;
    }

    // Italic
    const italicMatch = trimmed.match(/^\*(.+)\*$/);
    if (italicMatch) {
      htmlLines.push(`<p><em>${escapeHtml(italicMatch[1]!)}</em></p>`);
      continue;
    }

    // Default paragraph
    htmlLines.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  // Close any open table
  if (inTable) {
    htmlLines.push("</tbody></table>");
  }

  // Merge consecutive same-type lists
  return htmlLines
    .join("\n")
    .replace(/<\/ol>\n<ol>/g, "")
    .replace(/<\/ul>\n<ul>/g, "");
}

function renderInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseMarkdownTableCells(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  for (let index = 1; index < row.length - 1; index += 1) {
    const character = row[index]!;
    if (character === "\\" && row[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function compactEvidenceReference(value: string): string {
  const separator = value.indexOf(": ");
  if (separator < 0) return value;
  return `${compactPath(value.slice(0, separator))}: ${value.slice(separator + 2)}`;
}

function compactPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return value;
  const filename = parts.at(-1)!;
  return parts.at(-2) === "Phases" ? `Phases/${filename}` : filename;
}

// ---------------------------------------------------------------------------
// Status Labels
// ---------------------------------------------------------------------------

/**
 * Human-readable state labels for the pack lifecycle.
 */
export function packStateLabel(state: ManualTestPackStatus["state"]): string {
  switch (state) {
    case "missing":
      return "No verification pack generated";
    case "generating":
      return "Verification pack generation in progress";
    case "current":
      return "Verification pack is current";
    case "stale":
      return "Verification pack is stale (source content changed)";
    case "render_failed":
      return "Verification pack PDF generation failed";
    default:
      return "Unknown pack state";
  }
}

/**
 * Short label for buttons/indicators.
 */
export function packStateShortLabel(state: ManualTestPackStatus["state"]): string {
  switch (state) {
    case "missing":
      return "No Pack";
    case "generating":
      return "Generating";
    case "current":
      return "Current";
    case "stale":
      return "Stale";
    case "render_failed":
      return "Render Failed";
    default:
      return "Unknown";
  }
}

/**
 * CSS class name suffix for dashboard state styling.
 */
export function packStateCssClass(state: ManualTestPackStatus["state"]): string {
  switch (state) {
    case "missing":
    case "generating":
      return "manual-test-pack-inactive";
    case "current":
      return "manual-test-pack-current";
    case "stale":
      return "manual-test-pack-stale";
    case "render_failed":
      return "manual-test-pack-error";
    default:
      return "manual-test-pack-inactive";
  }
}

// ---------------------------------------------------------------------------
// Artifact Descriptors
// ---------------------------------------------------------------------------

/**
 * Descriptor for a Markdown artifact open/download action.
 */
export interface ArtifactDescriptor {
  readonly filename: string;
  readonly mimeType: string;
  readonly contentDisposition: "inline" | "attachment";
}

/**
 * Get the artifact descriptor for the current pack Markdown.
 */
export function markdownArtifactDescriptor(packVersion: string): ArtifactDescriptor {
  return {
    filename: `ManualTestVerification-${packVersion}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contentDisposition: "inline",
  };
}

/**
 * Get the artifact descriptor for the current pack PDF.
 */
export function pdfArtifactDescriptor(packVersion: string): ArtifactDescriptor {
  return {
    filename: `ManualTestVerification-${packVersion}.pdf`,
    mimeType: "application/pdf",
    contentDisposition: "inline",
  };
}

/**
 * Get the artifact descriptor for the legacy Markdown download action.
 */
export function markdownDownloadDescriptor(packVersion: string): ArtifactDescriptor {
  return {
    ...markdownArtifactDescriptor(packVersion),
    contentDisposition: "attachment",
  };
}

/**
 * Get the artifact descriptor for the legacy PDF download action.
 */
export function pdfDownloadDescriptor(packVersion: string): ArtifactDescriptor {
  return {
    ...pdfArtifactDescriptor(packVersion),
    contentDisposition: "attachment",
  };
}

// ---------------------------------------------------------------------------
// Error and Action Messages
// ---------------------------------------------------------------------------

/**
 * Safe, actionable message for the user when an action is blocked.
 */
export function blockedActionMessage(reason: "stale" | "unreviewed" | "missing" | "generating" | "render-failed" | "open-findings"): string {
  switch (reason) {
    case "stale":
      return "The verification pack is outdated because the source acceptance criteria, Gherkin scenarios, or EPIC tests have changed. Regenerate the pack and re-review it before recording manual tests.";
    case "unreviewed":
      return "The current verification pack has not been reviewed yet. Open the pack, review it, and explicitly acknowledge the review before recording manual tests.";
    case "missing":
      return "No verification pack has been generated. Generate a pack first, then review it before recording manual tests.";
    case "generating":
      return "A new verification pack is being generated. Please wait for completion before proceeding.";
    case "render-failed":
      return "The verification pack Markdown is available, but the PDF could not be generated. You can review the Markdown and record tests without the PDF.";
    case "open-findings":
      return "There are unresolved findings from failed manual tests. Resolve or accept the findings before completing the feature.";
    default:
      return "This action is not available right now.";
  }
}

/**
 * Safe, actionable message for the user about next steps.
 */
export function nextActionMessage(state: ManualTestPackStatus): string {
  if (state.state === "missing") {
    return "Generate a verification pack to begin manual testing.";
  }

  if (state.state === "generating") {
    return "Waiting for pack generation to complete...";
  }

  if (state.state === "render_failed") {
    return "Open the Markdown pack for review. PDF generation can be retried.";
  }

  if (state.isStale) {
    return "Regenerate the verification pack to update it with current source content.";
  }

  if (!state.isReviewed) {
    return "Review the current verification pack to unlock manual test recording.";
  }

  if (state.failedCount > 0) {
    return `${state.failedCount} test(s) failed. Resolve the findings before completing.`;
  }

  if (!state.hasResults) {
    return "Record manual test results for each test case in the pack.";
  }

  return "All manual tests recorded. The feature is eligible for completion.";
}

// ---------------------------------------------------------------------------
// HTML Escaping
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent injection.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape text for safe inclusion in Markdown (prevent table/formatting issues).
 */
export function escapeMdText(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

/**
 * Escape text for safe inclusion in a Markdown table cell.
 */
export function escapeMdTableText(text: string): string {
  const escaped = escapeMdText(text);
  return escaped.length > 120 ? `${escaped.slice(0, 119).trimEnd()}…` : escaped;
}
