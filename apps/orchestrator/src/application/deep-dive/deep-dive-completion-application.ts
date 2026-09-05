import type { CardMetadataStore, StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, DeepDiveSession, WorkItemCard } from "@hepha/shared";
import type { HephaFeatureWorkflowRunner } from "../../feature-workflow-spec.js";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  createDeepDiveWorkflowVariables,
  formatWorkItemKind,
  getDeepDiveWorkflowCommand,
} from "./deep-dive-workflow-policy.js";
import { toDeepDiveQuestions, toDeepDiveSession } from "./deep-dive-session-application.js";
import type { DeepDiveSourceDocumentRepository } from "./deep-dive-source-document-repository.js";

type DeepDiveCompletionStore = Pick<CardMetadataStore,
  | "enabled"
  | "getDeepDiveSession"
  | "recordFeatureWorkflowCompletion"
  | "recordFeatureWorkflowRun"
  | "recordHephaDeepDive"
  | "updateDeepDiveSession"
>;

export class DeepDiveCompletionApplication {
  constructor(private readonly dependencies: {
    clock: () => string;
    createRunner: (input: {
      cardKey: string;
      command: ReturnType<typeof getDeepDiveWorkflowCommand>;
      completedNodeIds: string[];
      externalId: string;
      project: StoredProject;
      runId: string;
    }) => HephaFeatureWorkflowRunner;
    documents: Pick<DeepDiveSourceDocumentRepository, "readEvidence" | "write">
      & Partial<Pick<DeepDiveSourceDocumentRepository, "readPreparationEvidence" | "readPreparationSource">>;
    findProject: (projectId: string) => StoredProject | null;
    metadataStore: DeepDiveCompletionStore;
    notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
    requireModel: (configuredModel: string | null | undefined, label: string) => import("@hepha/shared").HandoffPlanV1;
    scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
    syncEpic: (epic: WorkItemCard, workItems: WorkItemCard[]) => void;
    updateDocument: (
      session: StoredDeepDiveSession,
      questions: DeepDiveQuestion[],
      options: { cwd: string; plan: import("@hepha/shared").HandoffPlanV1; preparationContext?: string; workflowRunId: string },
    ) => Promise<string>;
  }) {}

