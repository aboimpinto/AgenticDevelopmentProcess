import React from "react";
import {
  formatDuration,
  formatEffortEstimateRange,
  type PortfolioTimingAnalytics,
} from "@hepha/shared";

export function PortfolioTimingSummaryPanel({
  analytics,
  title,
}: {
  readonly analytics: PortfolioTimingAnalytics;
  readonly title: string;
}) {
  if (analytics.comparableFeatureCount === 0) return null;

  return (
    <section className="validation-panel workflow-timing-summary" aria-label={title}>
      <div className="validation-heading"><strong>{title}</strong></div>
      <dl className="workflow-timing-values">
        <div><dt>Measured FEATs</dt><dd>{analytics.comparableFeatureCount}/{analytics.featureCount}</dd></div>
        <div><dt>Original human estimate</dt><dd>{formatEffortEstimateRange(analytics.totalHumanEstimate)}</dd></div>
        <div><dt>Actual AI execution</dt><dd>{formatDuration(analytics.totalActualAiDurationMs)}</dd></div>
        {analytics.estimatedHumanTimeSavedMidpointMs !== null && (
          <div><dt>Estimated human delivery gain</dt><dd>{formatSignedGain(analytics.estimatedHumanTimeSavedMidpointMs)}</dd></div>
        )}
        {analytics.humanAccelerationMidpoint !== null && (
          <div><dt>Estimated delivery acceleration</dt><dd>{analytics.humanAccelerationMidpoint.toFixed(1)}×</dd></div>
        )}
      </dl>
    </section>
  );
}

function formatSignedGain(durationMs: number) {
  return durationMs >= 0
    ? formatDuration(durationMs)
    : `${formatDuration(Math.abs(durationMs))} over estimate`;
}
