import type { IncomingMessage, ServerResponse } from "node:http";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  hashText,
  compareContextEntries,
  hashContextFiles,
  tryDecodeContextSnapshot,
  type ContextStalenessFailure,
} from "./workflow-receipt.js";
export type { StoredProject } from "./projects/stored-project.js";
import { normalizeRelativeProjectPath } from "./application/projects/relative-project-path-policy.js";
import { toProjectSummary } from "./projects/project-summary.js";
import { initializeProjectMemoryBank } from "./projects/project-memory-bank-initializer.js";
import { handleProjectInitializationRoute } from "./transport/http/routes/project-initialization-route.js";
import { toWorkItemListResponse } from "./projects/work-item-list-response.js";
import { handleProjectWorkItemCollectionRoute } from "./transport/http/routes/project-work-item-collection-route.js";
import { handleProjectWorkItemDocumentRoute } from "./transport/http/routes/project-work-item-document-route.js";
import { readLatestTestCoverageSummary } from "./test-coverage-receipt.js";
import { handleDesignArtifactRoutes } from "./transport/http/routes/design-artifact-routes.js";
import { handleProjectMemoryBankEventsRoute } from "./transport/http/routes/project-memory-bank-events-route.js";
import { handleProjectLiveActivityRoute } from "./transport/http/routes/project-live-activity-route.js";
import { handleRuntimeEvidenceRoutes } from "./transport/http/routes/runtime-evidence-routes.js";
import { createRuntimeEvidenceApplications } from "./bootstrap/runtime-evidence-applications.js";
import { createDeliveryApplications } from "./bootstrap/delivery-applications.js";
import { handleProjectCollectionRoute } from "./transport/http/routes/project-collection-route.js";
import { handleMissingFeatureBatchRoutes } from "./transport/http/routes/missing-feature-batch-routes.js";
import { handleWorkItemSubmissionRoutes } from "./transport/http/routes/work-item-submission-routes.js";
import { handleFeatureEpicLinkRoute } from "./transport/http/routes/feature-epic-link-route.js";
import { handleEpicRefinementRoute } from "./transport/http/routes/epic-refinement-route.js";
import { handleFeatureWorkflowActionRoutes } from "./transport/http/routes/feature-workflow-action-routes.js";
import { handleFeatureReviewRoutes } from "./transport/http/routes/feature-review-routes.js";
import { handleManualTestVerificationRoutes } from "./transport/http/routes/manual-test-verification-routes.js";
import { handleWorkflowConsoleRoutes } from "./transport/http/routes/workflow-console-routes.js";
import { FeatureWorkflowRunCoordinator } from "./application/features/feature-workflow-run-coordinator.js";
import { ProjectLessonsLearnedContextReader } from "./application/context/project-lessons-learned-context-reader.js";
import { FeatureWorkflowContextCollector } from "./application/context/feature-workflow-context-collector.js";
import { handleDeepDiveSessionRoutes } from "./transport/http/routes/deep-dive-session-routes.js";
import { handleDeliveryRoutes } from "./transport/http/routes/delivery-routes.js";
import { handleAgentTaskRoutes } from "./transport/http/routes/agent-task-routes.js";
import { handleApprovalRoutes } from "./transport/http/routes/approval-routes.js";
import { handleTimelineRoutes } from "./transport/http/routes/timeline-routes.js";
import { handleRunAnalyticsRoute } from "./transport/http/routes/run-analytics-route.js";
import { handleReceiptRoutes } from "./transport/http/routes/receipt-routes.js";
import { handleProviderConnectionRoutes } from "./transport/http/routes/provider-connection-routes.js";
import { handleModelCatalogRoutes } from "./transport/http/routes/model-catalog-routes.js";
import { handleAgentRoutingRoutes } from "./transport/http/routes/agent-routing-routes.js";
import { handleOrchestratorHealthRoute } from "./transport/http/routes/orchestrator-health-route.js";
import {
  listApprovals,
  resolveApproval,
} from "./application/approvals/approval-application.js";
import {
  readCompletedTimeline,
  readPhaseTimeline,
} from "./application/timeline/timeline-application.js";
import { readRunAnalytics } from "./application/analytics/run-analytics-application.js";
import {
  readReceiptDetail,
  searchReceiptEvidence,
} from "./application/receipts/receipt-application.js";
import { buildOrchestratorHealth } from "./application/health/orchestrator-health-application.js";
import { summarizeWorkflowOutput } from "./workflows/workflow-output-summary.js";
import { extractPhaseTaskLedger, renderPhaseTaskLedgerContext } from "./workflows/phases/phase-task-ledger.js";
import {
  cargoTimeoutSafetyRule,
  cargoValidationLadderRule,
  epicAcceptanceTestsFileName,
  lessonsLearnedExecutionConstraintsRule,
  serializedBuildCommandsSkillRule,
  validationEvidenceAccountingRule,
  windowsShellHygieneRule,
} from "./workflows/phases/phase-worker-prompt-policies.js";
import {
  getNextUnresolvedPhaseContractTask,
  isPhaseContractReadyForIndependentReview,
} from "./workflows/phases/phase-contract-task-projection.js";
export { resolveArchitectureDebtPrerequisiteStates } from "./application/features/refined-feature-readiness-application.js";
import { EpicCompletionApplication } from "./application/epics/epic-completion-application.js";
import {
  formatPiSpawnError,
  getPiInvocation,
  renderPiInvocation,
  resolvePiInvocation,
  type PiInvocation,
} from "./runtime/pi/pi-invocation-resolver.js";
import {
  extractTextDelta,
  parsePiJsonLine,
} from "./runtime/pi/pi-event-parser.js";
import {
  createWorkflowStreamLogState,
  renderPiEventForWorkflowStreamLog,
  renderToolArgumentsForConsole,
} from "./runtime/pi/pi-console-renderer.js";
import {
  createRuntimeMetadataStore,
  prepareRegisteredProjects,
  startOrchestratorHost,
} from "./bootstrap/orchestrator-host-lifecycle.js";
import { createOrchestratorRuntimeSettings } from "./bootstrap/orchestrator-runtime-settings.js";
import { createProviderRoutingServices } from "./bootstrap/provider-routing-services.js";
import { createPhaseFoundationApplications } from "./bootstrap/phase-foundation-applications.js";
import { createPhaseEntryApplications } from "./bootstrap/phase-entry-applications.js";
import { createPhaseReviewApplications } from "./bootstrap/phase-review-applications.js";
import { createPhaseWorkerApplications } from "./bootstrap/phase-worker-applications.js";
import { createPhaseBoundaryApplications } from "./bootstrap/phase-boundary-applications.js";
import { createHumanReviewPhaseApplication } from "./bootstrap/human-review-phase-application.js";
import { createAgentRuntimeApplications } from "./bootstrap/agent-runtime-applications.js";
import { RuntimeKnowledgeWorkerLifecycleApplication } from "./workflows/knowledge/runtime-knowledge-worker-lifecycle-application.js";
import {
  isCatalogedPiInstallationDefault,
  readPiInstallationDefault,
} from "./runtime/pi/pi-installation-default.js";
import { createWorkItemAuthoringApplications } from "./bootstrap/work-item-authoring-applications.js";
import { createDeepDiveApplications } from "./bootstrap/deep-dive-applications.js";
import { createFeatureCompletionApplications } from "./bootstrap/feature-completion-applications.js";
import { createFeaturePreparationApplications } from "./bootstrap/feature-preparation-applications.js";
import { createImplementationWorkerApplications } from "./bootstrap/implementation-worker-applications.js";
import { createImplementationCommandApplications } from "./bootstrap/implementation-command-applications.js";
import { createImplementationRecoveryApplications } from "./bootstrap/implementation-recovery-applications.js";
import { createImplementationRunApplications } from "./bootstrap/implementation-run-applications.js";
import { createProjectWorkItemApplications } from "./bootstrap/project-work-item-applications.js";
import { createWorkflowInfrastructureApplications } from "./bootstrap/workflow-infrastructure-applications.js";
import { createFeatureProjectionApplications } from "./bootstrap/feature-projection-applications.js";
import { createFeatureRecipeSourceApplications } from "./bootstrap/feature-recipe-source-applications.js";
import { isAllowedTransition } from "./workflow-state-machine.js";
import { startRawSessionLogCleanupService } from "./raw-session-log-cleanup.js";
import {
  assertFeatureBranches,
  type ImplementationBranchResult,
} from "./feature-git-branch.js";
import {
  getMissingPhaseQualityGates,
  getObservedPhaseChangedFiles,
  isResolvedPhaseQualitySummary,
} from "./workflows/phases/phase-quality-evidence-policy.js";
import {
  getNumberedPhases,
  isHumanReviewFindingsPhase,
  isImplementationPhaseRecoveryComplete,
  isPhaseAwaitingReview,
} from "./workflows/phases/phase-lifecycle-policy.js";
import {
  requestWorkflowCancellation,
  throwIfWorkflowCancelled,
} from "./workflow-cancellation.js";
import {
  type StoredImplementationTaskRun,
  type StoredCardMetadata,
} from "@hepha/db";
import type {
  CreateProjectInput,
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  FeatureWorkflowConsoleResponse,
  FeatureWorkflowCommand,
  FeatureWorkflowSummary,
  WorkflowPositionSummary,
  WorkItemCard,
  WorkItemScanStatus,
  WorkItemSourceIssue,
  WorkflowConsoleCleanupInput,
  WorkflowConsoleCleanupResponse,
  EpicUpdateSummary,
  LinkFeatureToEpicInput,
  LinkFeatureToEpicResponse,
} from "@hepha/shared";
import { getTerminalWorkItemLifecycle } from "@hepha/shared";
import { countNeedsValidationTags } from "./work-item-validation.js";
import { prepareProjectOnOrchestratorStartup } from "./project-startup.js";
import { extractEpicState, type EpicSyncResult } from "./epic-state.js";
import { extractEpicChildFeatureIds, extractLinkedIds } from "./work-item-links.js";
import {
  createHephaFeatureWorkflowRunner,
} from "./feature-workflow-spec.js";
import { readDesignArtifactDocument, readWorkItemDocument } from "./work-item-document-read.js";
import { renderDesignArtifactPdf } from "./design-artifacts/design-artifact-pdf-renderer.js";
import {
  phaseRequiresCodeReview,
  phaseUsesOrderedTaskExecutors,
  readPhaseContractTaskId,
  toOrderedPhaseTasks,
} from "./phase-execution-contract.js";
import { renderHephaCommandTemplate } from "./hepha-command-template.js";
import {
  formatTransitionSuccessSummary,
  formatBranchWorktreeSummary,
} from "./start-transition-presentation.js";
import { resolvePathInput } from "./path-input.js";
import { ProjectRegistrationError } from "./project-registration.js";
import { setBaseHeaders } from "./transport/http/cors.js";
import { toProjectErrorResponse } from "./transport/http/orchestrator-error-response.js";
import { readJson } from "./transport/http/read-json.js";
import { createHttpRequestListener } from "./transport/http/request-listener.js";
import { sendJson } from "./transport/http/send-json.js";
import {
  extractPhaseNumber,
  extractPhaseTitle,
  isKnownWorkflowStatus,
  isStandalonePhaseStatusLine,
} from "./memorybank/phase-document-parser.js";
import {
  checkRequiredFixes,
  recordRepairAttempt,
} from "./continue-implementation-finding-adapter.js";
import { selectProductionCodeReviewFiles } from "./autonomous-code-review-policy.js";
export { enforceSafetyKernelReviewOutput } from "./workflows/reviews/review-output-enforcement.js";
import {
  readWindowsUserEnvironmentValue,
} from "./runtime/orchestrator-runtime-configuration.js";
import {
  createSqliteGovernanceReadProvider,
  type GovernanceReadProvider,
} from "./governance-read-service.js";
import { handleGovernanceActionRoute, handleGovernanceReadRoute } from "./governance-http-routes.js";
export { ProjectRegistrationError };

