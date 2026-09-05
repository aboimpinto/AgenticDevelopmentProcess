import React from "react";
import { formatDuration } from "@hepha/shared";

import type { FeatureTimingSummaryDisplay } from "./workflow-presentation.js";

export interface WorkflowTimingSummaryPanelProps {
  readonly timing: FeatureTimingSummaryDisplay;
}

/**
 * Feature-level implementation timing. Estimates appear only after the Start
 * Feature post-process has written every phase estimate. Actual execution
 * aggregates persisted implementation-agent runs across the entire workflow.
 */
export function WorkflowTimingSummaryPanel({ timing }: WorkflowTimingSummaryPanelProps) {
  const hasTiming = timing.estimatedHumanTime || timing.estimatedAiTime || timing.actualDurationMs !== null || timing.inProgressDurationMs !== null;

  if (!hasTiming) return null;

  return (
    <section className="validation-panel workflow-timing-summary" aria-labelledby="workflow-timing-title">
      <div className="validation-heading">
        <strong id="workflow-timing-title">Implementation timing</strong>
      </div>
      <dl className="workflow-timing-values">
        <div>
          <dt>Human delivery estimate</dt>
          <dd>{timing.estimatedHumanTime ?? "Not calculated"}</dd>
        </div>
        <div>
          <dt>Actual AI execution</dt>
          <dd>{timing.actualDurationMs === null ? "No completed agent runs" : formatDuration(timing.actualDurationMs)}</dd>
        </div>
        <div>
          <dt>Original AI planning estimate</dt>
          <dd>{timing.estimatedAiTime ?? "Not calculated"}</dd>
        </div>
        {timing.estimatedHumanTimeSavedMidpointMs !== null && (
          <div>
            <dt>Estimated human delivery gain</dt>
            <dd>{formatHumanTimeSaved(timing.estimatedHumanTimeSavedMidpointMs)}</dd>
          </div>
        )}
        {timing.humanAccelerationMidpoint !== null && (
          <div>
            <dt>Estimated delivery acceleration</dt>
            <dd>{timing.humanAccelerationMidpoint.toFixed(1)}×</dd>
          </div>
        )}
        {timing.inProgressDurationMs !== null && (
          <div>
            <dt>AI execution including in-progress work</dt>
            <dd>{formatDuration(timing.inProgressDurationMs)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function formatHumanTimeSaved(durationMs: number) {
  return durationMs >= 0
    ? formatDuration(durationMs)
    : `${formatDuration(Math.abs(durationMs))} more than the human estimate`;
}
