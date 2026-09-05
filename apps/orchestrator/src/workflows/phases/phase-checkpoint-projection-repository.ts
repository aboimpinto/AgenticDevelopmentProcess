import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { PhaseSummary } from "@hepha/shared";
import type { AggregateVerificationResult } from "../../final-verification-types.js";
import {
  renderPhaseCheckpointReport,
  upsertPhaseCheckpointReport,
} from "../../phase-checkpoint-report.js";

/** Persists the latest declared verification result in its phase document. */
export class PhaseCheckpointProjectionRepository {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  persist(
    phase: PhaseSummary & { number: number },
    verification: AggregateVerificationResult,
    reviewArtifactHash: string | null,
  ): void {
    if (!existsSync(phase.documentPath)) return;
    const markdown = readFileSync(phase.documentPath, "utf8");
    const report = renderPhaseCheckpointReport({
      completedTasks: false,
      executedAt: this.now(),
      reviewArtifactHash,
      reviewSatisfied: true,
      verification,
    });
    const withCoverageGate = applyCoverageMeasurementGate(markdown, verification);
    writeFileSync(phase.documentPath, upsertPhaseCheckpointReport(withCoverageGate, report), "utf8");
  }
}

/** Settles only the machine-owned coverage row from successful measurement evidence. */
export function applyCoverageMeasurementGate(
  markdown: string,
  verification: AggregateVerificationResult,
): string {
  const checks = verification.checks.filter((check) => check.intent === "coverage");
  if (checks.length === 0) return markdown;
  const measured = checks.every((check) => check.outcome === "passed" || check.outcome === "advisory");
  const evidence = checks.map((check) => humanCoverageEvidence(check.outputSummary)).join("; ")
    || "Coverage check returned no evidence.";
  const row = /^(\|\s*Test coverage\s*\|)\s*[^|]*(\|)\s*[^|]*(\|)\s*$/im;
  if (!row.test(markdown)) return markdown;
  return markdown.replace(
    row,
    `$1 ${measured ? "satisfied" : "missing"} $2 ${evidence.replaceAll("|", "/")} $3`,
  );
}

function humanCoverageEvidence(outputSummary: string): string {
  return outputSummary.split(/\r?\n/)
    .find((line) => !line.startsWith("HEPHA_COVERAGE_MEASUREMENT_V1:"))
    ?.trim() ?? "";
}