const {
  completeFeatureSkillPath,
  continueImplementationSkillPath,
  createPiProcessEnv,
  deepDiveDocumentUpdateTimeoutMs,
  deepDiveModelRewriteMaxChars,
  deepDiveSkillPath,
  designFeatureSkillPath,
  ensurePiCargoShimDirectory,
  fingerprintAbsoluteSafetyCap, featureRecipeSourcePolicy,
  implementationIdleTimeoutMs,
  implementationRunTimeoutMs,
  implementationSkillPaths,
  inferredWorkspaceRoot,
  localStateDir,
  maxFixerResponseRepairAttempts, mcpCompatibility,
  port,
  rawSessionLogCleanupConfig,
  refineFeatureMaxRuntimeMs,
  refineFeatureMaxRuntimeSource,
  refineFeatureStallTimeoutMs,
  refineFeatureSkillPath,
  runTimeoutMs,
  runtimeEnv,
  serializedBuildCommandsSkillPath,
  sessionDir,
  startFeatureSkillPath,
  workspaceRoot,
} = createOrchestratorRuntimeSettings({ cwd: process.cwd() });
if (refineFeatureMaxRuntimeSource === "legacy") {
  console.warn(
    "HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS is deprecated; use HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS for an explicit wall-clock safety cap.",
  );
}
const {
  cardMetadataStore,
  codeReviewFailureContextRepository,
  codeReviewReportWriter,
  defaultProjectStorePath,
  featureStateFolderTransition,
  focusedGitCommitAdapter,
  implementationRunSummaryProjector,
  liveActivitySseService,
  memoryBankEventSseService,
  notifyProjectChanged,
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
} = await createWorkflowInfrastructureApplications({
  createMetadataStore: createRuntimeMetadataStore,
  environment: runtimeEnv,
  localStateDir,
  log: (message) => console.log(message),
  sessionDir,
  workspaceRoot,
});
const {
  designArtifactPolicy,
  featureWorkflowProgressProjector,
  featureWorkflowSummaryProjector,
  refinementArtifactPolicy,
  startFeatureTimingPolicy,
} = createFeatureProjectionApplications({
  getDefaultImplementationModel: () => routeResolver.getStartImplementationDefaultForDisplay(),
  implementationRunSummary: implementationRunSummaryProjector, metadataStoreEnabled: cardMetadataStore.enabled,
  recipeSourceFor: (operation) => featureRecipeSourcePolicy.sourceFor(operation),
  workspaceRoot: inferredWorkspaceRoot,
});

