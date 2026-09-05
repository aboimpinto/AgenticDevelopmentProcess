// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface EpicFeatureRow {
  rawText: string;
  featureId: string | null;   // null for TBD / unnamed entries
  title: string;
  dependencyText: string;
  status: string;
  priority: string | null;
  rowIndex: number;
  isTbd: boolean;
}
export interface ParsedFeatureTable {
  rows: EpicFeatureRow[];
  headerRowIndex: number;
}

// ──────────────────────────────────────────────
// EPIC feature table parsing
// ──────────────────────────────────────────────

/**
 * Parse the Features Breakdown table from an EPIC document.
 * Returns ordered rows preserving source order.
 */
export function parseEpicFeatureTable(markdown: string): ParsedFeatureTable {
  const lines = markdown.split(/\r?\n/);
  const rows: EpicFeatureRow[] = [];
  const hasFeatureBreakdownHeading = lines.some((line) => /^#{2,}\s+Features?\s+Breakdown\b/i.test(line.trim()));
  let headerRowIndex = -1;
  let inFeatureTable = false;
  let inCodeFence = false;
  let reachedFeatureBreakdown = !hasFeatureBreakdownHeading;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Track code fences
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    if (hasFeatureBreakdownHeading && /^#{2,}\s+Features?\s+Breakdown\b/i.test(line.trim())) {
      reachedFeatureBreakdown = true;
      continue;
    }

    // Detect feature table header
    if (
      !inFeatureTable &&
      headerRowIndex < 0 &&
      reachedFeatureBreakdown &&
      /\|\s*(Feature\s+ID|Layer\s*\/\s*Feature)\s*\|/i.test(line)
    ) {
      inFeatureTable = true;
      headerRowIndex = i;
      continue;
    }

    // Look for separator row after header
    if (inFeatureTable && /^\|[\s\-:]+\|/.test(line.trim())) {
      continue;
    }

    // Detect end of table
    if (inFeatureTable) {
      if (!line.includes("|") || /^\s*$/.test(line)) {
        inFeatureTable = false;
        continue;
      }

      const cells = parseTableCells(line);

      if (cells.length >= 2) {
        const firstCell = (cells[0] ?? "").trim();
        const titleCell = (cells[1] ?? "").trim();
        const featureId = extractFeatId(firstCell);
        const isTbd = /^(TBD|todo|pending|unnamed)$/i.test(firstCell);
        const rawRow = {
          rawText: line,
          featureId,
          title: extractFeatureRowTitle(featureId, titleCell, firstCell),
          dependencyText: (cells[3] ?? "").replace(/\*\*/g, "").trim() || "",
          status: (cells[2] ?? "").replace(/\*\*/g, "").trim(),
          priority: extractPriority(cells),
          rowIndex: i,
          isTbd,
        };

        rows.push(rawRow);
      }
    }
  }

  return { rows, headerRowIndex };
}

export function parseTableCells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)  // drop leading/trailing empty from first/last |
    .map((cell) => cell.replace(/`/g, "").replace(/\*\*/g, "").trim());
}

function extractFeatId(cell: string): string | null {
  const match = cell.match(/\b(FEAT-\d+)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function extractFeatureRowTitle(featureId: string | null, titleCell: string, firstCell: string): string {
  if (titleCell) {
    return titleCell;
  }

  // No second cell; use first cell minus FEAT ID
  if (featureId) {
    return firstCell.replace(new RegExp(`\\b${escapeRegex(featureId)}\\b`, "i"), "").replace(/[-:]\s*$/, "").trim();
  }

  return firstCell;
}

function extractPriority(cells: string[]): string | null {
  // Priority is typically in cell index 4 or 5
  for (const cell of cells.slice(3)) {
    const trimmed = cell.replace(/\*\*/g, "").trim();

    if (/^(P[1-5]|High|Medium|Low|Urgent|Normal|Critical)$/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
  }

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
