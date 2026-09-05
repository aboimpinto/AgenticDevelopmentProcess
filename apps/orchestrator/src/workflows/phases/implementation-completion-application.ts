import type { FeatureWorkflowCommand, WorkItemCard } from "@hepha/shared";
import type { AdapterResult } from "../../final-verification-adapter.js";
import type { StoredProject } from "../../projects/stored-project.js";

/** Verifies the durable all-phase terminal state and closes one autonomous implementation run. */
export class ImplementationCompletionApplication {
  constructor(private readonly dependencies: {
    allPhasesResolved: (feature: WorkItemCard) => boolean;
    recordProgress: (input: {
      cardKey: string; command: FeatureWorkflowCommand; currentStep: string; feature: WorkItemCard;
      project: StoredProject; runId: string; summary: string;
    }) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    runFinalVerification: (input: {
      project: StoredProject;
      feature: { cardKey: string; externalId: string; title: string };
      runId: string;
    }) => Promise<AdapterResult>;
  }) {}

  async complete(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    project: StoredProject;
    runId: string;
    summaries: readonly string[];
    usesOrderedPhaseWorkflow: boolean;
  }): Promise<string> {
    const feature = await this.dependencies.refreshFeature(input.project, input.feature.externalId, input.feature);
    if (!this.dependencies.allPhasesResolved(feature)) {
      throw new Error(
        "Autonomous implementation stopped before every numbered phase reached COMPLETED or SKIPPED. Use Continue Implementing after resolving the current phase state.",
      );
    }

    const summaries = [...input.summaries];
    if (input.usesOrderedPhaseWorkflow) {
      summaries.push("All declared tasks in all contract phases are resolved.");
      return summaries.join("\n");
    }

    const finalStep = "Final full build and test verification";
    await this.dependencies.recordProgress({
      cardKey: input.cardKey, command: input.command, currentStep: finalStep, feature,
      project: input.project, runId: input.runId, summary: "Running full project verification.",
    });
    const verification = await this.dependencies.runFinalVerification({
      project: input.project,
      feature: { cardKey: input.cardKey, externalId: feature.externalId, title: feature.title },
      runId: input.runId,
    });
    if (verification.aggregate.status !== "passed") {
      throw new Error(`Final verification did not pass: ${verification.summaryLine}`);
    }
    summaries.push(`Final verification: ${verification.summaryLine}`);
    return summaries.join("\n");
  }
}
