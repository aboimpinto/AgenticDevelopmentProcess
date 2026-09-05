import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GovernanceDashboardReadV1, GovernanceQueueItemV1 } from "@hepha/shared";
import { governanceApi, type GovernanceApi } from "./governance-api.js";

type ActionDraft = Readonly<{ action: string; label: string; request: Record<string, unknown>; version: number }>;

function actionId(): string {
  return crypto.randomUUID();
}

function scopeDraft(data: GovernanceDashboardReadV1, item: GovernanceQueueItemV1, action: string): ActionDraft | undefined {
  for (const remediation of data.remediations) {
    const finding = remediation.findings.find((candidate) => candidate.findingObservationId === item.targetId && candidate.scopeDecisionTarget !== null);
    if (!finding?.scopeDecisionTarget) continue;
    const replan = data.replans.find((candidate) => candidate.aggregateId === finding.scopeDecisionTarget!.aggregateId);
    if (!replan) return undefined;
    return {
      action,
      label: `${action} for finding ${finding.findingId}`,
      version: finding.scopeDecisionTarget.expectedVersion,
      request: { schemaVersion: "hepha-governance-action/v1", actionId: actionId(), kind: "SCOPE_EXPANSION_DECISION", action, target: { aggregateId: replan.aggregateId, featureId: replan.featureId, phaseNumber: replan.phaseNumber, reviewGateId: replan.reviewGateId, defectClass: replan.defectClass, findingObservationId: finding.findingObservationId }, expectedVersion: finding.scopeDecisionTarget.expectedVersion, reason: "", payload: {} },
    };
  }
  return undefined;
}

function replanDraft(data: GovernanceDashboardReadV1, item: GovernanceQueueItemV1, action: string): ActionDraft | undefined {
  const replan = data.replans.find((candidate) => candidate.aggregateId === item.targetId);
  if (!replan?.currentRequest) return undefined;
  return {
    action,
    label: `${action} for ${replan.defectClass}`,
    version: replan.eventVersion,
    request: { schemaVersion: "hepha-governance-action/v1", actionId: actionId(), kind: "REPLAN_DECISION", action, target: { aggregateId: replan.aggregateId, featureId: replan.featureId, phaseNumber: replan.phaseNumber, reviewGateId: replan.reviewGateId, defectClass: replan.defectClass, requestId: replan.currentRequest.requestId, planHash: replan.currentRequest.planHash, planVersion: replan.currentRequest.planVersion }, expectedVersion: replan.eventVersion, reason: "", payload: {} },
  };
}

function draftFor(data: GovernanceDashboardReadV1, item: GovernanceQueueItemV1, action: string): ActionDraft | undefined {
  if (item.itemKind === "REMEDIATION") return scopeDraft(data, item, action);
  if (item.itemKind === "REPLAN") return replanDraft(data, item, action);
  return undefined;
}
function disablePilotDraft(data: GovernanceDashboardReadV1): ActionDraft | undefined {
  const pilot = data.rollout.pilot;
  if (!pilot || data.rollout.mode === "DISABLED") return undefined;
  return { action: "DISABLE_PILOT", label: `Disable pilot ${pilot.pilotId}`, version: data.rollout.eventVersion, request: { schemaVersion: "hepha-governance-action/v1", actionId: actionId(), kind: "PILOT_DISABLEMENT", action: "DISABLE_PILOT", target: { pilotId: pilot.pilotId }, expectedVersion: data.rollout.eventVersion, reason: "", payload: { disableReason: "" } } };
}

