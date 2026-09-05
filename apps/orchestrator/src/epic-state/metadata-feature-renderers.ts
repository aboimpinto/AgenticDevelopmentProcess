import {
  cleanMarkdownTableCell,
  parseMarkdownTableLine,
  preserveTrailingNewline,
} from "./lifecycle-state.js";
import type { EpicSyncResult, FeatNormalizedState } from "./feature-snapshots.js";
import {
  extractFeatId,
  findColumnIndex,
  findColumnIndexInRawLine,
  findHeadingLine,
  findNextHeadingLine,
  getCodeFenceLines,
  parseTableLines,
  renderTableRow,
  stateToTableLabel,
} from "./markdown-structure.js";

export function renderMetadataProgress(
  markdown: string,
  progressPercent: number,
): EpicSyncResult {
  const lines = markdown.split(/\r?\n/);
  const codeFenceLines = getCodeFenceLines(lines);
  let changed = false;

  // Find the metadata table (everything from first `| Field | Value |` line up to first blank line)
  let tableStart = -1;
  let tableEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    if (codeFenceLines.has(i)) continue;
    if (/^\|\s*Field\s*\|\s*Value\s*\|\s*$/i.test(lines[i] ?? "")) {
      tableStart = i;
      // Find table end (first blank line after table start, or next heading)
      for (let j = i + 1; j < lines.length; j++) {
        if (codeFenceLines.has(j)) continue;
        if (lines[j]?.trim() === "" || /^##/.test(lines[j] ?? "")) {
          tableEnd = j;
          break;
        }
      }
      break;
    }
  }

  if (tableStart < 0) {
    return { markdown, changed: false, sections: [], warnings: [], blockers: [] };
  }

  const progressValue = `${progressPercent}%`;
  let found = false;

  for (let i = tableStart + 1; i < (tableEnd > 0 ? tableEnd : lines.length); i++) {
    if (codeFenceLines.has(i)) continue;
    const cells = parseMarkdownTableLine(lines[i] ?? "");
    if (cells.length >= 2 && /^progress$/i.test(cells[0] ?? "")) {
      const existingValue = cleanMarkdownTableCell(cells[1] ?? "");
      if (existingValue !== progressValue) {
        // Update the progress cell in the original line
        const originalParts = (lines[i] ?? "").split("|");
        // Find the Value column (second non-empty pipe segment)
        const valueIndex = findColumnIndexInRawLine(lines[i] ?? "");
        if (valueIndex >= 0) {
          const parts = (lines[i] ?? "").split("|");
          parts[valueIndex] = ` ${progressValue} `;
          lines[i] = parts.join("|");
          changed = true;
        }
      }
      found = true;
      break;
    }
  }

  return {
    markdown: changed ? preserveTrailingNewline(markdown, lines.join("\n")) : markdown,
    changed,
    sections: [
      {
        section: "metadata-progress",
        changed,
        warning: found ? undefined : "Progress field not found in metadata table — skipped",
      },
    ],
    warnings: found ? [] : ["Progress field not found in metadata table — skipped"],
    blockers: [],
  };
}

export function renderFeatureTableStatuses(
  markdown: string,
  childStates: Map<string, FeatNormalizedState>,
): EpicSyncResult {
  const lines = markdown.split(/\r?\n/);
  const warnings: string[] = [];

  const headingLine = findHeadingLine(lines, "Features Breakdown");
  if (headingLine < 0) {
    return {
      markdown,
      changed: false,
      sections: [{ section: "feature-table", changed: false, warning: "Features Breakdown heading not found — skipped" }],
      warnings: ["Features Breakdown heading not found — skipped table status update"],
      blockers: [],
    };
  }

  const nextHeading = findNextHeadingLine(lines, headingLine);
  const tableEnd = nextHeading > 0 ? nextHeading : lines.length;
  const codeFenceLines = getCodeFenceLines(lines);
  let changed = false;
  const sectionWarnings: string[] = [];

  // Find header row and status column index
  let statusColIndex = -1;
  let headerFound = false;

  for (let i = headingLine + 1; i < tableEnd; i++) {
    if (codeFenceLines.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\|.*\|$/.test(line.trim()) && !headerFound) {
      const cells = line.split("|").map((c) => cleanMarkdownTableCell(c)).filter(Boolean);
      statusColIndex = findColumnIndex(cells, "Status");
      headerFound = true;
      continue;
    }
    if (headerFound && statusColIndex >= 0 && /^\|.*\|$/.test(line.trim())) {
      const rawCells = line.split("|");
      const cells = rawCells.map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const featId = extractFeatId(cells[0] ?? "");
      if (!featId) continue;

      const normalizedState = childStates.get(featId);
      if (!normalizedState) continue;

      const currentStatus = cleanMarkdownTableCell(cells[statusColIndex] ?? "").toUpperCase().replace(/\s+/g, " ");
      const targetStatus = stateToTableLabel(normalizedState);

      if (currentStatus !== targetStatus) {
        // Map filtered index back to raw cells
        let realStatusIdx = -1;
        let seen = 0;
        for (let r = 0; r < rawCells.length; r++) {
          if (rawCells[r]!.trim()) {
            if (seen === statusColIndex) {
              realStatusIdx = r;
              break;
            }
            seen++;
          }
        }
        if (realStatusIdx >= 0 && realStatusIdx < rawCells.length) {
          rawCells[realStatusIdx] = ` ${targetStatus} `;
          lines[i] = rawCells.join("|");
          changed = true;
        }
      }
    }
  }

  // Emit warnings for child states not found in the table
  for (const [featId] of childStates) {
    let found = false;
    for (let i = headingLine + 1; i < tableEnd; i++) {
      if (codeFenceLines.has(i)) continue;
      const line = lines[i] ?? "";
      if (/^\|.*\|$/.test(line.trim())) {
        const filtered = line.split("|").map((c) => c.trim()).filter(Boolean);
        const featIdInRow = extractFeatId(filtered[0] ?? "");
        if (featIdInRow === featId) {
          found = true;
          break;
        }
      }
    }
    if (!found) {
      sectionWarnings.push(`FEAT ${featId} not found in Features Breakdown table — skipping status cell`);
    }
  }

  warnings.push(...sectionWarnings);

  return {
    markdown: changed ? preserveTrailingNewline(markdown, lines.join("\n")) : markdown,
    changed,
    sections: [{ section: "feature-table", changed, warning: sectionWarnings.join("; ") || undefined }],
    warnings,
    blockers: [],
  };
}
