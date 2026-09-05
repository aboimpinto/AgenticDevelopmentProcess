import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROUTING_MATRIX_SCHEMA_VERSION,
  type RoutingMatrixAttentionV1,
  type RoutingMatrixRowV1,
  type RoutingMatrixSnapshotV1,
} from "@hepha/shared";
import {
  createRoutingMatrixDraft,
  reconcileRoutingMatrixDrafts,
  routingMatrixDraftMatchesRow,
  routingMatrixDraftPreviewRequest,
  routingMatrixDraftRequest,
  routingMatrixDraftValuesEqual,
  routingMatrixRows,
  type RoutingMatrixDraftState,
} from "./routing-matrix-drafts.js";
import { routingMatrixErrorMessage } from "./routing-matrix-presentation.js";
import { RoutingMatrixAttention } from "./RoutingMatrixAttention.js";
import { RoutingMatrixGroup } from "./RoutingMatrixGroup.js";
import { RoutingMatrixRowEditor } from "./RoutingMatrixRowEditor.js";
import { RoutingPolicyPresentationError, routingPolicyApi, type RoutingMatrixErrorCode, type RoutingPolicyApi } from "./routing-policy-api.js";

export interface RoutingDefaultsPanelProps { readonly api?: RoutingPolicyApi; }
type LoadFailure = { readonly code: RoutingMatrixErrorCode | null };
type ConflictState = "detected" | "compared" | null;
type PreviewSettlement = "accepted" | "stale" | "conflict" | "failed";

