import type { CardMetadataStore } from "@hepha/db";
import type { MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";
import { EpicStateSynchronizationApplication } from "../application/epics/epic-state-synchronization-application.js";
import { FeatureEpicLinkApplication } from "../application/features/feature-epic-link-application.js";
import { FeatureWorkflowSummaryProjector } from "../application/features/feature-workflow-summary-projector.js";
import { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import { hydrateWorkItemRelations } from "../application/work-items/work-item-relation-hydrator.js";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import { linkFeatureToEpic } from "../feature-epic-linking-orchestrator.js";
import { ManualTestArtifactResolver } from "../application/manual-tests/manual-test-artifact-resolver.js";
import { ManualTestVerificationApplication } from "../application/manual-tests/manual-test-verification-application.js";
import { scanMemoryBankFoldersWithIssues } from "../memorybank-scanner.js";
import { ProjectRegistry } from "../projects/project-registry.js";
import type { StoredProject } from "../projects/stored-project.js";
import { createManualTestArtifactResponseSender } from "../transport/http/manual-test-artifact-response-sender.js";
import { createValidationSummary } from "../work-item-validation.js";
import { areAllImplementationPhasesResolved } from "../workflows/phases/phase-lifecycle-policy.js";

export interface ProjectWorkItemApplicationsDependencies {
  completeFeature(project: StoredProject, feature: WorkItemCard): Promise<boolean>;
  defaultProjectStorePath: string;
  featureWorkflowSummary: Pick<FeatureWorkflowSummaryProjector, "build">;
  metadataStore: CardMetadataStore;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  workspaceRoot: string;
}

export function createProjectWorkItemApplications(dependencies: ProjectWorkItemApplicationsDependencies) {
  const stateFolderLabels: Record<MemoryBankStateFolder, string> = {
    "00_EPICS": "Epics",
    "01_SUBMITTED": "Submitted",
    "02_READY_TO_DEVELOP": "Ready To Develop",
    "03_IN_PROGRESS": "In Progress",
    "04_COMPLETED": "Completed",
    "05_CANCELLED": "Cancelled",
  };
  const stateFolders = Object.keys(stateFolderLabels) as MemoryBankStateFolder[];
  const workItemQueries = new WorkItemQueryApplication({
    decorate: ({ agentRuns, findingRecords, metadata, metadataStoreAvailable, phaseRuns, scannedItem }) => {
      const validation = createValidationSummary(
        scannedItem.card.kind,
        scannedItem.card.specMarkdown,
        scannedItem.metadata.deepDiveSourceHash ?? scannedItem.metadata.documentHash,
        metadata,
        metadataStoreAvailable,
      );
      return {
        ...scannedItem.card,
        featureWorkflow: dependencies.featureWorkflowSummary.build({
          documentHash: scannedItem.metadata.documentHash,
          featureFindings: findingRecords,
          implementationAgentRuns: agentRuns,
          implementationPhaseRuns: phaseRuns,
          item: scannedItem.card,
          metadata,
          validation,
        }),
        validation,
      };
    },
    hydrateRelations: hydrateWorkItemRelations,
    metadataStore: dependencies.metadataStore,
    scanProject: (project) => scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels),
    stateFolders,
  });
  const epicStateSynchronizationApplication = new EpicStateSynchronizationApplication({
    scanProject: (project) => workItemQueries.scan(project),
  });
  const featureEpicLinkApplication = new FeatureEpicLinkApplication({
    link: linkFeatureToEpic,
    scan: (project) => workItemQueries.scan(project),
    syncEpic: (epic, items) => epicStateSynchronizationApplication.syncEpic(epic, items),
  });
  const projectRegistry = new ProjectRegistry({
    basePath: dependencies.workspaceRoot,
    resolveStorePath: () => process.env.HEPHA_PROJECT_STORE_PATH ?? dependencies.defaultProjectStorePath,
  });
  const featureWorkflowTargets = new FeatureWorkflowTargetResolver({
    findProject: (projectId) => projectRegistry.get(projectId),
    scanProject: (project) => workItemQueries.scan(project),
  });
  const manualTestVerificationApplication = new ManualTestVerificationApplication({
    allPhasesResolved: areAllImplementationPhasesResolved,
    createCardKey: createWorkItemCardKey,
    findProject: (projectId) => projectRegistry.get(projectId),
    maybeStartCompletion: dependencies.completeFeature,
    metadataStore: dependencies.metadataStore,
    notifyChanged: dependencies.notifyChanged,
    scanProject: (project) => workItemQueries.scan(project),
  });
  const manualTestArtifactResolver = new ManualTestArtifactResolver({
    createCardKey: createWorkItemCardKey,
    findProject: (projectId) => projectRegistry.get(projectId),
    metadataStore: dependencies.metadataStore,
    scanProject: (project) => workItemQueries.scan(project),
  });

  return {
    epicStateSynchronizationApplication,
    featureEpicLinkApplication,
    featureWorkflowTargets,
    manualTestArtifactResponseSender: createManualTestArtifactResponseSender(manualTestArtifactResolver),
    manualTestVerificationApplication,
    projectRegistry,
    stateFolderLabels,
    workItemQueries,
  };
}