const {
  agentRoutingStore,
  catalogConnectionStateService,
  catalogScanCoordinator,
  catalogStartupReconciler,
  modelCatalogStore,
  providerCatalogScanApplication,
  providerConnectionService,
  providerConnectionStore,
  routingPolicyHttpService,
  secretVault,
} = createProviderRoutingServices({ localStateDir, runtimeEnv });
await catalogStartupReconciler.reconcileAtStartup();
const discoveredPiInstallationDefault = readPiInstallationDefault(runtimeEnv, providerConnectionStore);
const routingInstallationDefault = discoveredPiInstallationDefault
  && isCatalogedPiInstallationDefault(discoveredPiInstallationDefault, modelCatalogStore)
  ? discoveredPiInstallationDefault
  : null;

const {
  epicStateSynchronizationApplication,
  featureEpicLinkApplication,
  featureWorkflowTargets,
  manualTestArtifactResponseSender,
  manualTestVerificationApplication,
  projectRegistry,
  stateFolderLabels,
  workItemQueries,
} = createProjectWorkItemApplications({
  completeFeature: (project, feature) => completeFeatureExecutionApplication.start(project, feature),
  defaultProjectStorePath,
  featureWorkflowSummary: featureWorkflowSummaryProjector,
  metadataStore: cardMetadataStore,
  notifyChanged: notifyProjectChanged,
  workspaceRoot,
});
const featureWorkflowRunCoordinator = new FeatureWorkflowRunCoordinator({
  assertRunActive: throwIfWorkflowCancelled,
  createRunner: createHephaFeatureWorkflowRunner,
  metadataStore: cardMetadataStore,
  notifyProjectChanged,
  workspaceRoot: inferredWorkspaceRoot,
});
const {
  featurePlanningArtifactPolicy,
  phaseCheckpointProjectionRepository,
  phaseCodeClassificationPolicy,
  phaseCompletionAuthorizationApplication,
  phaseExecutionContractApplication,
  phaseExecutionOrderPolicy,
  phaseGateEvidenceApplication,
  phaseGateRecoveryApplication,
  phasePostWorkerValidationApplication,
  phaseSameRunRepairApplication,
  phaseTaskCursorResolver,
  phaseTaskExecutionApplication,
  phaseWorkerTaskSettlementApplication,
  recordImplementationPhaseProgress,
} = createPhaseFoundationApplications({
  assertRunActive: throwIfWorkflowCancelled,
  metadataStore: cardMetadataStore,
  runCoordinator: featureWorkflowRunCoordinator,
  sessionEvidence: phaseWorkerSessionEvidenceReader,
  statusDocuments: phaseStatusDocumentRepository,
  targets: featureWorkflowTargets,
});
const {
  autonomousPhaseQueueApplication,
  declaredVerificationTaskApplication,
  implementationCompletionApplication,
  phaseExitLifecycleApplication,
  phaseFailureRecordingApplication,
  phaseTemplateDispatchApplication,
} = createPhaseBoundaryApplications({
  completionEvidence: phaseCompletionEvidenceReader,
  foundation: {
    featurePlanningArtifactPolicy,
    phaseCheckpointProjectionRepository,
    phaseCompletionAuthorizationApplication,
    phaseExecutionContractApplication,
    phaseTaskExecutionApplication,
    recordImplementationPhaseProgress,
  },
  metadataStore: cardMetadataStore,
  runCoordinator: featureWorkflowRunCoordinator,
  runWorker: (input) => implementationWorkerApplication.execute(input),
  statusDocuments: phaseStatusDocumentRepository,
  targets: featureWorkflowTargets,
});
const {
  phaseEntryPreparationApplication,
  phaseReviewHandoffApplication,
  phaseStateReconciliationApplication,
  phaseWorkerContinuationApplication,
  phaseWorkerEntryApplication,
  protectedPhaseWorkerApplication,
} = createPhaseEntryApplications({
  absoluteSafetyCap: fingerprintAbsoluteSafetyCap,
  completionEvidence: phaseCompletionEvidenceReader,
  failureContexts: codeReviewFailureContextRepository,
  foundation: {
    featurePlanningArtifactPolicy,
    phaseExecutionContractApplication,
    phaseExecutionOrderPolicy,
    phaseTaskExecutionApplication,
    recordImplementationPhaseProgress,
  },
  metadataStore: cardMetadataStore,
  prepareTemplate: (input) => phaseTemplateDispatchApplication.prepare(input),
  runCoordinator: featureWorkflowRunCoordinator,
  runDeclaredVerification: (input) => declaredVerificationTaskApplication.execute(input),
  statusDocuments: phaseStatusDocumentRepository,
  targets: featureWorkflowTargets,
  workflowMachineState: workflowMachineStateRepository,
});
const {
  phaseExecutionPlanningApplication,
  phaseReviewDispatchApplication,
  phaseReviewGateHandoffApplication,
  phaseReviewStateApplication,
} = createPhaseReviewApplications({
  buildReviewContext: async ({ feature, phase, previousFailureBrief, project }) => featureWorkflowContextCollector.collect(
    project,
    feature,
    await workItemQueries.scan(project),
    {
      contextMode: "code-review",
      includeUiLanguageDocuments: false,
      lessonContext: { agentRole: "code-review", phase },
    },
    previousFailureBrief,
  ),
  failureContexts: codeReviewFailureContextRepository,
  focusedGit: focusedGitCommitAdapter,
  foundation: {
    phaseCodeClassificationPolicy,
    phaseExecutionContractApplication,
    phaseTaskExecutionApplication,
    recordImplementationPhaseProgress,
  },
  metadataStore: cardMetadataStore,
  phaseEntry: { phaseStateReconciliationApplication },
  previousReviewPresenter: previousCodeReviewFollowUpPresenter,
  reportWriter: codeReviewReportWriter,
  runWorker: (input) => implementationWorkerApplication.execute(input),
  runNestedWorker: (_actionId, input) => runCodeReview(input),
  statusDocuments: phaseStatusDocumentRepository,
  targets: featureWorkflowTargets,
});
const {
  phasePostWorkerReviewApplication,
  phasePreReviewRoutingApplication,
  phaseWorkerExecutionApplication,
  phaseWorkerResultApplication,
} = createPhaseWorkerApplications({
  buildContext: async ({ agentRole, feature, phase, previousFailureBrief, project }) => featureWorkflowContextCollector.collect(
    project,
    feature,
    await workItemQueries.scan(project),
    { includeUiLanguageDocuments: false, lessonContext: { agentRole, phase } },
    previousFailureBrief,
  ),
  completionEvidence: phaseCompletionEvidenceReader,
  failureContexts: codeReviewFailureContextRepository,
  formatModelLabel: (model) => routeResolver.formatLabel(model),
  foundation: {
    phaseGateEvidenceApplication,
    phaseSameRunRepairApplication,
    recordImplementationPhaseProgress,
  },
  maximumRepairAttempts: maxFixerResponseRepairAttempts,
  phaseEntry: { phaseWorkerContinuationApplication, protectedPhaseWorkerApplication },
  phaseReview: { phaseReviewGateHandoffApplication },
  runWorker: (input) => implementationWorkerApplication.execute(input),
  runtimeDatabasePath: runtimeEnv.HEPHA_DATABASE_PATH,
  statusDocuments: phaseStatusDocumentRepository,
  targets: featureWorkflowTargets,
});
const humanReviewFindingsPhaseApplication = createHumanReviewPhaseApplication({
  buildContext: (project, feature, items, phase, previousFailureBrief) => featureWorkflowContextCollector.collect(
    project, feature, items, { includeUiLanguageDocuments: false, lessonContext: { agentRole: "human-review-findings", phase } }, previousFailureBrief,
  ),
  completionEvidence: phaseCompletionEvidenceReader,
  runCoordinator: featureWorkflowRunCoordinator,
  runWorker: (input) => implementationWorkerApplication.execute(input),
  scanProject: (project) => workItemQueries.scan(project),
  targets: featureWorkflowTargets,
});

