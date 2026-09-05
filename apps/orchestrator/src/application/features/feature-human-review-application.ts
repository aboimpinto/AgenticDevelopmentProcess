import type {
  FeatureHumanReviewInput,
  FeatureWorkflowActionResponse,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { CardMetadataStore } from "@hepha/db";
import type { StoredProject } from "../../projects/stored-project.js";

export interface FeatureHumanReviewDependencies {
  readonly allPhasesResolved: (feature: WorkItemCard) => boolean;
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly metadataStore: Pick<CardMetadataStore, "recordFeatureHumanReview">;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly resolveImplementation: (
    input: FeatureHumanReviewInput,
  ) => Promise<{ feature: WorkItemCard; project: StoredProject }>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly startCompletion: (project: StoredProject, feature: WorkItemCard) => Promise<boolean>;
  readonly toProjectSummary: (project: StoredProject) => ProjectSummary;
}

export class FeatureHumanReviewApplication {
  readonly #dependencies: FeatureHumanReviewDependencies;

  constructor(dependencies: FeatureHumanReviewDependencies) {
    this.#dependencies = dependencies;
  }

  async record(input: FeatureHumanReviewInput): Promise<FeatureWorkflowActionResponse> {
    const { feature, project } = await this.#dependencies.resolveImplementation(input);
    if (!this.#dependencies.allPhasesResolved(feature)) {
      throw new Error("Human review actions are available only after every numbered phase is completed or skipped.");
    }
    if (input.check !== "user-code-review" && input.check !== "manual-tests") {
      throw new Error("Unknown human review action.");
    }

    await this.#dependencies.metadataStore.recordFeatureHumanReview({
      cardKey: this.#dependencies.createCardKey(feature.kind, feature.externalId),
      check: input.check,
      projectId: project.id,
    });
    this.#dependencies.notifyChanged(project.id, "workflow.human-review", feature.externalId);
    const completionStarted = await this.#dependencies.startCompletion(project, feature);
    const label = input.check === "user-code-review" ? "User code review" : "Manual tests";

    return {
      filesChanged: [],
      filesCreated: [],
      items: await this.#dependencies.scanProject(project),
      project: this.#dependencies.toProjectSummary(project),
      summary: completionStarted
        ? `${label} recorded for ${feature.externalId}. Complete Feature finalization started.`
        : `${label} recorded for ${feature.externalId}.`,
    };
  }
}
