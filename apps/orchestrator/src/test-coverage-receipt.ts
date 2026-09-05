import type { FinalVerificationCheckRecord } from "@hepha/db";
import type {
  TestCoverageMetricSummary,
  TestCoverageSummary,
} from "@hepha/shared";
import type { TestCoverageCheckMeasurement } from "./test-coverage-telemetry.js";

const RECEIPT_PREFIX = "HEPHA_COVERAGE_MEASUREMENT_V1:";

/** Embeds a compact machine-readable receipt before human command output. */
export function serializeTestCoverageMeasurement(measurement: TestCoverageCheckMeasurement): string {
  return `${RECEIPT_PREFIX}${JSON.stringify(measurement)}`;
}

/** Reads only the controlled V1 receipt; arbitrary command output is never interpreted. */
export function parseTestCoverageMeasurement(outputSummary: string): TestCoverageCheckMeasurement | null {
  const line = outputSummary.split(/\r?\n/, 1)[0] ?? "";
  if (!line.startsWith(RECEIPT_PREFIX)) return null;
  try {
    const value = JSON.parse(line.slice(RECEIPT_PREFIX.length)) as TestCoverageCheckMeasurement;
    return isMetric(value.feature) && isMetric(value.overall)
      && Number.isFinite(value.minimumPercent) && Number.isFinite(value.targetPercent)
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Combines disjoint coverage checks (for example core and web) into one FEAT receipt. */
export function projectTestCoverageSummary(
  checks: readonly Pick<FinalVerificationCheckRecord, "intent" | "outputSummary" | "startedAt">[],
): TestCoverageSummary | null {
  const receipts = checks
    .filter((check) => check.intent === "coverage")
    .map((check) => ({ measuredAt: check.startedAt, value: parseTestCoverageMeasurement(check.outputSummary) }))
    .filter((entry): entry is { measuredAt: string; value: TestCoverageCheckMeasurement } => entry.value !== null);
  if (receipts.length === 0) return null;

  const minimumPercent = Math.max(...receipts.map(({ value }) => value.minimumPercent));
  const targetPercent = Math.max(...receipts.map(({ value }) => value.targetPercent));
  return {
    feature: combineMetrics(receipts.map(({ value }) => value.feature), minimumPercent, targetPercent, "FEAT changed-line coverage"),
    overall: combineMetrics(receipts.map(({ value }) => value.overall), minimumPercent, targetPercent, "Overall project coverage"),
    minimumPercent,
    targetPercent,
    measuredAt: receipts.map(({ measuredAt }) => measuredAt).sort().at(-1)!,
  };
}

/** Finds the newest final-verification run that contains durable coverage receipts. */
export async function readLatestTestCoverageSummary(
  store: Pick<import("@hepha/db").CardMetadataStore, "listFinalVerificationRuns" | "listFinalVerificationChecks">,
  projectId: string,
  cardKey: string,
): Promise<TestCoverageSummary | null> {
  const runs = await store.listFinalVerificationRuns(projectId, cardKey);
  for (const run of runs) {
    const summary = projectTestCoverageSummary(await store.listFinalVerificationChecks(run.id));
    if (summary) return summary;
  }
  return null;
}

function combineMetrics(
  metrics: readonly TestCoverageMetricSummary[],
  minimumPercent: number,
  targetPercent: number,
  label: string,
): TestCoverageMetricSummary {
  const applicable = metrics.filter((metric) => metric.percent !== null);
  if (applicable.length === 0) {
    return {
      assessment: "not_applicable",
      comment: `${label} is not applicable yet.`,
      coveredLines: 0,
      executableLines: 0,
      percent: null,
    };
  }
  const coveredLines = applicable.reduce((sum, metric) => sum + metric.coveredLines, 0);
  const executableLines = applicable.reduce((sum, metric) => sum + metric.executableLines, 0);
  const percent = executableLines === 0 ? 100 : Math.round((coveredLines / executableLines) * 10_000) / 100;
  if (applicable.some((metric) => metric.assessment === "needs_improvement")) {
    return { assessment: "needs_improvement", comment: `${label} should increase because at least one measured coverage scope remains below the ${minimumPercent}% reference.`, coveredLines, executableLines, percent };
  }
  if (percent === 100) return { assessment: "perfect", comment: `${label} is perfect.`, coveredLines, executableLines, percent };
  if (percent >= targetPercent) return { assessment: "excellent", comment: `${label} achieved the ${targetPercent}% target.`, coveredLines, executableLines, percent };
  if (percent >= minimumPercent) return { assessment: "ok", comment: `${label} is OK and can still improve toward ${targetPercent}%.`, coveredLines, executableLines, percent };
  return { assessment: "needs_improvement", comment: `${label} should increase toward the ${minimumPercent}% reference.`, coveredLines, executableLines, percent };
}

function isMetric(value: unknown): value is TestCoverageMetricSummary {
  if (!value || typeof value !== "object") return false;
  const metric = value as Partial<TestCoverageMetricSummary>;
  return typeof metric.comment === "string"
    && typeof metric.coveredLines === "number"
    && typeof metric.executableLines === "number"
    && (metric.percent === null || typeof metric.percent === "number")
    && typeof metric.assessment === "string";
}