const {
  agentTaskRuntime,
  createDetachedCompletionWorkerApplication,
  directHostRuntimeEvidenceStore,
  implementationWorkerApplication,
  nestedWorkerActionApplications,
  runOneShotPiPrompt,
  runtimeEvidenceContext,
  runtimeInvocationStore,
  startTransitionStateRecorder,
  workflowConsoleApplication,
  workflowConsoleSummaryPresenter,
  routeResolver,
  workflowPiProcessRegistry,
} = createAgentRuntimeApplications({
  metadataStore: cardMetadataStore,
  routingCatalogStore: modelCatalogStore,
  routingConnectionStore: providerConnectionStore,
  routingInstallationDefault,
  routingStore: agentRoutingStore,
  routingVault: secretVault,
  settings: {
    createPiProcessEnv,
    implementationIdleTimeoutMs,
    implementationRunTimeoutMs,
    implementationSkillPaths,
    inferredWorkspaceRoot, mcpCompatibility,
    runTimeoutMs,
    runtimeEnv,
    sessionDir,
    workspaceRoot,
  },
});
const {
  runCodeReview,
  runFeatureLessonsWriter,
  runPhaseLessonsCapture,
  runPostCompleteLessonsCurator,
} = nestedWorkerActionApplications;
const runtimeKnowledgeWorkerLifecycleApplication = new RuntimeKnowledgeWorkerLifecycleApplication({
  runFeatureLessonsWriter,
  runPhaseLessonsCapture,
  runPostCompleteLessonsCurator,
});
const detachedCompletionWorkerApplication = createDetachedCompletionWorkerApplication(
  runtimeKnowledgeWorkerLifecycleApplication.curateDetachedCompletion.bind(runtimeKnowledgeWorkerLifecycleApplication),
);
const projectLessonsLearnedContextReader = new ProjectLessonsLearnedContextReader();
const featureWorkflowContextCollector = new FeatureWorkflowContextCollector({
  acceptanceTestsFileName: epicAcceptanceTestsFileName,
  createPreviousFailureBrief: (feature) => previousWorkflowFailureBriefResolver.resolve(feature),
  getNumberedPhases,
  getPlanningArtifactPath: (feature) => featurePlanningArtifactPolicy.getPath(feature),
  readCurrentBranch: (rootPath) => safeGitReader.read(rootPath, ["branch", "--show-current"]),
  renderLessons: (project, options) => projectLessonsLearnedContextReader.render(project, options),
  renderPhaseTaskLedger: renderPhaseTaskLedgerContext,
  selectCodeReviewFiles: (project, feature, phaseNumber) => selectProductionCodeReviewFiles(
    getObservedPhaseChangedFiles(project, feature, phaseNumber),
  ),
});

