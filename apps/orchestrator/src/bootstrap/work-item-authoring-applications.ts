import { randomUUID } from "node:crypto";
import { EpicRefinementApplication } from "../application/epics/epic-refinement-application.js";
import { EpicStateSynchronizationApplication } from "../application/epics/epic-state-synchronization-application.js";
import { EpicSubmissionApplication } from "../application/epics/epic-submission-application.js";
import { UnnamedFeatureDiscoveryApplication } from "../application/epics/unnamed-feature-discovery-application.js";
import { FeatureSubmissionApplication } from "../application/features/feature-submission-application.js";
import { MissingFeatureBatchApplication } from "../application/features/missing-feature-batch-application.js";
import { SubmittedFeatureDocumentWriter } from "../application/features/submitted-feature-document-writer.js";
import { WorkItemIdAllocator } from "../application/work-items/work-item-id-allocator.js";
import { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import { ProjectRegistry } from "../projects/project-registry.js";
import { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";

type FeatureSubmissionDependencies = ConstructorParameters<typeof FeatureSubmissionApplication>[0];
type DiscoveryDependencies = ConstructorParameters<typeof UnnamedFeatureDiscoveryApplication>[0];

export interface WorkItemAuthoringApplicationsDependencies {
  documentWriter: SubmittedFeatureDocumentWriter;
  epicState: EpicStateSynchronizationApplication;
  idAllocator: WorkItemIdAllocator;
  routeResolver: RoutingActionResolver;
  notifyChanged: FeatureSubmissionDependencies["notifyChanged"];
  registry: ProjectRegistry;
  runPrompt: DiscoveryDependencies["runPrompt"];
  workItems: WorkItemQueryApplication;
}

/** Composes EPIC/FEAT submission, discovery, refinement, and missing-feature batching. */
export function createWorkItemAuthoringApplications(dependencies: WorkItemAuthoringApplicationsDependencies) {
  const findProject = (projectId: string) => dependencies.registry.get(projectId) ?? null;
  const scanProject = (project: Parameters<WorkItemQueryApplication["scan"]>[0]) => dependencies.workItems.scan(project);
  const unnamedFeatureDiscoveryApplication = new UnnamedFeatureDiscoveryApplication({
    choosePlanningModel: () => dependencies.routeResolver.resolvePlan("submit-feature"),
    runPrompt: dependencies.runPrompt,
  });
  const missingFeatureBatchApplication = new MissingFeatureBatchApplication({
    discover: unnamedFeatureDiscoveryApplication,
    documentWriter: dependencies.documentWriter,
    findProject,
    idAllocator: dependencies.idAllocator,
    scanProject,
    synchronizeEpic: dependencies.epicState,
  });
  const featureSubmissionApplication = new FeatureSubmissionApplication({
    findProject,
    idAllocator: dependencies.idAllocator,
    notifyChanged: dependencies.notifyChanged,
    scanProject,
  });
  const epicRefinementApplication = new EpicRefinementApplication({
    chooseModel: () => dependencies.routeResolver.resolvePlan("submit-epic"),
    clock: () => new Date().toISOString(),
    createId: randomUUID,
    findProject,
    notifyChanged: dependencies.notifyChanged,
    runPrompt: dependencies.runPrompt,
    scanProject,
  });
  const epicSubmissionApplication = new EpicSubmissionApplication({
    chooseModel: () => dependencies.routeResolver.resolvePlan("submit-epic"),
    currentDate: () => new Date().toISOString().slice(0, 10),
    findProject,
    idAllocator: dependencies.idAllocator,
    notifyChanged: dependencies.notifyChanged,
    runPrompt: dependencies.runPrompt,
    scanProject,
  });

  return {
    epicRefinementApplication,
    epicSubmissionApplication,
    featureSubmissionApplication,
    missingFeatureBatchApplication,
  };
}
