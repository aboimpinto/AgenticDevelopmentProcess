/**
 * FEAT-056: Phase list panel.
 *
 * Displays exact authoritative phase order with state, recovery disclosure,
 * and evidence links. Receives pre-built PhaseRowDisplay rows — no local
 * reconciliation or sorting.
 */

import React from "react";
import { formatDuration } from "@hepha/shared";
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";

import type { RuntimePhaseEvidenceSummaryV1 } from "@hepha/shared";
import { RuntimeEvidencePanel } from "./runtime-evidence-panel.js";
import type { RuntimePhaseEvidenceSnapshot } from "./use-runtime-evidence-controller.js";
import type { PhaseRowDisplay } from "./workflow-presentation.js";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RuntimeEvidenceListBinding {
  readonly summaries: readonly RuntimePhaseEvidenceSummaryV1[];
  readonly snapshots: Readonly<Record<string, RuntimePhaseEvidenceSnapshot>>;
  readonly openPhaseIds: ReadonlySet<string>;
  readonly pendingPhaseIds: ReadonlySet<string>;
  readonly isRefreshing: boolean;
  readonly isStale: boolean;
  readonly onToggle: (phaseId: string) => void;
  readonly onLoadMore: (phaseId: string) => void;
  readonly onRefresh: () => void;
}

