// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split Markdown into lines while preserving trailing newline convention.
 */
export function splitLines(markdown: string): string[] {
  return markdown.split(/\r?\n/);
}

/**
 * Join lines back to Markdown, preserving the original trailing newline.
 */
export function joinLines(original: string, lines: string[]): string {
  const result = lines.join("\n");
  return original.endsWith("\n") ? `${result}\n` : result;
}

/**
 * Check if a line index is inside a code fence block.
 */
export function buildCodeFenceLineSet(lines: string[]): Set<number> {
  const inside = new Set<number>();
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^```/.test(line)) {
      depth = depth > 0 ? depth - 1 : depth + 1;
    }
    if (depth > 0) {
      inside.add(i);
    }
  }

  return inside;
}

/**
 * Extract the first EPIC-NNN or FEAT-NNN from a string.
 */
export function extractId(value: string, prefix: "FEAT" | "EPIC"): string | null {
  const pattern = new RegExp(`\\b${prefix}-\\d+\\b`, "i");
  const match = value.match(pattern);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Extract all EPIC-NNN IDs from a string.
 */
export function extractAllEpicIds(value: string): string[] {
  const ids = new Set<string>();
  const pattern = /\bEPIC-\d+\b/gi;
  for (const match of value.matchAll(pattern)) {
    ids.add(match[0].toUpperCase());
  }
  return [...ids].sort();
}

// ---------------------------------------------------------------------------
// FEAT Metadata Patch Helpers
// ---------------------------------------------------------------------------

/**
 * Find the index of the existing `**Parent Epic**: EPIC-NNN` line, or -1.
 */
export function findParentEpicLine(lines: string[], codeFence: Set<number>): number {
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\*\*Parent\s+Epic\s*\*\*\s*:\s*EPIC-\d+/i.test(line.trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * Count how many `**Parent Epic**` metadata lines exist.
 * If more than 1, the document has ambiguous parent metadata.
 */
export function countParentEpicLines(lines: string[], codeFence: Set<number>): number {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\*\*Parent\s+Epic\s*\*\*\s*:/i.test(line.trim())) {
      count++;
    }
  }
  return count;
}

/**
 * Find a suitable insertion point for `**Parent Epic**: EPIC-NNN`.
 * Tries to insert after the `**Feature ID**` or `**Status**` metadata line.
 */
export function findMetadataInsertionPoint(lines: string[], codeFence: Set<number>): number {
  // Try after Feature ID line first
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\*\*Feature\s+ID\s*\*\*\s*:/i.test(line.trim())) {
      return i + 1;
    }
  }
  // Try after Status line
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\*\*Status\s*\*\*\s*:/i.test(line.trim())) {
      return i + 1;
    }
  }
  // Fallback: after the first heading
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^#\s/.test(line.trim())) {
      return i + 2; // heading + blank line
    }
  }
  return 0;
}

/**
 * Find the `## Source` section boundaries.
 */
export function findSourceSection(lines: string[], codeFence: Set<number>): { start: number; end: number } | null {
  let sourceStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^##\s*Source\s*$/i.test(line.trim())) {
      sourceStart = i;
      break;
    }
  }

  if (sourceStart < 0) return null;

  // Find end: next ## heading or end of document
  for (let i = sourceStart + 1; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^##\s/.test(line.trim())) {
      return { start: sourceStart, end: i };
    }
  }

  return { start: sourceStart, end: lines.length };
}

/**
 * Find an existing `- EPIC: EPIC-NNN` backlink line in the Source section.
 */
export function findEpicBacklinkLine(lines: string[], sectionStart: number, sectionEnd: number, codeFence: Set<number>): number {
  for (let i = sectionStart; i < sectionEnd; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\s*-\s*EPIC\s*:\s*EPIC-\d+/i.test(line.trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the last backlink line in the Source section (to insert after it).
 */
export function findLastBacklinkLine(lines: string[], sectionStart: number, sectionEnd: number, codeFence: Set<number>): number {
  let lastIdx = -1;
  for (let i = sectionStart; i < sectionEnd; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\s*-\s*EPIC\s*:\s*EPIC-\d+/i.test(line.trim())) {
      lastIdx = i;
    }
  }
  return lastIdx;
}

// ---------------------------------------------------------------------------
// EPIC Child-Reference Patch Helpers
// ---------------------------------------------------------------------------

/**
 * Find the `## Features Breakdown` (or variant) heading index.
 */
export function findFeaturesBreakdownHeading(lines: string[], codeFence: Set<number>): number {
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^##\s*Features?\s*Breakdown/i.test(line.trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a Markdown table from a heading to the next heading or end.
 * Returns the header row, separator row, and data rows as raw line indices.
 */
export function parseTableAfterHeading(
  lines: string[],
  headingLine: number,
  codeFence: Set<number>,
): { headerIdx: number; separatorIdx: number; dataStart: number; dataEnd: number } | null {
  // Find the first pipe-delimited line after the heading
  let headerIdx = -1;
  let separatorIdx = -1;
  let dataStart = -1;

  for (let i = headingLine + 1; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\|.*\|$/.test(line.trim()) && headerIdx < 0) {
      headerIdx = i;
      continue;
    }
    if (headerIdx >= 0 && separatorIdx < 0 && /^\|.*\|$/.test(line.trim())) {
      // Check if this looks like a separator row (contains ---)
      if (/---/.test(line)) {
        separatorIdx = i;
        dataStart = i + 1;
      } else {
        // No separator row — treat this as first data row
        dataStart = i;
      }
      continue;
    }
    if (dataStart >= 0) {
      // Stop at next heading or non-table line
      if (/^##\s/.test(line.trim())) {
        return { headerIdx, separatorIdx, dataStart, dataEnd: i };
      }
      if (!/^\|.*\|$/.test(line.trim())) {
        return { headerIdx, separatorIdx, dataStart, dataEnd: i };
      }
    }
  }

  if (headerIdx >= 0) {
    return { headerIdx, separatorIdx, dataStart: dataStart >= 0 ? dataStart : lines.length, dataEnd: lines.length };
  }

  return null;
}

/**
 * Extract column index by column name from a table header row.
 */
export function findColumnIndex(headerLine: string, columnName: string): number {
  const cells = headerLine
    .split("|")
    .map((c) => c.trim().replace(/\*\*/g, ""))
    .filter(Boolean);
  return cells.findIndex(
    (c) => c.toLowerCase() === columnName.toLowerCase(),
  );
}

/**
 * Check if a FEAT ID appears in the Features Breakdown table.
 */
export function findFeatInBreakdownTable(
  lines: string[],
  dataStart: number,
  dataEnd: number,
  featId: string,
  codeFence: Set<number>,
): { lineIdx: number; statusCellContent: string } | null {
  for (let i = dataStart; i < dataEnd; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (!/^\|.*\|$/.test(line.trim())) continue;

    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    const id = extractId(cells[0] ?? "", "FEAT");
    if (id === featId) {
      // Find the Status column
      return { lineIdx: i, statusCellContent: cells[2] ?? "" };
    }
  }
  return null;
}

/**
 * Find the `## Feature Details` section for a specific FEAT.
 */
export function findFeatureDetailSection(
  lines: string[],
  featId: string,
  codeFence: Set<number>,
): { start: number; end: number } | null {
  // Look for ### Feature N: Title or similar with FEAT ID
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^###\s/.test(line.trim()) && line.includes(featId)) {
      // Find end: next ### or ## heading
      for (let j = i + 1; j < lines.length; j++) {
        if (codeFence.has(j)) continue;
        const nextLine = lines[j] ?? "";
        if (/^#{2,3}\s/.test(nextLine.trim())) {
          return { start: i, end: j };
        }
      }
      return { start: i, end: lines.length };
    }
  }
  return null;
}

