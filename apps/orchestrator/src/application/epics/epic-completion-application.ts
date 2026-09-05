import type {
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface EpicCompletionDependencies {
  readonly findProject: (projectId: string) => StoredProject | null | undefined;
  readonly normalizePath: (projectRoot: string, documentPath: string) => string;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly syncState: (epic: WorkItemCard, items: WorkItemCard[]) => boolean;
  readonly toProjectSummary: (project: StoredProject) => ProjectSummary;
}

export class EpicCompletionApplication {
  readonly #dependencies: EpicCompletionDependencies;

  constructor(dependencies: EpicCompletionDependencies) {
    this.#dependencies = dependencies;
  }

  async complete(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const project = this.#dependencies.findProject(input.projectId);
    if (!project) throw new Error("Project not found.");
    let items = await this.#dependencies.scanProject(project);
    const epic = items.find((candidate) => candidate.id === input.cardId);
    if (!epic || epic.kind !== "epic") throw new Error("EPIC work item not found.");

    const blockers = getEpicCompletionBlockers(epic, items);
    if (blockers.length > 0) {
      throw new Error(`Complete EPIC is available only when every linked FEAT is completed. ${blockers.join(" ")}`);
    }

    const wasAlreadyCompleted = epic.epicState === "completed";
    const changed = this.#dependencies.syncState(epic, items);
    items = await this.#dependencies.scanProject(project);
    const currentEpic = items.find(
      (candidate) => candidate.kind === "epic" && candidate.externalId === epic.externalId,
    );
    if (!currentEpic || currentEpic.epicState !== "completed") {
      throw new Error(`Complete EPIC could not verify ${epic.externalId} as Completed after synchronization.`);
    }
    if (changed) this.#dependencies.notifyChanged(project.id, "epic.completed", epic.externalId);

    const linkedFeatureCount = new Set(epic.linkedFeatureIds).size;
    const featureLabel = linkedFeatureCount === 1 ? "linked FEAT is" : "linked FEATs are";
    return {
      filesChanged: changed && epic.documentPath
        ? [this.#dependencies.normalizePath(project.rootPath, epic.documentPath)]
        : [],
      filesCreated: [],
      items,
      project: this.#dependencies.toProjectSummary(project),
      summary: wasAlreadyCompleted
        ? `${epic.externalId} is already Completed because all ${linkedFeatureCount} ${featureLabel} completed.`
        : `${epic.externalId} marked Completed because all ${linkedFeatureCount} ${featureLabel} completed.`,
    };
  }
}

export function getEpicCompletionBlockers(epic: WorkItemCard, workItems: WorkItemCard[]): string[] {
  const linkedFeatureIds = [...new Set(epic.linkedFeatureIds)].sort();
  const blockers: string[] = [];
  if (linkedFeatureIds.length === 0) return ["No linked FEATs were detected."];

  const featuresById = new Map<string, WorkItemCard[]>();
  for (const item of workItems) {
    if (item.kind !== "feature") continue;
    const current = featuresById.get(item.externalId) ?? [];
    current.push(item);
    featuresById.set(item.externalId, current);
  }

  const missing: string[] = [];
  const ambiguous: string[] = [];
  const incomplete: string[] = [];
  for (const featureId of linkedFeatureIds) {
    const matches = featuresById.get(featureId) ?? [];
    if (matches.length === 0) {
      missing.push(featureId);
      continue;
    }
    const states = [...new Set(matches.map((match) => match.stateFolder))];
    if (states.length > 1) {
      ambiguous.push(`${featureId} (${states.join(", ")})`);
      continue;
    }
    const [match] = matches;
    if (match?.stateFolder !== "04_COMPLETED") {
      incomplete.push(`${featureId} is ${match?.stateLabel ?? match?.stateFolder ?? "unknown"}`);
    }
  }
  if (missing.length > 0) blockers.push(`Missing linked FEATs: ${missing.join(", ")}.`);
  if (ambiguous.length > 0) blockers.push(`Ambiguous linked FEAT states: ${ambiguous.join("; ")}.`);
  if (incomplete.length > 0) blockers.push(`Incomplete linked FEATs: ${incomplete.join("; ")}.`);
  return blockers;
}
