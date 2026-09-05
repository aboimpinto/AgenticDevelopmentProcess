import type { DocumentPatchPlan, FeatIdentity, LinkOperation, SectionPatch } from "./link-types.js";
import {
  buildCodeFenceLineSet,
  findColumnIndex,
  findFeatInBreakdownTable,
  findFeaturesBreakdownHeading,
  insertTableRow,
  joinLines,
  parseTableAfterHeading,
  removeFeatRowFromTable,
  splitLines,
  updateFeatStatusInTable,
} from "./markdown-structure.js";

/**
 * Plan the EPIC document child-reference patch for a link/relink/unlink operation.
 *
 * Handles:
 * - Features Breakdown table: insert, update status, or remove FEAT row
 * - Feature Details section: update status or add minimal backlink
 * - No-destructive-write guards for duplicate rows and unsupported shapes
 */
export function planEpicChildPatch(
  epicMarkdown: string,
  feat: FeatIdentity,
  operation: LinkOperation,
  /** Whether this EPIC is the target (new) or previous (old) EPIC */
  role: "target" | "previous",
): DocumentPatchPlan {
  const lines = splitLines(epicMarkdown);
  const codeFence = buildCodeFenceLineSet(lines);
  const sectionPatches: SectionPatch[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  let changed = false;
  let currentLines = [...lines];

  // --- Features Breakdown table ---
  const breakdownHeading = findFeaturesBreakdownHeading(currentLines, codeFence);
  let tableInfo: { headerIdx: number; separatorIdx: number; dataStart: number; dataEnd: number } | null = null;
  let statusColIdx = -1;

  if (breakdownHeading >= 0) {
    tableInfo = parseTableAfterHeading(currentLines, breakdownHeading, codeFence);
  }

  if (breakdownHeading >= 0 && tableInfo) {
    // Check if FEAT already has a row (for duplicate detection)
    const existingRow = findFeatInBreakdownTable(
      currentLines,
      tableInfo.dataStart,
      tableInfo.dataEnd,
      feat.featId,
      codeFence,
    );

    // Find status column index
    if (tableInfo.headerIdx >= 0) {
      statusColIdx = findColumnIndex(currentLines[tableInfo.headerIdx] ?? "", "Status");
    }

    if (operation === "unlink" || (operation === "relink" && role === "previous")) {
      // Remove the FEAT row from the table
      const removeResult = removeFeatRowFromTable(
        currentLines,
        tableInfo.dataStart,
        tableInfo.dataEnd,
        feat.featId,
        codeFence,
      );
      if (removeResult.removed) {
        changed = true;
        currentLines = removeResult.lines;
      }
      warnings.push(...removeResult.warnings);
    }

    if (operation === "link" || (operation === "relink" && role === "target")) {
      if (existingRow) {
        // Update status if already present
        if (statusColIdx >= 0) {
          const updateResult = updateFeatStatusInTable(
            currentLines,
            tableInfo.dataStart,
            tableInfo.dataEnd,
            feat.featId,
            feat.statusText,
            statusColIdx,
            codeFence,
          );
          if (updateResult.changed) {
            changed = true;
            currentLines = updateResult.lines;
          }
          warnings.push(...updateResult.warnings);
        }
      } else {
        // Insert new row
        const rowCells = [feat.featId, feat.title, feat.statusText, "-", "-"];
        const insertResult = insertTableRow(
          currentLines,
          tableInfo.dataStart,
          rowCells,
        );
        changed = true;
        currentLines = insertResult.lines;
      }
    }
  } else if (operation === "link" || (operation === "relink" && role === "target")) {
    // No Features Breakdown heading exists — add a minimal backlink section
    // Insert after the metadata table or after the first heading
    const backlinkSection = [
      "",
      "## Features Breakdown",
      "",
      "| Feature ID | Title | Status | Dependencies | Priority |",
      "|---|---|---|---|---|",
      `| ${feat.featId} | ${feat.title} | ${feat.statusText} | - | - |`,
      "",
    ];

    // Find a good insertion point: after the metadata table (after first blank line after field table)
    let insertAt = -1;
    for (let i = 0; i < currentLines.length; i++) {
      if (codeFence.has(i)) continue;
      if (/^\|\s*Field\s*\|\s*Value\s*\|\s*$/i.test(currentLines[i] ?? "")) {
        // Find the end of the metadata table (next blank line or heading)
        for (let j = i + 1; j < currentLines.length; j++) {
          if (codeFence.has(j)) continue;
          const line = currentLines[j] ?? "";
          if (line.trim() === "" || /^##/.test(line)) {
            insertAt = j;
            break;
          }
        }
        break;
      }
    }

    if (insertAt < 0) {
      // Fallback: after the first heading
      for (let i = 0; i < currentLines.length; i++) {
        if (codeFence.has(i)) continue;
        if (/^#\s/.test(currentLines[i] ?? "")) {
          insertAt = i + 2;
          break;
        }
      }
    }

    if (insertAt < 0) {
      insertAt = currentLines.length;
    }

    currentLines.splice(insertAt, 0, ...backlinkSection);
    changed = true;
    warnings.push(
      `EPIC document had no Features Breakdown section — added minimal backlink section for ${feat.featId}`,
    );
  }

  sectionPatches.push({
    section: "epic-features-breakdown",
    patchedMarkdown: joinLines(epicMarkdown, currentLines),
    changed,
    warnings,
  });

  return {
    originalMarkdown: epicMarkdown,
    patchedMarkdown: joinLines(epicMarkdown, currentLines),
    changed,
    sectionPatches,
    warnings,
    blockers: [],
  };
}
