import type { CardMetadataStore, StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, DeepDiveSession, StartDeepDiveSessionInput, WorkItemCard } from "@hepha/shared";
import { assertDeepDiveLifecycleEligible } from "../../deep-dive-lifecycle-policy.js";
import type { HephaFeatureWorkflowRunner } from "../../feature-workflow-spec.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { assertDeepDiveMetadataStoreEnabled } from "../../work-item-validation.js";
import type { CardWorkflowRunnerInput } from "../features/feature-workflow-run-coordinator.js";
import {
  createDeepDiveWorkflowVariables,
  createStaleDeepDiveRecoveryQuestion,
  formatWorkItemKind,
  getDeepDiveWorkflowCommand,
  type DeepDiveWorkflowCommand,
} from "./deep-dive-workflow-policy.js";
import { toDeepDiveSession } from "./deep-dive-session-application.js";
import type { DeepDivePreparationSource } from "./deep-dive-preparation-source.js";

type DeepDiveStartStore = Pick<CardMetadataStore,
  | "createDeepDiveSession"
  | "enabled"
  | "findOpenDeepDiveSession"
  | "getDeepDiveSession"
  | "recordFeatureWorkflowRun"
  | "updateDeepDiveSession"
>;

export interface DeepDiveStartDependencies {
  clock(): string;
  createCardKey(kind: WorkItemCard["kind"], externalId: string): string;
  createId(): string;
  createRunner(input: CardWorkflowRunnerInput): HephaFeatureWorkflowRunner;
  findProject(projectId: string): StoredProject | null;
  hashText(value: string): string;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  planQuestions(
    project: StoredProject,
    item: WorkItemCard,
    options: { plan: import("@hepha/shared").HandoffPlanV1; preparationSource: DeepDivePreparationSource; workflowRunId: string },
  ): Promise<DeepDiveQuestion[]>;
  readPreparationSource?(item: WorkItemCard): DeepDivePreparationSource;
  requireModel(configuredModel: string | undefined, label: string): import("@hepha/shared").HandoffPlanV1;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  store: DeepDiveStartStore;
}

export interface DeepDiveQuestionGenerationInput {
  cardKey: string;
  command: DeepDiveWorkflowCommand;
  item: WorkItemCard;
  project: StoredProject;
  preparationSource?: DeepDivePreparationSource;
  runId: string;
}

/** Starts a durable Deep-Dive session and owns its asynchronous question round. */
export class DeepDiveStartApplication {
  constructor(private readonly dependencies: DeepDiveStartDependencies) {}