  async complete(sessionId: string): Promise<DeepDiveSession> {
    const session = await this.load(sessionId);
    const questions = toDeepDiveQuestions(session.questions);
    if (!questions.every((question) => question.status === "answered")) {
      throw new Error("All deep-dive questions must be answered before updating the document.");
    }
    if (!session.originalDocumentPath) {
      throw new Error("The deep-dive session is not linked to a writable source document.");
    }

    const project = this.dependencies.findProject(session.projectId);
    if (!project) throw new Error("Project not found for Deep-Dive session.");

    const command = getDeepDiveWorkflowCommand(session.cardKind as WorkItemCard["kind"]);
    const variables = createDeepDiveWorkflowVariables(session);
    const workflow = this.dependencies.createRunner({
      cardKey: session.cardKey,
      command,
      completedNodeIds: ["create-session", "generate-questions", "wait-for-answers", "answers-ready"],
      externalId: session.cardExternalId,
      project,
      runId: session.id,
    });

    try {
      const updateResult = await workflow.runNode("update-document", { variables }, async (node) => {
        const updatingSession = await this.dependencies.metadataStore.updateDeepDiveSession({
          ...session,
          agentConnectionStatus: "active",
          questions,
          status: "updating_document",
          updatedAt: this.dependencies.clock(),
        });
        const preparationContext = this.dependencies.documents.readPreparationSource?.(
          session.originalDocumentPath!,
          session.cardKind as WorkItemCard["kind"],
        ).promptMarkdown;
        const updatedMarkdown = await this.dependencies.updateDocument(updatingSession, questions, {
          cwd: project.rootPath,
          plan: this.dependencies.requireModel(undefined, `${command} update-document node`),
          preparationContext,
          workflowRunId: session.id,
        });
        this.dependencies.documents.write(session.originalDocumentPath!, updatedMarkdown);
        return {
          evidence: this.readPreparationEvidence(session),
          updatingSession,
        };
      });

      const evidence = session.cardKind === "epic"
        ? await workflow.runNode("sync-epic-state", { variables }, async () => {
            const workItems = await this.dependencies.scanProject(project);
            const epic = workItems.find((item) => item.kind === "epic" && item.externalId === session.cardExternalId);
            if (epic) this.dependencies.syncEpic(epic, workItems);
            return this.readPreparationEvidence(session);
          })
        : updateResult.evidence;

      const completedSession = await workflow.runNode("record-completion", { variables }, async () => {
        const completedAt = this.dependencies.clock();
        await this.dependencies.metadataStore.recordHephaDeepDive({
          cardKey: updateResult.updatingSession.cardKey,
          projectId: updateResult.updatingSession.projectId,
          runId: updateResult.updatingSession.id,
          semanticSource: evidence.semanticSource,
          sourceDocumentHash: evidence.sourceDocumentHash,
          sourceDocumentUpdatedAt: evidence.sourceDocumentUpdatedAt,
        });
        return this.dependencies.metadataStore.updateDeepDiveSession({
          ...updateResult.updatingSession,
          agentConnectionStatus: "finished",
          completedAt,
          questions,
          status: "completed",
          updatedAt: completedAt,
        });
      });

      await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey: session.cardKey,
        command,
        projectId: session.projectId,
        runId: session.id,
        summary: `Completed ${formatWorkItemKind(session.cardKind as WorkItemCard["kind"])} Deep-Dive for ${session.cardExternalId}.`,
      });
      this.dependencies.notifyChanged(session.projectId, "deep-dive.completed", session.cardExternalId);
      return toDeepDiveSession(completedSession);
    } catch (error) {
      await this.recordFailure(session, questions, command, error);
      throw error;
    }
  }

  async recordAnswersReady(session: StoredDeepDiveSession): Promise<void> {
    const project = this.dependencies.findProject(session.projectId);
    if (!project) return;
    const command = getDeepDiveWorkflowCommand(session.cardKind as WorkItemCard["kind"]);
    const workflow = this.dependencies.createRunner({
      cardKey: session.cardKey,
      command,
      completedNodeIds: ["create-session", "generate-questions", "wait-for-answers"],
      externalId: session.cardExternalId,
      project,
      runId: session.id,
    });
    await workflow.runNode(
      "answers-ready",
      { variables: createDeepDiveWorkflowVariables(session) },
      () => undefined,
    );
  }

  private async load(sessionId: string): Promise<StoredDeepDiveSession> {
    if (!this.dependencies.metadataStore.enabled) {
      throw new Error("SQLite metadata is required for Hepha deep-dive sessions.");
    }
    const session = await this.dependencies.metadataStore.getDeepDiveSession(sessionId);
    if (!session) throw new Error("Deep-dive session not found.");
    return session;
  }

  private async recordFailure(
    session: StoredDeepDiveSession,
    questions: DeepDiveQuestion[],
    command: ReturnType<typeof getDeepDiveWorkflowCommand>,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown Deep-Dive document update error.";
    await this.dependencies.metadataStore.updateDeepDiveSession({
      ...session,
      agentConnectionStatus: "lost",
      questions,
      status: "failed",
      updatedAt: this.dependencies.clock(),
    });
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey: session.cardKey,
      command,
      currentStep: "Deep-Dive document update failed",
      error: message,
      projectId: session.projectId,
      runId: session.id,
      status: "failed",
      summary: message,
    }).catch(() => undefined);
    this.dependencies.notifyChanged(session.projectId, "deep-dive.failed", session.cardExternalId);
  }

  private readPreparationEvidence(session: StoredDeepDiveSession) {
    return this.dependencies.documents.readPreparationEvidence?.(
      session.originalDocumentPath!,
      session.cardKind as WorkItemCard["kind"],
    ) ?? this.dependencies.documents.readEvidence(session.originalDocumentPath!);
  }
}
