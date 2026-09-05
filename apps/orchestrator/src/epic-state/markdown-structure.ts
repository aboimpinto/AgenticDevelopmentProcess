import { cleanMarkdownTableCell } from "./lifecycle-state.js";
import type { FeatNormalizedState } from "./feature-snapshots.js";

// ---------------------------------------------------------------------------
// FEAT-012: Internal Markdown parsing helpers
// ---------------------------------------------------------------------------

interface CodeFenceState {
  line: number;
  fence: string;
}

/**
 * Track code-fence depth across Markdown lines.
 * Each "```" toggles inside/outside state.
 */
export function getCodeFenceLines(lines: string[]): Set<number> {
  const inside = new Set<number>();
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^```/.test(line)) {
      if (depth > 0) {
        depth--;
      } else {
        depth++;
      }
    }
    if (depth > 0) {
      inside.add(i);
    }
  }

  return inside;
}

export function findHeadingLine(lines: string[], heading: string): number {
  const pattern = new RegExp(`^##\\s*${escapeRegex(heading)}\\s*$`, "i");
  const codeFenceLines = getCodeFenceLines(lines);

  for (let i = 0; i < lines.length; i++) {
    if (codeFenceLines.has(i)) {
      continue;
    }
    if (pattern.test(lines[i] ?? "")) {
      return i;
    }
  }

  return -1;
}

export function findNextHeadingLine(lines: string[], startIndex: number): number {
  const codeFenceLines = getCodeFenceLines(lines);

  for (let i = startIndex + 1; i < lines.length; i++) {
    if (codeFenceLines.has(i)) {
      continue;
    }
    if (/^##\s/.test(lines[i] ?? "")) {
      return i;
    }
  }

  return -1;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTableLines(lines: string[], start: number, end: number): string[][] {
  const rows: string[][] = [];

  for (let i = start; i <= end && i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\|.*\|$/.test(line.trim()) && !/^\|\s*-+\s*\|/.test(line.trim())) {
      rows.push(
        line
          .split("|")
          .map((cell) => cell.trim()),
      );
    }
  }

  return rows;
}

export function renderTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

export function findColumnIndex(headerRow: string[], columnName: string): number {
  return headerRow.findIndex(
    (cell) => cleanMarkdownTableCell(cell).toLowerCase() === columnName.toLowerCase(),
  );
}

/**
 * Find Mermaid code block boundaries in Markdown.
 * Returns array of {startLine, endLine} line indices.
 */
export function findMermaidBlockLines(lines: string[]): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  let inMermaid = false;
  let mermaidStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^```\s*mermaid\s*$/i.test(line)) {
      inMermaid = true;
      mermaidStart = i;
      continue;
    }
    if (inMermaid && /^```/.test(line)) {
      blocks.push({ start: mermaidStart, end: i });
      inMermaid = false;
      mermaidStart = -1;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// FEAT-012: Targeted Render Helpers
// ---------------------------------------------------------------------------

/**
 * Update the metadata `| Progress | <value> |` row in the opening EPIC table.
 */

export function findColumnIndexInRawLine(line: string): number {
  const parts = line.split("|");
  // Find first non-empty segment after the header column
  let cellCount = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]?.trim()) {
      cellCount++;
      if (cellCount === 2) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Update `Status` cells in the Features Breakdown table for each linked FEAT.
 */

export function findInsertPoint(lines: string[], headingLine: number, sectionEnd: number): number {
  // Insert after the last non-blank line before section end
  for (let i = headingLine + 1; i < sectionEnd; i++) {
    if ((lines[i] ?? "").trim() === "" && i + 1 < sectionEnd && (lines[i + 1] ?? "").trim() === "") {
      return i;
    }
  }
  return sectionEnd - 1;
}

/**
 * Update Status and Started columns in the Progress Tracking table.
 */

export function extractFeatId(cell: string): string | null {
  const cleaned = cleanMarkdownTableCell(cell);
  const match = cleaned.match(/\b(FEAT-\d+)\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function stateToTableLabel(state: FeatNormalizedState): string {
  switch (state) {
    case "SUBMITTED":
      return "SUBMITTED";
    case "READY":
      return "READY";
    case "IN_PROGRESS":
      return "IN PROGRESS";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    case "MISSING":
      return "MISSING";
  }
}
