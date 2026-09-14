import { useEffect, useRef, useState } from "react";
import type { WorkItemCard, CompletionRecoveryResponse } from "@hepha/shared";
import { isCompletionReadinessRunning } from "./completion-recovery-activity.js";

/** Explicit recovery reassessment. Only a separately confirmed proposal may add coverage links. */
export function useCompletionReadinessRefresh(projectId: string, item: WorkItemCard,
  onUpdated?: (items: WorkItemCard[]) => void) {
  const [state, setState] = useState({ pending: false, message: null as string | null, error: null as string | null });
  const active = useRef<AbortController | null>(null);
  const selection = `${projectId}:${item.id}`;
  const currentSelection = useRef(selection);
  const serverRunning = isCompletionReadinessRunning(item);
  currentSelection.current = selection;
  useEffect(() => {
    setState({ pending: false, message: null, error: null });
    return () => { active.current?.abort(); active.current = null; };
  }, [selection]);

  const refresh = async (confirmProposalId?: string, coveragePhaseNumber?: number, verificationGuidance?: string) => {
    if (active.current || serverRunning || item.featureWorkflow?.activeRun || !projectId) return;
    const request = new AbortController();
    active.current = request;
    setState({ pending: true, message: null, error: null });
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/completion-readiness`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ cardId: item.id, ...(confirmProposalId ? { confirmProposalId, confirm: true } : {}), ...(coveragePhaseNumber !== undefined ? { coveragePhaseNumber } : {}), ...(!confirmProposalId && coveragePhaseNumber === undefined ? { reassess: true, verifyExisting: true, ...(verificationGuidance?.trim() ? { verificationGuidance: verificationGuidance.trim() } : {}) } : {}) }),
      });
      const result = await response.json() as CompletionRecoveryResponse;
      if (!response.ok) throw new Error(result.message || `Readiness refresh failed (${response.status}).`);
      if (!Array.isArray(result.items) || !result.items.some(card => card.externalId === item.externalId && card.kind === item.kind)) {
        throw new Error("The feature was not found in the refreshed project. Rescan the board and select it again.");
      }
      if (request.signal.aborted || currentSelection.current !== selection) return;
      onUpdated?.(result.items);
      setState({ pending: false, message: result.message, error: null });
    } catch (error) {
      if (request.signal.aborted || currentSelection.current !== selection) return;
      setState({ pending: false, message: null, error: error instanceof Error ? error.message : "Unable to refresh completion readiness." });
    } finally {
      if (active.current === request) active.current = null;
    }
  };
  return { ...state, pending: state.pending || serverRunning, message: serverRunning ? null : state.message, error: serverRunning ? null : state.error, refresh };
}
