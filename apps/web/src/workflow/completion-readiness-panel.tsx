/**
 * FEAT-056: Completion readiness panel.
 *
 * Displays the completion verdict, blocking reasons, and the Complete button.
 * Receives a pre-built CompletionReadinessDisplay — does not evaluate policy.
 */

import React from "react";
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import type { CompletionReadinessDisplay } from "./workflow-presentation.js";
import type { CompletionRecoveryAssessment, CompletionRecoveryBlocker } from "@hepha/shared";
import { CompletionRecoveryDetails } from "./completion-recovery-details.js";
import { completionReadinessActivityLabel } from "./completion-recovery-activity.js";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CompletionReadinessPanelProps {
  readonly assessment?: CompletionRecoveryAssessment;
  readonly onResolveBlocker?: (blocker: CompletionRecoveryBlocker) => void;
  readonly coveragePhases?: readonly { number: number | null; title: string }[];
  readonly onAssignCoveragePhase?: (phaseNumber: number) => void;
  readonly readiness: CompletionReadinessDisplay;
  readonly isPending?: boolean;
  readonly onComplete: () => void;
  readonly onRefresh?: (guidance?: string) => void;
  readonly contextKey?: string;
  readonly isRefreshing?: boolean;
  readonly refreshMessage?: string | null;
  readonly refreshError?: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CompletionReadinessPanel({
  readiness,
  isPending = false,
  onComplete,
  onRefresh,
  isRefreshing = false,
  refreshMessage,
  refreshError,
  assessment,
  onResolveBlocker,
  coveragePhases,
  onAssignCoveragePhase,
  contextKey,
}: CompletionReadinessPanelProps) {
  const [guidance, setGuidance] = React.useState("");
  React.useEffect(() => setGuidance(""), [contextKey]);
  if (readiness.verdict === "not_applicable") {
    return null;
  }

  const isReady = readiness.verdict === "ready";
  const isFinalizing = readiness.verdict === "finalizing";
  const verificationStopped = assessment?.blockers.some(b => b.id === "fresh-verification");

  return (
    <section className="validation-panel" aria-labelledby="cr-title" data-completion-readiness tabIndex={-1}>
      <div className="validation-heading">
        <strong id="cr-title">Complete Feature readiness</strong>
        <em>{isRefreshing ? "In Progress" : readiness.verdict === "ready" ? "Ready" : readiness.verdict === "blocked" ? "Blocked" : "In Progress"}</em>
      </div>

      {onRefresh && verificationStopped && <label className="completion-readiness-guidance">
        <span>Additional verification guidance (optional)</span>
        <textarea value={guidance} onChange={event => setGuidance(event.target.value)} disabled={isRefreshing || isPending} maxLength={4000} rows={3}
          placeholder="Add configuration details or explain what the previous attempts misunderstood." />
      </label>}
      {onRefresh && (
        <button className="mini-button validation-action completion-readiness-refresh" type="button" onClick={() => onRefresh(guidance.trim() || undefined)}
          disabled={isRefreshing || isPending} title="Verify the accepted feature plan, run its configured checks and assess their collective evidence. Additional improvements do not block completion. Historical passes are not reused as current proof. Failures require repair; acceptance remains yours.">
          <RefreshCw size={14} className={isRefreshing ? "spin-icon" : undefined} aria-hidden="true" />
          {isRefreshing ? "Refreshing Readiness" : verificationStopped ? "Retry verification" : "Refresh Completion Readiness"}
        </button>
      )}
      {refreshMessage && (isRefreshing || !assessment?.blockers.some(b => b.id === "fresh-verification")) && <p role="status" aria-live="polite">{refreshMessage}</p>}
      {refreshError && <p role="alert">{refreshError}</p>}
      {assessment?.contextCompaction && Number.isFinite(assessment.contextCompaction.beforeTokens) && <p role="status">{assessment.contextCompaction.state === "running"
        ? "Compacting context to fit the selected model. Evidence and recorded results are preserved."
        : assessment.contextCompaction.state === "completed"
          ? `Context compaction completed (${assessment.contextCompaction.beforeTokens.toLocaleString()} → ${assessment.contextCompaction.afterTokens?.toLocaleString()} tokens in the largest assessment request). This is not a coverage approval.`
          : "Context compaction could not finish within its budget. Existing evidence and results are preserved."}</p>}
      {isRefreshing && <p role="status">{completionReadinessActivityLabel(assessment)}. Explicit Refresh inspects setup, reruns feature-related checks and assesses fresh reports; background assessment does not start tests. Saved human results are preserved.</p>}
      {assessment && <CompletionRecoveryDetails assessment={assessment} pending={isRefreshing || isPending} onResolve={onResolveBlocker} phases={coveragePhases} onAssign={onAssignCoveragePhase} />}

      {!!assessment?.verifiedCriterionCount && <p>{assessment.verifiedCriterionCount} accepted criteria verified against the feature plan.</p>}
      {!!assessment?.improvements?.length && <details className="readiness-improvements">
        <summary>{assessment.improvements.length} improvements for future planning — non-blocking</summary>
        <p>Saved for Lessons Learned. These suggestions require future planning approval and do not expand this feature.</p>
        <ul>{assessment.improvements.map(item => <li key={item.id}><strong>{item.observation}</strong><p>{item.rationale}</p></li>)}</ul>
      </details>}

      {!assessment && readiness.reasons.length > 0 && (
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
          Expand verification issues on the affected phase cards above for evidence and resolution steps.
        </p>
      )}

      {readiness.verdict === "blocked" && (
        <p className="gate-message">Resolve workflow/artifact errors first if actions are unavailable. User code review is a separate human acceptance step; an agent review does not replace it. Execute applicable manual tests and record their outcomes. Never mark missing evidence as passed to unlock completion.</p>
      )}

      {!isFinalizing && (
        <div className="feature-workflow-actions">
          <button
            className={`mini-button validation-action${isReady && readiness.canCompleteNow && !isPending && !isRefreshing ? " validation-action-complete" : ""}`}
            disabled={!isReady || !readiness.canCompleteNow || isPending || isFinalizing || isRefreshing}
            onClick={onComplete}
            type="button"
            title={isReady ? "Complete this feature: final checks, report, commits, push, merge, and move to Completed." : "Resolve or explicitly waive the phase gaps and finish the remaining human checks listed above."}
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
