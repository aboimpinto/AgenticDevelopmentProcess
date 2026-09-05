import type { CardMetadataStore } from "@hepha/db";
import { randomUUID } from "node:crypto";
import { ProjectLessonsLearnedContextReader } from "../application/context/project-lessons-learned-context-reader.js";
import { DeepDiveChatResponder } from "../application/deep-dive/deep-dive-chat-responder.js";
import { DeepDiveCompletionApplication } from "../application/deep-dive/deep-dive-completion-application.js";
import { DeepDiveContinuationRecoveryApplication } from "../application/deep-dive/deep-dive-continuation-recovery-application.js";
import { DeepDiveDocumentUpdater } from "../application/deep-dive/deep-dive-document-updater.js";
import { DeepDiveFollowUpPlanner } from "../application/deep-dive/deep-dive-follow-up-planner.js";
import { DeepDiveQuestionPlanner } from "../application/deep-dive/deep-dive-question-planner.js";
import { DeepDiveSessionApplication } from "../application/deep-dive/deep-dive-session-application.js";
import { DeepDiveSourceDocumentRepository } from "../application/deep-dive/deep-dive-source-document-repository.js";
import { DeepDiveStartApplication } from "../application/deep-dive/deep-dive-start-application.js";
import { readDeepDivePreparationSource } from "../application/deep-dive/deep-dive-preparation-source.js";
import { EpicStateSynchronizationApplication } from "../application/epics/epic-state-synchronization-application.js";
import { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import { ProjectRegistry } from "../projects/project-registry.js";
import { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import { createUiRequirementSourceHash } from "../workflows/prompts/feature-entry-prompts.js";
import { hashText } from "../workflow-receipt.js";
import type { createOrchestratorRuntimeSettings } from "./orchestrator-runtime-settings.js";

type RuntimeSettings = ReturnType<typeof createOrchestratorRuntimeSettings>;
type StartDependencies = ConstructorParameters<typeof DeepDiveStartApplication>[0];
type FollowUpDependencies = ConstructorParameters<typeof DeepDiveFollowUpPlanner>[0];

export interface DeepDiveApplicationsDependencies {
  epicState: EpicStateSynchronizationApplication;
  lessons: ProjectLessonsLearnedContextReader;
  metadataStore: CardMetadataStore;
  routeResolver: RoutingActionResolver;
  notifyChanged: StartDependencies["notifyChanged"];
  registry: ProjectRegistry;
  runCoordinator: FeatureWorkflowRunCoordinator;
  runPrompt: FollowUpDependencies["runPrompt"];
  settings: Pick<RuntimeSettings,
    | "deepDiveDocumentUpdateTimeoutMs"
    | "deepDiveModelRewriteMaxChars"
    | "runTimeoutMs"
    | "sessionDir"
  >;
  workItems: WorkItemQueryApplication;
}

/** Composes interactive deep-dive planning, chat, document update, completion, and recovery. */
export function createDeepDiveApplications(dependencies: DeepDiveApplicationsDependencies) {
  const findProject = (projectId: string) => dependencies.registry.get(projectId) ?? null;
  const scanProject = (project: Parameters<WorkItemQueryApplication["scan"]>[0]) => dependencies.workItems.scan(project);
  const deepDiveChatResponder = new DeepDiveChatResponder({
    resolveModel: () => dependencies.routeResolver.resolvePlan("deep-dive"),
    runPrompt: dependencies.runPrompt,
  });
  const deepDiveFollowUpPlanner = new DeepDiveFollowUpPlanner({
    resolveModel: () => dependencies.routeResolver.resolvePlan("deep-dive"),
    runPrompt: dependencies.runPrompt,
    stallTimeoutMs: dependencies.settings.runTimeoutMs,
  });
  const deepDiveQuestionPlanner = new DeepDiveQuestionPlanner({
    renderLessons: (project) => dependencies.lessons.render(project, {
      agentRole: "deep-dive",
      maxDocuments: 12,
    }),
    runPrompt: dependencies.runPrompt,
    sessionDirectory: dependencies.settings.sessionDir,
    stallTimeoutMs: dependencies.settings.runTimeoutMs,
    warn: (message, error) => console.warn(message, error instanceof Error ? error.message : error),
  });
  const deepDiveDocumentUpdater = new DeepDiveDocumentUpdater({
    maxModelRewriteCharacters: dependencies.settings.deepDiveModelRewriteMaxChars,
    runPrompt: dependencies.runPrompt,
    sessionDirectory: dependencies.settings.sessionDir,
    timeoutMs: dependencies.settings.deepDiveDocumentUpdateTimeoutMs,
    warn: (message, error) => console.warn(message, error instanceof Error ? error.message : error),
  });
  const deepDiveSourceDocumentRepository = new DeepDiveSourceDocumentRepository();
  const deepDiveStartApplication = new DeepDiveStartApplication({
    clock: () => new Date().toISOString(),
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    createRunner: (input) => dependencies.runCoordinator.createCardRunner(input),
    findProject,
    hashText,
    notifyChanged: dependencies.notifyChanged,
    planQuestions: (project, item, options) => deepDiveQuestionPlanner.create(project, item, options),
    readPreparationSource: readDeepDivePreparationSource,
    requireModel: (_configuredModel, _label) => dependencies.routeResolver.resolvePlan("deep-dive"),
    scanProject,
    store: dependencies.metadataStore,
  });
  const deepDiveCompletionApplication = new DeepDiveCompletionApplication({
    clock: () => new Date().toISOString(),
    createRunner: (input) => dependencies.runCoordinator.createCardRunner(input),
    documents: deepDiveSourceDocumentRepository,
    findProject,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    requireModel: (_configuredModel, _label) => dependencies.routeResolver.resolvePlan("deep-dive"),
    scanProject,
    syncEpic: (epic, items) => { dependencies.epicState.syncEpic(epic, items); },
    updateDocument: (session, questions, options) => deepDiveDocumentUpdater.update(session, questions, options),
  });
  const deepDiveSessionApplication = new DeepDiveSessionApplication({
    clock: () => new Date().toISOString(),
    createChatReply: (session, question, userMessage) => deepDiveChatResponder.createReply(session, question, userMessage),
    createId: randomUUID,
    notifyChanged: dependencies.notifyChanged,
    planFollowUp: (session, question) => deepDiveFollowUpPlanner.create(session, question),
    recordAnswersReady: (session) => deepDiveCompletionApplication.recordAnswersReady(session),
    store: dependencies.metadataStore,
  });
  const deepDiveContinuationRecoveryApplication = new DeepDiveContinuationRecoveryApplication({
    createCardKey: createWorkItemCardKey,
    createSourceHash: hashText,
    createUiRequirementSourceHash,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    readPreparationSource: readDeepDivePreparationSource,
    startRecoverySession: (input, question) => deepDiveStartApplication.start(input, question),
  });

  return {
    deepDiveCompletionApplication,
    deepDiveContinuationRecoveryApplication,
    deepDiveSessionApplication,
    deepDiveStartApplication,
  };
}
