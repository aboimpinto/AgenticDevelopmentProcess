import type { WorkItemCard, CompletionRecoveryAssessment } from "@hepha/shared";

export function completionReadinessActivityLabel(assessment?: CompletionRecoveryAssessment): string {
  if (assessment?.contextCompaction?.state === "running") return "Compacting context";
  if (assessment?.verificationStage) return {
    inspecting: "Inspecting relevant tests", correcting: "Correcting verification plan",
    preparing: "Preparing test execution", testing: "Running relevant tests",
    checking: "Running supporting checks", waiting: "Preparing next verification check",
    validating: "Validating test reports", assessing: "Evaluating test evidence",
  }[assessment.verificationStage] + (assessment.verificationCheckId ? ` — ${assessment.verificationCheckId}` : "");
  return assessment?.contextCompaction?.state === "completed" ? "Context compacted — refreshing readiness" : "Refreshing readiness";
}

/** Display the server-owned recovery lock, never infer activity from an old blocked verdict. */
export function isCompletionReadinessRunning(item: WorkItemCard): boolean {
  return item.kind === "feature" && item.stateFolder === "03_IN_PROGRESS"
    && item.completionRecovery?.ready === false
    && item.completionRecovery.blockers.some(blocker => blocker.id === "recovery-running"
      || (blocker.id === "fresh-verification" && !!item.featureWorkflow?.activeRun));
}