const {
  epicRefinementApplication,
  epicSubmissionApplication,
  featureSubmissionApplication,
  missingFeatureBatchApplication,
} = createWorkItemAuthoringApplications({
  documentWriter: submittedFeatureDocumentWriter,
  epicState: epicStateSynchronizationApplication,
  idAllocator: workItemIdAllocator,
  routeResolver,
  notifyChanged: notifyProjectChanged,
  registry: projectRegistry,
  runPrompt: runOneShotPiPrompt,
  workItems: workItemQueries,
});
const {
  deepDiveCompletionApplication,
  deepDiveContinuationRecoveryApplication,
  deepDiveSessionApplication,
  deepDiveStartApplication,
} = createDeepDiveApplications({
  epicState: epicStateSynchronizationApplication,
  lessons: projectLessonsLearnedContextReader,
  metadataStore: cardMetadataStore,
  routeResolver,
  notifyChanged: notifyProjectChanged,
  registry: projectRegistry,
  runCoordinator: featureWorkflowRunCoordinator,
  runPrompt: runOneShotPiPrompt,
  settings: {
    deepDiveDocumentUpdateTimeoutMs,
    deepDiveModelRewriteMaxChars,
    runTimeoutMs,
    sessionDir,
  },
  workItems: workItemQueries,
});
const {
  completeFeatureExecutionApplication,
  featureCompletionApplication,
  featureHumanReviewApplication,
  featureWorkflowCancellation,
  workflowTransitionReceiptPolicy,
} = createFeatureCompletionApplications({
  cancelPiProcesses: (runId) => workflowPiProcessRegistry.cancel(runId),
  contextCollector: featureWorkflowContextCollector,
  epicState: epicStateSynchronizationApplication,
  failureBriefPresenter: workflowFailureBriefPresenter,
  finalizer: detachedCompletionWorkerApplication,
  metadataStore: cardMetadataStore,
  routeResolver,
  notifyChanged: notifyProjectChanged,
  requestCancellation: requestWorkflowCancellation,
  runCoordinator: featureWorkflowRunCoordinator,
  targets: featureWorkflowTargets,
  workItems: workItemQueries,
});
const {
  featureFindingApplication,
  featurePreparationApplication,
  refinedFeatureReadinessApplication,
} = createFeaturePreparationApplications({
  completeFeature: (project, feature) => completeFeatureExecutionApplication.start(project, feature),
  contextCollector: featureWorkflowContextCollector,
  designArtifactPolicy,
  failureBriefPresenter: workflowFailureBriefPresenter,
  metadataStore: cardMetadataStore,
  routeResolver,
  notifyChanged: notifyProjectChanged,
  phaseContract: phaseExecutionContractApplication,
  refineFeatureMaxRuntimeMs,
  refineFeatureStallTimeoutMs,
  runCoordinator: featureWorkflowRunCoordinator,
  runOneShotPiPrompt,
  stewardId: runtimeEnv.HEPHA_ARCHITECTURE_STEWARD_ID,
  targets: featureWorkflowTargets,
  transitionReceiptPolicy: workflowTransitionReceiptPolicy,
  workItems: workItemQueries,
  worker: implementationWorkerApplication,
});
const {
  continueImplementationApplication,
  startImplementationApplication,
} = createImplementationCommandApplications({
  continueExecution: (input) => continueImplementationRunApplication.execute(input),
  deepDiveRecovery: deepDiveContinuationRecoveryApplication,
  metadataStore: cardMetadataStore,
  notifyChanged: notifyProjectChanged,
  phaseContract: phaseExecutionContractApplication,
  previousFailureResolver: previousWorkflowFailureBriefResolver,
  receiptPolicy: workflowTransitionReceiptPolicy,
  safeGitReader,
  startExecution: (input) => startImplementationRunApplication.execute(input),
  targets: featureWorkflowTargets,
  workItems: workItemQueries,
});
const {
  autonomousImplementationWorkflowApplication,
  interactiveImplementationHandoffApplication,
  startFeaturePostProcessApplication,
} = createImplementationWorkerApplications({
  contextCollector: featureWorkflowContextCollector,
  featureLevelWorker: implementationWorkerApplication,
  knowledge: runtimeKnowledgeWorkerLifecycleApplication,
  routeResolver,
  notifyChanged: notifyProjectChanged,
  phaseWorkflow: {
    complete: implementationCompletionApplication,
    entry: phaseEntryPreparationApplication,
    exit: phaseExitLifecycleApplication,
    failure: phaseFailureRecordingApplication,
    humanReview: humanReviewFindingsPhaseApplication,
    planning: phaseExecutionPlanningApplication,
    planningArtifactRequired: (feature, phase) => featurePlanningArtifactPolicy.isPlanningPhase(feature, phase),
    postWorkerReview: phasePostWorkerReviewApplication,
    postWorkerValidation: phasePostWorkerValidationApplication,
    preReview: phasePreReviewRoutingApplication,
    queue: autonomousPhaseQueueApplication,
    review: phaseReviewDispatchApplication,
    settleTask: phaseWorkerTaskSettlementApplication,
    workerEntry: phaseWorkerEntryApplication,
    workerExecution: phaseWorkerExecutionApplication,
    workerResult: phaseWorkerResultApplication,
  },
  runCoordinator: featureWorkflowRunCoordinator,
  runtimeDatabasePath: runtimeEnv.HEPHA_DATABASE_PATH,
  targets: featureWorkflowTargets,
  timingPolicy: startFeatureTimingPolicy,
  worker: implementationWorkerApplication,
  workItems: workItemQueries,
});
const { implementationAutoRecoveryApplication } = createImplementationRecoveryApplications({
  codeReviewFailureContext: codeReviewFailureContextRepository,
  consoleSummary: workflowConsoleSummaryPresenter,
  createPiEnvironment: createPiProcessEnv,
  ensureCargoShimDirectory: ensurePiCargoShimDirectory,
  failureBriefPresenter: workflowFailureBriefPresenter,
  lessons: projectLessonsLearnedContextReader,
  machineState: workflowMachineStateRepository,
  routeResolver,
  recordPhaseProgress: recordImplementationPhaseProgress,
  runAutonomous: (input) => autonomousImplementationWorkflowApplication.execute(input),
  runCoordinator: featureWorkflowRunCoordinator,
  targets: featureWorkflowTargets,
  worker: implementationWorkerApplication,
});
const {
  continueImplementationRunApplication,
  startImplementationRunApplication,
} = createImplementationRunApplications({
  autoRecovery: implementationAutoRecoveryApplication,
  autonomousWorkflow: autonomousImplementationWorkflowApplication,
  epicState: epicStateSynchronizationApplication,
  failureBriefPresenter: workflowFailureBriefPresenter,
  featureState: featureStateFolderTransition,
  inProgressStateLabel: stateFolderLabels["03_IN_PROGRESS"],
  interactiveHandoff: interactiveImplementationHandoffApplication,
  metadataStore: cardMetadataStore,
  routeResolver,
  notifyChanged: notifyProjectChanged,
  phaseGateRecovery: phaseGateRecoveryApplication,
  phaseReviewHandoff: phaseReviewHandoffApplication,
  phaseStateReconciliation: phaseStateReconciliationApplication,
  phaseTaskCursor: phaseTaskCursorResolver,
  runCoordinator: featureWorkflowRunCoordinator,
  startFeaturePostProcess: startFeaturePostProcessApplication,
  startTransitionState: startTransitionStateRecorder,
  targets: featureWorkflowTargets,
  workItems: workItemQueries,
});
const featureRecipeActionRoutes = createFeatureRecipeSourceApplications({
  metadataStore: cardMetadataStore, notifyChanged: notifyProjectChanged, policy: featureRecipeSourcePolicy,
  routeResolver, targets: featureWorkflowTargets, workItems: workItemQueries, worker: implementationWorkerApplication,
  native: {
    completeFeature: (input) => featureCompletionApplication.start(input), continueImplementing: (input) => continueImplementationApplication.continue(input),
    designFeature: (input) => featurePreparationApplication.startDesign(input), refineFeature: (input) => featurePreparationApplication.startRefine(input), startImplementing: (input) => startImplementationApplication.start(input),
  },
});
const epicCompletionApplication = new EpicCompletionApplication({
  findProject: (projectId) => projectRegistry.get(projectId),
  normalizePath: normalizeRelativeProjectPath,
  notifyChanged: notifyProjectChanged,
  scanProject: (project) => workItemQueries.scan(project),
  syncState: (epic, items) => epicStateSynchronizationApplication.syncEpic(epic, items),
  toProjectSummary,
});
const runtimeEvidenceApplications = createRuntimeEvidenceApplications({
  context: runtimeEvidenceContext,
  directHostStore: directHostRuntimeEvidenceStore,
  orchestratedStore: runtimeInvocationStore,
  projects: projectRegistry,
  workItems: workItemQueries,
});
const deliveryApplications = createDeliveryApplications({ metadataStore: cardMetadataStore, notifyProjectChanged, projects: projectRegistry });
export function createOrchestratorRequestListener(
  reportError: (error: unknown) => void = (error) => console.error(error),
) {
  return createHttpRequestListener({
    dispatch: handleRequest,
    mapError: toProjectErrorResponse,
    reportError,
  });
}

