import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { SubmitFeatureInput, SubmitFeatureResponse, WorkItemCard } from "@hepha/shared";
import { deriveFeatureDocumentPath, deriveFeatureFolderPath, renderSubmitFeatureDocument } from "../../feature-submission.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { toProjectSummary } from "../../projects/project-summary.js";
import type { WorkItemIdAllocator } from "../work-items/work-item-id-allocator.js";

export interface FeatureSubmissionDependencies {
  findProject(projectId: string): StoredProject | null;
  idAllocator: Pick<WorkItemIdAllocator, "nextFeature">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
}

/** Validates and creates one submitted feature document without overwriting existing work. */
export class FeatureSubmissionApplication {
  constructor(private readonly dependencies: FeatureSubmissionDependencies) {}

  async submit(input: SubmitFeatureInput): Promise<SubmitFeatureResponse> {
    const project = this.dependencies.findProject(input.projectId);
    if (!project) throw new Error("Project not found.");
    const title = input.title.trim();
    const summary = input.summary.trim();
    if (!title) throw new Error("FEAT title is required.");
    if (!summary) throw new Error("FEAT summary is required.");

    if (input.parentEpicId) {
      const currentItems = await this.dependencies.scanProject(project);
      if (!currentItems.some((item) => item.kind === "epic" && item.externalId === input.parentEpicId)) {
        throw new Error(`Parent EPIC ${input.parentEpicId} not found.`);
      }
    }

    const featureId = this.dependencies.idAllocator.nextFeature(project);
    const folderPath = deriveFeatureFolderPath(project.memoryBankPath, featureId, title);
    const documentPath = deriveFeatureDocumentPath(project.memoryBankPath, featureId, title);
    if (existsSync(folderPath) || existsSync(documentPath)) {
      throw new Error(`${featureId} already exists. Refresh the project and try again.`);
    }
    const markdown = renderSubmitFeatureDocument({
      featureId,
      title,
      summary,
      acceptanceCriteria: input.acceptanceCriteria,
      parentEpicId: input.parentEpicId,
      parentEpicTitle: input.parentEpicTitle,
      priority: input.priority,
      externalReference: input.externalReference,
      owner: input.owner,
    });
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(documentPath, markdown, "utf8");
    this.dependencies.notifyChanged(project.id, "feature.submitted", featureId);

    const items = await this.dependencies.scanProject(project);
    const feature = items.find((item) => item.kind === "feature" && item.externalId === featureId);
    if (!feature) throw new Error(`${featureId} was created but could not be loaded from the MemoryBank scan.`);
    return {
      feature,
      filesCreated: [documentPath],
      items,
      project: toProjectSummary(project),
      summary: `Submitted ${featureId}: ${title}.`,
    };
  }
}
