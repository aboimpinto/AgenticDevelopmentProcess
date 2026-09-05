import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { ContextPackRef, ReceiptContextEntry } from "../../workflow-receipt.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { WorkflowFailureBriefPresenter } from "../../workflows/recovery/workflow-failure-brief-presenter.js";
import type { ImplementationWorkerApplication } from "../../workflows/phases/implementation-worker-application.js";
import type { PhaseExecutionContractApplication } from "../../workflows/phases/phase-execution-contract-application.js";
import type { RefinementDeepDiveHandoffApplication } from "../deep-dive/refinement-deep-dive-handoff-application.js";
import type { FeatureWorkflowRunCoordinator } from "./feature-workflow-run-coordinator.js";
import type { FeatureWorkflowTargetResolver } from "./feature-workflow-target-resolver.js";
import type { RefineFeatureWorkerResult } from "./refine-feature-worker-result.js";
import type { PhaseExecutionContract } from "../../phase-execution-contract.js";
import {
  projectRefinementArtifactProgress,
  RefinementArtifactProgressReporter,
} from "./refinement-artifact-progress.js";

interface RefineArtifactValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string; path: string }>;
}

interface RefineTransitionReceiptInput {
  cardKey: string;
  command: "refine-feature";
  context: ReceiptContextEntry[];
  contextPackRefs: ContextPackRef[];
  nextState: "02_READY_TO_DEVELOP";
  projectId: string;
  projectRoot: string;
  stage: "refine-feature-promote-ready" | "refine-feature-recovery";
}

export interface RefineFeatureExecutionDependencies {
  buildPrompt(project: StoredProject, feature: WorkItemCard): string;
  confirmReadiness(input: { cardKey: string; feature: WorkItemCard; previousFeature: WorkItemCard; project: StoredProject }): Promise<void>;
  createRecoveredSummary(input: { errorMessage: string; feature: WorkItemCard }): string;
  createDeepDiveHandoff: RefinementDeepDiveHandoffApplication["create"];
  createTransitionContext(project: StoredProject, feature: WorkItemCard): { context: ReceiptContextEntry[]; packRefs: ContextPackRef[] };
  failureBriefPresenter: Pick<WorkflowFailureBriefPresenter, "create">;
  metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowCompletion" | "recordFeatureWorkflowRun">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  parseWorkerResult(output: string): RefineFeatureWorkerResult;
  phaseContract: Pick<PhaseExecutionContractApplication, "require">;
  requireFinalCheckpointCoverage(projectRoot: string, contract: PhaseExecutionContract): void;
  requireModel(configuredModel: string | undefined, label: string): import("@hepha/shared").HandoffPlanV1;
  maxRuntimeMs: number | null;
  stallTimeoutMs: number;
  summarizeOutput(output: string, fallback: string): string;
  targets: Pick<FeatureWorkflowTargetResolver, "findCurrentFeature">;
  validateArtifacts(folderPath: string, identity: { projectId: string; featureId: string }): RefineArtifactValidationResult;
  validateTransitionReceipt(input: RefineTransitionReceiptInput): Error | undefined;
  worker: Pick<ImplementationWorkerApplication, "execute">;
  workflowCoordinator: Pick<FeatureWorkflowRunCoordinator, "createFeatureRunner">;
}

export interface RefineFeatureExecutionInput {
  cardKey: string;
  feature: WorkItemCard;
  project: StoredProject;
  runId: string;
}

/** Owns the detached Refine Feature workflow, recovery, and terminal recording. */
export class RefineFeatureExecutionApplication {
  constructor(private readonly dependencies: RefineFeatureExecutionDependencies) {}

