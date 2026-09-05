import type { FeatureWorkflowActionInput, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface FeatureWorkflowTargetDependencies {
  readonly findProject: (projectId: string) => StoredProject | null | undefined;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
}

export class FeatureWorkflowTargetResolver {
  readonly #dependencies: FeatureWorkflowTargetDependencies;

  constructor(dependencies: FeatureWorkflowTargetDependencies) {
    this.#dependencies = dependencies;
  }

  async findCurrentFeature(
    project: StoredProject,
    externalId: string,
    fallback: WorkItemCard,
  ): Promise<WorkItemCard> {
    const items = await this.#dependencies.scanProject(project);
    return items.find((candidate) => candidate.kind === "feature" && candidate.externalId === externalId) ?? fallback;
  }

  async resolveWorkflow(input: FeatureWorkflowActionInput) {
    const target = await this.#resolveFeature(input);
    if (target.feature.validation.needsValidationCount > 0) {
      throw new Error("The FEAT has unresolved validation markers. Complete a Deep-Dive before this workflow step.");
    }
    return target;
  }

  /** Resolves only stable project/feature identity; the selected external recipe owns lifecycle prerequisites. */
  async resolveCompatibility(input: FeatureWorkflowActionInput) {
    return this.#resolveFeature(input);
  }

  async resolveImplementation(input: FeatureWorkflowActionInput) {
    const target = await this.#resolveFeature(input);
    if (target.feature.validation.needsValidationCount > 0) {
      throw new Error("The FEAT still has validation markers. Resolve them before implementation.");
    }
    return target;
  }

  async resolveCancellation(input: FeatureWorkflowActionInput) {
    const project = this.#project(input.projectId);
    const workItems = await this.#dependencies.scanProject(project);
    const item = workItems.find((candidate) => candidate.id === input.cardId);
    if (!item) throw new Error("Work item not found.");
    return { item, project };
  }

  async #resolveFeature(input: FeatureWorkflowActionInput) {
    const project = this.#project(input.projectId);
    const workItems = await this.#dependencies.scanProject(project);
    const feature = workItems.find((candidate) => candidate.id === input.cardId);
    if (!feature || feature.kind !== "feature") throw new Error("FEAT work item not found.");
    if (!feature.documentPath || !feature.specMarkdown.trim()) {
      throw new Error("The selected FEAT does not have a readable source document.");
    }
    return { feature, project, workItems };
  }

  #project(projectId: string): StoredProject {
    const project = this.#dependencies.findProject(projectId);
    if (!project) throw new Error("Project not found.");
    return project;
  }
}
