import { readFileSync, writeFileSync } from "node:fs";
import type { BatchPreviewPlan, CreateMissingFeaturesInput, CreateMissingFeaturesResponse, PreviewFeatCandidate, PreviewMissingFeaturesInput, PreviewMissingFeaturesResponse, WorkItemCard } from "@hepha/shared";
import { buildArtifactMap, buildPreviewPlan, calculatePlanHash, classifyCandidates, detectAmbiguousFeatState, orderByDependencies, renderUpdatedFeatureDetails, renderUpdatedFeatureTable, renderUpdatedMermaidDiagram, renderUpdatedProgressTracking } from "../../batch-preview.js";
import type { PlannedFeature } from "../../feature-extraction.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { toProjectSummary } from "../../projects/project-summary.js";
import { hashText } from "../../workflow-receipt.js";
import type { EpicStateSynchronizationApplication } from "../epics/epic-state-synchronization-application.js";
import type { UnnamedFeatureDiscoveryApplication } from "../epics/unnamed-feature-discovery-application.js";
import type { WorkItemIdAllocator } from "../work-items/work-item-id-allocator.js";
import type { SubmittedFeatureDocumentWriter } from "./submitted-feature-document-writer.js";

export interface MissingFeatureBatchDependencies {
  discover: Pick<UnnamedFeatureDiscoveryApplication, "discover">;
  documentWriter: Pick<SubmittedFeatureDocumentWriter, "createFromEpicReference" | "createFromPlan">;
  findProject(projectId: string): StoredProject | null;
  idAllocator: Pick<WorkItemIdAllocator, "advanceFeaturePast">;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  synchronizeEpic: Pick<EpicStateSynchronizationApplication, "syncEpic">;
}

/** Owns preview, confirmation, idempotent creation, and EPIC projection for missing child features. */
export class MissingFeatureBatchApplication {
  constructor(private readonly dependencies: MissingFeatureBatchDependencies) {}

  async preview(input: PreviewMissingFeaturesInput): Promise<PreviewMissingFeaturesResponse> {
    const { epic, project, workItems } = await this.loadEligibleEpic(input.projectId, input.cardId);
    return { plan: await this.createCurrentPlan(project, epic, workItems), items: workItems, project: toProjectSummary(project) };
  }

  async create(input: CreateMissingFeaturesInput): Promise<CreateMissingFeaturesResponse> {
    const { epic, project, workItems } = await this.loadEligibleEpic(input.projectId, input.cardId);
    const approvedPreviewPlan = input.previewPlan ?? (await this.createCurrentPlan(project, epic, workItems));
    const currentDocumentHash = epic.documentPath ? hashText(readFileSync(epic.documentPath, "utf8")) : hashText(epic.specMarkdown);
    validateApprovedPreviewPlan({ currentDocumentHash, epic, input, plan: approvedPreviewPlan });

    const { ambiguousIds, warnings: ambiguousWarnings } = detectAmbiguousFeatState(project.memoryBankPath);
    if (ambiguousIds.size > 0) {
      throw new Error(`Cannot apply: ambiguous FEAT state detected for ${Array.from(ambiguousIds.keys()).join(", ")}. These FEAT IDs appear in multiple state folders. Manual resolution required.`);
    }
    const epicDocumentContent = epic.documentPath ? readFileSync(epic.documentPath, "utf8") : epic.specMarkdown;
    const artifactMap = buildArtifactMap(project.memoryBankPath, epicDocumentContent);
    const candidates = [...approvedPreviewPlan.explicitCandidates, ...approvedPreviewPlan.discoveredCandidates];
    const classification = classifyCandidates(candidates, artifactMap);
    if (classification.blockedFeatureIds.length > 0) {
      throw new Error(`Cannot apply: blocked candidates: ${classification.blockedFeatureIds.join(", ")}. These FEAT IDs exist in multiple state folders. Resolve manually and retry.`);
    }
    const orderedResult = orderByDependencies(candidates.filter((candidate) => candidate.plannedFeatureId.length > 0));
    if (orderedResult.blocked) {
      throw new Error(`Cannot apply: dependency cycle detected. Resolve cycles and retry. Warnings: ${orderedResult.warnings.join("; ")}`);
    }

    const createdFeatureIds: string[] = [];
    const skippedFeatureIds = [...classification.existingFeatureIds];
    for (const candidate of orderedResult.ordered) {
      if (!classification.createdFeatureIds.includes(candidate.plannedFeatureId)) continue;
      const created = candidate.fromExplicitLink
        ? this.dependencies.documentWriter.createFromEpicReference(project, epic, candidate.plannedFeatureId)
        : this.dependencies.documentWriter.createFromPlan(project, epic, candidate.plannedFeatureId, createPlannedFeatureFromPreviewCandidate(candidate));
      (created ? createdFeatureIds : skippedFeatureIds).push(candidate.plannedFeatureId);
    }
    this.dependencies.idAllocator.advanceFeaturePast(project, createdFeatureIds);

    const epicUpdates: { section: string; updated: boolean; details: string[] }[] = [];
    let currentEpicMd = epicDocumentContent;
    let epicWasUpdated = false;
    const updateProjection = (section: string, render: (markdown: string) => string, changed: string, unchanged: string) => {
      const updated = render(currentEpicMd);
      const didChange = updated !== currentEpicMd;
      epicUpdates.push({ section, updated: didChange, details: [didChange ? changed : unchanged] });
      if (didChange) { currentEpicMd = updated; epicWasUpdated = true; }
    };
    if (candidates.length > 0) {
      updateProjection("feature-table", (markdown) => renderUpdatedFeatureTable(markdown, candidates, artifactMap.existingFeatIds), `Updated feature table with ${candidates.length} candidate(s)`, "No changes to feature table");
      updateProjection("feature-details", (markdown) => renderUpdatedFeatureDetails(markdown, candidates, artifactMap.existingFeatIds, epic.externalId, epic.title), "Added feature detail sections for new candidates", "No changes to feature details");
      updateProjection("progress-tracking", (markdown) => renderUpdatedProgressTracking(markdown, candidates, artifactMap.existingFeatIds), "Added progress tracking entries for new candidates", "No changes to progress tracking");
      updateProjection("mermaid-diagram", (markdown) => renderUpdatedMermaidDiagram(markdown, candidates, artifactMap.existingFeatIds), "Added Mermaid nodes for new candidates", "No changes to Mermaid diagram");
    }
    if (epicWasUpdated && epic.documentPath) writeFileSync(epic.documentPath, currentEpicMd, "utf8");

    let items = await this.dependencies.scanProject(project);
    const refreshedEpic = items.find((item) => item.kind === "epic" && item.externalId === epic.externalId);
    if (refreshedEpic && this.dependencies.synchronizeEpic.syncEpic(refreshedEpic, items)) items = await this.dependencies.scanProject(project);
    return {
      createdFeatureIds,
      discoveredFeatureCount: approvedPreviewPlan.discoveredCandidates.length,
      items,
      project: toProjectSummary(project),
      skippedFeatureIds,
      existingFeatureIds: classification.existingFeatureIds,
      recoveredFeatureIds: classification.recoveredFeatureIds,
      blockedFeatureIds: classification.blockedFeatureIds,
      epicUpdates,
      warnings: [...orderedResult.warnings, ...classification.warnings, ...ambiguousWarnings],
    };
  }

