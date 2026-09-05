import type { CardMetadataStore } from "@hepha/db";
import type {
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

type PreparationStore = Pick<CardMetadataStore, "recordFeatureUiRequirement" | "recordFeatureWorkflowRun">;
type PreparationTarget = { feature: WorkItemCard; project: StoredProject };

export interface FeaturePreparationDependencies {
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly createId: () => string;
  readonly evaluateUiDecision: (feature: WorkItemCard) => Promise<{ decision: "requires_ui" | "no_ui"; reason: string }>;
  readonly metadataStore: PreparationStore;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly resolveWorkflow: (input: FeatureWorkflowActionInput) => Promise<PreparationTarget>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly sourceHash: (feature: WorkItemCard) => string;
  readonly startDesignWorker: (input: PreparationTarget & { cardKey: string; runId: string }) => Promise<unknown>;
  readonly startRefineWorker: (input: PreparationTarget & { cardKey: string; runId: string }) => Promise<unknown>;
  readonly toProjectSummary: (project: StoredProject) => ProjectSummary;
}

export class FeaturePreparationApplication {
  readonly #dependencies: FeaturePreparationDependencies;

  constructor(dependencies: FeaturePreparationDependencies) {
    this.#dependencies = dependencies;
  }

  async evaluateUi(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const { feature, project } = await this.#dependencies.resolveWorkflow(input);
    const decision = await this.#dependencies.evaluateUiDecision(feature);
    await this.#dependencies.metadataStore.recordFeatureUiRequirement({
      cardKey: this.#dependencies.createCardKey(feature.kind, feature.externalId),
      decision: decision.decision,
      projectId: project.id,
      reason: decision.reason,
      sourceDocumentHash: this.#dependencies.sourceHash(feature),
    });
    return this.#response(project, decision.reason);
  }

  async startDesign(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const target = await this.#dependencies.resolveWorkflow(input);
    const { feature } = target;
    this.#assertIdle(feature);
    if (feature.featureWorkflow?.uiRequirementDecision !== "requires_ui") {
      throw new Error("UI requirements can be created only after Hepha classifies this FEAT as requiring UI work.");
    }
    if (feature.featureWorkflow.hasDesignArtifacts) throw new Error("UI requirements already exist for this FEAT.");
    return this.#start(target, "design-feature", "Starting design-feature skill", "Designing", "Design Feature", this.#dependencies.startDesignWorker);
  }

  async startRefine(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const target = await this.#dependencies.resolveWorkflow(input);
    const { feature } = target;
    this.#assertIdle(feature);
    if (feature.featureWorkflow?.lastRun?.command === "refine-feature" &&
      feature.featureWorkflow.lastRun.status === "blocked") {
      throw new Error("Complete the pending FEAT Deep-Dive before refining this FEAT again.");
    }
    if (feature.featureWorkflow?.hasRefinementArtifacts && feature.stateFolder !== "01_SUBMITTED") {
      throw new Error("Refinement artifacts already exist for this FEAT.");
    }
    if (feature.stateFolder !== "01_SUBMITTED" && feature.stateFolder !== "02_READY_TO_DEVELOP") {
      throw new Error("Only submitted or ready FEATs can be refined.");
    }
    if (feature.featureWorkflow?.uiRequirementDecision === "requires_ui" && !feature.featureWorkflow.hasDesignArtifacts) {
      throw new Error("This FEAT needs UI requirements before refinement.");
    }
    if (feature.featureWorkflow?.uiRequirementDecision === "unknown") {
      throw new Error("Hepha must classify whether this FEAT needs UI requirements before refinement.");
    }
    return this.#start(target, "refine-feature", "Starting refine-feature skill", "Refining", "Refinement", this.#dependencies.startRefineWorker);
  }

  #assertIdle(feature: WorkItemCard): void {
    if (feature.featureWorkflow?.activeRun?.status === "running") {
      throw new Error(`${feature.externalId} already has a running ${feature.featureWorkflow.activeRun.command} workflow.`);
    }
  }

  async #start(
    target: PreparationTarget,
    command: "design-feature" | "refine-feature",
    currentStep: string,
    runningVerb: string,
    responseLabel: string,
    worker: FeaturePreparationDependencies["startDesignWorker"],
  ): Promise<FeatureWorkflowActionResponse> {
    const { feature, project } = target;
    const runId = `workflow-${this.#dependencies.createId()}`;
    const cardKey = this.#dependencies.createCardKey(feature.kind, feature.externalId);
    await this.#dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey, command, currentStep, projectId: project.id, runId, status: "running",
      summary: `${runningVerb} ${feature.externalId}.`,
    });
    void worker({ ...target, cardKey, runId });
    this.#dependencies.notifyChanged(project.id, "workflow.started", feature.externalId);
    return this.#response(project, `${responseLabel} started for ${feature.externalId}.`);
  }

  async #response(project: StoredProject, summary: string): Promise<FeatureWorkflowActionResponse> {
    return {
      filesChanged: [], filesCreated: [], items: await this.#dependencies.scanProject(project),
      project: this.#dependencies.toProjectSummary(project), summary,
    };
  }
}
