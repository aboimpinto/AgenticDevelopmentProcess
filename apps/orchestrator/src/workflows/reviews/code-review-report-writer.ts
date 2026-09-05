import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";

interface CodeReviewReportWriterDependencies {
  now?: () => Date;
}

export class CodeReviewReportWriter {
  constructor(private readonly dependencies: CodeReviewReportWriterDependencies = {}) {}

  write(
    feature: Pick<WorkItemCard, "folderPath">,
    phase: PhaseSummary & { number: number },
    markdown: string,
  ): string {
    const reportsPath = resolve(feature.folderPath, "code-reviews");
    const timestamp = (this.dependencies.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
    const reportPath = resolve(reportsPath, `phase-${phase.number}-code-review-${timestamp}.md`);
    mkdirSync(reportsPath, { recursive: true });
    writeFileSync(reportPath, `${stripMarkdownFence(markdown).trim()}\n`, "utf8");
    return reportPath;
  }
}

export function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}