if (!process.env.VITEST) {
  startOrchestratorHost({
    cleanupConfig: rawSessionLogCleanupConfig,
    listener: createOrchestratorRequestListener(),
    log: (message) => console.log(message),
    port,
    prepareProjects: () => prepareRegisteredProjects({
      options: { env: runtimeEnv, readUserEnvironmentValue: readWindowsUserEnvironmentValue },
      prepare: prepareProjectOnOrchestratorStartup,
      projects: projectRegistry.list(),
      report: (project, error) => console.error(
        `[startup:${project.name}] Project startup preparation failed:`,
        error instanceof Error ? error.message : error,
      ),
    }),
    reportCleanup: (summary) => console.log(
      `Hepha raw session cleanup: deleted ${summary.filesDeleted} files and freed ${summary.bytesFreed} bytes.`,
    ),
    sessionDir,
    startCleanup: startRawSessionLogCleanupService,
    workspaceRoot,
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  setBaseHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  const governanceProvider: GovernanceReadProvider = cardMetadataStore.databasePath
    ? createSqliteGovernanceReadProvider(cardMetadataStore.databasePath)
    : { load: () => ({ kind: "store_unavailable" }) };
  if (await handleGovernanceReadRoute(request, response, {
    findProject: (projectId) => projectRegistry.get(projectId),
    provider: governanceProvider,
    databasePath: cardMetadataStore.databasePath ?? null,
  })) return;
  if (await handleGovernanceActionRoute(request, response, {
    findProject: (projectId) => projectRegistry.get(projectId),
    provider: governanceProvider,
    databasePath: cardMetadataStore.databasePath ?? null,
  })) return;

  if (await handleOrchestratorHealthRoute(request, response, url, {
    read: () => buildOrchestratorHealth({
      authFileExists: existsSync,
      createPiEnvironment: createPiProcessEnv,
      metadataDatabasePath: cardMetadataStore.databasePath,
      metadataStore: cardMetadataStore.backend,
      port,
      renderPiInvocation: (invocation) => renderPiInvocation(invocation as PiInvocation),
      resolveAuthFile: () => resolvePathInput("~/.pi/agent/auth.json"),
      resolvePi: resolvePiInvocation,
      sessionDir,
      workspaceRoot,
    }),
  })) return;

  if (await handleProjectCollectionRoute(request, response, url, {
    createProject,
    listProjects: () => projectRegistry.list(),
    summarizeProject: toProjectSummary,
  })) return;

  if (await handleProjectInitializationRoute(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    initializeProject: initializeProjectMemoryBank,
    summarizeProject: toProjectSummary,
  })) return;

  if (await handleProjectWorkItemCollectionRoute(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    projectResponse: toWorkItemListResponse,
    scanProject: (project) => workItemQueries.scanWithIssues(project),
  })) return;

  if (await handleProjectWorkItemDocumentRoute(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    readDocument: readWorkItemDocument,
    readTestCoverage: (projectId, cardKey) => readLatestTestCoverageSummary(cardMetadataStore, projectId, cardKey),
  })) return;

  if (await handleRuntimeEvidenceRoutes(request, response, url, runtimeEvidenceApplications)) return;

  if (await handleDesignArtifactRoutes(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    readArtifact: readDesignArtifactDocument,
    renderPdf: renderDesignArtifactPdf,
  })) return;

  if (await handleProjectMemoryBankEventsRoute(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    streamEvents: (project, request, response) => memoryBankEventSseService.stream(project, request, response),
  })) return;

  if (await handleProjectLiveActivityRoute(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    streamActivity: (project, request, response) => liveActivitySseService.stream(project, request, response),
  })) return;

  if (await handleMissingFeatureBatchRoutes(request, response, url, {
    create: (input) => missingFeatureBatchApplication.create(input),
    preview: (input) => missingFeatureBatchApplication.preview(input),
  })) return;

  if (await handleWorkItemSubmissionRoutes(request, response, url, {
    submitEpic: (input) => epicSubmissionApplication.submit(input),
    submitFeature: (input) => featureSubmissionApplication.submit(input),
  })) return;

  if (await handleFeatureEpicLinkRoute(request, response, url, {
    findProject: (projectId) => projectRegistry.get(projectId),
    linkFeatureToEpic: (project, cardId, input) => featureEpicLinkApplication.execute(project, cardId, input),
  })) return;

  if (await handleEpicRefinementRoute(request, response, url, {
    submitRefinement: (input) => epicRefinementApplication.submit(input),
  })) return;

  if (await handleFeatureWorkflowActionRoutes(request, response, url, {
    cancelFeatureWorkflow: (input) => featureWorkflowCancellation.cancel(input),
    completeEpic: (input) => epicCompletionApplication.complete(input),
    ...featureRecipeActionRoutes,
    evaluateUiRequirement: (input) => featurePreparationApplication.evaluateUi(input),
  })) return;

  if (await handleFeatureReviewRoutes(request, response, url, {
    acceptFindingsPhase: (input) => featureFindingApplication.acceptPhase(input),
    addFindingDetail: (input) => featureFindingApplication.addDetail(input),
    recordHumanReview: (input) => featureHumanReviewApplication.record(input),
    resolveFinding: (input) => featureFindingApplication.resolve(input),
    submitFinding: (input) => featureFindingApplication.submit(input),
  })) return;

  if (await handleManualTestVerificationRoutes(request, response, url, {
    generate: (input) => manualTestVerificationApplication.generate(input),
    recordResult: (input, result) => manualTestVerificationApplication.recordResult(input, result),
    review: (input) => manualTestVerificationApplication.review(input),
    sendArtifact: (response, input) => manualTestArtifactResponseSender.send(response, input),
    status: (input) => manualTestVerificationApplication.status(input),
  })) return;

  if (await handleDeliveryRoutes(request, response, url, deliveryApplications)) return;

  if (await handleWorkflowConsoleRoutes(request, response, url, {
    cleanupConsole: (keepRunId) => workflowConsoleApplication.cleanup(keepRunId),
    readConsole: (runId) => workflowConsoleApplication.read(runId),
  })) return;

  if (await handleDeepDiveSessionRoutes(request, response, url, {
    answer: (sessionId, questionId, input) => deepDiveSessionApplication.answer(sessionId, questionId, input),
    chat: (sessionId, questionId, input) => deepDiveSessionApplication.chat(sessionId, questionId, input),
    complete: (sessionId) => deepDiveCompletionApplication.complete(sessionId),
    get: (sessionId) => deepDiveSessionApplication.get(sessionId),
    start: (input) => deepDiveStartApplication.start(input),
  })) return;

  if (await handleAgentTaskRoutes(request, response, url, {
    cancelTask: (taskId) => agentTaskRuntime.cancel(taskId),
    createTask: (input) => agentTaskRuntime.create(input),
    findTask: (taskId) => agentTaskRuntime.find(taskId),
    listTasks: () => agentTaskRuntime.list(),
    startTask: (taskId) => agentTaskRuntime.start(taskId),
  })) return;

  const approvalDependencies = {
    enabled: cardMetadataStore.enabled,
    finalizeTimedOut: (now: string) => cardMetadataStore.finalizeTimedOutApprovals(now),
    get: (requestId: string) => cardMetadataStore.getApprovalRequest(requestId),
    list: (
      projectId: string,
      status: import("@hepha/db").ApprovalDbStatus | "all",
      limit: number,
    ) => cardMetadataStore.listApprovalRequests(projectId, status, limit),
    now: () => new Date().toISOString(),
    resolve: (
      requestId: string,
      status: "approved" | "denied" | "timed_out",
      resolvedBy: "operator" | "timeout",
      reason: string | null,
    ) => cardMetadataStore.resolveApprovalRequest(requestId, status, resolvedBy, reason),
  };
  if (await handleApprovalRoutes(request, response, url, {
    defaultProjectId: () => projectRegistry.list()[0]?.id ?? "default",
    list: (input) => listApprovals(input, approvalDependencies),
    resolve: (requestId, input) => resolveApproval(requestId, input, approvalDependencies),
  })) return;

  const timelineDependencies = {
    queryEvents: (filters: import("@hepha/shared").EventFilter) =>
      cardMetadataStore.queryNormalizedEvents(filters),
    queryInvocations: (filters: import("@hepha/shared").InvocationFilter) =>
      cardMetadataStore.queryAgentInvocations(filters),
  };
  if (await handleTimelineRoutes(request, response, url, {
    readCompleted: (input) => readCompletedTimeline(input, timelineDependencies),
    readPhase: (input) => readPhaseTimeline(input, timelineDependencies),
  })) return;

  if (await handleRunAnalyticsRoute(request, response, url, {
    read: (input) => readRunAnalytics(input, {
      queryInvocations: (filters) => cardMetadataStore.queryAgentInvocations(filters),
    }),
  })) return;

  const receiptDependencies = {
    queryInvocations: (filters: import("@hepha/shared").InvocationFilter) =>
      cardMetadataStore.queryAgentInvocations(filters),
  };
  if (await handleReceiptRoutes(request, response, url, {
    detail: (input) => readReceiptDetail(input, receiptDependencies),
    search: (input) => searchReceiptEvidence(input, receiptDependencies),
  })) return;

  if (await handleProviderConnectionRoutes(
    request,
    response,
    url,
    {
      service: providerConnectionService,
      mutations: providerCatalogScanApplication,
    },
  )) return;

  if (await handleModelCatalogRoutes(request, response, url, {
    connections: providerConnectionService,
    coordinator: catalogScanCoordinator,
    states: catalogConnectionStateService,
    store: modelCatalogStore,
  })) return;

  if (await handleAgentRoutingRoutes(request, response, url, routingPolicyHttpService)) return;

  sendJson(response, 404, { error: "Route not found" });
}
export function createProject(input: CreateProjectInput) { return projectRegistry.register(input); }
