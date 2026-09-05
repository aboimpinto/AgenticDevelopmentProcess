import type {
  StoredFeatureFinding,
  StoredImplementationAgentRun,
  StoredImplementationPhaseRun,
} from "@hepha/db";
import type {
  FeatureWorkflowCommand,
  FeatureWorkflowSummary,
  ImplementationAgentRunSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { LatestCodeReviewReport } from "../../workflows/reviews/code-review-failure-context-repository.js";
import {
  formatPhaseReference,
  isImplementationPhaseResolved,
  normalizeImplementationPhaseStatus,
} from "../../workflows/phases/phase-lifecycle-policy.js";

interface ImplementationRunSummaryProjectorDependencies {
  findLatestReviewReport: (featureFolderPath: string, phaseNumber: number) => LatestCodeReviewReport | null;
  summarizeOutput: (output: string, fallback: string) => string;
}

export class ImplementationRunSummaryProjector {
  constructor(private readonly dependencies: ImplementationRunSummaryProjectorDependencies) {}

  mapPhase(
    phaseRun: StoredImplementationPhaseRun,
    feature: Pick<WorkItemCard, "folderPath" | "phases"> | null = null,
    lastRun: FeatureWorkflowSummary["lastRun"] | null = null,
  ): FeatureWorkflowSummary["implementationPhases"][number] {
    const reconciled = this.#attachLatestUnresolvedReviewReport(
      this.#reconcileRecoveredPhaseRun(phaseRun, feature, lastRun),
      feature,
      lastRun,
    );

    return {
      agent: reconciled.agent,
      completedAt: reconciled.completedAt,
      currentStep: reconciled.currentStep,
      error: reconciled.error,
      model: reconciled.model,
      phaseNumber: reconciled.phaseNumber,
      phaseTitle: reconciled.phaseTitle,
      reportPath: reconciled.reportPath,
      startedAt: reconciled.startedAt,
      status: reconciled.status,
      summary: reconciled.summary,
      updatedAt: reconciled.updatedAt,
      workflowRunId: reconciled.workflowRunId,
    };
  }

  mapAgent(agentRun: StoredImplementationAgentRun): ImplementationAgentRunSummary {
    return {
      agentName: agentRun.agentName,
      agentRole: agentRun.agentRole,
      completedAt: agentRun.completedAt,
      currentStep: agentRun.currentStep,
      error: agentRun.error,
      id: agentRun.id,
      model: agentRun.model,
      phaseNumber: agentRun.phaseNumber,
      phaseTitle: agentRun.phaseTitle,
      reportPath: agentRun.reportPath,
      startedAt: agentRun.startedAt,
      status: agentRun.status,
      summary: agentRun.summary,
      updatedAt: agentRun.updatedAt,
      workflowRunId: agentRun.workflowRunId,
    };
  }

  mapFinding(finding: StoredFeatureFinding): FeatureWorkflowSummary["findings"][number] {
    return {
      closedAt: finding.closedAt,
      createdAt: finding.createdAt,
      currentStep: finding.currentStep,
      error: finding.error,
      events: finding.events,
      id: finding.id,
      runId: finding.runId,
      status: finding.status,
      summary: finding.summary,
      title: finding.title,
      updatedAt: finding.updatedAt,
    };
  }

  deriveCurrentStep(card: WorkItemCard): string | null {
    const states: Array<[string, (reference: string) => string]> = [
      ["CODE_REVIEW_IN_PROGRESS", (reference) => `Code-Review ${reference}`],
      ["CHECKPOINT_IN_PROGRESS", (reference) => `Running CheckPoint for ${reference}`],
      ["IN_PROGRESS", (reference) => `Implementing ${reference}`],
      ["AWAITING_USER_ACCEPTANCE", (reference) => `${reference} awaiting acceptance`],
    ];

    for (const [status, render] of states) {
      const phase = card.phases.find((candidate) => normalizeStatus(candidate.status).includes(status));
      if (phase) return render(formatPhaseReference(phase));
    }

    return null;
  }

  #reconcileRecoveredPhaseRun(
    phaseRun: StoredImplementationPhaseRun,
    feature: Pick<WorkItemCard, "phases"> | null,
    lastRun: FeatureWorkflowSummary["lastRun"] | null,
  ): StoredImplementationPhaseRun {
    if (
      !feature ||
      !lastRun ||
      !isImplementationWorkflowCommand(lastRun.command) ||
      lastRun.status !== "completed" ||
      (phaseRun.status !== "failed" && phaseRun.status !== "blocked")
    ) return phaseRun;

    const phase = feature.phases.find((candidate) => candidate.number === phaseRun.phaseNumber);
    if (!phase || !isImplementationPhaseResolved(phase)) return phaseRun;
    const resolvedStatus = normalizeImplementationPhaseStatus(phase.status);

    return {
      ...phaseRun,
      currentStep: `Phase ${phaseRun.phaseNumber} recovered after phase document update`,
      error: null,
      status: "completed",
      summary: `recovered after workflow completion of a ${phaseRun.status} phase run; phase Markdown status is ${resolvedStatus}.`,
      updatedAt: phase.updatedAt,
    };
  }

  #attachLatestUnresolvedReviewReport(
    phaseRun: StoredImplementationPhaseRun,
    feature: Pick<WorkItemCard, "folderPath"> | null,
    lastRun: FeatureWorkflowSummary["lastRun"] | null,
  ): StoredImplementationPhaseRun {
    if (!feature || !lastRun || !isImplementationWorkflowCommand(lastRun.command) || lastRun.status === "completed") {
      return phaseRun;
    }

    const latestReport = this.dependencies.findLatestReviewReport(feature.folderPath, phaseRun.phaseNumber);
    if (!latestReport || (latestReport.result !== "NEEDS_CHANGES" && latestReport.result !== "BLOCKED")) {
      return phaseRun;
    }
    if (phaseRun.reportPath === latestReport.path && phaseRun.error) return phaseRun;

    return {
      ...phaseRun,
      error: phaseRun.error ?? this.dependencies.summarizeOutput(
        latestReport.markdown,
        "The latest review report contains unresolved findings.",
      ),
      reportPath: phaseRun.reportPath ?? latestReport.path,
    };
  }
}

export function isImplementationWorkflowCommand(command: FeatureWorkflowCommand | null | undefined): boolean {
  return command === "start-implementing" || command === "continue-implementing" || command === "complete-feature";
}

function normalizeStatus(status: string): string {
  return status.toUpperCase().replace(/[\s-]+/g, "_");
}