export interface WorkflowPhaseListPanelProps {
  readonly phases: readonly PhaseRowDisplay[];
  readonly runtimeEvidence?: RuntimeEvidenceListBinding;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WorkflowPhaseListPanel({
  phases,
  runtimeEvidence,
}: WorkflowPhaseListPanelProps) {
  if (phases.length === 0) {
    return (
      <section className="validation-panel" aria-labelledby="wpl-title">
        <div className="validation-heading">
          <strong id="wpl-title">Phases</strong>
        </div>
        <p className="empty-inline">No phases defined for this feature.</p>
      </section>
    );
  }

  return (
    <section className="validation-panel" aria-labelledby="wpl-title">
      <div className="validation-heading">
        <strong id="wpl-title">Phases</strong>
        <span className="phase-count">{phases.length} phase{phases.length !== 1 ? "s" : ""}</span>
      </div>
      <ul className="phase-list" role="list">
        {phases.map((phase) => (
          <li
            key={phase.executionContractId ?? phase.number ?? "unknown"}
            className={`phase-row ${phase.isCurrent ? "phase-row-current" : ""} ${
              phase.isBlocked ? "phase-row-blocked" : ""
            } ${phase.isCompleted ? "phase-row-completed" : ""}`}
            aria-current={phase.isCurrent ? "step" : undefined}
          >
            <span
              className={`phase-row-icon ${phase.isCompleted ? "phase-row-icon-complete" : phase.isBlocked || phase.hasError ? "phase-row-icon-blocked" : phase.isActive ? "phase-row-icon-active" : ""}`}
              aria-hidden="true"
            >
              {phase.isCompleted ? (
                <CheckCircle2 size={14} />
              ) : phase.isBlocked ? (
                <AlertTriangle size={14} />
              ) : phase.isActive ? (
                <Loader2 className="spin-icon" size={14} />
              ) : (
                <Clock3 size={14} />
              )}
            </span>
            <span className="phase-row-content">
              <strong className="phase-row-title">
                {phase.number !== null ? `Phase ${phase.number}` : ""}{" "}
                {phase.title}
              </strong>
              <span className={`phase-row-status ${phase.isCompleted ? "phase-status-complete" : phase.isBlocked || phase.hasError ? "phase-status-blocked" : phase.isActive ? "phase-status-active" : ""}`}>
                {phase.statusLabel}
              </span>
              {phase.isBlocked && phase.errorMessage && (
                <span className="phase-row-error">{phase.errorMessage}</span>
              )}
              {phase.agent && (
                <small className="phase-row-agent">
                  Agent: {phase.agent}{phase.model ? ` · Orchestrator command model: ${phase.model}` : ""}
                </small>
              )}
              {phase.isActive && phase.activityLabel && (
                <small className="phase-row-activity">Activity: {phase.activityLabel}</small>
              )}
              {(phase.estimatedHumanTime || phase.estimatedAiTime || phase.actualDurationMs !== null) && (
                <small className="phase-row-timing" aria-label={`Timing for ${phase.title}`}>
                  {phase.estimatedHumanTime && `Human delivery estimate: ${phase.estimatedHumanTime}`}
                  {phase.estimatedHumanTime && (phase.estimatedAiTime || phase.actualDurationMs !== null) && " · "}
                  {phase.actualDurationMs !== null && `Actual AI execution: ${formatDuration(phase.actualDurationMs)}`}
                  {phase.actualDurationMs !== null && phase.estimatedAiTime && " · "}
                  {phase.estimatedAiTime && `AI planning estimate: ${phase.estimatedAiTime}`}
                </small>
              )}
              {phase.actualDurationMs !== null && (
                <small className="phase-row-timing phase-timing-insights">
                  {formatPhaseTimingInsights(phase)}
                </small>
              )}
              {phase.evidence && (
                <>
                  <small className="phase-row-evidence">
                    {phase.evidence.codeFileCount} code · {phase.evidence.testFileCount} tests · {phase.evidence.documentationFileCount} docs
                  </small>
                  <span className="evidence-gate-list phase-row-gates" aria-label={`Quality gates for ${phase.title}`}>
                    {phase.evidence.gates.map((gate) => (
                      <span
                        className={`evidence-gate ${gate.status === "satisfied" ? "evidence-gate-ok" : gate.status === "waived" || gate.status === "not_applicable" ? "evidence-gate-waived" : gate.status === "missing" ? "evidence-gate-missing" : ""}`}
                        key={gate.gate}
                        title={gate.justification ?? `${gate.gate}: ${gate.status}`}
                      >
                        {gate.gate.replace("gherkin_e2e", "E2E").replace("code_review", "Review")}: {gate.status.replace("not_applicable", "N/A")}
                      </span>
                    ))}
                  </span>
                  {phase.evidence.warnings.map((warning) => (
                    <small className="phase-row-error" key={warning}>{warning}</small>
                  ))}
                </>
              )}
              {runtimeEvidence && phase.executionContractId === null && phase.runtimeExecutions.length > 0 ? (
                <PhaseAttributedRuntimeEvidence executions={phase.runtimeExecutions} />
              ) : runtimeEvidence ? (() => {
                const phaseId = phase.executionContractId ?? null;
                const summary = runtimeEvidence.summaries.find((candidate) =>
                  phaseId !== null
                    ? candidate.phaseExecutionContractId === phaseId
                    : candidate.phaseExecutionContractId === null && candidate.phaseNumber === phase.number,
                ) ?? null;
                return (
                  <RuntimeEvidencePanel
                    isOpen={phaseId !== null && runtimeEvidence.openPhaseIds.has(phaseId)}
                    isPending={phaseId !== null && runtimeEvidence.pendingPhaseIds.has(phaseId)}
                    isRefreshing={runtimeEvidence.isRefreshing}
                    isStale={runtimeEvidence.isStale}
                    onLoadMore={() => { if (phaseId) runtimeEvidence.onLoadMore(phaseId); }}
                    onRefresh={runtimeEvidence.onRefresh}
                    onToggle={() => { if (phaseId) runtimeEvidence.onToggle(phaseId); }}
                    snapshot={phaseId ? runtimeEvidence.snapshots[phaseId] : undefined}
                    summary={summary}
                  />
                );
              })() : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhaseAttributedRuntimeEvidence({
  executions,
}: {
  readonly executions: PhaseRowDisplay["runtimeExecutions"];
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <section className="runtime-evidence-panel" aria-label="Phase-attributed runtime evidence">
      <div className="runtime-evidence-summary">
        <span>{executions.length} phase-attributed execution{executions.length === 1 ? "" : "s"}</span>
      </div>
      <div className="runtime-evidence-actions">
        <button
          aria-expanded={isOpen}
          className="mini-button"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          {isOpen ? "Hide runtime evidence" : "Show runtime evidence"}
        </button>
      </div>
      {isOpen ? (
        <div className="runtime-evidence-details">
          <small>
            These immutable orchestrator records are attributed to the phase from dispatch identity and durable phase-artifact boundaries.
          </small>
          <div role="list">
            {executions.map((execution) => (
              <article className="runtime-evidence-chain" key={execution.id} role="listitem">
                <header><strong>{execution.agent}</strong><span>{execution.status}</span></header>
                <dl>
                  <dt>Command model</dt><dd>{execution.commandModel ?? "Not recorded"}</dd>
                  <dt>Measured duration</dt><dd>{execution.durationMs === null ? "Not recorded" : formatDuration(execution.durationMs)}</dd>
                  <dt>Started</dt><dd>{formatTimestamp(execution.startedAt)}</dd>
                  <dt>Completed</dt><dd>{execution.completedAt ? formatTimestamp(execution.completedAt) : "Running"}</dd>
                  <dt>Workflow</dt><dd>{execution.workflowRunId}</dd>
                </dl>
              </article>
            ))}
          </div>
          <small>Observed provider/fallback route is unavailable when the original runtime invocation was not phase-bound.</small>
        </div>
      ) : null}
    </section>
  );
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatPhaseTimingInsights(phase: PhaseRowDisplay) {
  const insights: string[] = [];
  if (phase.estimatedHumanTimeSavedMidpointMs !== null) {
    insights.push(
      phase.estimatedHumanTimeSavedMidpointMs >= 0
        ? `Est. human delivery gain: ${formatDuration(phase.estimatedHumanTimeSavedMidpointMs)}`
        : `Human estimate exceeded by ${formatDuration(Math.abs(phase.estimatedHumanTimeSavedMidpointMs))}`,
    );
  }
  if (phase.humanAccelerationMidpoint !== null) {
    insights.push(`${phase.humanAccelerationMidpoint.toFixed(1)}× acceleration`);
  }
  return insights.join(" · ");
}
