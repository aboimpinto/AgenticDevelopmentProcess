import React, { useId } from "react";
import {
  formatDuration,
  type DirectHostRuntimeEvidenceViewV1,
  type OrchestratedRuntimeEvidenceViewV1,
  type RuntimePhaseEvidenceSummaryV1,
} from "@hepha/shared";
import type { RuntimePhaseEvidenceSnapshot } from "./use-runtime-evidence-controller.js";

export interface RuntimeEvidencePanelProps {
  readonly summary: RuntimePhaseEvidenceSummaryV1 | null;
  readonly snapshot: RuntimePhaseEvidenceSnapshot | undefined;
  readonly isOpen: boolean;
  readonly isPending: boolean;
  readonly isRefreshing: boolean;
  readonly isStale: boolean;
  readonly onToggle: () => void;
  readonly onLoadMore: () => void;
  readonly onRefresh: () => void;
}

/** Presents the explicit direct-host/orchestrated execution union for one phase. */
export function RuntimeEvidencePanel(props: RuntimeEvidencePanelProps) {
  const regionId = useId();
  const summary = props.summary;
  const canOpen = summary?.phaseExecutionContractId !== null && summary?.phaseExecutionContractId !== undefined;
  return (
    <section className="runtime-evidence-panel" aria-label={`Runtime evidence for ${summary?.phaseTitle ?? "phase"}`}>
      <div className="runtime-evidence-summary">
        <span>{summary ? formatSummary(summary) : "Runtime evidence loading"}</span>
        {props.isStale ? <span className="runtime-evidence-stale" role="status">Last confirmed snapshot</span> : null}
      </div>
      <div className="runtime-evidence-actions">
        <button aria-controls={regionId} aria-expanded={props.isOpen} className="mini-button" disabled={!canOpen} onClick={props.onToggle} type="button">
          {props.isOpen ? "Hide runtime evidence" : "Show runtime evidence"}
        </button>
        {props.isOpen ? (
          <button className="mini-button" disabled={props.isRefreshing} onClick={props.onRefresh} type="button">
            {props.isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
      </div>
      {!canOpen && summary ? <small>Detailed evidence is unavailable because this phase has no stable execution-contract identity.</small> : null}
      {props.isOpen ? (
        <div className="runtime-evidence-details" id={regionId}>
          {props.isPending && !props.snapshot ? <p role="status">Loading runtime evidence…</p> : null}
          {props.snapshot?.executions.length === 0 ? <p>{emptyMessage(summary?.state)}</p> : null}
          {props.snapshot?.executions.map((execution) => execution.mode === "direct_host"
            ? <DirectHostExecution execution={execution} key={`direct:${execution.evidenceId}`} />
            : <OrchestratedExecution execution={execution} key={`orchestrated:${execution.invocationId}`} />)}
          {props.snapshot?.nextCursor ? (
            <button className="mini-button" disabled={props.isPending} onClick={props.onLoadMore} type="button">
              {props.isPending ? "Loading…" : "Load more runtime evidence"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DirectHostExecution({ execution }: { readonly execution: DirectHostRuntimeEvidenceViewV1 }) {
  const model = execution.modelEvidence.status === "not_recorded"
    ? "Not recorded"
    : `${execution.modelEvidence.providerId ? `${execution.modelEvidence.providerId} / ` : ""}${execution.modelEvidence.modelId}`;
  const provenance = execution.modelEvidence.status === "not_recorded"
    ? "Not recorded"
    : `${execution.modelEvidence.instrumentationSource} · observed ${dateTime(execution.modelEvidence.observedAt)}`;
  const stateSync = execution.stateSync.status === "not_requested" ? "Not requested"
    : execution.stateSync.status === "completed" ? `Completed · ${execution.stateSync.operationId}`
      : `Failed · ${label(execution.stateSync.code)}`;
  return (
    <article className="runtime-evidence-chain">
      <header><strong>Direct host execution</strong><span>{label(execution.outcome)}</span></header>
      <dl>
        <Fact term="Execution mode" value="Direct host" />
        <Fact term="Host" value={`${label(execution.hostKind)}${execution.hostIdentity ? ` · ${execution.hostIdentity}` : ""}`} />
        <Fact term="Procedure / action" value={`${execution.procedureId ?? "Not recorded"} / ${execution.actionId ?? "Not recorded"}`} />
        <Fact term="Observed model" value={model} />
        <Fact term="Model provenance" value={provenance} />
        <Fact term="State sync" value={stateSync} />
        <Fact term="Started" value={dateTime(execution.startedAt)} />
        <Fact term="Finished" value={execution.settledAt ? dateTime(execution.settledAt) : "Running"} />
        <Fact term="Measured duration" value={execution.durationMs === null ? "Not recorded" : formatDuration(execution.durationMs)} />
        <Fact term="Final result" value={execution.failureCode ? `${label(execution.outcome)} · ${label(execution.failureCode)}` : label(execution.outcome)} />
      </dl>
    </article>
  );
}

function OrchestratedExecution({ execution }: { readonly execution: OrchestratedRuntimeEvidenceViewV1 }) {
  return (
    <article className="runtime-evidence-chain">
      <header>
        <strong>{execution.invocationKind === "nested" ? "Nested invocation · Orchestrated" : "Invocation · Orchestrated"}</strong>
        <span>{label(execution.status)}</span>
      </header>
      <dl>
        <Fact term="Execution mode" value="Orchestrated" />
        <Fact term="Action" value={execution.approvedPlan.actionId} />
        <Fact term="Agent role / prompt" value={`${execution.approvedPlan.roleId} / ${execution.approvedPlan.promptVersion}`} />
        <Fact term="Approved primary route" value={route(execution.approvedPlan.primaryRoute)} />
        <Fact term="Approved second route" value={execution.approvedPlan.secondRoute ? route(execution.approvedPlan.secondRoute) : "None approved"} />
        <Fact term="Policy" value={`${label(execution.approvedPlan.policySource)} · revision ${execution.approvedPlan.revisionId}`} />
        <Fact term="Started" value={dateTime(execution.openedAt)} />
        <Fact term="Finished" value={execution.settledAt ? dateTime(execution.settledAt) : "Running"} />
        <Fact term="Measured duration" value={execution.durationMs === null ? "Not recorded" : formatDuration(execution.durationMs)} />
        <Fact term="Final result" value={execution.failureCode ? `${label(execution.status)} · ${label(execution.failureCode)}` : label(execution.status)} />
        <Fact term="Lineage" value={execution.parentInvocationId ? `Parent ${execution.parentInvocationId} · root ${execution.rootInvocationId}` : `Root ${execution.rootInvocationId}`} />
      </dl>
      <h5>Attempts</h5>
      <ol className="runtime-evidence-attempts">
        {execution.attempts.map((attempt) => (
          <li key={attempt.attemptId}>
            <strong>{label(attempt.attemptKind)} · {label(attempt.status)}</strong>
            <dl>
              <Fact term="Approved route" value={route(attempt.approvedRoute)} />
              <Fact term="Executed route" value={attempt.actualRoute ? route(attempt.actualRoute) : "Not recorded — process did not spawn"} />
              <Fact term="Authentication" value={attempt.authenticationConnectionId ? `${label(attempt.authenticationKind ?? "not_recorded")} · ${attempt.authenticationConnectionId}${attempt.credentialVersion ? ` · version ${attempt.credentialVersion}` : ""}` : "Not recorded"} />
              <Fact term="Work state" value={attempt.checkpointId ? `${label(attempt.workState)} · checkpoint ${attempt.checkpointId}` : label(attempt.workState)} />
              <Fact term="Timestamps" value={`${dateTime(attempt.preparationStartedAt)} → ${attempt.terminalAt ? dateTime(attempt.terminalAt) : "Running"}`} />
              <Fact term="Measured duration" value={attempt.durationMs === null ? "Not recorded" : formatDuration(attempt.durationMs)} />
              <Fact term="Outcome" value={attempt.failureCode ? `${label(attempt.status)} · ${label(attempt.failureCode)}` : label(attempt.status)} />
            </dl>
          </li>
        ))}
      </ol>
      {execution.routeChangeEvents.length > 0 ? (
        <><h5>Route-change history</h5><ol className="runtime-evidence-history">
          {execution.routeChangeEvents.map((event) => (
            <li key={event.eventId}><strong>{label(event.kind)}</strong>: {route(event.sourceApprovedRoute)} → {route(event.targetApprovedRoute)} · {label(event.reasonCode)} · {label(event.result)} · {dateTime(event.occurredAt)}</li>
          ))}
        </ol></>
      ) : null}
    </article>
  );
}

function Fact({ term, value }: { readonly term: string; readonly value: string }) { return <><dt>{term}</dt><dd>{value}</dd></>; }
function formatSummary(summary: RuntimePhaseEvidenceSummaryV1): string {
  if (summary.state === "not_yet_run") return "Not yet run";
  if (summary.state === "not_recorded") return "Legacy activity · Not recorded";
  const invocations = `${summary.invocationCount} execution${summary.invocationCount === 1 ? "" : "s"}`;
  const modes = summary.executionModes.map((mode) => mode === "direct_host" ? "Direct host" : "Orchestrated").join(" + ");
  const routes = summary.actualRoutes.length === 0 ? "No orchestrated route recorded"
    : summary.actualRoutes.length === 1 ? route(summary.actualRoutes[0]!) : `${summary.actualRoutes.length} executed routes`;
  const duration = summary.aggregateDurationMs === null ? "Duration not recorded" : formatDuration(summary.aggregateDurationMs);
  return `${invocations} · ${modes} · ${routes} · ${duration} · ${label(summary.finalOutcome ?? summary.state)}`;
}
function emptyMessage(state: RuntimePhaseEvidenceSummaryV1["state"] | undefined): string {
  return state === "not_yet_run" ? "No authoritative execution has started for this phase."
    : "Authoritative execution details were not recorded for this phase.";
}
function route(value: { readonly connectionId: string; readonly modelId: string }): string { return `${value.connectionId} / ${value.modelId}`; }
function label(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/gu, (character) => character.toUpperCase()); }
function dateTime(value: string): string { return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }); }
