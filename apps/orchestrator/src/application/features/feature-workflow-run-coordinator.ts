import type { CardMetadataStore } from "@hepha/db";
import type {
  FeatureWorkflowCommand,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type {
  HephaFeatureWorkflowRunner,
  HephaFeatureWorkflowProgressRecorder,
} from "../../feature-workflow-spec.js";

type WorkflowProgressStore = Pick<CardMetadataStore, "recordFeatureWorkflowRun">;

export interface CardWorkflowProgressInput {
  cardKey: string;
  command: FeatureWorkflowCommand;
  currentNodeId?: string | null;
  currentStep: string;
  externalId: string;
  project: StoredProject;
  runId: string;
  summary: string;
}

export interface FeatureWorkflowProgressInput extends Omit<CardWorkflowProgressInput, "externalId"> {
  feature: WorkItemCard;
}

export interface CardWorkflowRunnerInput {
  cardKey: string;
  command: FeatureWorkflowCommand;
  completedNodeIds?: string[];
  externalId: string;
  project: StoredProject;
  runId: string;
}

export interface FeatureWorkflowRunnerInput extends Omit<CardWorkflowRunnerInput, "externalId"> {
  getFeature: () => WorkItemCard;
}

export class FeatureWorkflowRunCoordinator {
  constructor(private readonly dependencies: {
    assertRunActive: (runId: string) => void;
    createRunner: (input: {
      command: FeatureWorkflowCommand;
      completedNodeIds?: string[];
      recorder: HephaFeatureWorkflowProgressRecorder;
      workspaceRoot: string;
    }) => HephaFeatureWorkflowRunner;
    metadataStore: WorkflowProgressStore;
    notifyProjectChanged: (projectId: string, eventType: string, externalId: string) => void;
    workspaceRoot: string;
  }) {}

  async recordCardProgress(input: CardWorkflowProgressInput): Promise<void> {
    this.dependencies.assertRunActive(input.runId);
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey: input.cardKey,
      command: input.command,
      currentNodeId: input.currentNodeId,
      currentStep: input.currentStep,
      projectId: input.project.id,
      runId: input.runId,
      status: "running",
      summary: input.summary,
    });
    this.dependencies.notifyProjectChanged(input.project.id, "workflow.progress", input.externalId);
  }

  recordFeatureProgress(input: FeatureWorkflowProgressInput): Promise<void> {
    return this.recordCardProgress({ ...input, externalId: input.feature.externalId });
  }

  createCardRunner(input: CardWorkflowRunnerInput): HephaFeatureWorkflowRunner {
    return this.createRunner(input, () => input.externalId);
  }

  createFeatureRunner(input: FeatureWorkflowRunnerInput): HephaFeatureWorkflowRunner {
    return this.createRunner(input, () => input.getFeature().externalId);
  }

  private createRunner(
    input: CardWorkflowRunnerInput | FeatureWorkflowRunnerInput,
    getExternalId: () => string,
  ): HephaFeatureWorkflowRunner {
    return this.dependencies.createRunner({
      command: input.command,
      completedNodeIds: input.completedNodeIds,
      workspaceRoot: this.dependencies.workspaceRoot,
      recorder: async (node, rendered) => {
        await this.recordCardProgress({
          cardKey: input.cardKey,
          command: input.command,
          currentNodeId: node.id,
          currentStep: rendered.status,
          externalId: getExternalId(),
          project: input.project,
          runId: input.runId,
          summary: rendered.summary,
        });
      },
    });
  }
}
