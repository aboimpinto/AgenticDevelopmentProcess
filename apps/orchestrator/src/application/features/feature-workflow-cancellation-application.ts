import type {
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  FeatureWorkflowCommand,
  ImplementationPhaseRunStatus,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { CardMetadataStore } from "@hepha/db";
import type { StoredProject } from "../../projects/stored-project.js";
import { describeBlockedTransition } from "../../workflow-state-machine.js";

type CancellationStore = Pick<
  CardMetadataStore,
  "findOpenDeepDiveSession" | "recordFeatureWorkflowRun" | "recordImplementationPhaseRun" | "updateDeepDiveSession"
>;

export interface FeatureWorkflowCancellationDependencies {
  readonly cancelPiProcesses: (runId: string) => number;
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly formatCommand: (command: FeatureWorkflowCommand) => string;
  readonly metadataStore: CancellationStore;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly requestCancellation: (runId: string) => void;
  readonly resolveTarget: (
    input: FeatureWorkflowActionInput,
  ) => Promise<{ item: WorkItemCard; project: StoredProject }>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly syncLinkedEpic: (project: StoredProject, feature: WorkItemCard) => Promise<unknown>;
  readonly toProjectSummary: (project: StoredProject) => ProjectSummary;
  readonly clock?: () => string;
}

export class FeatureWorkflowCancellationApplication {
  readonly #dependencies: FeatureWorkflowCancellationDependencies;

  constructor(dependencies: FeatureWorkflowCancellationDependencies) {
    this.#dependencies = dependencies;
  }

  async cancel(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const { item, project } = await this.#dependencies.resolveTarget(input);
    const activeRun = item.featureWorkflow?.activeRun;
    if (!activeRun) throw new Error(`${item.externalId} does not have a running workflow to cancel.`);

    const transitionBlocked = describeBlockedTransition(activeRun.status, "cancel", "cancelled");
    if (transitionBlocked) throw new Error(`${item.externalId} cannot be cancelled: ${transitionBlocked}`);

    this.#dependencies.requestCancellation(activeRun.runId);
    const killedProcesses = this.#dependencies.cancelPiProcesses(activeRun.runId);
    const cardKey = this.#dependencies.createCardKey(item.kind, item.externalId);
    const cancelMessage = killedProcesses > 0
      ? `Cancelled workflow and stopped ${killedProcesses} Pi process${killedProcesses === 1 ? "" : "es"}.`
      : "Cancelled stale workflow; no active Pi process was attached to this orchestrator instance.";

    for (const phaseRun of item.featureWorkflow?.implementationPhases ?? []) {
      if (["completed", "blocked", "failed"].includes(phaseRun.status)) continue;
      const phaseStatus: ImplementationPhaseRunStatus = phaseRun.status === "pending" ? "pending" : "failed";
      await this.#dependencies.metadataStore.recordImplementationPhaseRun({
        agent: phaseRun.agent ?? "Implementation Agent",
        cardKey,
        currentStep: "Cancelled by user",
        error: cancelMessage,
        model: phaseRun.model ?? "unknown",
        phaseNumber: phaseRun.phaseNumber,
        phaseTitle: phaseRun.phaseTitle,
        projectId: project.id,
        reportPath: phaseRun.reportPath,
        status: phaseStatus,
        summary: cancelMessage,
        workflowRunId: activeRun.runId,
      }).catch(() => undefined);
    }

    await this.#dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey,
      command: activeRun.command,
      currentStep: "Cancelled by user",
      error: cancelMessage,
      projectId: project.id,
      runId: activeRun.runId,
      status: "cancelled",
      summary: cancelMessage,
    });

    if (isDeepDiveCommand(activeRun.command)) {
      const openSession = await this.#dependencies.metadataStore
        .findOpenDeepDiveSession(project.id, cardKey)
        .catch(() => null);
      if (openSession?.id === activeRun.runId) {
        const cancelledAt = (this.#dependencies.clock ?? (() => new Date().toISOString()))();
        await this.#dependencies.metadataStore.updateDeepDiveSession({
          ...openSession,
          agentConnectionStatus: "lost",
          completedAt: cancelledAt,
          status: "failed",
          updatedAt: cancelledAt,
        }).catch(() => undefined);
      }
    }

    if (item.kind === "feature") await this.#dependencies.syncLinkedEpic(project, item);
    this.#dependencies.notifyChanged(project.id, "workflow.cancelled", item.externalId);

    return {
      filesChanged: [],
      filesCreated: [],
      items: await this.#dependencies.scanProject(project),
      project: this.#dependencies.toProjectSummary(project),
      summary: `${this.#dependencies.formatCommand(activeRun.command)} cancelled for ${item.externalId}.`,
    };
  }
}

function isDeepDiveCommand(command: FeatureWorkflowCommand): boolean {
  return command === "deep-dive-epic" || command === "deep-dive-feature";
}
