import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readPhaseDocumentNumber } from "./phase-execution-contract.js";

type InventorySchema = "contract" | "legacy";

interface InventoryHeader {
  readonly documentColumn: number | null;
  readonly headerLine: number;
  readonly phaseColumn: number | null;
  readonly schema: InventorySchema;
  readonly statusColumn: number;
}

interface InventoryRow {
  readonly line: string;
  readonly lineIndex: number;
  readonly phaseNumber: number;
  readonly status: string;
  readonly statusColumn: number;
}

/** Read the authoritative status for one numbered phase. */
export function readFeatureTasksPhaseStatus(markdown: string, phaseNumber: number): string | null {
  return readInventoryRows(markdown).find((row) => row.phaseNumber === phaseNumber)?.status ?? null;
}

/** Read every numbered phase status from the selected inventory schema. */
export function readFeatureTasksPhaseStatusMap(markdown: string): Map<number, string> {
  const statuses = new Map<number, string>();
  for (const row of readInventoryRows(markdown)) {
    if (!statuses.has(row.phaseNumber)) statuses.set(row.phaseNumber, row.status);
  }
  return statuses;
}

/** Return the full inventory row used as durable narrative evidence. */
export function readFeatureTasksPhaseRow(markdown: string, phaseNumber: number): string {
  return readInventoryRows(markdown).find((row) => row.phaseNumber === phaseNumber)?.line ?? "";
}

/** Replace one phase status without changing the selected table's other cells. */
export function replaceFeatureTasksPhaseStatus(
  markdown: string,
  phaseNumber: number,
  status: string,
): string | null {
  const matches = readInventoryRows(markdown).filter((row) => row.phaseNumber === phaseNumber);
  if (matches.length !== 1) return null;
  const row = matches[0]!;
  const lines = markdown.split(/\r?\n/);
  const cells = lines[row.lineIndex]!.split("|");
  // split() retains the leading border cell, hence +1.
  cells[row.statusColumn + 1] = ` ${status} `;
  lines[row.lineIndex] = cells.join("|");
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Persist one phase status; false means no unique authoritative row existed. */
export function updateFeatureTasksPhaseStatus(path: string, phaseNumber: number, status: string): boolean {
  if (!existsSync(path)) return false;
  const markdown = readFileSync(path, "utf8");
  const next = replaceFeatureTasksPhaseStatus(markdown, phaseNumber, status);
  if (next === null) return false;
  if (next !== markdown) writeFileSync(path, next, "utf8");
  return true;
}

function readInventoryRows(markdown: string): InventoryRow[] {
  const lines = markdown.split(/\r?\n/);
  const header = findInventoryHeader(lines);
  if (!header) return [];
  const rows: InventoryRow[] = [];

  for (let lineIndex = header.headerLine + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!;
    if (!line.trim().startsWith("|")) break;
    const cells = parseCells(line);
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const phaseNumber = header.schema === "contract"
      ? readContractPhaseNumber(cells[header.documentColumn!] ?? "")
      : readLegacyPhaseNumber(cells[header.phaseColumn!] ?? "");
    const status = cells[header.statusColumn]?.trim() ?? "";
    if (phaseNumber === null || !status) continue;
    rows.push({ line, lineIndex, phaseNumber, status, statusColumn: header.statusColumn });
  }
  return rows;
}

function findInventoryHeader(lines: readonly string[]): InventoryHeader | null {
  const candidates: InventoryHeader[] = [];
  for (const [headerLine, line] of lines.entries()) {
    if (!line.trim().startsWith("|")) continue;
    const headers = parseCells(line).map((cell) => cell.toLowerCase());
    const statusColumn = headers.indexOf("status");
    const documentColumn = headers.indexOf("document");
    const contractIdColumn = headers.indexOf("contract id");
    const roleColumn = headers.indexOf("role");
    if (statusColumn >= 0 && documentColumn >= 0 && contractIdColumn >= 0 && roleColumn >= 0) {
      candidates.push({ documentColumn, headerLine, phaseColumn: null, schema: "contract", statusColumn });
      continue;
    }
    const phaseColumn = headers.indexOf("phase");
    if (phaseColumn >= 0 && statusColumn >= 0) {
      candidates.push({ documentColumn: null, headerLine, phaseColumn, schema: "legacy", statusColumn });
    }
  }
  return candidates.find((candidate) => candidate.schema === "contract") ?? candidates[0] ?? null;
}

function readContractPhaseNumber(value: string): number | null {
  const normalized = value.replace(/`/g, "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
  return readPhaseDocumentNumber(normalized);
}

function readLegacyPhaseNumber(value: string): number | null {
  const match = /^(\d+)(?=\s*(?:$|\||—|-|:))/.exec(value.trim());
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function parseCells(line: string): string[] {
  return line.trim().split("|").slice(1, -1).map((cell) => cell.trim());
}
