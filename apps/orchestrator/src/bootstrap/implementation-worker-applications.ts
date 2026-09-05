import { resolve } from "node:path";
import type { FeatureWorkflowContextCollector } from "../application/context/feature-workflow-context-collector.js";
import type { StartFeatureTimingPolicy } from "../application/features/start-feature-timing-policy.js";
import type { FeatureWorkflowRunCoordinator } from "../application/features/feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import type { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import {
  buildSafeEstimationCalibrationContext,
  toHistoricalTimingCandidate,
} from "../estimation-calibration.js";
import { assertFeatureBranches } from "../feature-git-branch.js";
import { detectProjectStack } from "../projects/project-summary.js";
import type { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import { isWorkflowCancelledError, yieldToWorkflowControlPlane } from "../workflow-cancellation.js";
import { AutonomousImplementationWorkflowApplication } from "../workflows/implementation/autonomous-implementation-workflow-application.js";
import { capturePhaseDurableProgressFingerprint } from "../workflows/implementation/phase-durable-progress-fingerprint.js";
import { DirectImplementationSkillApplication } from "../workflows/implementation/direct-implementation-skill-application.js";
import { InteractiveImplementationHandoffApplication } from "../workflows/implementation/interactive-implementation-handoff-application.js";
import { StartFeaturePostProcessApplication } from "../workflows/implementation/start-feature-post-process-application.js";
import type { ImplementationWorkerApplication } from "../workflows/phases/implementation-worker-application.js";
import type { RuntimeKnowledgeWorkerLifecycleApplication } from "../workflows/knowledge/runtime-knowledge-worker-lifecycle-application.js";
import { normalizeImplementationPhaseStatus } from "../workflows/phases/phase-lifecycle-policy.js";
import {
  epicAcceptanceTestsFileName,
  featurePlanningArtifactFileName,
  phaseTaskLedgerRule,
} from "../workflows/phases/phase-worker-prompt-policies.js";
import { selectDeveloperAgentForStack } from "../workflows/phases/developer-agent-selection-policy.js";
import {
  buildContinueImplementingPrompt,
  buildStartImplementingPrompt,
} from "../workflows/prompts/feature-entry-prompts.js";
import { buildStartFeaturePostProcessPrompt } from "../workflows/prompts/start-feature-post-process-prompt.js";

type AutonomousDependencies = ConstructorParameters<typeof AutonomousImplementationWorkflowApplication>[0];
type NotifyChanged = ConstructorParameters<typeof StartFeaturePostProcessApplication>[0]["notifyChanged"];

type PhaseWorkflowApplications = Pick<AutonomousDependencies,
  | "complete"
  | "entry"
  | "exit"
  | "failure"
  | "humanReview"
  | "planning"
  | "planningArtifactRequired"
  | "postWorkerReview"
  | "postWorkerValidation"
  | "preReview"
  | "queue"
  | "review"
  | "settleTask"
  | "workerEntry"
  | "workerExecution"
  | "workerResult"
>;

export interface ImplementationWorkerApplicationsDependencies {
  contextCollector: FeatureWorkflowContextCollector;
  featureLevelWorker: Pick<ImplementationWorkerApplication, "execute">;
  knowledge: Pick<RuntimeKnowledgeWorkerLifecycleApplication, "capturePhase" | "writeFeatureLessons">;
  routeResolver: RoutingActionResolver;
  notifyChanged: NotifyChanged;
  phaseWorkflow: PhaseWorkflowApplications;
  runCoordinator: FeatureWorkflowRunCoordinator;
  runtimeDatabasePath: string | undefined;
  targets: FeatureWorkflowTargetResolver;
  timingPolicy: StartFeatureTimingPolicy;
  worker: ImplementationWorkerApplication;
  workItems: WorkItemQueryApplication;
}

/** Composes implementation prompts, handoff modes, post-processing, and the generic autonomous phase loop. */
export function createImplementationWorkerApplications(dependencies: ImplementationWorkerApplicationsDependencies) {
  const startFeaturePostProcessApplication = new StartFeaturePostProcessApplication({
    assertTimingComplete: (feature) => dependencies.timingPolicy.assertComplete(feature),
    buildContext: (input, feature, workItems) => dependencies.contextCollector.collect(
      input.project,
      feature,
      workItems,
      { includeUiLanguageDocuments: false, lessonContext: { agentRole: "start-feature-postprocess" } },
      input.previousFailureBrief,
    ),
    buildPrompt: (input, feature, context, workItems) => buildStartFeaturePostProcessPrompt(
      input.project,
      feature,
      context,
      {
        branchMessage: input.branchMessage,
        branchName: input.branchName,
        defaultImplementationModelLabel: dependencies.routeResolver.formatLabel(
          dependencies.routeResolver.getStartImplementationDefaultForDisplay(),
        ),
        detectedStack: detectProjectStack(input.project.rootPath),
        epicAcceptanceTestsFileName,
        estimationCalibration: buildSafeEstimationCalibrationContext(
          workItems.filter((item) => item.kind === "feature").map(toHistoricalTimingCandidate),
          feature.externalId,
        ),
        featurePlanningArtifactFileName,
        phaseTaskLedgerRule,
      },
    ),
    notifyChanged: dependencies.notifyChanged,
    scanProject: (input) => dependencies.workItems.scan(input.project),
    targets: dependencies.targets,
    worker: dependencies.worker,
    workflowCoordinator: dependencies.runCoordinator,
  });
  const interactiveImplementationHandoffApplication = new InteractiveImplementationHandoffApplication({
    buildContext: (input, feature, workItems) => dependencies.contextCollector.collect(
      input.project,
      feature,
      workItems,
      { includeUiLanguageDocuments: false, lessonContext: { agentRole: input.command } },
      input.previousFailureBrief,
    ),
    buildPrompt: (input, feature, context) => input.command === "continue-implementing"
      ? buildContinueImplementingPrompt(input.project, feature, context, {
          autonomous: false, branchMessage: input.branchMessage, branchName: input.branchName,
        })
      : buildStartImplementingPrompt(input.project, feature, context, {
          autonomous: false, branchMessage: input.branchMessage, branchName: input.branchName,
        }),
    resolveImplementationModel: (input) => dependencies.routeResolver.resolvePlan(input.agentAction),
    scanProject: (input) => dependencies.workItems.scan(input.project),
    targets: dependencies.targets,
    worker: dependencies.worker,
    workflowCoordinator: dependencies.runCoordinator,
  });
  const directImplementationSkillApplication = new DirectImplementationSkillApplication({
    buildPrompt: (input, feature) => input.command === "start-implementing"
      ? buildStartImplementingPrompt(input.project, feature, "", {
          autonomous: input.autonomous, branchMessage: input.branchMessage, branchName: input.branchName,
        })
      : buildContinueImplementingPrompt(input.project, feature, "", {
          autonomous: input.autonomous, branchMessage: input.branchMessage, branchName: input.branchName,
        }),
    resolveModel: (input) => dependencies.routeResolver.resolvePlan(input.agentAction),
    targets: dependencies.targets,
    worker: dependencies.featureLevelWorker,
  });
  const autonomousImplementationWorkflowApplication = new AutonomousImplementationWorkflowApplication({
    assertBranches: assertFeatureBranches,
    captureDurableProgress: (feature) => capturePhaseDurableProgressFingerprint(feature.folderPath),
    configuredDatabasePath: () => dependencies.runtimeDatabasePath,
    databasePath: (projectRoot) => dependencies.runtimeDatabasePath ?? resolve(projectRoot, ".hepha", "hepha.sqlite"),
    directImplementation: directImplementationSkillApplication,
    findCurrentFeature: (project, externalId, fallback) => dependencies.targets.findCurrentFeature(project, externalId, fallback),
    isCancelled: isWorkflowCancelledError,
    knowledge: dependencies.knowledge,
    routeResolver: dependencies.routeResolver,
    normalizePhaseStatus: normalizeImplementationPhaseStatus,
    selectDeveloperAgent: (projectRoot) => selectDeveloperAgentForStack(detectProjectStack(projectRoot)),
    yieldControl: yieldToWorkflowControlPlane,
    ...dependencies.phaseWorkflow,
  });

  return {
    autonomousImplementationWorkflowApplication,
    interactiveImplementationHandoffApplication,
    startFeaturePostProcessApplication,
  };
}
