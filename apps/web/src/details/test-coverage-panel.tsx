import React from "react";
import type { TestCoverageMetricSummary, TestCoverageSummary } from "@hepha/shared";

/** Presents the latest advisory FEAT and contextual project coverage receipt. */
export function TestCoveragePanel({ coverage }: { coverage: TestCoverageSummary | null }) {
  if (!coverage) return null;
  return (
    <section className="summary-section coverage-summary" aria-labelledby="test-coverage-title">
      <div className="summary-heading-row">
        <h3 id="test-coverage-title">Test Coverage</h3>
        <span className="coverage-measured-at">Measured {new Date(coverage.measuredAt).toLocaleString()}</span>
      </div>
      <p className="coverage-scope-note">
        FEAT coverage drives scoped improvement attempts. Overall project coverage is context only and never asks this FEAT to repair unrelated code.
      </p>
      <div className="coverage-metric-grid">
        <CoverageMetric label="FEAT changed code" metric={coverage.feature} />
        <CoverageMetric label="Overall project" metric={coverage.overall} />
      </div>
      <p className="coverage-threshold-note">
        Advisory reference {formatPercent(coverage.minimumPercent)} · target {formatPercent(coverage.targetPercent)} · percentages do not block phase or FEAT completion
      </p>
    </section>
  );
}

function CoverageMetric({ label, metric }: { label: string; metric: TestCoverageMetricSummary }) {
  return (
    <article className={`coverage-metric coverage-${metric.assessment}`}>
      <span>{label}</span>
      <strong>{metric.percent === null ? "N/A" : formatPercent(metric.percent)}</strong>
      <p>{metric.comment}</p>
      {metric.percent === null ? null : <small>{metric.coveredLines}/{metric.executableLines} executable lines covered</small>}
    </article>
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}
