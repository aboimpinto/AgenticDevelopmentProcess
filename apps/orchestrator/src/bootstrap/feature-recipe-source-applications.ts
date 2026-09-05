import type { CardMetadataStore } from "@hepha/db";
import type { FeatureWorkflowActionInput, FeatureWorkflowActionResponse } from "@hepha/shared";
import { randomUUID } from "node:crypto";
import type { FeatureWorkflowTargetResolver } from "../application/features/feature-workflow-target-resolver.js";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import type { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import type { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import type { ImplementationWorkerApplication } from "../workflows/phases/implementation-worker-application.js";
import { DevCycleMcpCompatibilityApplication } from "../workflows/recipes/devcycle-mcp-compatibility-application.js";
import {
  applyCompatibilityManualTestDeferrals,
  seedRefinedManualTestSkips,
} from "../workflows/recipes/compatibility-manual-test-deferral-application.js";
import type { FeatureRecipeOperation, FeatureRecipeSourcePolicy } from "../workflows/recipes/feature-recipe-source-policy.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";
import { toProjectSummary } from "../projects/project-summary.js";

type FeatureWorkflowOperation = (input: FeatureWorkflowActionInput) => Promise<FeatureWorkflowActionResponse>;
type RecipeActionRoutes = Readonly<Record<FeatureRecipeOperation, FeatureWorkflowOperation>>;

export interface FeatureRecipeSourceApplicationsDependencies {
  readonly metadataStore: CardMetadataStore;
  readonly native: RecipeActionRoutes;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly policy: FeatureRecipeSourcePolicy;
  readonly routeResolver: Pick<RoutingActionResolver, "resolvePlan">;
  readonly targets: Pick<FeatureWorkflowTargetResolver, "resolveCompatibility">;
  readonly workItems: Pick<WorkItemQueryApplication, "scan">;
  readonly worker: Pick<ImplementationWorkerApplication, "execute">;
}

/** Composes the temporary recipe-source switch without spreading MCP branches through native applications. */
export function createFeatureRecipeSourceApplications(
  dependencies: FeatureRecipeSourceApplicationsDependencies,
): RecipeActionRoutes {
  const compatibility = new DevCycleMcpCompatibilityApplication({
    applyManualTestDeferrals: (input) => applyCompatibilityManualTestDeferrals({
      ...input,
      store: dependencies.metadataStore,
    }),
    createCardKey: createWorkItemCardKey,
    createId: randomUUID,
    metadata: {
      block: (input) => dependencies.metadataStore.recordFeatureWorkflowRun({ ...input, status: "blocked" }),
      complete: (input) => dependencies.metadataStore.recordFeatureWorkflowCompletion(input),
      fail: (input) => dependencies.metadataStore.recordFeatureWorkflowRun({ ...input, status: "failed" }),
      start: (input) => dependencies.metadataStore.recordFeatureWorkflowRun({ ...input, status: "running" }),
    },
    notifyChanged: dependencies.notifyChanged,
    resolvePlan: (actionId) => dependencies.routeResolver.resolvePlan(actionId),
    resolveTarget: (input) => dependencies.targets.resolveCompatibility(input),
    runWorker: (input) => dependencies.worker.execute(input),
    scanProject: (project) => dependencies.workItems.scan(project),
    seedManualTestSkips: (input) => seedRefinedManualTestSkips({
      ...input,
      store: dependencies.metadataStore,
    }),
    summarizeOutput: summarizeWorkflowOutput,
    summarizeProject: toProjectSummary,
  });
  return Object.freeze(Object.fromEntries(Object.entries(dependencies.native).map(([operation, native]) => [
    operation,
    (input: FeatureWorkflowActionInput) => dependencies.policy.sourceFor(operation as FeatureRecipeOperation) === "devcycle-mcp"
      ? compatibility.start(operation as FeatureRecipeOperation, input)
      : native(input),
  ])) as unknown as RecipeActionRoutes);
}