function DebtDetail({ debt }: { debt: GovernanceDashboardReadV1["architectureDebt"][number] }) {
  return <details>
    <summary>Inspect architecture debt context for {debt.recordId}</summary>
    <h4>Architectural boundary</h4><p>{debt.architecturalBoundary}</p>
    <h4>Risk</h4><p>{debt.risk}</p>
    <h4>Locations</h4>{debt.locations.length === 0 ? <p>No locations recorded.</p> : <ul>{debt.locations.map((location) => <li key={location.locationId}>{location.relativePath}{location.symbol ? `; symbol: ${location.symbol}` : ""}{location.endpoint ? `; endpoint: ${location.endpoint}` : ""}; rule tags: {location.ruleTags.join(", ")}</li>)}</ul>}
    <h4>Future-touch trigger</h4><p>Trigger ID: {debt.futureTouchTrigger.triggerId}; name: {debt.futureTouchTrigger.name}</p>
    <h5>Trigger paths</h5>{debt.futureTouchTrigger.paths.length === 0 ? <p>No future-touch trigger paths recorded.</p> : <ul>{debt.futureTouchTrigger.paths.map((path) => <li key={path}>{path}</li>)}</ul>}
    <h5>Trigger symbols</h5>{debt.futureTouchTrigger.symbols.length === 0 ? <p>No future-touch trigger symbols recorded.</p> : <ul>{debt.futureTouchTrigger.symbols.map((symbol) => <li key={symbol}>{symbol}</li>)}</ul>}
    <h5>Trigger rule tags</h5>{debt.futureTouchTrigger.ruleTags.length === 0 ? <p>No future-touch trigger rule tags recorded.</p> : <ul>{debt.futureTouchTrigger.ruleTags.map((tag) => <li key={tag}>{tag}</li>)}</ul>}
    <h4>Future-touch decisions</h4>{debt.futureTouchDecisions.length === 0 ? <p>No future-touch decisions recorded.</p> : <ol>{debt.futureTouchDecisions.map((decision) => <li key={decision.decisionId}>Decision ID: {decision.decisionId}; feature: {decision.featureId}; touch plan hash: {decision.touchPlanHash}; record version: {decision.recordVersion}; selectors: {decision.selectorIds.join(", ")}; kind: {decision.kind}; actor: {decision.actorId}; role: {decision.authorizedRole}; reason: {decision.reason}; occurred at: {decision.occurredAt}</li>)}</ol>}
  </details>;
}

function ActionDialog({ draft, pending, onCancel, onSubmit }: { draft: ActionDraft; pending: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const invoker = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => {
    heading.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); invoker.current?.focus(); };
  }, [onCancel]);

  return <div className="governance-dialog-backdrop" role="presentation">
    <section aria-labelledby="governance-action-dialog-title" aria-modal="true" className="governance-dialog" role="dialog">
      <h2 id="governance-action-dialog-title" ref={heading} tabIndex={-1}>Confirm governance action</h2>
      <p>{draft.label}. This will be sent to the loopback governance service at version {draft.version}.</p>
      <label htmlFor="governance-action-reason">Reason</label>
      <textarea id="governance-action-reason" onChange={(event) => setReason(event.target.value)} value={reason} />
      <label><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /> I understand this action requires server confirmation.</label>
      <div className="governance-actions">
        <button onClick={onCancel} type="button">Cancel</button>
        <button disabled={pending || !confirmed || reason.trim().length === 0} onClick={() => onSubmit(reason.trim())} type="button">Confirm {draft.action}</button>
      </div>
    </section>
  </div>;
}

