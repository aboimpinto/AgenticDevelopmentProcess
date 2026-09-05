import type { WorkItemCard } from "@hepha/shared";
import type { WorkflowFailureBriefPresenter } from "./workflow-failure-brief-presenter.js";

/** Resolves the compact, actionable failure context for the next workflow attempt. */
export class PreviousWorkflowFailureBriefResolver {
  constructor(private readonly dependencies: {
    isSupersededByApproval: (value: string) => boolean;
    presenter: Pick<WorkflowFailureBriefPresenter, "compact" | "create">;
  }) {}

  resolve(feature: WorkItemCard): string | null {
    const lastRun = feature.featureWorkflow?.lastRun;
    if (!lastRun || lastRun.status !== "failed") return null;

    const persistedSummary = lastRun.summary?.trim();
    if (persistedSummary?.startsWith("## Previous Workflow Failure Brief")) {
      if (this.dependencies.isSupersededByApproval(persistedSummary)) return null;
      return this.dependencies.presenter.compact(lastRun, feature, persistedSummary);
    }
    if (!lastRun.error) {
      return persistedSummary ? `## Previous Workflow Failure Brief\n\n${persistedSummary}` : null;
    }
    if (this.dependencies.isSupersededByApproval(lastRun.error)) return null;
    return this.dependencies.presenter.create({
      command: lastRun.command,
      currentStep: lastRun.currentStep,
      feature,
      rawError: lastRun.error,
      runId: lastRun.runId,
    });
  }
}
