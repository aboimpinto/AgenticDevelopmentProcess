import type { EpicDeliveryState } from "@hepha/shared";
import {
  cleanMarkdownTableCell,
  formatEpicStateForFile,
  preserveTrailingNewline,
} from "./lifecycle-state.js";
import type { EpicSyncResult, FeatNormalizedState, ProgressCounts } from "./feature-snapshots.js";
import {
  extractFeatId,
  findColumnIndex,
  getCodeFenceLines,
  findHeadingLine,
  findInsertPoint,
  findNextHeadingLine,
  parseTableLines,
  renderTableRow,
  stateToTableLabel,
} from "./markdown-structure.js";

/** Update or insert the EPIC progress summary and count table. */
export function renderEpicProgress(
  markdown: string,
  counts: ProgressCounts,
  derivedState: EpicDeliveryState,
  progressPercent: number,
): EpicSyncResult {
  const lines = markdown.split(/\r?\n/);
  const warnings: string[] = [];

  const headingLine = findHeadingLine(lines, "Epic Progress");
  if (headingLine < 0) {
    return {
      markdown,
      changed: false,
      sections: [{ section: "epic-progress", changed: false, warning: "Epic Progress heading not found — skipped" }],
      warnings: ["Epic Progress heading not found — skipping progress recalc"],
      blockers: [],
    };
  }

  const nextHeading = findNextHeadingLine(lines, headingLine);
  const sectionEnd = nextHeading > 0 ? nextHeading : lines.length;
  const codeFenceLines = getCodeFenceLines(lines);
  let changed = false;

  // Update progress summary line: `**Progress:** <percent>% (<completed>/<total> features complete)`
  const progressLinePattern = /^\*\*Progress:\*\*\s*\d+%\s*\(\d+\/\d+\s+features\s+complete\)/i;
  const progressLineReplacement = `**Progress:** ${progressPercent}% (${counts.completed}/${counts.total} features complete)`;
  let progressLineFound = false;

  for (let i = headingLine + 1; i < sectionEnd; i++) {
    if (codeFenceLines.has(i)) continue;
    const line = lines[i] ?? "";
    if (progressLinePattern.test(line.trim())) {
      if (line.trim() !== progressLineReplacement) {
        lines[i] = progressLineReplacement;
        changed = true;
      }
      progressLineFound = true;
      break;
    }
  }

  if (!progressLineFound) {
    // Insert after heading (or after first blank line after heading)
    const insertAt = headingLine + 2;
    if (insertAt < sectionEnd) {
      lines.splice(insertAt, 0, progressLineReplacement, "");
      changed = true;
    }
  }

  // Update or insert status count table
  const stateRows = new Map<string, number>([
    ["Completed", counts.completed],
    ["In Progress", counts.inProgress],
    ["Ready", counts.ready],
    ["Submitted", counts.submitted],
    ["Cancelled", counts.cancelled],
  ]);

  // Collect features for each status
  const featuresByStatus = new Map<string, string[]>();
  for (const [statusLabel, count] of stateRows) {
    featuresByStatus.set(statusLabel, count > 0 ? [] : []);
  }

  // Find existing count table
  let tableStartLine = -1;
  let tableHeaderLine = -1;

  for (let i = headingLine + 1; i < sectionEnd; i++) {
    if (codeFenceLines.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\|\s*Status\s*\|\s*Count\s*\|\s*Features/i.test(line.trim())) {
      tableHeaderLine = i;
      tableStartLine = i;
      break;
    }
  }

  if (tableStartLine >= 0) {
    // Update existing table rows — use raw split positions without trimming
    let rowLine = tableStartLine + 2; // Skip header + separator

    for (const [statusLabel, count] of stateRows) {
      if (rowLine >= sectionEnd) break;
      if (codeFenceLines.has(rowLine)) { rowLine++; continue; }
      if (!/^\|/.test(lines[rowLine] ?? "")) { rowLine++; continue; }
      const rawRow = lines[rowLine] ?? "";
      const rawParts = rawRow.split("|");
      // Find the Count column — second non-empty segment
      let countIdx = -1;
      let nonEmpty = 0;
      for (let p = 0; p < rawParts.length; p++) {
        if (rawParts[p]!.trim()) {
          if (nonEmpty === 1) {
            countIdx = p;
            break;
          }
          nonEmpty++;
        }
      }
      if (countIdx >= 0) {
        const currentCount = rawParts[countIdx]!.trim();
        const newCountStr = String(count);
        if (currentCount !== newCountStr) {
          rawParts[countIdx] = ` ${newCountStr} `;
          lines[rowLine] = rawParts.join("|");
          changed = true;
        }
      }
      rowLine++;
    }
  } else {
    // Insert new count table
    const insertAt = findInsertPoint(lines, headingLine, sectionEnd);
    if (insertAt >= 0) {
      const tableLines = [
        "| Status | Count | Features |",
        "|--------|-------|----------|",
      ];
      for (const [statusLabel, count] of stateRows) {
        tableLines.push(`| ${statusLabel} | ${count} | - |`);
      }
      lines.splice(insertAt, 0, "", ...tableLines);
      changed = true;
    }
  }

  // Update state line
  const stateLinePattern = /^\*\*State:\*\*\s*/i;
  for (let i = headingLine + 1; i < sectionEnd; i++) {
    if (codeFenceLines.has(i)) continue;
    const line = lines[i] ?? "";
    if (stateLinePattern.test(line.trim())) {
      const nextState = formatEpicStateForFile(derivedState);
      if (!line.includes(nextState)) {
        lines[i] = `**State:** ${nextState}`;
        changed = true;
      }
      break;
    }
  }

  return {
    markdown: changed ? preserveTrailingNewline(markdown, lines.join("\n")) : markdown,
    changed,
    sections: [{ section: "epic-progress", changed }],
    warnings,
    blockers: [],
  };
}

