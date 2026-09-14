import { useEffect, useState } from "react";
import type { WorkItemCard, FeatureWorkflowActionResponse, PhaseQualityResolutionInput } from "@hepha/shared";
import type { ResolvePhaseGate } from "./phase-quality-issues.js";
import { isCompletionReadinessRunning } from "./completion-recovery-activity.js";

export function usePhaseQualityResolution(projectId: string, item: WorkItemCard,
  onUpdated?: (items: WorkItemCard[]) => void, onNotice?: (message: string | null) => void, onError?: (error: string | null) => void) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A completed run supersedes the launch notice; do not keep displaying "repairing" while idle.
  useEffect(() => setMessage(null), [projectId, item.id, item.featureWorkflow?.lastRun?.completedAt]);
  const resolve: ResolvePhaseGate = async (blocker, action, note, confirmExecutionPrerequisites) => {
    if (pending || isCompletionReadinessRunning(item) || item.featureWorkflow?.activeRun || blocker.phaseNumber === null) return;
    const phase = item.phases.find(p => p.number === blocker.phaseNumber);
    if (!phase) return;
    setPending(true); setMessage(null);
    try {
      const body: PhaseQualityResolutionInput = { projectId, cardId: item.id, phaseNumber: blocker.phaseNumber, gate: blocker.gate,
        action, note, confirmWaiver: action === "waive", confirmExecutionPrerequisites, expectedUpdatedAt: phase.updatedAt };
      const response = await fetch("/api/phase-quality/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as FeatureWorkflowActionResponse & { error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? "Phase gate action failed.");
      onUpdated?.(result.items); onNotice?.(result.summary); onError?.(null); setMessage(result.summary);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text); onError?.(text);
    } finally { setPending(false); }
  };
  return { pending, resolve, message };
}
