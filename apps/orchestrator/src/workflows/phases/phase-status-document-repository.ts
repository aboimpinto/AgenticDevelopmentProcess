import { existsSync, readFileSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { PhaseSummary } from "@hepha/shared";
import {
  readFeatureTasksPhaseRow,
  updateFeatureTasksPhaseStatus,
} from "../../feature-tasks-phase-status.js";
import { cleanInlineMarkdown } from "../../memorybank/markdown-parsing.js";
import {
  isStandalonePhaseStatusLine,
} from "../../memorybank/phase-document-parser.js";
import { formatPhaseReference } from "./phase-lifecycle-policy.js";
import { extractPhaseTaskLedger } from "./phase-task-ledger.js";

type NumberedPhase = PhaseSummary & { number: number };

export class PhaseStatusDocumentRepository {
  constructor(private readonly configuration?: { sessionDirectory: string }) {}

  isAwaitingReviewRerun(phase: PhaseSummary): boolean {
    const status = cleanInlineMarkdown(phase.status ?? "");
    const markdown = existsSync(phase.documentPath) ? readFileSync(phase.documentPath, "utf8") : "";
    const featureTasksRow = this.readFeatureTasksRow(phase);
    const documentText = `${status}\n${markdown}\n${featureTasksRow}`;
    if (/review fixes applied|awaiting code review rerun|awaiting review rerun/i.test(documentText)) return true;

    // Fallback: check session JSON files — fixers often write the review-ready
    // note in their chat response but forget to add it to the document.
    return this.hasReviewReadyTextInSessions();
  }

  recordApprovedReviewEvidence(phase: PhaseSummary, reportPath: string): void {
    if (!existsSync(phase.documentPath)) return;
    const markdown = readFileSync(phase.documentPath, "utf8");
    const relativeReportPath = `code-reviews/${basename(reportPath)}`;
    const nextMarkdown = markdown.replace(
      /^(\|\s*Code review\s*\|\s*)[^|]+(\|)[^\n]*$/im,
      `$1 satisfied $2 Approved code review report: \`${relativeReportPath}\`.`,
    );
    if (nextMarkdown === markdown) {
      throw new Error(`${formatPhaseReference(phase)} code review was approved but its Quality Gate Evidence row could not be persisted.`);
    }
    writeFileSync(phase.documentPath, nextMarkdown, "utf8");
  }

  markCompleted(featureFolderPath: string, phase: NumberedPhase): void {
    this.writePhaseStatus(phase, "COMPLETED");
    updateFeatureTasksPhaseStatus(resolve(featureFolderPath, "FeatureTasks.md"), phase.number, "COMPLETED");
  }

  hasCheckedTaskLedger(phase: PhaseSummary): boolean {
    if (!existsSync(phase.documentPath) || !safeIsFile(phase.documentPath)) return false;
    const tasks = extractPhaseTaskLedger(readFileSync(phase.documentPath, "utf8"), phase.number);
    return tasks.length > 0 && tasks.every((task) => task.checked);
  }

  markAwaitingReview(featureFolderPath: string, phase: NumberedPhase): void {
    this.writePhaseStatus(phase, "AWAITING_REVIEW");
    updateFeatureTasksPhaseStatus(resolve(featureFolderPath, "FeatureTasks.md"), phase.number, "AWAITING_REVIEW");
  }

  markAwaitingReviewRerun(featureFolderPath: string, phase: NumberedPhase): void {
    this.markAwaitingReview(featureFolderPath, phase);
    if (!existsSync(phase.documentPath)) {
      throw new Error(`${formatPhaseReference(phase)} document was not found while recording the code-review rerun gate.`);
    }
    const markdown = readFileSync(phase.documentPath, "utf8");
    const codeReviewRow = /^(\|\s*Code review\s*\|)\s*[^|]*(\|)[^\n]*$/im;
    const nextMarkdown = markdown.replace(
      codeReviewRow,
      "$1 missing $2 Fixer responses are complete; awaiting an independent code-review rerun. |",
    );
    if (nextMarkdown === markdown) {
      if (!codeReviewRow.test(markdown)) {
        throw new Error(`${formatPhaseReference(phase)} has no writable Code review Quality Gate Evidence row.`);
      }
      return;
    }
    writeFileSync(phase.documentPath, nextMarkdown, "utf8");
  }

  private hasReviewReadyTextInSessions(): boolean {
    if (!this.configuration?.sessionDirectory) return false;
    if (!existsSync(this.configuration.sessionDirectory)) return false;
    const reviewReady = /review fixes applied|awaiting code review rerun|awaiting review rerun/i;
    try {
      const sessions = readdirSync(this.configuration.sessionDirectory);
      for (const file of sessions.filter((f) => f.endsWith(".json")).slice(-10)) {
        const path = resolve(this.configuration.sessionDirectory!, file);
        try {
          const content = readFileSync(path, "utf8");
          if (reviewReady.test(content)) return true;
        } catch { continue; }
      }
    } catch { /* best-effort */ }
    return false;
  }

  private readFeatureTasksRow(phase: PhaseSummary): string {
    const featureTasksPath = resolve(dirname(dirname(phase.documentPath)), "FeatureTasks.md");
    if (!existsSync(featureTasksPath)) return "";
    const markdown = readFileSync(featureTasksPath, "utf8");
    const phaseNumber = Number(phase.number);
    return Number.isFinite(phaseNumber) ? readFeatureTasksPhaseRow(markdown, phaseNumber) : markdown;
  }

  private writePhaseStatus(phase: PhaseSummary, status: string): void {
    if (!existsSync(phase.documentPath)) return;
    const markdown = readFileSync(phase.documentPath, "utf8");
    const nextMarkdown = replaceImplementationPhaseStatusLine(markdown, status);
    if (nextMarkdown !== markdown) writeFileSync(phase.documentPath, nextMarkdown, "utf8");
  }

}

export function replaceImplementationPhaseStatusLine(markdown: string, status: string): string {
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => isStandalonePhaseStatusLine(line));
  if (index === -1) return `**Status:** ${status}\n\n${markdown}`;
  lines[index] = `**Status:** ${status}`;
  return `${lines.join("\n").trimEnd()}\n`;
}

export { updateFeatureTasksPhaseStatus } from "../../feature-tasks-phase-status.js";

function safeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
