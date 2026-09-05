import type {
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  HandoffPlanV1,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";
import {
  getNumberedPhases,
  isImplementationPhaseResolved,
} from "../phases/phase-lifecycle-policy.js";
import {
  createDevCycleMcpCompatibilityRequest,
  renderDevCycleMcpCompatibilityPrompt,
} from "./devcycle-mcp-compatibility-request.js";
import type { FeatureRecipeOperation } from "./feature-recipe-source-policy.js";

interface CompatibilityTarget {
  readonly feature: WorkItemCard;
  readonly project: StoredProject;
}

interface CompatibilityMetadataInput {
  readonly cardKey: string;
  readonly command: ReturnType<typeof createDevCycleMcpCompatibilityRequest>["command"];
  readonly projectId: string;
  readonly runId: string;
}

export interface DevCycleMcpCompatibilityDependencies {
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly applyManualTestDeferrals: (input: {
    readonly cardKey: string;
    readonly feature: WorkItemCard;
    readonly output: string;
    readonly project: StoredProject;
    readonly runId: string;
  }) => Promise<number>;
  readonly createId: () => string;
  readonly metadata: {
    block(input: CompatibilityMetadataInput & {
      readonly currentNodeId: string;
      readonly currentStep: string;
      readonly summary: string;
    }): Promise<void>;
    complete(input: CompatibilityMetadataInput & { readonly summary: string }): Promise<void>;
    fail(input: CompatibilityMetadataInput & { readonly error: string; readonly summary: string }): Promise<void>;
    start(input: CompatibilityMetadataInput & { readonly currentStep: string; readonly summary: string }): Promise<void>;
  };
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly resolvePlan: (actionId: ReturnType<typeof createDevCycleMcpCompatibilityRequest>["agentAction"]) => HandoffPlanV1;
  readonly resolveTarget: (input: FeatureWorkflowActionInput) => Promise<CompatibilityTarget>;
  readonly runWorker: (input: ImplementationWorkerInput) => Promise<string>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly seedManualTestSkips: (input: {
    readonly cardKey: string;
    readonly feature: WorkItemCard;
    readonly project: StoredProject;
    readonly runId: string;
  }) => Promise<number>;
  readonly summarizeOutput: (output: string, fallback: string) => string;
  readonly summarizeProject: (project: StoredProject) => ProjectSummary;
}

/** Runs one user-facing lifecycle action through the proven DevCycle MCP recipe in one Pi model session. */
export class DevCycleMcpCompatibilityApplication {
  constructor(private readonly dependencies: DevCycleMcpCompatibilityDependencies) {}

  async start(
    operation: FeatureRecipeOperation,
    input: FeatureWorkflowActionInput,
  ): Promise<FeatureWorkflowActionResponse> {
    const target = await this.dependencies.resolveTarget(input);
    if (target.feature.featureWorkflow?.activeRun?.status === "running") {
      throw new Error(`${target.feature.externalId} already has a running ${target.feature.featureWorkflow.activeRun.command} workflow.`);
    }
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: input.autonomous !== false,
      featureId: target.feature.externalId,
      featurePath: target.feature.folderPath,
      operation,
    });
    const runId = `workflow-${this.dependencies.createId()}`;
    const cardKey = this.dependencies.createCardKey(target.feature.kind, target.feature.externalId);
    const metadata = { cardKey, command: request.command, projectId: target.project.id, runId } as const;
    await this.dependencies.metadata.start({
      ...metadata,
      currentStep: `Calling ${request.toolName} through DevCycle MCP`,
      summary: `Starting ${operation} with recipe source devcycle-mcp.`,
    });
    void this.execute({ cardKey, request, runId, target });
    this.dependencies.notifyChanged(target.project.id, "workflow.started", target.feature.externalId);
    return {
      filesChanged: [],
      filesCreated: [],
      items: await this.dependencies.scanProject(target.project),
      project: this.dependencies.summarizeProject(target.project),
      summary: `DevCycle MCP compatibility workflow started for ${target.feature.externalId}.`,
    };
  }

  async execute(input: {
    readonly cardKey: string;
    readonly request: ReturnType<typeof createDevCycleMcpCompatibilityRequest>;
    readonly runId: string;
    readonly target: CompatibilityTarget;
  }): Promise<void> {
    const { feature, project } = input.target;
    const metadata = {
      cardKey: input.cardKey,
      command: input.request.command,
      projectId: project.id,
      runId: input.runId,
    } as const;
    try {
      if (input.request.operation === "startImplementing") {
        await this.dependencies.seedManualTestSkips({
          cardKey: input.cardKey,
          feature,
          project,
          runId: input.runId,
        });
      }
      const phase = selectExecutionPhase(input.request.operation, feature);
      const plan = this.dependencies.resolvePlan(input.request.agentAction);
      const output = await this.dependencies.runWorker({
        agentAction: input.request.agentAction,
        agentName: "DevCycle MCP Compatibility Agent",
        agentRole: "devcycle-mcp-compatibility",
        cardKey: input.cardKey,
        feature,
        mcpProfile: true,
        phaseNumber: phase?.number ?? null,
        phaseTitle: phase?.title ?? null,
        plan,
        project,
        prompt: renderDevCycleMcpCompatibilityPrompt(input.request),
        runId: input.runId,
        step: `Executing ${input.request.toolName} from DevCycle MCP`,
      });
      const deferredManualTests = await this.dependencies.applyManualTestDeferrals({
        cardKey: input.cardKey,
        feature,
        output,
        project,
        runId: input.runId,
      });
      const summary = [
        this.dependencies.summarizeOutput(
          output,
          `${input.request.toolName} completed through DevCycle MCP.`,
        ),
        deferredManualTests > 0
          ? `Hepha recorded ${deferredManualTests} task(s) as SKIPPED with mandatory Manual TestPack obligations.`
          : "",
      ].filter(Boolean).join(" ");
      const refreshed = (await this.dependencies.scanProject(project))
        .find((candidate) => candidate.externalId === feature.externalId);
      if (input.request.operation === "refineFeature" && !hasCompletedRefinementPostconditions(refreshed)) {
        await this.dependencies.metadata.block({
          ...metadata,
          currentNodeId: "evaluate-result",
          currentStep: "Waiting for FEAT Deep-Dive answers",
          summary,
        });
        this.dependencies.notifyChanged(project.id, "workflow.blocked", feature.externalId);
        return;
      }
      await this.dependencies.metadata.complete({ ...metadata, summary });
      this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown DevCycle MCP compatibility failure.";
      await this.dependencies.metadata.fail({
        ...metadata,
        error: message,
        summary: `DevCycle MCP compatibility failed while executing ${input.request.toolName}: ${message}`,
      }).catch(() => undefined);
      this.dependencies.notifyChanged(project.id, "workflow.failed", feature.externalId);
    }
  }
}

/**
 * Associates implementation telemetry with the lifecycle phase active when the
 * orchestrator dispatches the provider recipe. Phase number/title are recorded
 * only as display metadata; selection is based on unresolved lifecycle state.
 */
function hasCompletedRefinementPostconditions(feature: WorkItemCard | undefined): boolean {
  return feature?.stateFolder === "02_READY_TO_DEVELOP" &&
    feature.featureWorkflow?.hasRefinementArtifacts === true;
}

function selectExecutionPhase(
  operation: FeatureRecipeOperation,
  feature: Pick<WorkItemCard, "phases">,
) {
  if (operation !== "startImplementing" && operation !== "continueImplementing") return null;
  return getNumberedPhases(feature).find((phase) => !isImplementationPhaseResolved(phase)) ?? null;
}
