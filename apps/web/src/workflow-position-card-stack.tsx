/**
 * FEAT-035: Workflow Position Card Stack Component
 *
 * Compact workflow-position status stack for FEAT cards.
 * Shows execution state, active phase, and quality-gate state.
 * Returns null when there's no meaningful state to display.
 */
import React from "react";
import { Loader2 } from "lucide-react";
import type { WorkItemCard } from "@hepha/shared";
import { isCompletionReadinessRunning, completionReadinessActivityLabel } from "./workflow/completion-recovery-activity.js";
import {
  buildCardStatusStack,
  formatCommandLabel,
} from "@hepha/shared";

export function WorkflowPositionCardStack({
  item,
}: {
  item: WorkItemCard;
}): React.ReactElement | null {
  // Only display for FEAT cards
  if (item.kind !== "feature") {
    return null;
  }

  if (isCompletionReadinessRunning(item)) {
    return <div className="card-workflow-position" role="status" aria-label="Completion readiness refresh running">
      <span className="wp-execution-state state-running">
        <Loader2 className="spin-icon" size={12} aria-hidden="true" />
        {completionReadinessActivityLabel(item.completionRecovery)}
      </span>
    </div>;
  }

  const workflowPosition = item.featureWorkflow?.workflowPosition;

  // If the scanner hasn't populated workflowPosition yet, don't display
  if (!workflowPosition) {
    return null;
  }

  const stack = buildCardStatusStack(workflowPosition);

  // No meaningful state to display
  if (!stack) {
    return null;
  }

  return (
    <div className="card-workflow-position" aria-label={stack.ariaLabel}>
      <span className={`wp-execution-state ${stack.executionCssClass}`}>
        {stack.executionCssClass.includes("running") && (
          <Loader2 className="spin-icon" size={12} aria-hidden="true" />
        )}
        {stack.executionLabel}
      </span>
      {stack.phaseBadge ? (
        <span className="wp-phase-badge">{stack.phaseBadge}</span>
      ) : null}
      {stack.qualityGateLabel ? (
        <span className="wp-quality-gate">{stack.qualityGateLabel}</span>
      ) : null}
    </div>
  );
}