/** Coordinates guarded matrix transport, independent row drafts, and globally serialized mutations. */
export function RoutingDefaultsPanel({ api = routingPolicyApi }: RoutingDefaultsPanelProps) {
  const [snapshot, setSnapshotState] = useState<RoutingMatrixSnapshotV1 | null>(null);
  const [drafts, setDraftsState] = useState<Map<string, RoutingMatrixDraftState>>(() => new Map());
  const [loadFailure, setLoadFailure] = useState<LoadFailure | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [savingScopeKey, setSavingScopeKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [conflict, setConflict] = useState<ConflictState>(null);
  const snapshotRef = useRef(snapshot);
  const draftsRef = useRef(drafts);
  const mutationBusyRef = useRef(false);
  const savingScopeRef = useRef<string | null>(null);
  const previewSequence = useRef(new Map<string, number>());
  const conflictRef = useRef<HTMLDivElement>(null);

  const setSnapshot = useCallback((next: RoutingMatrixSnapshotV1 | null) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);

  const setDrafts = useCallback((next: Map<string, RoutingMatrixDraftState> | ((current: Map<string, RoutingMatrixDraftState>) => Map<string, RoutingMatrixDraftState>)) => {
    const resolved = typeof next === "function" ? next(draftsRef.current) : next;
    draftsRef.current = resolved;
    setDraftsState(resolved);
  }, []);

  const invalidatePreview = useCallback((scopeKey: string) => {
    previewSequence.current.set(scopeKey, (previewSequence.current.get(scopeKey) ?? 0) + 1);
  }, []);

  const previewDraft = useCallback(async (row: RoutingMatrixRowV1, draft: RoutingMatrixDraftState): Promise<PreviewSettlement> => {
    const input = routingMatrixDraftPreviewRequest(row, draft);
    if (!input) {
      invalidatePreview(row.scopeKey);
      return "failed";
    }
    const sequence = (previewSequence.current.get(row.scopeKey) ?? 0) + 1;
    previewSequence.current.set(row.scopeKey, sequence);
    setDrafts((current) => updateCurrentDraft(current, row.scopeKey, draft, (value) => ({ ...value, preview: null, previewPending: true, issue: null, errorMessage: null })));
    try {
      const preview = await api.preview(input);
      if (!previewCanSettle(previewSequence.current, sequence, row.scopeKey, draft, draftsRef.current)) return "stale";
      setDrafts((current) => updateCurrentDraft(current, row.scopeKey, draft, (value) => ({ ...value, preview, previewPending: false, issue: null, errorMessage: null })));
      return "accepted";
    } catch (caught) {
      if (!previewCanSettle(previewSequence.current, sequence, row.scopeKey, draft, draftsRef.current)) return "stale";
      const code = errorCode(caught);
      const issue = code === "ROUTING_POLICY_CONFLICT" ? "conflict"
        : code === "ROUTING_ROUTE_UNAVAILABLE" || code === "ROUTING_CAPABILITY_MISMATCH" ? "route_unavailable" : "validation";
      setDrafts((current) => updateCurrentDraft(current, row.scopeKey, draft, (value) => ({ ...value, preview: null, previewPending: false, issue, errorMessage: routingMatrixErrorMessage(code) })));
      if (code === "ROUTING_POLICY_CONFLICT") {
        setConflict("detected");
        queueMicrotask(() => conflictRef.current?.focus());
        return "conflict";
      }
      queueMicrotask(() => document.getElementById(`routing-${row.scopeKey.replace(/[^a-z0-9]+/gi, "-")}-error`)?.focus());
      return "failed";
    }
  }, [api, invalidatePreview, setDrafts]);

  const refreshRetainedPreviews = useCallback(async (nextSnapshot: RoutingMatrixSnapshotV1, retained: Map<string, RoutingMatrixDraftState>): Promise<boolean> => {
    const rows = routingMatrixRows(nextSnapshot);
    const results = await Promise.all([...retained].map(async ([scopeKey, draft]) => {
      const row = rows.get(scopeKey);
      if (!row || draft.issue !== null || !routingMatrixDraftPreviewRequest(row, draft)) {
        invalidatePreview(scopeKey);
        return "stale" as const;
      }
      return previewDraft(row, draft);
    }));
    return results.includes("conflict");
  }, [invalidatePreview, previewDraft]);

  const load = useCallback(async (compare = false) => {
    if (compare) {
      if (mutationBusyRef.current) return;
      mutationBusyRef.current = true;
      setMutationBusy(true);
    }
    try {
      const next = await api.matrix();
      const retained = reconcileRoutingMatrixDrafts(draftsRef.current, next);
      setSnapshot(next);
      setDrafts(retained);
      setLoadFailure(null);
      if (compare) {
        const refreshConflict = await refreshRetainedPreviews(next, retained);
        if (!refreshConflict) {
          setConflict("compared");
          setAnnouncement(`Latest routing revision ${next.policy.revisionNumber} loaded. Review each retained draft before retrying.`);
          queueMicrotask(() => conflictRef.current?.focus());
        }
      }
    } catch (caught) {
      if (compare) {
        setAnnouncement(routingMatrixErrorMessage(errorCode(caught)));
      } else {
        setSnapshot(null);
        setLoadFailure({ code: errorCode(caught) });
      }
    } finally {
      if (compare) {
        mutationBusyRef.current = false;
        setMutationBusy(false);
      }
    }
  }, [api, refreshRetainedPreviews, setDrafts, setSnapshot]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (conflict !== null) conflictRef.current?.focus();
  }, [conflict]);

  const changeDraft = useCallback((row: RoutingMatrixRowV1, patch: Partial<RoutingMatrixDraftState>) => {
    const currentSnapshot = snapshotRef.current;
    if (!currentSnapshot || savingScopeRef.current === row.scopeKey) return;
    const current = draftsRef.current.get(row.scopeKey) ?? createRoutingMatrixDraft(row, currentSnapshot);
    const next = { ...current, ...patch };
    if (routingMatrixDraftMatchesRow(row, next)) {
      invalidatePreview(row.scopeKey);
      setDrafts((existing) => {
        const clean = new Map(existing);
        clean.delete(row.scopeKey);
        return clean;
      });
      return;
    }
    const updated = new Map(draftsRef.current);
    updated.set(row.scopeKey, next);
    setDrafts(updated);
    void previewDraft(row, next);
  }, [invalidatePreview, previewDraft, setDrafts]);

  const discardDraft = useCallback((scopeKey: string) => {
    if (savingScopeRef.current === scopeKey) return;
    invalidatePreview(scopeKey);
    setDrafts((current) => { const next = new Map(current); next.delete(scopeKey); return next; });
    setAnnouncement("Row changes discarded.");
  }, [invalidatePreview, setDrafts]);

  const saveDraft = useCallback(async (scopeKey: string) => {
    const currentSnapshot = snapshotRef.current;
    if (!currentSnapshot || mutationBusyRef.current) return;
    const row = routingMatrixRows(currentSnapshot).get(scopeKey);
    const submitted = draftsRef.current.get(scopeKey);
    if (!row || !submitted || routingMatrixDraftMatchesRow(row, submitted)) return;
    const input = routingMatrixDraftRequest(row, submitted);
    if (!input) return;
    mutationBusyRef.current = true;
    savingScopeRef.current = scopeKey;
    setMutationBusy(true);
    setSavingScopeKey(scopeKey);
    try {
      const next = await api.save(input);
      const retained = reconcileRoutingMatrixDrafts(draftsRef.current, next, { scopeKey, submitted });
      setSnapshot(next);
      setDrafts(retained);
      const refreshConflict = await refreshRetainedPreviews(next, retained);
      if (!refreshConflict) setConflict(null);
      setAnnouncement(`${row.label} saved in routing revision ${next.policy.revisionNumber}.`);
    } catch (caught) {
      const code = errorCode(caught);
      const issue = code === "ROUTING_POLICY_CONFLICT" ? "conflict"
        : code === "ROUTING_ROUTE_UNAVAILABLE" || code === "ROUTING_CAPABILITY_MISMATCH" ? "route_unavailable" : "validation";
      setDrafts((current) => updateDraft(current, scopeKey, (value) => ({ ...value, issue, errorMessage: routingMatrixErrorMessage(code) })));
      if (code === "ROUTING_POLICY_CONFLICT") {
        setConflict("detected");
        queueMicrotask(() => conflictRef.current?.focus());
      } else {
        queueMicrotask(() => document.getElementById(`routing-${scopeKey.replace(/[^a-z0-9]+/gi, "-")}-error`)?.focus());
      }
    } finally {
      mutationBusyRef.current = false;
      savingScopeRef.current = null;
      setMutationBusy(false);
      setSavingScopeKey(null);
    }
  }, [api, refreshRetainedPreviews, setDrafts, setSnapshot]);

  const acknowledge = useCallback(async (attention: RoutingMatrixAttentionV1) => {
    const currentSnapshot = snapshotRef.current;
    if (!currentSnapshot || mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    try {
      const acknowledgedAt = new Date().toISOString();
      const next = await api.acknowledge({
        schemaVersion: ROUTING_MATRIX_SCHEMA_VERSION,
        policyId: currentSnapshot.policy.policyId,
        attentionIdentity: {
          attentionId: attention.attentionId,
          attentionRevisionId: attention.attentionRevisionId,
          affectedRoute: attention.affectedRoute,
        },
        expectedRevision: { revisionId: currentSnapshot.policy.revisionId, revisionNumber: currentSnapshot.policy.revisionNumber },
        revisionGuard: currentSnapshot.policy.revisionGuard,
        acknowledgedAt,
      });
      const retained = reconcileRoutingMatrixDrafts(draftsRef.current, next);
      setSnapshot(next);
      setDrafts(retained);
      const refreshConflict = await refreshRetainedPreviews(next, retained);
      if (!refreshConflict) setConflict(null);
      setAnnouncement("Routing notice acknowledged. No routing policy was changed.");
    } catch (caught) {
      const code = errorCode(caught);
      if (code === "ROUTING_ATTENTION_CONFLICT" || code === "ROUTING_POLICY_CONFLICT") {
        setConflict("detected");
        queueMicrotask(() => conflictRef.current?.focus());
      }
      setAnnouncement(routingMatrixErrorMessage(code));
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  }, [api, refreshRetainedPreviews, setDrafts, setSnapshot]);

  if (loadFailure) {
    return (
      <section aria-label="Routing Defaults" className="routing-defaults-panel">
        <h2>Routing Defaults</h2>
        <p role="alert">{routingMatrixErrorMessage(loadFailure.code)}</p>
        <button onClick={() => void load()} type="button">Refresh routing matrix</button>
      </section>
    );
  }
  if (!snapshot) return <section aria-busy="true" aria-label="Routing Defaults" className="routing-defaults-panel"><p aria-live="polite">Loading routing matrix…</p></section>;

  return (
    <section aria-labelledby="routing-defaults-heading" className="routing-defaults-panel">
      <header className="routing-matrix-header">
        <div><h2 id="routing-defaults-heading">Routing Defaults</h2><p>Configure future worker routes. Effective facts are resolved by Hepha.</p></div>
        <p>Revision <strong>{snapshot.policy.revisionNumber}</strong> <code>{snapshot.policy.revisionId}</code></p>
      </header>
      <p aria-live="polite" className="routing-announcement">{announcement}</p>
      {conflict ? (
        <div className="routing-conflict" ref={conflictRef} role="alert" tabIndex={-1}>
          <strong>{conflict === "detected" ? "Routing policy conflict." : "Latest policy loaded for comparison."}</strong>
          <p>{conflict === "detected" ? "Pending values were retained. Reload the latest matrix to compare; retry is always explicit." : "Pending values remain unsaved. Review them before choosing Save again."}</p>
          {conflict === "detected" ? <button disabled={mutationBusy} onClick={() => void load(true)} type="button">Reload latest and compare</button> : null}
        </div>
      ) : null}
      {snapshot.state === "global_unavailable" ? <p className="routing-blocking-state" role="alert">The Global Default is unavailable. Select an eligible replacement in the Global row.</p> : null}
      {snapshot.state === "empty_choices" ? <p className="routing-blocking-state" role="status">No eligible route choices are currently available. Current effective facts remain visible.</p> : null}
      <RoutingMatrixAttention mutationBusy={mutationBusy} onAcknowledge={(item) => void acknowledge(item)} snapshot={snapshot} />
      <section aria-labelledby="routing-global-group-heading" className="routing-global-group">
        <h3 id="routing-global-group-heading">Global Default</h3>
        <RoutingMatrixRowEditor draft={drafts.get(snapshot.global.scopeKey) ?? null} mutationBusy={mutationBusy} onChange={changeDraft} onDiscard={discardDraft} onSave={(scopeKey) => void saveDraft(scopeKey)} row={snapshot.global} saving={savingScopeKey === snapshot.global.scopeKey} />
      </section>
      {snapshot.groups.map((group) => <RoutingMatrixGroup drafts={drafts} group={group} key={group.actionType} mutationBusy={mutationBusy} onChange={changeDraft} onDiscard={discardDraft} onSave={(scopeKey) => void saveDraft(scopeKey)} savingScopeKey={savingScopeKey} />)}
      <p className="routing-safety-note">Only future workers use saved routing changes. Actual worker activity is recorded separately.</p>
    </section>
  );
}

function previewCanSettle(
  sequences: ReadonlyMap<string, number>,
  expectedSequence: number,
  scopeKey: string,
  expectedDraft: RoutingMatrixDraftState,
  currentDrafts: ReadonlyMap<string, RoutingMatrixDraftState>,
): boolean {
  const current = currentDrafts.get(scopeKey);
  return sequences.get(scopeKey) === expectedSequence
    && current !== undefined
    && routingMatrixDraftValuesEqual(current, expectedDraft)
    && policyIdentityEqual(current.baseline, expectedDraft.baseline);
}

function policyIdentityEqual(left: RoutingMatrixDraftState["baseline"], right: RoutingMatrixDraftState["baseline"]): boolean {
  return left.policyId === right.policyId
    && left.revisionId === right.revisionId
    && left.revisionNumber === right.revisionNumber
    && left.registryVersion === right.registryVersion
    && left.revisionGuard === right.revisionGuard;
}

function updateCurrentDraft(
  current: Map<string, RoutingMatrixDraftState>,
  scopeKey: string,
  expected: RoutingMatrixDraftState,
  update: (draft: RoutingMatrixDraftState) => RoutingMatrixDraftState,
): Map<string, RoutingMatrixDraftState> {
  const existing = current.get(scopeKey);
  if (!existing || !routingMatrixDraftValuesEqual(existing, expected) || !policyIdentityEqual(existing.baseline, expected.baseline)) return current;
  const next = new Map(current);
  next.set(scopeKey, update(existing));
  return next;
}

function updateDraft(
  current: Map<string, RoutingMatrixDraftState>,
  scopeKey: string,
  update: (draft: RoutingMatrixDraftState) => RoutingMatrixDraftState,
): Map<string, RoutingMatrixDraftState> {
  const existing = current.get(scopeKey);
  if (!existing) return current;
  const next = new Map(current);
  next.set(scopeKey, update(existing));
  return next;
}
function errorCode(caught: unknown): RoutingMatrixErrorCode | null {
  return caught instanceof RoutingPolicyPresentationError ? caught.code : null;
}
