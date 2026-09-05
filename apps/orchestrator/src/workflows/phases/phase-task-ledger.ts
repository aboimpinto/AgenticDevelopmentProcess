import type { ImplementationTaskRunStatus, PhaseSummary, WorkItemCard } from "@hepha/shared";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import type { StoredProject } from "../../projects/stored-project.js";

export interface PhaseTaskLedgerItem {
  checked: boolean;
  id: string;
  lineNumber: number;
  section: string;
  status: ImplementationTaskRunStatus;
  taskIndex: number;
  text: string;
}

export function extractPhaseTaskLedger(markdown: string, phaseNumber: number | null = null): PhaseTaskLedgerItem[] {
  const items: PhaseTaskLedgerItem[] = [];
  const seenIds = new Map<string, number>();
  let section = "Document";
  const lines = markdown.split(/\r?\n/);
  const hasExplicitLedger = lines.some((line) => {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(line);
    return heading ? /^phase task ledger$/i.test(cleanInlineMarkdown(heading[1]!)) : false;
  });
  let insideExplicitLedger = !hasExplicitLedger;
  let explicitLedgerLevel = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const headingLevel = heading[1]!.length;
      const headingText = cleanInlineMarkdown(heading[2]!).trim();
      if (hasExplicitLedger && /^phase task ledger$/i.test(headingText)) {
        insideExplicitLedger = true;
        explicitLedgerLevel = headingLevel;
      } else if (hasExplicitLedger && insideExplicitLedger && headingLevel <= explicitLedgerLevel) {
        insideExplicitLedger = false;
      }
      section = headingText || section;
      continue;
    }
    if (!insideExplicitLedger) continue;
    const checkbox = /^\s*[-*]\s+\[([ xX-])\]\s+(.+?)\s*$/.exec(line);
    if (!checkbox) continue;
    const text = truncate(cleanInlineMarkdown(checkbox[2]!).trim(), 240);
    const baseId = createPhaseTaskId(phaseNumber, section, text);
    const duplicateIndex = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, duplicateIndex + 1);
    const status = checkbox[1] === "x" || checkbox[1] === "X"
      ? "COMPLETED"
      : checkbox[1] === "-" ? "IN_PROGRESS" : "NOT_STARTED";
    items.push({
      checked: status === "COMPLETED",
      id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
      lineNumber: index + 1,
      section,
      status,
      taskIndex: items.length,
      text,
    });
  }
  return items;
}

export function renderPhaseTaskLedgerContext(
  project: StoredProject,
  feature: WorkItemCard,
  phase?: PhaseSummary | null,
): string {
  if (phase) return renderSinglePhaseTaskLedgerContext(project, phase);
  const phases = feature.phases.filter((candidate) => candidate.number !== null && !isHumanReviewFindingsPhase(candidate));
  if (phases.length === 0) {
    return ["## Phase Task Resume Ledger", "", "- No phase documents were found yet. Start Feature must create durable checkbox task ledgers in the phase documents before implementation resumes."].join("\n");
  }
  const lines = [
    "## Phase Task Resume Ledger", "",
    "This overview is derived from markdown checkboxes in phase documents. Checked items are durable resume state; unchecked items are the remaining executable queue.", "",
  ];
  for (const current of phases.slice(0, 12)) {
    if (!isFile(current.documentPath)) {
      lines.push(`- Phase ${current.number ?? "?"}: no readable phase document.`);
      continue;
    }
    const items = extractPhaseTaskLedger(readFileSync(current.documentPath, "utf8"), current.number);
    const checked = items.filter((item) => item.checked).length;
    lines.push(`- Phase ${current.number ?? "?"} (${current.title || "Untitled"}): ${checked}/${items.length} checked, ${items.length - checked} unchecked, status ${current.status || "Unknown"} — ${normalizePath(project.rootPath, current.documentPath)}`);
  }
  return lines.join("\n");
}

export function renderSinglePhaseTaskLedgerContext(project: StoredProject, phase: PhaseSummary): string {
  const lines = [
    "## Phase Task Resume Ledger", "", "Rules:",
    "- Treat this ledger as the durable resume plan for the current phase.",
    "- Hepha owns task checkmarks, task IDs, lifecycle state, and quality-gate decisions. Do not edit those machine-owned fields.",
    "- Skip checked items unless a later changed file, failed verification, or review-finding decision explicitly invalidates them.",
    "- Work only unchecked items, invalidated checked items, missing final gates, or listed review findings.",
    "- If evidence would invalidate a checked item, report the exact evidence in your result. Hepha will apply any ledger change deterministically.", "",
    `Phase: ${phase.number === null ? phase.title : `Phase ${phase.number}`} - ${phase.title || "Untitled"}`,
    `Phase status: ${phase.status || "Unknown"}`,
    `Phase document: ${normalizePath(project.rootPath, phase.documentPath)}`,
  ];
  if (!isFile(phase.documentPath)) return [...lines, "", "- Phase document is missing or unreadable; no task ledger is available."].join("\n");
  const items = extractPhaseTaskLedger(readFileSync(phase.documentPath, "utf8"), phase.number);
  if (items.length === 0) return [...lines, "", "- No markdown checkboxes found in this phase document.", "- Before doing substantive work, add a `## Phase Task Ledger` or equivalent checklist with durable task/gate items for resume safety."].join("\n");
  const checked = items.filter((item) => item.checked);
  const unchecked = items.filter((item) => !item.checked);
  lines.push("", `Ledger summary: ${checked.length}/${items.length} checked, ${unchecked.length} unchecked.`, "", "### Unchecked Items To Work Next", "");
  lines.push(...(unchecked.length ? unchecked.slice(0, 30).map(renderPhaseTaskLedgerItem) : ["- None. Resume at missing checkpoint/review/finalization gates only."]));
  if (checked.length) {
    lines.push("", "### Checked Items To Preserve", "", ...checked.slice(0, 20).map(renderPhaseTaskLedgerItem));
    if (checked.length > 20) lines.push(`- ... ${checked.length - 20} more checked items omitted from prompt context.`);
  }
  return lines.join("\n");
}

export function createPhaseTaskId(phaseNumber: number | null, section: string, text: string): string {
  return `${phaseNumber === null ? "phase-unknown" : `phase-${phaseNumber}`}.${slug(section)}.${slug(text)}`;
}

function renderPhaseTaskLedgerItem(item: PhaseTaskLedgerItem): string {
  return `- L${item.lineNumber} [${item.checked ? "x" : " "}] ${item.section}: ${item.text} (${item.status}, ${item.id})`;
}

function cleanInlineMarkdown(value: string): string {
  return value.replace(/`/g, "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/_/g, " ").replace(/[^\S\r\n]+/g, " ").trim();
}

function slug(value: string): string {
  return cleanInlineMarkdown(value).toLowerCase().replace(/`([^`]+)`/g, "$1").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "task";
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}...`;
}

function isFile(path: string): boolean {
  try { return existsSync(path) && statSync(path).isFile(); } catch { return false; }
}

function isHumanReviewFindingsPhase(phase: Pick<PhaseSummary, "fileName" | "title">): boolean {
  return /human-review-findings/i.test(phase.fileName) || /human review findings/i.test(phase.title);
}

function normalizePath(root: string, path: string): string {
  const value = relative(root, path);
  return value && !value.startsWith("..") ? value.replaceAll("\\", "/") : path;
}