export function renderProgressTrackingStatuses(
  markdown: string,
  childStates: Map<string, { state: FeatNormalizedState; started?: string }>,
): EpicSyncResult {
  const lines = markdown.split(/\r?\n/);
  const warnings: string[] = [];

  const headingLine = findHeadingLine(lines, "Progress Tracking");
  if (headingLine < 0) {
    return {
      markdown,
      changed: false,
      sections: [{ section: "progress-tracking", changed: false, warning: "Progress Tracking heading not found — skipped" }],
      warnings: ["Progress Tracking heading not found — skipping tracking update"],
      blockers: [],
    };
  }

  const nextHeading = findNextHeadingLine(lines, headingLine);
  const tableEnd = nextHeading > 0 ? nextHeading : lines.length;
  const codeFenceLines = getCodeFenceLines(lines);
  let changed = false;

  // Find header row and column indices
  let statusColIndex = -1;
  let startedColIndex = -1;
  let headerFound = false;

  for (let i = headingLine + 1; i < tableEnd; i++) {
    if (codeFenceLines.has(i)) continue;
    const line = lines[i] ?? "";
    if (/^\|.*\|$/.test(line.trim()) && !headerFound) {
      const cells = line.split("|").map((c) => cleanMarkdownTableCell(c)).filter(Boolean);
      statusColIndex = findColumnIndex(cells, "Status");
      startedColIndex = findColumnIndex(cells, "Started");
      headerFound = true;
      continue;
    }
    if (headerFound && /^\|.*\|$/.test(line.trim())) {
      const rawCells = line.split("|");
      const cells = rawCells.map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;

      const featId = extractFeatId(cells[0] ?? "");
      if (!featId) continue;

      const childInfo = childStates.get(featId);
      if (!childInfo) continue;

      const targetStatus = stateToTableLabel(childInfo.state);

      // Map filtered index back to raw cells for Status column
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

      // Update Status column
      if (realStatusIdx >= 0 && realStatusIdx < rawCells.length) {
        const currentStatus = cleanMarkdownTableCell(rawCells[realStatusIdx] ?? "").toUpperCase().replace(/\s+/g, " ");
        if (currentStatus !== targetStatus && targetStatus !== "-") {
          rawCells[realStatusIdx] = ` ${targetStatus} `;
          changed = true;
        }
      }

      // Map filtered index to raw cells for Started column
      let realStartedIdx = -1;
      seen = 0;
      for (let r = 0; r < rawCells.length; r++) {
        if (rawCells[r]!.trim()) {
          if (seen === startedColIndex) {
            realStartedIdx = r;
            break;
          }
          seen++;
        }
      }

      // Update Started column if blank and we have a date
      if (realStartedIdx >= 0 && realStartedIdx < rawCells.length && childInfo.started) {
        const currentStarted = cleanMarkdownTableCell(rawCells[realStartedIdx] ?? "");
        if (!currentStarted || currentStarted === "-") {
          rawCells[realStartedIdx] = ` ${childInfo.started} `;
          changed = true;
        }
      }

      lines[i] = rawCells.join("|");
    }
  }

  // Check for child states not in table
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
      warnings.push(`FEAT ${featId} not found in Progress Tracking — skipping row`);
    }
  }

  return {
    markdown: changed ? preserveTrailingNewline(markdown, lines.join("\n")) : markdown,
    changed,
    sections: [{ section: "progress-tracking", changed }],
    warnings,
    blockers: [],
  };
}
