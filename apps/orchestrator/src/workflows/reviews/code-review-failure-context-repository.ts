import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import {
  parseCodeReviewReportResult,
  type CodeReviewReportResult,
} from "../../code-review-report-result.js";
import {
  extractCodeReviewBlockedPhaseNumber,
  extractWorkflowFailurePhaseNumber,
} from "../recovery/implementation-failure-classifier.js";
import {
  extractCodeReviewFindings,
  type CodeReviewFindingDecisionItem,
} from "./code-review-finding-parser.js";

export interface CodeReviewFailureContext {
  readonly excerpt: string;
  readonly findings: CodeReviewFindingDecisionItem[];
  readonly phaseNumber: number;
  readonly reportPath: string;
  readonly reviewResult: string;
}

export interface LatestCodeReviewReport {
  readonly markdown: string;
  readonly path: string;
  readonly result: CodeReviewReportResult;
}

export class CodeReviewFailureContextRepository {
  extract(rawError: string): CodeReviewFailureContext | null {
    return selectLatestContext(this.extractAll(rawError));
  }

  resolve(feature: WorkItemCard, rawError: string): CodeReviewFailureContext | null {
    const directContext = this.extract(rawError);
    const phaseNumber = directContext?.phaseNumber ?? extractWorkflowFailurePhaseNumber(rawError);
    if (!phaseNumber) return isActionable(directContext) ? directContext : null;

    // A failure brief is historical context, not review authority. The newest
    // actionable on-disk report must win over an older path in the brief.
    const latestReport = this.findLatest(feature.folderPath, phaseNumber);
    if (!latestReport) return isActionable(directContext) ? directContext : null;
    return createContext(latestReport.markdown, phaseNumber, latestReport.path);
  }

  extractAll(rawError: string): CodeReviewFailureContext[] {
    const contexts: CodeReviewFailureContext[] = [];
    const seen = new Set<string>();
    const matches = rawError.matchAll(/\b(?:See|Review report:)\s+(.+?phase-(\d+)-code-review-[^\s]+\.md)\b/gi);

    for (const match of matches) {
      const reportPath = match[1] ? resolve(match[1]) : null;
      const phaseNumber = Number.parseInt(match[2] ?? "", 10);
      if (!reportPath || !phaseNumber || seen.has(reportPath) || !existsSync(reportPath)) continue;
      seen.add(reportPath);
      contexts.push(createContext(readFileSync(reportPath, "utf8"), phaseNumber, reportPath));
    }
    if (contexts.length > 0) return contexts;

    const phaseNumber = extractCodeReviewBlockedPhaseNumber(rawError);
    const reportPath = extractReportPath(rawError);
    return phaseNumber && reportPath && existsSync(reportPath)
      ? [createContext(readFileSync(reportPath, "utf8"), phaseNumber, reportPath)]
      : [];
  }

  isSupersededByApproval(rawError: string): boolean {
    const contexts = this.extractAll(rawError);
    return contexts.length > 0 && contexts.every((context) => this.hasNewerApproval(context));
  }

  hasNewerApproval(context: Pick<CodeReviewFailureContext, "phaseNumber" | "reportPath">): boolean {
    const reportsPath = dirname(context.reportPath);
    const failedReportName = basename(context.reportPath);
    const pattern = new RegExp(`^phase-${context.phaseNumber}-code-review-.+\\.md$`, "i");
    return safeReadDirectory(reportsPath)
      .filter((entry) => pattern.test(entry) && entry > failedReportName)
      .some((entry) => {
        const reportPath = resolve(reportsPath, entry);
        return existsSync(reportPath)
          && parseCodeReviewReportResult(readFileSync(reportPath, "utf8")) === "APPROVED";
      });
  }

  findLatest(featureFolderPath: string, phaseNumber: number): LatestCodeReviewReport | null {
    const reportsPath = resolve(featureFolderPath, "code-reviews");
    const pattern = new RegExp(`^phase-${phaseNumber}-code-review-.+\\.md$`, "i");
    for (const entry of safeReadDirectory(reportsPath).filter((name) => pattern.test(name)).sort().reverse()) {
      const reportPath = resolve(reportsPath, entry);
      if (!existsSync(reportPath)) continue;
      const markdown = readFileSync(reportPath, "utf8");
      const result = parseCodeReviewReportResult(markdown);
      // Infrastructure/harness notes are auditable but are not actionable
      // finding contracts and cannot hide the latest NEEDS_CHANGES report.
      if (result === "UNKNOWN" || extractCodeReviewFindings(markdown).length === 0) continue;
      return { markdown, path: reportPath, result };
    }
    return null;
  }
}

function createContext(markdown: string, phaseNumber: number, reportPath: string): CodeReviewFailureContext {
  return {
    excerpt: truncate(stripMarkdownFence(markdown).trim(), 1800),
    findings: extractCodeReviewFindings(markdown),
    phaseNumber,
    reportPath,
    reviewResult: parseCodeReviewReportResult(markdown),
  };
}

function selectLatestContext(contexts: CodeReviewFailureContext[]): CodeReviewFailureContext | null {
  return contexts.reduce<CodeReviewFailureContext | null>(
    (latest, context) => !latest || context.reportPath.localeCompare(latest.reportPath) > 0 ? context : latest,
    null,
  );
}

function isActionable(context: CodeReviewFailureContext | null): context is CodeReviewFailureContext {
  return Boolean(context && context.reviewResult !== "UNKNOWN" && context.findings.length > 0);
}

function extractReportPath(rawError: string): string | null {
  const match = rawError.match(/\bSee\s+(.+?phase-\d+-code-review-[^\s]+\.md)\b/i)
    ?? rawError.match(/-\s*Review report:\s*(.+?phase-\d+-code-review-[^\s]+\.md)\b/i);
  return match?.[1] ? resolve(match[1]) : null;
}

function safeReadDirectory(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function stripMarkdownFence(value: string): string {
  return value.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