  private async createCurrentPlan(project: StoredProject, epic: WorkItemCard, workItems: WorkItemCard[]): Promise<BatchPreviewPlan> {
    const existingFeatureIds = new Set(workItems.filter((item) => item.kind === "feature").map((item) => item.externalId));
    const base = { epic, epicDocumentPath: epic.documentPath ?? "", existingFeatureIds, memoryBankPath: project.memoryBankPath };
    const basePlan = buildPreviewPlan({ ...base, discoveredFeatures: [] });
    if (basePlan.explicitCandidates.length > 0 || basePlan.discoveredCandidates.length > 0) return basePlan;
    return buildPreviewPlan({ ...base, discoveredFeatures: await this.dependencies.discover.discover(epic, workItems) });
  }

  private async loadEligibleEpic(projectId: string, cardId: string) {
    const project = this.dependencies.findProject(projectId);
    if (!project) throw new Error("Project not found.");
    const workItems = await this.dependencies.scanProject(project);
    const epic = workItems.find((candidate) => candidate.id === cardId);
    if (!epic || epic.kind !== "epic") throw new Error("EPIC work item not found.");
    if (epic.validation.blocksFeatureExtraction) throw new Error("Missing FEATs can be created only after the EPIC has a current Hepha deep-dive and no validation blockers.");
    return { epic, project, workItems };
  }
}

export function validateApprovedPreviewPlan({ currentDocumentHash, epic, input, plan }: { currentDocumentHash: string; epic: WorkItemCard; input: CreateMissingFeaturesInput; plan: BatchPreviewPlan }): void {
  if (plan.epicId !== epic.externalId) throw new Error(`Preview plan belongs to ${plan.epicId}, not ${epic.externalId}. Request a new preview.`);
  const sourceDocumentHash = input.sourceDocumentHash ?? plan.epicDocumentHash;
  if (sourceDocumentHash !== currentDocumentHash || plan.epicDocumentHash !== currentDocumentHash) throw new Error("EPIC document has changed since preview. Request a new preview.");
  const expectedPlanHash = calculatePlanHash(plan.epicDocumentHash, plan.explicitCandidates, plan.discoveredCandidates, plan.warnings);
  if (plan.planHash !== expectedPlanHash || (input.planHash && input.planHash !== expectedPlanHash)) throw new Error("Preview plan is stale. EPIC document or existing FEATs have changed. Request a new preview.");
  if (!plan.applyAllowed) throw new Error("No FEAT candidates to create. Request a new preview to check for changes.");
}

export function createPlannedFeatureFromPreviewCandidate(candidate: PreviewFeatCandidate): PlannedFeature {
  return { acceptanceCriteria: [], dependencyIds: candidate.dependencyIds, description: candidate.summary, priority: candidate.priority, title: candidate.title };
}
