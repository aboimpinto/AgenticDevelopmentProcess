import { resolve } from "node:path";
import { createCardMetadataStore } from "@hepha/db";
import { ImplementationRunSummaryProjector } from "../application/features/implementation-run-summary-projector.js";
import { FeatureStateFolderTransition } from "../application/features/feature-state-folder-transition.js";
import { SubmittedFeatureDocumentWriter } from "../application/features/submitted-feature-document-writer.js";
import { WorkItemIdAllocator } from "../application/work-items/work-item-id-allocator.js";
import { ProjectChangeNotifier } from "../application/projects/project-change-notifier.js";
import { FocusedGitCommitAdapter } from "../infrastructure/git/focused-git-commit-adapter.js";
import { SafeGitReader } from "../infrastructure/git/safe-git-reader.js";
import { LiveActivitySseService } from "../transport/sse/live-activity-sse-service.js";
import { MemoryBankEventSseService } from "../transport/sse/memory-bank-event-sse-service.js";
import { PhaseCompletionEvidenceReader } from "../workflows/phases/phase-completion-evidence-reader.js";
import { PhaseStatusDocumentRepository } from "../workflows/phases/phase-status-document-repository.js";
import { PhaseWorkerSessionEvidenceReader } from "../workflows/phases/phase-worker-session-evidence-reader.js";
import { CodeReviewFailureContextRepository } from "../workflows/reviews/code-review-failure-context-repository.js";
import { CodeReviewReportWriter } from "../workflows/reviews/code-review-report-writer.js";
import { PreviousCodeReviewFollowUpPresenter } from "../workflows/reviews/previous-code-review-follow-up-presenter.js";
import { PreviousWorkflowFailureBriefResolver } from "../workflows/recovery/previous-workflow-failure-brief-resolver.js";
import { WorkflowFailureBriefPresenter } from "../workflows/recovery/workflow-failure-brief-presenter.js";
import { WorkflowMachineStateRepository } from "../workflows/recovery/workflow-machine-state-repository.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";
import { createRuntimeMetadataStore } from "./orchestrator-host-lifecycle.js";

export interface WorkflowInfrastructureDependencies {
  createMetadataStore: typeof createRuntimeMetadataStore;
  environment: NodeJS.ProcessEnv;
  localStateDir: string;
  log(message: string): void;
  sessionDir: string;
  workspaceRoot: string;
}

export async function createWorkflowInfrastructureApplications(dependencies: WorkflowInfrastructureDependencies) {
  const phaseWorkerSessionEvidenceReader = new PhaseWorkerSessionEvidenceReader({
    sessionDirectory: dependencies.sessionDir,
    workspaceRoot: dependencies.workspaceRoot,
  });
  const codeReviewFailureContextRepository = new CodeReviewFailureContextRepository();
  const previousCodeReviewFollowUpPresenter = new PreviousCodeReviewFollowUpPresenter(
    codeReviewFailureContextRepository,
  );
  const codeReviewReportWriter = new CodeReviewReportWriter();
  const implementationRunSummaryProjector = new ImplementationRunSummaryProjector({
    findLatestReviewReport: (featureFolderPath, phaseNumber) =>
      codeReviewFailureContextRepository.findLatest(featureFolderPath, phaseNumber),
    summarizeOutput: summarizeWorkflowOutput,
  });
  const focusedGitCommitAdapter = new FocusedGitCommitAdapter();
  const phaseStatusDocumentRepository = new PhaseStatusDocumentRepository({ sessionDirectory: dependencies.sessionDir });
  const phaseCompletionEvidenceReader = new PhaseCompletionEvidenceReader();
  const workflowMachineStateRepository = new WorkflowMachineStateRepository();
  const featureStateFolderTransition = new FeatureStateFolderTransition();
  const workItemIdAllocator = new WorkItemIdAllocator();
  const submittedFeatureDocumentWriter = new SubmittedFeatureDocumentWriter();
  const workflowFailureBriefPresenter = new WorkflowFailureBriefPresenter({
    findCodeReviewContext: (rawError) => codeReviewFailureContextRepository.extract(rawError),
    summarizeWorkflowOutput,
  });
  const previousWorkflowFailureBriefResolver = new PreviousWorkflowFailureBriefResolver({
    isSupersededByApproval: (value) => codeReviewFailureContextRepository.isSupersededByApproval(value),
    presenter: workflowFailureBriefPresenter,
  });
  const safeGitReader = new SafeGitReader();
  const cardMetadataStore = await dependencies.createMetadataStore({
    create: createCardMetadataStore,
    env: dependencies.environment,
    log: dependencies.log,
  });
  const liveActivitySseService = new LiveActivitySseService({
    queryPhaseLifecycleEventsAfterCursor: (projectId, cursorId) =>
      cardMetadataStore.queryPhaseLifecycleEventsAfterCursor(projectId, cursorId),
  });
  const memoryBankEventSseService = new MemoryBankEventSseService({
    broadcastFileChange: (projectId, event) => liveActivitySseService.broadcast(projectId, event),
    environment: dependencies.environment,
  });
  const projectChangeNotifier = new ProjectChangeNotifier({
    notifyLive: (projectId, eventType, externalId) => liveActivitySseService.notify(projectId, eventType, externalId),
    notifyMemoryBank: (projectId, eventType, externalId) =>
      memoryBankEventSseService.notify(projectId, eventType, externalId),
  });

  return {
    cardMetadataStore,
    codeReviewFailureContextRepository,
    codeReviewReportWriter,
    defaultProjectStorePath: resolve(dependencies.localStateDir, "projects.json"),
    featureStateFolderTransition,
    focusedGitCommitAdapter,
    implementationRunSummaryProjector,
    liveActivitySseService,
    memoryBankEventSseService,
    notifyProjectChanged: projectChangeNotifier.notify.bind(projectChangeNotifier),
    phaseCompletionEvidenceReader,
    phaseStatusDocumentRepository,
    phaseWorkerSessionEvidenceReader,
    previousCodeReviewFollowUpPresenter,
    previousWorkflowFailureBriefResolver,
    safeGitReader,
    submittedFeatureDocumentWriter,
    workflowFailureBriefPresenter,
    workflowMachineStateRepository,
    workItemIdAllocator,
  };
}
