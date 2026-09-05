import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LiveActivityEvent,
  RuntimeFeatureEvidenceV1,
  RuntimeExecutionEvidenceViewV1,
} from "@hepha/shared";
import { useLiveActivity } from "../use-live-activity.js";
import { createRuntimeEvidenceApi, type RuntimeEvidenceApi } from "./runtime-evidence-api.js";

export interface RuntimePhaseEvidenceSnapshot {
  readonly executions: readonly RuntimeExecutionEvidenceViewV1[];
  readonly nextCursor: string | null;
  readonly loadedPageCount: number;
}

export interface RuntimeEvidenceControllerState {
  readonly summary: RuntimeFeatureEvidenceV1 | null;
  readonly phases: Readonly<Record<string, RuntimePhaseEvidenceSnapshot>>;
  readonly openPhaseIds: ReadonlySet<string>;
  readonly pendingPhaseIds: ReadonlySet<string>;
  readonly isRefreshing: boolean;
  readonly isStale: boolean;
  readonly error: string | null;
}

interface RequestIdentity {
  readonly projectId: string;
  readonly cardKey: string;
  readonly generation: number;
}

const defaultApi = createRuntimeEvidenceApi();

/** Owns disclosure state and atomically refreshes server-authoritative runtime evidence. */
export function useRuntimeEvidenceController(
  projectId: string,
  cardKey: string,
  cardId: string,
  api: RuntimeEvidenceApi = defaultApi,
  enabled = true,
) {
  const [state, setState] = useState<RuntimeEvidenceControllerState>(createEmptyState);
  const stateRef = useRef(state);
  const refreshGeneration = useRef(0);
  const requestIdentityRef = useRef<RequestIdentity>({ projectId, cardKey, generation: 0 });
  const phaseRequestTokensRef = useRef(new Map<string, symbol>());
  if (requestIdentityRef.current.projectId !== projectId || requestIdentityRef.current.cardKey !== cardKey) {
    requestIdentityRef.current = { projectId, cardKey, generation: ++refreshGeneration.current };
  }
  stateRef.current = state;

  const refresh = useCallback(async () => {
    if (!enabled || !isActiveIdentity(requestIdentityRef.current, projectId, cardKey)) return;
    const generation = ++refreshGeneration.current;
    requestIdentityRef.current = { projectId, cardKey, generation };
    phaseRequestTokensRef.current.clear();
    const request = requestIdentityRef.current;
    const previous = stateRef.current;
    setState((current) => isActiveRequest(requestIdentityRef.current, request)
      ? { ...current, pendingPhaseIds: new Set(), isRefreshing: true, error: null }
      : current);
    try {
      const summary = await api.fetchFeature(projectId, cardKey);
      if (!isActiveRequest(requestIdentityRef.current, request)) return;
      assertSummaryIdentity(summary.projectId, summary.cardKey, projectId, cardKey);
      const stagedPhases: Record<string, RuntimePhaseEvidenceSnapshot> = { ...previous.phases };
      for (const phaseId of previous.openPhaseIds) {
        const pageCount = Math.max(1, previous.phases[phaseId]?.loadedPageCount ?? 1);
        let cursor: string | null = null;
        let executions: RuntimeExecutionEvidenceViewV1[] = [];
        let loadedPageCount = 0;
        for (let index = 0; index < pageCount; index += 1) {
          const page = await api.fetchPhase(projectId, cardKey, phaseId, cursor);
          if (!isActiveRequest(requestIdentityRef.current, request)) return;
          assertPageIdentity(page.projectId, page.cardKey, page.phaseExecutionContractId, projectId, cardKey, phaseId);
          executions = mergeExecutions(executions, page.executions);
          loadedPageCount += 1;
          if (page.nextCursor === null) { cursor = null; break; }
          if (page.nextCursor === cursor) throw new Error("Runtime evidence cursor did not advance.");
          cursor = page.nextCursor;
        }
        stagedPhases[phaseId] = { executions, nextCursor: cursor, loadedPageCount };
      }
      if (!isActiveRequest(requestIdentityRef.current, request)) return;
      setState((current) => isActiveRequest(requestIdentityRef.current, request) ? {
        ...current,
        summary,
        phases: stagedPhases,
        pendingPhaseIds: new Set(),
        isRefreshing: false,
        isStale: false,
        error: null,
      } : current);
    } catch {
      if (!isActiveRequest(requestIdentityRef.current, request)) return;
      setState((current) => isActiveRequest(requestIdentityRef.current, request) ? {
        ...current,
        pendingPhaseIds: new Set(),
        isRefreshing: false,
        isStale: current.summary !== null,
        error: "Runtime evidence could not be refreshed.",
      } : current);
    }
  }, [api, cardKey, enabled, projectId]);

  useEffect(() => {
    phaseRequestTokensRef.current.clear();
    const empty = createEmptyState();
    stateRef.current = empty;
    setState(empty);
  }, [cardKey, projectId]);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);

  const loadPhase = useCallback(async (phaseId: string, cursor: string | null) => {
    if (!isActiveIdentity(requestIdentityRef.current, projectId, cardKey)
      || phaseRequestTokensRef.current.has(phaseId)) return;
    const request = requestIdentityRef.current;
    const previous = stateRef.current.phases[phaseId];
    const token = Symbol(phaseId);
    phaseRequestTokensRef.current.set(phaseId, token);
    setState((current) => isActiveRequest(requestIdentityRef.current, request)
      ? { ...current, pendingPhaseIds: added(current.pendingPhaseIds, phaseId), error: null }
      : current);
    try {
      const page = await api.fetchPhase(projectId, cardKey, phaseId, cursor);
      if (!isActivePhaseRequest(requestIdentityRef.current, request, phaseRequestTokensRef.current, phaseId, token)) return;
      assertPageIdentity(page.projectId, page.cardKey, page.phaseExecutionContractId, projectId, cardKey, phaseId);
      const executions = mergeExecutions(cursor === null ? [] : previous?.executions ?? [], page.executions);
      setState((current) => {
        if (!isActivePhaseRequest(requestIdentityRef.current, request, phaseRequestTokensRef.current, phaseId, token)) return current;
        const currentPhase = current.phases[phaseId];
        if (currentPhase !== previous || cursor !== null && currentPhase?.nextCursor !== cursor) {
          phaseRequestTokensRef.current.delete(phaseId);
          return { ...current, pendingPhaseIds: removed(current.pendingPhaseIds, phaseId) };
        }
        phaseRequestTokensRef.current.delete(phaseId);
        return {
          ...current,
          phases: {
            ...current.phases,
            [phaseId]: {
              executions,
              nextCursor: page.nextCursor,
              loadedPageCount: cursor === null ? 1 : (currentPhase?.loadedPageCount ?? 0) + 1,
            },
          },
          pendingPhaseIds: removed(current.pendingPhaseIds, phaseId),
          isStale: false,
          error: null,
        };
      });
    } catch {
      if (!isActivePhaseRequest(requestIdentityRef.current, request, phaseRequestTokensRef.current, phaseId, token)) return;
      phaseRequestTokensRef.current.delete(phaseId);
      setState((current) => isActiveRequest(requestIdentityRef.current, request) ? {
        ...current,
        pendingPhaseIds: removed(current.pendingPhaseIds, phaseId),
        isStale: current.summary !== null,
        error: "Runtime evidence details are unavailable.",
      } : current);
    }
  }, [api, cardKey, projectId]);

  const togglePhase = useCallback((phaseId: string) => {
    const opening = !stateRef.current.openPhaseIds.has(phaseId);
    setState((current) => ({
      ...current,
      openPhaseIds: opening ? added(current.openPhaseIds, phaseId) : removed(current.openPhaseIds, phaseId),
    }));
    if (opening && !stateRef.current.phases[phaseId]) void loadPhase(phaseId, null);
  }, [loadPhase]);

  const loadMore = useCallback((phaseId: string) => {
    const cursor = stateRef.current.phases[phaseId]?.nextCursor;
    if (cursor) void loadPhase(phaseId, cursor);
  }, [loadPhase]);

  const handleEvent = useCallback((event: LiveActivityEvent) => {
    if ((event.cardId !== cardKey && event.cardId !== cardId)
      || (event.category !== "phase" && !event.type.startsWith("workflow."))) return;
    void refresh();
  }, [cardId, cardKey, refresh]);
  const liveCallbacks = useMemo(() => ({
    onEvent: handleEvent,
    onReplayUnavailable: () => {
      if (!isActiveIdentity(requestIdentityRef.current, projectId, cardKey)) return;
      setState((current) => isActiveIdentity(requestIdentityRef.current, projectId, cardKey)
        ? { ...current, isStale: current.summary !== null }
        : current);
    },
  }), [cardKey, handleEvent, projectId]);
  useLiveActivity(enabled && typeof EventSource !== "undefined" ? projectId : null, null, liveCallbacks);

  return { state, refresh, togglePhase, loadMore };
}