/**
 * Find the `## Epic Progress` heading index.
 */
export function findEpicProgressHeading(lines: string[], codeFence: Set<number>): number {
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^##\s*Epic\s+Progress/i.test(line.trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the `## Progress Tracking` heading index.
 */
export function findProgressTrackingHeading(lines: string[], codeFence: Set<number>): number {
  for (let i = 0; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^##\s*Progress\s+Tracking/i.test(line.trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the next heading after a given line index.
 */
export function findNextHeading(lines: string[], startIndex: number, codeFence: Set<number>): number {
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (codeFence.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^##\s/.test(line.trim())) {
      return i;
    }
  }
  return lines.length;
}

/**
 * Remove a row from a pipe table given a matching FEAT ID.
 */
export function removeFeatRowFromTable(
  lines: string[],
  dataStart: number,
  dataEnd: number,
  featId: string,
  codeFence: Set<number>,
): { lines: string[]; removed: boolean; warnings: string[] } {
  const newLines = [...lines];
  const warnings: string[] = [];
  let removed = false;

  for (let i = dataStart; i < dataEnd; i++) {
    if (codeFence.has(i)) continue;
    const line = newLines[i] ?? "";
    if (!/^\|.*\|$/.test(line.trim())) continue;

    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    const id = extractId(cells[0] ?? "", "FEAT");
    if (id === featId) {
      newLines.splice(i, 1);
      removed = true;
      break;
    }
  }

  if (!removed) {
    warnings.push(`FEAT ${featId} not found in table — nothing to remove`);
  }

  return { lines: newLines, removed, warnings };
}

/**
 * Update a row's status cell in a pipe table given a matching FEAT ID.
 */
export function updateFeatStatusInTable(
  lines: string[],
  dataStart: number,
  dataEnd: number,
  featId: string,
  statusText: string,
  statusColIdx: number,
  codeFence: Set<number>,
): { lines: string[]; changed: boolean; warnings: string[] } {
  const newLines = [...lines];
  const warnings: string[] = [];
  let changed = false;

  for (let i = dataStart; i < dataEnd; i++) {
    if (codeFence.has(i)) continue;
    const line = newLines[i] ?? "";
    if (!/^\|.*\|$/.test(line.trim())) continue;

    const rawParts = line.split("|");
    const cells = rawParts.map((c) => c.trim()).filter(Boolean);
    const id = extractId(cells[0] ?? "", "FEAT");
    if (id !== featId) continue;

    // Map filtered statusColIdx back to raw parts
    let realStatusIdx = -1;
    let nonEmptyCount = 0;
    for (let p = 0; p < rawParts.length; p++) {
      if (rawParts[p]!.trim()) {
        if (nonEmptyCount === statusColIdx) {
          realStatusIdx = p;
          break;
        }
        nonEmptyCount++;
      }
    }

    if (realStatusIdx >= 0 && realStatusIdx < rawParts.length) {
      const currentStatus = rawParts[realStatusIdx]!.trim().replace(/\*\*/g, "");
      if (currentStatus.toUpperCase() !== statusText.toUpperCase()) {
        rawParts[realStatusIdx] = ` ${statusText} `;
        newLines[i] = rawParts.join("|");
        changed = true;
      }
    }
    break;
  }

  return { lines: newLines, changed, warnings };
}

/**
 * Insert a new row into a pipe table.
 */
export function insertTableRow(
  lines: string[],
  dataStart: number,
  cells: string[],
): { lines: string[] } {
  const newLines = [...lines];
  const row = `| ${cells.join(" | ")} |`;
  newLines.splice(dataStart, 0, row);
  return { lines: newLines };
}
