/**
 * FEAT-056: Completion readiness panel.
 *
 * Displays the completion verdict, blocking reasons, and the Complete button.
 * Receives a pre-built CompletionReadinessDisplay — does not evaluate policy.
 */

import React from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import type { CompletionReadinessDisplay } from "./workflow-presentation.js";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CompletionReadinessPanelProps {
  readonly readiness: CompletionReadinessDisplay;
  readonly isPending?: boolean;
  readonly onComplete: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CompletionReadinessPanel({
  readiness,
  isPending = false,
  onComplete,
}: CompletionReadinessPanelProps) {
  if (readiness.verdict === "not_applicable") {
    return null;
  }

  const isReady = readiness.verdict === "ready";
  const isFinalizing = readiness.verdict === "finalizing";

  return (
    <section className="validation-panel" aria-labelledby="cr-title">
      <div className="validation-heading">
        <strong id="cr-title">Complete Feature readiness</strong>
        <em>{readiness.verdict === "ready" ? "Ready" : readiness.verdict === "blocked" ? "Blocked" : "In Progress"}</em>
      </div>

      {readiness.reasons.length > 0 && (
        <div className="readiness-reasons" role="status" aria-live="polite">
          {readiness.reasons.map((reason, idx) => (
            <p key={idx} className="readiness-reason">
              {isReady ? (
                <CheckCircle2 size={13} aria-hidden="true" />
              ) : (
                <AlertTriangle size={13} aria-hidden="true" />
              )}
              {reason}
            </p>
          ))}
        </div>
      )}

      {readiness.missingQualityGateCount > 0 && (
        <p className="gate-message">
          {readiness.missingQualityGateCount} phase quality gate(s) need evidence before completion.
        </p>
      )}

      {isReady && (
        <div className="feature-workflow-actions">
          <button
            className="mini-button validation-action validation-action-complete"
            disabled={isPending || isFinalizing}
            onClick={onComplete}
            type="button"
            title="Complete this feature: final checks, report, commits, push, merge, and move to Completed."
          >
            {isPending ? (
              <Loader2 className="spin-icon" size={14} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={14} aria-hidden="true" />
            )}
            {isPending ? "Completing Feature" : "Complete Feature"}
          </button>
        </div>
      )}

      {isFinalizing && (
        <div className="workflow-run-status" role="status" aria-live="polite">
          <Loader2 className="spin-icon" size={14} aria-hidden="true" />
          <strong>Finalization in progress</strong>
        </div>
      )}
    </section>
  );
}
