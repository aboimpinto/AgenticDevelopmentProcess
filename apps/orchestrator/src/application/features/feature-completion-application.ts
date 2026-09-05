import type {
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  FeatureWorkflowCommand,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface FeatureCompletionDependencies {
  readonly assertTransitionAllowed: (project: StoredProject, feature: WorkItemCard) => void;
  readonly countMissingQualityGates: (feature: WorkItemCard) => number;
  readonly findCurrentFeature: (
    project: StoredProject,
    externalId: string,
    fallback: WorkItemCard,
  ) => Promise<WorkItemCard>;
  readonly formatCommand: (command: FeatureWorkflowCommand) => string;
  readonly resolveImplementation: (
    input: FeatureWorkflowActionInput,
  ) => Promise<{ feature: WorkItemCard; project: StoredProject }>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly shouldStart: (feature: WorkItemCard) => boolean;
  readonly startFinalization: (project: StoredProject, feature: WorkItemCard) => Promise<boolean>;
  readonly toProjectSummary: (project: StoredProject) => ProjectSummary;
}

export class FeatureCompletionApplication {
  readonly #dependencies: FeatureCompletionDependencies;

  constructor(dependencies: FeatureCompletionDependencies) {
    this.#dependencies = dependencies;
  }

  async start(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const { feature, project } = await this.#dependencies.resolveImplementation(input);
    const currentFeature = await this.#dependencies.findCurrentFeature(project, feature.externalId, feature);
    const activeRun = currentFeature.featureWorkflow?.activeRun ?? null;

    if (activeRun) {
      if (activeRun.command !== "complete-feature") {
        throw new Error(`${this.#dependencies.formatCommand(activeRun.command)} is already running for this FEAT.`);
      }
      return this.#response(
        project,
        `Complete Feature finalization is already running for ${currentFeature.externalId}.`,
      );
    }

    if (!this.#dependencies.shouldStart(currentFeature)) {
      const missingQualityGateCount = this.#dependencies.countMissingQualityGates(currentFeature);
      if (missingQualityGateCount > 0) {
        throw new Error(
          `Complete Feature is blocked by ${missingQualityGateCount} missing phase quality gate${missingQualityGateCount === 1 ? "" : "s"}. Add evidence or an explicit justified waiver before finalization.`,
        );
      }
      throw new Error(
        "Complete Feature is available only after all phases are resolved, user code review and manual tests are recorded, all findings are closed, the Human Review Findings phase is resolved, and phase quality gates have no missing decisions.",
      );
    }

    this.#dependencies.assertTransitionAllowed(project, currentFeature);
    if (!await this.#dependencies.startFinalization(project, currentFeature)) {
      throw new Error("Complete Feature finalization could not be started. Refresh and try again.");
    }
    return this.#response(project, `Complete Feature finalization started for ${currentFeature.externalId}.`);
  }

  async #response(project: StoredProject, summary: string): Promise<FeatureWorkflowActionResponse> {
    return {
      filesChanged: [],
      filesCreated: [],
      items: await this.#dependencies.scanProject(project),
      project: this.#dependencies.toProjectSummary(project),
      summary,
    };
  }
}
