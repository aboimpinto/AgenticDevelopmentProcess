import type { PreviewFeatCandidate } from "@hepha/shared";
import { parseEpicFeatureTable } from "./epic-feature-table.js";
import {
  parseFeatureDetailSections,
  parseMermaidDiagram,
  parseProgressTracking,
} from "./epic-section-parsers.js";

// ──────────────────────────────────────────────
// FEAT-011: Phase 2 — EPIC Markdown upsert rendering
// ──────────────────────────────────────────────

export function renderUpdatedFeatureTable(
  markdown: string,
  candidates: PreviewFeatCandidate[],
  existingIds: Set<string>,
): string {
  const { rows, headerRowIndex } = parseEpicFeatureTable(markdown);
  const lines = markdown.split(/\r?\n/);
  const rowMap = new Map<string, (typeof rows)[0]>();
  const tbdRows: (typeof rows)[0][] = [];

  for (const row of rows) {
    if (row.featureId) {
      rowMap.set(row.featureId, row);
    } else if (row.isTbd) {
      tbdRows.push(row);
    }
  }

  let tbdIndex = 0;

  for (const candidate of candidates) {
    const existingRow = rowMap.get(candidate.plannedFeatureId);
    const isExisting = existingIds.has(candidate.plannedFeatureId);

    if (existingRow && isExisting) {
      lines[existingRow.rowIndex] = updateTableCell(
        lines[existingRow.rowIndex] ?? "",
        2,
        "IN PROGRESS",
      );
    } else if (existingRow && !isExisting) {
      // Row exists but not in existingIds — update status
      lines[existingRow.rowIndex] = updateTableCell(
        lines[existingRow.rowIndex] ?? "",
        2,
        "SUBMITTED",
      );
    } else if (tbdIndex < tbdRows.length) {
      // Replace next available TBD row
      const tbdRow = tbdRows[tbdIndex];
      tbdIndex++;

      const depCell = candidate.dependencyIds.length > 0 ? candidate.dependencyIds.join(", ") : "";
      const priorityCell = candidate.priority ?? "";

      lines[tbdRow.rowIndex] = `| ${candidate.plannedFeatureId} | ${candidate.title} | SUBMITTED | ${depCell} | ${priorityCell} |`;
    } else {
      // Insert new row after the last feature table row
      const insertAfter = Math.max(...rows.map((r) => r.rowIndex), headerRowIndex + 2);
      const depCell = candidate.dependencyIds.length > 0 ? candidate.dependencyIds.join(", ") : "";
      const priorityCell = candidate.priority ?? "";

      lines.splice(insertAfter + 1, 0, `| ${candidate.plannedFeatureId} | ${candidate.title} | SUBMITTED | ${depCell} | ${priorityCell} |`);
      break;
    }
  }

  return lines.join("\n");
}

// ──────────────────────────────────────────────
// FEAT-011: Phase 2 — EPIC Markdown upsert rendering
// ──────────────────────────────────────────────

export function renderUpdatedFeatureDetails(
  markdown: string,
  candidates: PreviewFeatCandidate[],
  existingIds: Set<string>,
  epicId: string,
  epicTitle: string,
): string {
  const sections = parseFeatureDetailSections(markdown);
  const lines = markdown.split(/\r?\n/);
  const existingDetailIds = new Set(sections.map((s) => s.featId));

  let insertAfterLine = -1;
  if (sections.length > 0) {
    insertAfterLine = sections[sections.length - 1].lineEnd;
  } else {
    // Find the Feature Details heading
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Feature\s+Details/i.test(lines[i] ?? "")) {
        insertAfterLine = i + 1;
      }
    }
  }

  let featureNumber = sections.length + 1;
  const newSections: string[] = [];

  for (const candidate of candidates) {
    if (existingDetailIds.has(candidate.plannedFeatureId) || existingIds.has(candidate.plannedFeatureId)) {
      continue; // Preserve existing detail section
    }

    newSections.push(
      "",
      `### Feature ${featureNumber}: ${candidate.title} (${candidate.plannedFeatureId})`,
      "",
      `**User Story:** ${candidate.summary}`,
      "",
      `**Scope:** Generated from EPIC ${epicId} - ${epicTitle}.`,
      `**Backlink:** ${candidate.backlinkText}`,
      `**Dependencies:** ${candidate.dependencyIds.length > 0 ? candidate.dependencyIds.join(", ") : "None"}`,
      "",
    );
    featureNumber++;
  }

  if (newSections.length === 0) {
    return markdown;
  }

  if (insertAfterLine >= 0) {
    lines.splice(insertAfterLine + 1, 0, ...newSections);
  } else {
    // Append before the next known section or at end
    lines.push(...newSections);
  }

  return lines.join("\n");
}

