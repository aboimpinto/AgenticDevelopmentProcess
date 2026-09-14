/** Completion readiness display derived from server-owned workflow evidence. */
import type { FeatureWorkflowSummary, FeatureImplementationEvidenceSummary, TerminalWorkItemLifecycle } from "@hepha/shared";
import { isUnresolvedQualityGate } from "@hepha/shared";

export interface CompletionReadinessDisplay {
  readonly verdict: CompletionVerdict;
  readonly reasons: readonly string[];
  readonly canCompleteNow: boolean;
  readonly isFinalizing: boolean;
  readonly missingQualityGateCount: number;
}

export type CompletionVerdict =
  | "ready"
  | "blocked"
  | "finalizing"
  | "not_applicable";

export function summarizeResolvedPhaseQualityGates(
  phases: FeatureImplementationEvidenceSummary["phaseQualityGates"],
): { readonly missing: number; readonly total: number } {
  return phases.reduce(
    (summary, phase) => {
      const status = phase.phaseStatus.trim().toUpperCase();
      if (status !== "COMPLETED" && status !== "SKIPPED") return summary;
      return {
        missing: summary.missing + phase.gates.filter(isUnresolvedQualityGate).length,
        total: summary.total + phase.gates.length,
      };
    },
    { missing: 0, total: 0 },
  );
}

export function buildCompletionReadiness(
  workflow: FeatureWorkflowSummary | null,
  qualityGateCount: number,
  gateSummary: { missing: number; total: number },
  terminalLifecycle: TerminalWorkItemLifecycle | null = null,
): CompletionReadinessDisplay {
  if (!workflow || terminalLifecycle) {
    return {
      verdict: "not_applicable",
      reasons: ["No workflow data available."],
      canCompleteNow: false,
      isFinalizing: false,
      missingQualityGateCount: 0,
    };
  }

  const reasons: string[] = [];
  let canCompleteNow = true;

  // Verification and repair are not feature finalization.
  let verdict: CompletionVerdict = workflow.activeRun?.command === "complete-feature" ? "finalizing" : workflow.activeRun ? "blocked" : "ready";

  if (workflow.activeRun) {
    reasons.push("A workflow run is in progress.");
    canCompleteNow = false;
  }

  const artifactReasons = workflow.canContinueImplementing && !workflow.implementationCompleted
    ? [] : workflow.readiness?.reasons.filter(reason => reason.blocking) ?? [];
  if (artifactReasons.length > 0 || workflow.lastRun?.status === "failed" || workflow.lastRun?.status === "blocked") {
    for (const reason of artifactReasons) reasons.push(`${reason.message}${reason.detail ? ` — ${reason.detail}` : ""}`);
    if (workflow.lastRun?.error) reasons.push(`Last workflow error: ${workflow.lastRun.error}`);
    else if (workflow.lastRun?.status === "blocked" && workflow.lastRun.summary) reasons.push(workflow.lastRun.summary);
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  // Check implementation completed
  if (!workflow.implementationCompleted) {
    reasons.push("Implementation is not yet completed.");
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  // Check human review
  if (!workflow.userCodeReviewCompletedAt) {
    reasons.push("User code review is pending.");
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  if (!workflow.manualTestsCompletedAt) {
    reasons.push("Manual tests are pending.");
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  // Check open findings
  const openFindings = workflow.findings.filter((f) => f.status !== "closed");
  if (openFindings.length > 0) {
    reasons.push(`${openFindings.length} open finding(s) remain.`);
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  // Check quality gates
  if (gateSummary.missing > 0) {
    reasons.push(`${gateSummary.missing} phase quality gate(s) are missing.`);
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  // Check human review findings acceptance
  if (workflow.canAcceptHumanReviewFindings) {
    reasons.push("Accept human review findings before completing.");
    if (verdict === "ready") verdict = "blocked";
    canCompleteNow = false;
  }

  if (verdict === "ready") {
    reasons.push("All completion conditions satisfied.");
  }

  return {
    verdict,
    reasons,
    canCompleteNow,
    isFinalizing: verdict === "finalizing",
    missingQualityGateCount: gateSummary.missing,
  };
}
