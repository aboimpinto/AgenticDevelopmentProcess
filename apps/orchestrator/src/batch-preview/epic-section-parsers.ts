import { parseTableCells } from "./epic-feature-table.js";

// ──────────────────────────────────────────────
// FEAT-011: Phase 2 — EPIC Markdown section parsers
// ──────────────────────────────────────────────

export interface ParsedFeatureDetail {
  featId: string;
  title: string;
  headingLine: string;
  sectionContent: string;
  lineStart: number;
  lineEnd: number;
}

export function parseFeatureDetailSections(markdown: string): ParsedFeatureDetail[] {
  const lines = markdown.split(/\r?\n/);
  const sections: ParsedFeatureDetail[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    const detailMatch = line.match(/^###\s+Feature\s+\d+\s*:\s*(.+?)\(\s*(FEAT-\d+)\s*\)\s*$/i);

    if (!detailMatch) {
      continue;
    }

    const featId = detailMatch[2].toUpperCase();
    const title = detailMatch[1].trim();
    let sectionLines: string[] = [line];
    let j = i + 1;

    while (j < lines.length) {
      const nextLine = lines[j] ?? "";

      // Stop at code fence boundaries so the for loop handles the toggle
      if (/^```/.test(nextLine.trim())) {
        break;
      }

      if (/^###\s/.test(nextLine)) {
        break;
      }

      sectionLines.push(nextLine);
      j++;
    }

    sections.push({
      featId,
      title,
      headingLine: line,
      sectionContent: sectionLines.join("\n"),
      lineStart: i,
      lineEnd: j - 1,
    });

    i = j - 1;
  }

  return sections;
}

export interface ProgressTrackingEntry {
  featId: string | null;
  status: string;
  started: string;
  completed: string;
  notes: string;
  rawLine: string;
  lineIndex: number;
}

export function parseProgressTracking(markdown: string): ProgressTrackingEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ProgressTrackingEntry[] = [];
  let inProgressTable = false;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    // Specific: must match the full progress tracking header
    if (
      !inProgressTable &&
      /\|\s*Feature\s+ID\s*\|\s*Status\s*\|\s*Started\s*\|\s*Completed\s*\|\s*Notes\s*\|/i.test(line)
    ) {
      inProgressTable = true;
      continue;
    }

    // Skip separator row
    if (inProgressTable && /^\|[\s\-:]+\|/.test(line.trim())) {
      continue;
    }

    if (inProgressTable) {
      if (!line.includes("|") || /^\s*$/.test(line)) {
        inProgressTable = false;
        continue;
      }

      const cells = parseTableCells(line);

      if (cells.length >= 2) {
        const firstCell = (cells[0] ?? "").trim();
        const featMatch = firstCell.match(/FEAT-(\d+)/i);
        const featId = featMatch ? "FEAT-" + featMatch[1].padStart(3, "0").toUpperCase() : null;

        entries.push({
          featId,
          status: (cells[1] ?? "").replace(/\*\*/g, "").trim(),
          started: (cells[2] ?? "").replace(/\*\*/g, "").trim(),
          completed: (cells[3] ?? "").replace(/\*\*/g, "").trim(),
          notes: (cells[4] ?? "").replace(/\*\*/g, "").trim(),
          rawLine: line,
          lineIndex: i,
        });
      }
    }
  }

  return entries;
}

export interface MermaidNode {
  variable: string;
  title: string;
  rawLine: string;
  lineIndex: number;
}

export interface MermaidClass {
  variable: string;
  className: string;
  rawLine: string;
  lineIndex: number;
}

export interface ParsedMermaidBlock {
  nodes: MermaidNode[];
  classes: MermaidClass[];
  codeFenceStart: number;
  codeFenceEnd: number;
  lines: string[];
}

export function parseMermaidDiagram(markdown: string): ParsedMermaidBlock | null {
  const lines = markdown.split(/\r?\n/);
  let inMermaidBlock = false;
  let codeFenceStart = -1;
  let codeFenceEnd = -1;
  const nodes: MermaidNode[] = [];
  const classes: MermaidClass[] = [];
  const mermaidLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (/^```mermaid\s*$/i.test(line.trim())) {
      inMermaidBlock = true;
      codeFenceStart = i;
      mermaidLines.push(line);
      continue;
    }

    if (inMermaidBlock && /^```\s*$/.test(line.trim())) {
      inMermaidBlock = false;
      codeFenceEnd = i;
      mermaidLines.push(line);
      break;
    }

    if (inMermaidBlock) {
      mermaidLines.push(line);

      // Indentation-tolerant node matching
      const nodeMatch = line.match(/^\s*(\w+)\[(.+?)\]/);

      if (nodeMatch) {
        nodes.push({
          variable: nodeMatch[1],
          title: nodeMatch[2],
          rawLine: line,
          lineIndex: i,
        });
      }

      // Indentation-tolerant class matching
      const classMatch = line.match(/^\s*class\s+(\w+)\s+(\S+)/);

      if (classMatch) {
        classes.push({
          variable: classMatch[1],
          className: classMatch[2],
          rawLine: line,
          lineIndex: i,
        });
      }
    }
  }

  if (codeFenceStart < 0) {
    return null;
  }

  return {
    nodes,
    classes,
    codeFenceStart,
    codeFenceEnd,
    lines: mermaidLines,
  };
}