export function renderUpdatedProgressTracking(
  markdown: string,
  candidates: PreviewFeatCandidate[],
  existingIds: Set<string>,
): string {
  const entries = parseProgressTracking(markdown);
  const lines = markdown.split(/\r?\n/);

  // Find where progress tracking table is or where to insert
  let tableEndLine = -1;
  let hasProgressSection = false;
  let progressHeaderLine = -1;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) continue;

    if (/^##\s+Progress\s+Tracking/i.test(line)) {
      hasProgressSection = true;
      progressHeaderLine = i;
    }

    if (hasProgressSection && /^\|\s*Feature\s+ID\s*\|/.test(line)) {
      tableEndLine = i;
    }

    if (hasProgressSection && i > progressHeaderLine && line.includes("|")) {
      tableEndLine = i;
    }

    if (hasProgressSection && !line.includes("|") && i > progressHeaderLine + 1) {
      if (tableEndLine < 0) {
        tableEndLine = i - 1;
      }
      break;
    }
  }

  const existingEntryMap = new Map(entries.filter((e) => e.featId).map((e) => [e.featId!, e]));
  const existingEntryIds = new Set(existingEntryMap.keys());
  const newRows: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  let changedExistingRow = false;

  for (const candidate of candidates) {
    const existingEntry = existingEntryMap.get(candidate.plannedFeatureId);

    if (existingEntry) {
      if (!existingIds.has(candidate.plannedFeatureId) && /^missing$/i.test(existingEntry.status)) {
        lines[existingEntry.lineIndex] = updateTableCell(lines[existingEntry.lineIndex] ?? "", 1, "SUBMITTED");
        changedExistingRow = true;
      }
      continue;
    }

    if (existingEntryIds.has(candidate.plannedFeatureId) || existingIds.has(candidate.plannedFeatureId)) {
      continue;
    }

    newRows.push(
      `| ${candidate.plannedFeatureId} | SUBMITTED | ${today} | | |`,
    );
  }

  if (newRows.length === 0) {
    if (changedExistingRow) {
      return lines.join("\n");
    }
    return markdown;
  }

  if (tableEndLine >= 0) {
    lines.splice(tableEndLine + 1, 0, ...newRows);
  } else if (progressHeaderLine >= 0) {
    lines.splice(
      progressHeaderLine + 1,
      0,
      "",
      `| Feature ID | Status | Started | Completed | Notes |`,
      `|------------|--------|---------|-----------|-------|`,
      ...newRows,
    );
  }

  return lines.join("\n");
}

export function renderUpdatedMermaidDiagram(
  markdown: string,
  candidates: PreviewFeatCandidate[],
  existingIds: Set<string>,
): string {
  const block = parseMermaidDiagram(markdown);
  const lines = markdown.split(/\r?\n/);

  if (!block) {
    return markdown;
  }

  const existingNodeTitles = new Set(block.nodes.map((n) => n.title));
  const usedVariables = block.nodes.map((n) => n.variable);

  // Find the highest F variable number
  let maxVarNum = 0;
  for (const v of usedVariables) {
    const match = v.match(/^F(\d+)$/);
    if (match) {
      maxVarNum = Math.max(maxVarNum, parseInt(match[1], 10));
    }
  }

  const newNodes: string[] = [];
  const newClasses: string[] = [];
  let nextVarNum = maxVarNum + 1;

  for (const candidate of candidates) {
    if (existingNodeTitles.has(candidate.title) || existingIds.has(candidate.plannedFeatureId)) {
      continue;
    }

    const varName = `F${nextVarNum}`;
    newNodes.push(`        ${varName}[${candidate.title}]`);
    newClasses.push(`    class ${varName} notStarted`);
    nextVarNum++;
  }

  if (newNodes.length === 0) {
    return markdown;
  }

  // Insert new nodes before the classDef section
  let insertBeforeLine = block.codeFenceEnd;

  for (let i = block.codeFenceStart + 1; i < block.codeFenceEnd; i++) {
    if (/classDef/i.test(lines[i] ?? "")) {
      insertBeforeLine = i;
      break;
    }
  }

  // Insert nodes before the classDef line (or before closing ```)
  lines.splice(insertBeforeLine, 0, ...newNodes, "");
  const classInsertIndex = insertBeforeLine + newNodes.length + 1;

  // Insert class assignments after the classDef section
  let classDefEnd = classInsertIndex;
  for (let i = classInsertIndex; i < block.codeFenceEnd + (newNodes.length + 1); i++) {
    if ((lines[i] ?? "").trim() === "```") {
      classDefEnd = i;
      break;
    }
  }

  lines.splice(classDefEnd, 0, ...newClasses);

  return lines.join("\n");
}

function updateTableCell(line: string, cellIndex: number, value: string): string {
  const parts = line.split("|");
  const dataParts = parts.slice(1, -1);

  if (cellIndex < dataParts.length) {
    dataParts[cellIndex] = ` ${value} `;
  }

  return `|${dataParts.join("|")}|`;
}
