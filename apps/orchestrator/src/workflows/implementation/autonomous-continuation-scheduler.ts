import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export type AutonomousContinuationOutcome = "blocked" | "not_scheduled" | "scheduled";

export interface AutonomousContinuationInput {
  autonomous: boolean;
  branchMessage: string;
  branchName: string;
  cardKey: string;
  command: "continue-implementing" | "start-implementing";
  durableFingerprintBeforeRun: string;
  feature: WorkItemCard;
  previousFailureBrief: string | null;
  project: StoredProject;
  runId: string;
}

/**
 * Owns the cross-run continuation circuit after an implementation boundary.
 * A successor is legal only when unresolved work remains and the completed run
 * changed durable FEAT evidence. Authoritative terminal reconciliation never
 * reaches this scheduler. For genuinely unresolved work, unchanged before/after
 * evidence pauses the current run instead of recursively creating an equivalent
 * Continue Implementation run.
 */
export class AutonomousContinuationScheduler {
  constructor(private readonly dependencies: {
    captureDurableProgress(feature: WorkItemCard): string;
    createId(): string;
    execute(input: AutonomousContinuationInput & {
      command: "continue-implementing";
      recoveryAttempt: number;
      runId: string;
    }): Promise<void>;
    hasRemainingWork(feature: WorkItemCard): boolean;
    metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowRun">;
    notifyChanged(projectId: string, eventType: string, externalId: string): void;
  }) {}

  async schedule(input: AutonomousContinuationInput): Promise<AutonomousContinuationOutcome> {
    if (!input.autonomous || !this.dependencies.hasRemainingWork(input.feature)) return "not_scheduled";

    const durableFingerprintAfterRun = this.dependencies.captureDurableProgress(input.feature);
    const unchangedDurableState = input.durableFingerprintBeforeRun === durableFingerprintAfterRun;

    if (unchangedDurableState) {
      const error = [
        "WORKFLOW_AWAITING_USER_DECISION: The completed implementation run returned to the autonomous continuation boundary with unresolved work and unchanged durable FEAT evidence.",
        `Durable fingerprint before run: ${input.durableFingerprintBeforeRun}.`,
        `Durable fingerprint after run: ${durableFingerprintAfterRun}.`,
        "Hepha stopped autonomous continuation scheduling rather than creating an equivalent workflow run. Completed task evidence remains preserved. Repair the reported authority mismatch and choose Continue Implementation, or cancel the workflow.",
      ].join(" ");
      await this.dependencies.metadataStore.recordFeatureWorkflowRun({
        cardKey: input.cardKey,
        command: input.command,
        currentNodeId: "continuation-circuit",
        currentStep: "Awaiting user decision at the continuation boundary",
        error,
        projectId: input.project.id,
        runId: input.runId,
        status: "blocked",
        summary: error,
      });
      this.dependencies.notifyChanged(input.project.id, "workflow.blocked", input.feature.externalId);
      return "blocked";
    }

    const runId = `workflow-${this.dependencies.createId()}`;
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey: input.cardKey,
      command: "continue-implementing",
      currentNodeId: "refresh-current-feature",
      currentStep: "Scheduling fresh continuation after durable progress",
      projectId: input.project.id,
      runId,
      status: "running",
      summary: "The preceding implementation run changed durable FEAT evidence, so the orchestrator is starting a fresh Continue Implementation run for the next durable phase task.",
    });
    this.dependencies.notifyChanged(
      input.project.id,
      "workflow.continuation-scheduled",
      input.feature.externalId,
    );
    void this.dependencies.execute({
      ...input,
      autonomous: true,
      command: "continue-implementing",
      durableFingerprintBeforeRun: durableFingerprintAfterRun,
      recoveryAttempt: 0,
      runId,
    });
    return "scheduled";
  }
}