export function GovernanceDashboard({ projectId, api = governanceApi }: { projectId: string | null; api?: GovernanceApi }) {
  const [data, setData] = useState<GovernanceDashboardReadV1 | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [message, setMessage] = useState<string | null>(null);
  const [isRefusal, setIsRefusal] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);

  useEffect(() => {
    submitInFlight.current = false;
    setData(null);
    setSelectedQueueItem(null);
    setDraft(null);
    setMessage(null);
    setIsRefusal(false);
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) { setData(null); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await api.fetchDashboard(projectId);
      if (result.kind === "dashboard") { setData(result.data); setMessage(null); setIsRefusal(false); }
      else { setMessage(`${result.code}: ${result.message}`); setIsRefusal(true); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load governance dashboard."); setIsRefusal(true); }
    finally { setLoading(false); }
  }, [api, projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(reason: string) {
    if (submitInFlight.current || !draft || !projectId) return;
    submitInFlight.current = true;
    setSubmitting(true);
    const request = { ...draft.request, reason, ...(draft.action === "DISABLE_PILOT" ? { payload: { disableReason: reason } } : {}) }; 
    try {
      const result = await api.submitAction(projectId, request);
      if (result.kind === "governance_action_recorded") {
        setData(result.refreshed);
        setMessage(`Recorded ${result.receipt.action}; refreshed from the server.`);
        setIsRefusal(false);
      } else {
        setMessage(`${result.code}: ${result.message}. Refresh before trying again.`);
        setIsRefusal(true);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Governance action failed."); setIsRefusal(true); }
    finally { submitInFlight.current = false; setSubmitting(false); setDraft(null); }
  }

  if (loading) return <section aria-label="Governance dashboard" className="board-shell" role="status">Loading governance dashboard…</section>;
  if (!projectId) return <section aria-label="Governance dashboard" className="board-shell">Select a project to inspect governance.</section>;
  // An effect clears state after a selector transition, but rendering must never
  // momentarily present project A data as project B authority.
  if (!data || data.projectId !== projectId) return <section aria-label="Governance dashboard" className="board-shell"><div role="alert">{message ?? "Governance data is unavailable."}</div><button onClick={() => void refresh()} type="button">Refresh governance dashboard</button></section>;

  const selected = data.queue.find((item) => item.itemId === selectedQueueItem) ?? null;
  return <section aria-label="Governance dashboard" className="board-shell governance-dashboard">
    <header className="approval-queue-header"><div><h1>Governance dashboard</h1><p>Loopback-only governance visibility. Actions are confirmed by the server.</p></div><button onClick={() => void refresh()} type="button">Refresh governance dashboard</button></header>
    {message ? <div role={isRefusal ? "alert" : "status"}>{message}</div> : null}
    <section aria-label="Governance metrics"><h2>Metrics</h2><div className="governance-metrics"><span>Review runs: {data.metrics.reviewRuns}</span><span>Open cycles: {data.metrics.openRemediationCycles}</span><span>Replans: {data.metrics.replanAggregates}</span><span>Debt records: {data.metrics.architectureDebtRecords}</span><span>Actionable queue: {data.metrics.actionableQueueItems}</span></div></section>
    <section aria-label="Governance queue"><h2>Actionable governance queue</h2>{data.queue.length === 0 ? <p>No governance queue items require attention.</p> : <ol>{data.queue.map((item) => <li key={item.itemId}><button aria-expanded={selected?.itemId === item.itemId} onClick={() => setSelectedQueueItem(item.itemId)} type="button">{item.itemKind}: {item.summaryCode} — {item.state}</button>{item.requiresAction ? <span> Requires action</span> : null}</li>)}</ol>}</section>
    {selected ? <section aria-label="Selected governance queue item"><h2>Queue item detail</h2><p>Target: {selected.targetId}; version: {selected.currentVersion ?? "informational"}; urgency: {selected.urgency}.</p>{selected.availableActions.map((action) => { const actionDraft = draftFor(data, selected, action); return actionDraft ? <button key={action} onClick={() => setDraft(actionDraft)} type="button">{action}</button> : <span key={action}> {action} is available only through its supported detail form.</span>; })}</section> : null}
    <section aria-label="Remediation and replan details"><h2>Remediation and replans</h2>{data.remediations.length === 0 && data.replans.length === 0 ? <p>No remediation or replan records.</p> : <>{data.remediations.map((remediation) => <article key={remediation.reviewRunId}><h3>{remediation.featureId} — {remediation.manifestResult}</h3><p>Manifest: {remediation.manifestHash}; cycle: {remediation.cycleState}; receipts: {remediation.receipts.length}.</p><ul>{remediation.findings.map((finding) => <li key={finding.findingId}>{finding.severity}: {finding.summary} ({finding.disposition})</li>)}</ul></article>)}{data.replans.map((replan) => <article key={replan.aggregateId}><h3>{replan.defectClass}</h3><p>{replan.state}; version {replan.eventVersion}; post-fix manifestations: {replan.recurrence.postFixManifestations}.</p></article>)}</>}</section>
    <section aria-label="Architecture debt details"><h2>Architecture debt</h2>{data.architectureDebt.length === 0 ? <p>No architecture debt records.</p> : data.architectureDebt.map((debt) => <article key={debt.recordId}><h3>{debt.recordId} — {debt.state}</h3><p>Owner: {debt.ownerId}; priority: {debt.priority}; rule: {debt.rule.ruleId} {debt.rule.ruleVersion}.</p><p>{debt.rationale}</p><DebtDetail debt={debt} /></article>)}</section>
    <section aria-label="Governance rollout status"><h2>Rollout status</h2><p>{data.rollout.mode === "DISABLED" ? "DISABLED — enforcement is not enabled by this dashboard." : `${data.rollout.mode} — the pilot remains loopback-only and bounded by its persisted approval.`}</p>{data.rollout.mode === "NEEDS_HUMAN" ? <p role="alert">Autonomous dispatch is stopped and requires human intervention.</p> : null}{disablePilotDraft(data) ? <button onClick={() => setDraft(disablePilotDraft(data)!)} type="button">Disable active pilot</button> : null}</section>
    {draft ? <ActionDialog draft={draft} pending={submitting} onCancel={() => setDraft(null)} onSubmit={(reason) => void submit(reason)} /> : null}
    {submitting ? <div role="status">Submitting confirmed action…</div> : null}
  </section>;
}