function createEmptyState(): RuntimeEvidenceControllerState {
  return {
    summary: null,
    phases: {},
    openPhaseIds: new Set(),
    pendingPhaseIds: new Set(),
    isRefreshing: false,
    isStale: false,
    error: null,
  };
}
function assertSummaryIdentity(actualProject: string, actualCard: string, project: string, card: string): void {
  if (actualProject !== project || actualCard !== card) throw new Error("Runtime evidence summary identity does not match its request.");
}
function assertPageIdentity(actualProject: string, actualCard: string, actualPhase: string, project: string, card: string, phase: string): void {
  if (actualProject !== project || actualCard !== card || actualPhase !== phase) throw new Error("Runtime evidence page identity does not match its request.");
}
function isActiveIdentity(active: RequestIdentity, projectId: string, cardKey: string): boolean {
  return active.projectId === projectId && active.cardKey === cardKey;
}
function isActiveRequest(active: RequestIdentity, request: RequestIdentity): boolean {
  return active.projectId === request.projectId && active.cardKey === request.cardKey
    && active.generation === request.generation;
}
function isActivePhaseRequest(
  active: RequestIdentity,
  request: RequestIdentity,
  tokens: ReadonlyMap<string, symbol>,
  phaseId: string,
  token: symbol,
): boolean {
  return isActiveRequest(active, request) && tokens.get(phaseId) === token;
}
function mergeExecutions(previous: readonly RuntimeExecutionEvidenceViewV1[], next: readonly RuntimeExecutionEvidenceViewV1[]): RuntimeExecutionEvidenceViewV1[] {
  const merged = [...previous];
  const ids = new Set(previous.map(executionId));
  for (const execution of next) {
    const id = executionId(execution);
    if (ids.has(id)) throw new Error("Runtime evidence contains a duplicate execution.");
    const last = merged.at(-1);
    if (last && compareExecution(execution, last) <= 0) throw new Error("Runtime evidence page is out of order.");
    ids.add(id);
    merged.push(execution);
  }
  return merged;
}
function executionId(value: RuntimeExecutionEvidenceViewV1): string {
  return `${value.mode}\u0000${value.mode === "direct_host" ? value.evidenceId : value.invocationId}`;
}
function executionPosition(value: RuntimeExecutionEvidenceViewV1): readonly [string, string, string] {
  return value.mode === "direct_host"
    ? [value.startedAt, value.mode, value.evidenceId]
    : [value.openedAt, value.mode, value.invocationId];
}
function compareExecution(left: RuntimeExecutionEvidenceViewV1, right: RuntimeExecutionEvidenceViewV1): number {
  const a = executionPosition(left);
  const b = executionPosition(right);
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1
    : a[1] < b[1] ? -1 : a[1] > b[1] ? 1
    : a[2] < b[2] ? -1 : a[2] > b[2] ? 1
    : 0;
}
function added<T>(values: ReadonlySet<T>, value: T): Set<T> { const next = new Set(values); next.add(value); return next; }
function removed<T>(values: ReadonlySet<T>, value: T): Set<T> { const next = new Set(values); next.delete(value); return next; }
