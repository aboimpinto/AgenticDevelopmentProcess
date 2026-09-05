import type { StoredImplementationTaskRun } from "@hepha/db";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { updateFeatureTasksPhaseStatus } from "../../feature-tasks-phase-status.js";
import { cleanInlineMarkdown } from "../../memorybank/markdown-parsing.js";
import { selectDeclaredOrderedLedgerItems } from "../../ordered-phase-task-policy.js";
import {
  getPhaseExecutionContractForDocument,
  loadPhaseExecutionContract,
  phaseUsesOrderedTaskExecutors,
  readPhaseContractTaskId,
  validatePhaseTaskLedgerParity,
} from "../../phase-execution-contract.js";
import { extractPhaseTaskLedger, type PhaseTaskLedgerItem } from "./phase-task-ledger.js";

export function readPhaseTaskLedgerItems(phase: PhaseSummary & { number: number }): PhaseTaskLedgerItem[] {
  if (!isFile(phase.documentPath)) return [];
  const items = extractPhaseTaskLedger(readFileSync(phase.documentPath, "utf8"), phase.number);
  const featureFolderPath = dirname(dirname(phase.documentPath));
  const loaded = loadPhaseExecutionContract(featureFolderPath);
  const contract = getPhaseExecutionContractForDocument(loaded.contract, phase.documentPath, featureFolderPath);
  if (!phaseUsesOrderedTaskExecutors(contract)) return items;
  const parityDiagnostics = validatePhaseTaskLedgerParity(readFileSync(phase.documentPath, "utf8"), contract!);
  if (parityDiagnostics.length > 0) {
    throw new Error(`CONTRACT_TASK_LEDGER_MISMATCH: ${phase.documentPath}: ${parityDiagnostics
      .map((diagnostic) => `line ${diagnostic.line}: ${diagnostic.message}`).join(" ")}`);
  }
  return [...selectDeclaredOrderedLedgerItems({
    items,
    declaredTaskIds: contract!.tasks.map((task) => task.id),
    readTaskId: readPhaseContractTaskId,
  })];
}

export function markImplementationPhaseInProgress(
  feature: Pick<WorkItemCard, "folderPath">,
  phase: PhaseSummary & { number: number },
): void {
  if (existsSync(phase.documentPath)) {
    const markdown = readFileSync(phase.documentPath, "utf8");
    const nextMarkdown = replacePhaseStatus(markdown, "IN_PROGRESS");
    if (nextMarkdown !== markdown) writeFileSync(phase.documentPath, nextMarkdown, "utf8");
  }
  updateFeatureTasksPhaseStatus(resolve(feature.folderPath, "FeatureTasks.md"), phase.number, "IN_PROGRESS");
}

export function setPhaseTaskCheckbox(
  phase: PhaseSummary & { number: number },
  task: PhaseTaskLedgerItem,
  checked: boolean,
): void {
  if (!isFile(phase.documentPath)) return;
  const lines = readFileSync(phase.documentPath, "utf8").split(/\r?\n/);
  const currentTask = extractPhaseTaskLedger(lines.join("\n"), phase.number).find((item) => item.id === task.id);
  const lineIndex = (currentTask?.lineNumber ?? task.lineNumber) - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) return;
  lines[lineIndex] = lines[lineIndex]!.replace(/^(\s*[-*]\s+\[)[ xX-](\]\s+)/, `$1${checked ? "x" : " "}$2`);
  writeFileSync(phase.documentPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
}

export function syncPhaseTaskStateSection(
  phase: PhaseSummary & { number: number },
  items: PhaseTaskLedgerItem[],
  taskRuns: StoredImplementationTaskRun[],
): void {
  if (!isFile(phase.documentPath)) return;
  const taskRunById = new Map(taskRuns.map((taskRun) => [taskRun.taskId, taskRun]));
  const table = renderPhaseTaskStateTable(items, taskRunById);
  const markdown = readFileSync(phase.documentPath, "utf8");
  const nextMarkdown = upsertMarkdownSection(markdown, "Hepha Task State", table);
  if (nextMarkdown !== markdown) writeFileSync(phase.documentPath, nextMarkdown, "utf8");
}

export function renderPhaseTaskStateTable(
  items: PhaseTaskLedgerItem[],
  taskRunById: ReadonlyMap<string, StoredImplementationTaskRun>,
): string {
  const lines = [
    "## Hepha Task State", "",
    "| Task ID | Task | State | Started | Completed | Duration |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of items) {
    const taskRun = taskRunById.get(item.id);
    const startedAt = taskRun?.startedAt ?? null;
    const completedAt = taskRun?.completedAt ?? null;
    lines.push(`| ${escapeTableCell(item.id)} | ${escapeTableCell(item.text)} | ${taskRun?.status ?? item.status} | ${formatTimestamp(startedAt)} | ${formatTimestamp(completedAt)} | ${formatDuration(startedAt, completedAt)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function replacePhaseStatus(markdown: string, status: string): string {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex(isStandalonePhaseStatusLine);
  if (index === -1) return `**Status:** ${status}\n\n${markdown}`;
  lines[index] = `**Status:** ${status}`;
  return `${lines.join("\n").trimEnd()}\n`;
}

function upsertMarkdownSection(markdown: string, heading: string, section: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^##\\s+${escapedHeading}\\s*$`, "im").exec(markdown);
  if (!match) return `${markdown.trimEnd()}\n\n${section.trimEnd()}`;
  const afterHeading = match.index + match[0].length;
  const nextHeading = /^##\s+/m.exec(markdown.slice(afterHeading));
  const end = nextHeading?.index === undefined ? markdown.length : afterHeading + nextHeading.index;
  return `${markdown.slice(0, match.index).trimEnd()}\n\n${section.trimEnd()}\n\n${markdown.slice(end).trimStart()}`.trimEnd();
}

function isStandalonePhaseStatusLine(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed && !trimmed.startsWith("|") && /^(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:Phase\s+\d+\s+)?Status(?:\*\*)?\s*:\s*`?([^`\r\n]+)/i.test(trimmed));
}

function escapeTableCell(value: string): string {
  return cleanInlineMarkdown(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toISOString() : "-";
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "-";
  const elapsedMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "-";
  const totalSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function isFile(path: string): boolean {
  try { return existsSync(path) && statSync(path).isFile(); } catch { return false; }
}