  async start(
    input: StartDeepDiveSessionInput,
    recoveryQuestion?: { topic: string; prompt: string },
  ): Promise<DeepDiveSession> {
    assertDeepDiveMetadataStoreEnabled(this.dependencies.store.enabled);
    const project = this.dependencies.findProject(input.projectId);
    if (!project) throw new Error("Project not found.");

    const item = (await this.dependencies.scanProject(project)).find((candidate) => candidate.id === input.cardId);
    if (!item) throw new Error("Work item not found.");
    assertDeepDiveLifecycleEligible(item);
    if (!item.documentPath || !item.specMarkdown.trim()) {
      throw new Error("The selected work item does not have a readable source document.");
    }

    const cardKey = this.dependencies.createCardKey(item.kind, item.externalId);
    const existingSession = await this.dependencies.store.findOpenDeepDiveSession(project.id, cardKey);
    if (existingSession) return toDeepDiveSession(existingSession);

    const now = this.dependencies.clock();
    const runId = `workflow-${this.dependencies.createId()}`;
    const command = getDeepDiveWorkflowCommand(item.kind);
    const preparationSource = this.dependencies.readPreparationSource?.(item) ?? {
      documents: [],
      promptMarkdown: item.specMarkdown,
      semanticSource: item.specMarkdown,
      sourceHash: this.dependencies.hashText(item.specMarkdown),
      sourceUpdatedAt: item.documentUpdatedAt,
    };
    const session: StoredDeepDiveSession = {
      agentConnectionStatus: "active",
      cardExternalId: item.externalId,
      cardId: item.id,
      cardKey,
      cardKind: item.kind,
      cardTitle: item.title || item.folderName,
      completedAt: null,
      createdAt: now,
      id: runId,
      originalDocument: item.specMarkdown,
      originalDocumentHash: preparationSource.sourceHash,
      originalDocumentPath: item.documentPath,
      originalDocumentUpdatedAt: preparationSource.sourceUpdatedAt,
      projectId: project.id,
      questions: recoveryQuestion ? [createStaleDeepDiveRecoveryQuestion(recoveryQuestion)] : [],
      status: recoveryQuestion ? "question_round" : "generating_questions",
      updatedAt: now,
    };
    const storedSession = await this.dependencies.store.createDeepDiveSession(session);

    await this.dependencies.store.recordFeatureWorkflowRun({
      cardKey,
      command,
      currentStep: `Preparing ${formatWorkItemKind(item.kind)} Deep-Dive for ${item.externalId}`,
      projectId: project.id,
      runId,
      status: "running",
      summary: `Starting ${formatWorkItemKind(item.kind)} Deep-Dive for ${item.externalId}.`,
    });
    if (!recoveryQuestion) void this.generateQuestions({ cardKey, command, item, preparationSource, project, runId });
    this.dependencies.notifyChanged(project.id, "deep-dive.started", item.externalId);
    return toDeepDiveSession(storedSession);
  }

  async generateQuestions(input: DeepDiveQuestionGenerationInput): Promise<void> {
    const variables = createDeepDiveWorkflowVariables(input.item);
    const preparationSource = input.preparationSource
      ?? this.dependencies.readPreparationSource?.(input.item)
      ?? {
        documents: [],
        promptMarkdown: input.item.specMarkdown,
        semanticSource: input.item.specMarkdown,
        sourceHash: this.dependencies.hashText(input.item.specMarkdown),
        sourceUpdatedAt: input.item.documentUpdatedAt,
      };
    try {
      const workflow = this.dependencies.createRunner({
        cardKey: input.cardKey,
        command: input.command,
        externalId: input.item.externalId,
        project: input.project,
        runId: input.runId,
      });
      await workflow.runNode("create-session", { variables }, () => undefined);
      const questions = await workflow.runNode("generate-questions", { variables }, (node) =>
        this.dependencies.planQuestions(input.project, input.item, {
          plan: this.dependencies.requireModel(undefined, `${input.command} generate-questions node`),
          preparationSource,
          workflowRunId: input.runId,
        }),
      );
      const latestSession = await this.dependencies.store.getDeepDiveSession(input.runId);
      if (!latestSession) throw new Error("Deep-Dive session disappeared before questions could be stored.");

      await this.dependencies.store.updateDeepDiveSession({
        ...latestSession,
        agentConnectionStatus: "finished",
        questions,
        status: "question_round",
        updatedAt: this.dependencies.clock(),
      });
      await workflow.runNode("wait-for-answers", { variables }, () => undefined);
      this.dependencies.notifyChanged(input.project.id, "deep-dive.questions-ready", input.item.externalId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown Deep-Dive question generation error.";
      const latestSession = await this.dependencies.store.getDeepDiveSession(input.runId).catch(() => null);
      if (latestSession) {
        await this.dependencies.store.updateDeepDiveSession({
          ...latestSession,
          agentConnectionStatus: "lost",
          status: "failed",
          updatedAt: this.dependencies.clock(),
        }).catch(() => undefined);
      }
      await this.dependencies.store.recordFeatureWorkflowRun({
        cardKey: input.cardKey,
        command: input.command,
        currentStep: "Deep-Dive question generation failed",
        error: errorMessage,
        projectId: input.project.id,
        runId: input.runId,
        status: "failed",
        summary: errorMessage,
      }).catch(() => undefined);
      this.dependencies.notifyChanged(input.project.id, "deep-dive.failed", input.item.externalId);
    }
  }
}