  async execute({ cardKey, feature, project, runId }: RefineFeatureExecutionInput): Promise<void> {
    let currentFeature = feature;
    let output = "";
    let progressReporter: RefinementArtifactProgressReporter | null = null;
    try {
      const workflow = this.dependencies.workflowCoordinator.createFeatureRunner({
        cardKey, command: "refine-feature", getFeature: () => currentFeature, project, runId,
      });
      currentFeature = await workflow.runNode(
        "collect-context",
        { variables: { featureId: feature.externalId } },
        () => this.dependencies.targets.findCurrentFeature(project, feature.externalId, currentFeature),
      );
      progressReporter = new RefinementArtifactProgressReporter({
        folderPath: currentFeature.folderPath,
        record: async (currentStep, summary) => {
          await this.dependencies.metadataStore.recordFeatureWorkflowRun({
            cardKey, command: "refine-feature", currentNodeId: "generate-artifacts", currentStep,
            projectId: project.id, runId, status: "running", summary,
          });
          this.dependencies.notifyChanged(project.id, "workflow.progress", feature.externalId);
        },
      });
      progressReporter.start();
      output = await workflow.runNode(
        "generate-artifacts",
        { variables: { featureId: feature.externalId } },
        (node, rendered) => {
          if (node.kind !== "prompt") throw new Error("AGENT_ACTION_MISSING");
          return this.dependencies.worker.execute({
            agentAction: node.agentAction,
            agentName: "Refine Feature Agent", agentRole: "refine-feature", cardKey, feature: currentFeature,
            plan: this.dependencies.requireModel(undefined, "refine-feature generate-artifacts node"),
            phaseNumber: null, phaseTitle: "Refine Feature", node, project,
            prompt: this.dependencies.buildPrompt(project, currentFeature), runId, step: rendered.status,
            maxRuntimeMs: this.dependencies.maxRuntimeMs,
            onPiEvent: (event) => progressReporter?.observe(event),
            stallTimeoutMs: this.dependencies.stallTimeoutMs,
            timeoutLabel: "Refine Feature Pi run",
          });
        },
      );
      await progressReporter.drain();
      const result = await workflow.runNode(
        "evaluate-result",
        { variables: { featureId: feature.externalId } },
        () => this.dependencies.parseWorkerResult(output),
      );
      if (result.kind === "needs_deep_dive") {
        await this.dependencies.createDeepDiveHandoff({
          cardKey, feature: currentFeature, project, questions: result.questions,
        });
        await this.dependencies.metadataStore.recordFeatureWorkflowRun({
          cardKey,
          command: "refine-feature",
          currentNodeId: "evaluate-result",
          currentStep: "Waiting for FEAT Deep-Dive answers",
          projectId: project.id,
          runId,
          status: "blocked",
          summary: result.reason,
        });
        this.dependencies.notifyChanged(project.id, "workflow.blocked", feature.externalId);
        return;
      }
      currentFeature = await workflow.runNode(
        "promote-ready",
        { variables: { featureId: feature.externalId } },
        async () => {
          const refreshed = await this.dependencies.targets.findCurrentFeature(project, feature.externalId, currentFeature);
          this.assertArtifacts(refreshed, project);
          if (refreshed.stateFolder !== "02_READY_TO_DEVELOP") {
            throw new Error("Refine Feature skill did not move the FEAT to Ready To Develop.");
          }
          return refreshed;
        },
      );
      await this.dependencies.confirmReadiness({ cardKey, feature: currentFeature, previousFeature: feature, project });
      this.assertReceipt(cardKey, currentFeature, project, "refine-feature-promote-ready");
      await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
        cardKey, command: "refine-feature", projectId: project.id, runId,
        summary: result.summary,
      });
      this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
    } catch (error) {
      await progressReporter?.drain();
      const rawErrorMessage = error instanceof Error ? error.message : "Unknown refinement error.";
      const errorMessage = describeRefinementInterruption(rawErrorMessage, currentFeature.folderPath);
      if (await this.recordRecovered({ cardKey, currentFeature, errorMessage, feature, project, runId })) {
        this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
        return;
      }
      await this.dependencies.metadataStore.recordFeatureWorkflowRun({
        cardKey, command: "refine-feature", error: errorMessage, projectId: project.id, runId, status: "failed",
        summary: this.dependencies.failureBriefPresenter.create({ command: "refine-feature", feature, rawError: errorMessage, runId }),
      }).catch(() => undefined);
      this.dependencies.notifyChanged(project.id, "workflow.failed", feature.externalId);
    }
  }

  async recordRecovered(input: RefineFeatureExecutionInput & { currentFeature: WorkItemCard; errorMessage: string }): Promise<boolean> {
    const refreshed = await this.dependencies.targets.findCurrentFeature(input.project, input.feature.externalId, input.currentFeature).catch(() => null);
    if (!refreshed || refreshed.stateFolder !== "02_READY_TO_DEVELOP") return false;
    try {
      this.assertArtifacts(refreshed, input.project);
      await this.dependencies.confirmReadiness({ cardKey: input.cardKey, feature: refreshed, previousFeature: input.feature, project: input.project });
      this.assertReceipt(input.cardKey, refreshed, input.project, "refine-feature-recovery");
    } catch {
      return false;
    }
    await this.dependencies.metadataStore.recordFeatureWorkflowCompletion({
      cardKey: input.cardKey, command: "refine-feature", projectId: input.project.id, runId: input.runId,
      summary: this.dependencies.createRecoveredSummary({ errorMessage: input.errorMessage, feature: refreshed }),
    });
    return true;
  }

  private assertArtifacts(feature: WorkItemCard, project: StoredProject): void {
    const validation = this.dependencies.validateArtifacts(feature.folderPath, {
      projectId: project.id, featureId: feature.externalId.toLowerCase(),
    });
    if (!validation.valid) {
      const details = validation.errors.map((error) => `[${error.code}] ${error.path}: ${error.message}`).join("; ");
      throw new Error(`Refinement artifacts failed validation: ${details}`);
    }
    const contract = this.dependencies.phaseContract.require(feature);
    this.dependencies.requireFinalCheckpointCoverage(project.rootPath, contract);
  }

  private assertReceipt(cardKey: string, feature: WorkItemCard, project: StoredProject, stage: RefineTransitionReceiptInput["stage"]): void {
    const { context, packRefs } = this.dependencies.createTransitionContext(project, feature);
    const error = this.dependencies.validateTransitionReceipt({
      cardKey, command: "refine-feature", context, contextPackRefs: packRefs,
      stage, nextState: "02_READY_TO_DEVELOP", projectId: project.id, projectRoot: project.rootPath,
    });
    if (error) throw error;
  }
}

function describeRefinementInterruption(errorMessage: string, folderPath: string): string {
  if (!/(?:stalled after|maximum runtime|timed out|RUNTIME_(?:ROUTE_SEQUENCE_EXHAUSTED|RECOVERY_CHECKPOINT_REQUIRED))/iu.test(errorMessage)) {
    return errorMessage;
  }
  const progress = projectRefinementArtifactProgress(folderPath);
  const position = progress.lastCompletedArtifact
    ? ` Last durable refinement artifact: ${progress.lastCompletedArtifact}.`
    : " No complete refinement artifact checkpoint was detected.";
  const next = progress.nextExpectedArtifact
    ? ` Next required artifact: ${progress.nextExpectedArtifact}.`
    : ` ${progress.currentStep}.`;
  return `${errorMessage}${position}${next}`;
}
