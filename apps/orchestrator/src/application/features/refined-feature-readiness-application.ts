import { ArchitectureDebtSqliteStore, type CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { evaluateFeatureDebtReadiness } from "../../architecture-debt-integration.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { createUiRequirementSourceHash } from "../../workflows/prompts/feature-entry-prompts.js";
import { hashText } from "../../workflow-receipt.js";

export type ArchitectureDebtPrerequisiteState = "SUBMITTED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export function resolveArchitectureDebtPrerequisiteStates(
  workItems: readonly WorkItemCard[],
): readonly { readonly featureId: string; readonly state: ArchitectureDebtPrerequisiteState }[] {
  const stateByFolder = {
    "01_SUBMITTED": "SUBMITTED",
    "02_READY_TO_DEVELOP": "READY",
    "03_IN_PROGRESS": "IN_PROGRESS",
    "04_COMPLETED": "COMPLETED",
    "05_CANCELLED": "CANCELLED",
  } as const;
  const resolved = new Map<string, { readonly featureId: string; readonly state: ArchitectureDebtPrerequisiteState }>();
  for (const item of workItems) {
    if (item.kind !== "feature" || item.stateFolder === "00_EPICS") continue;
    const state = stateByFolder[item.stateFolder];
    if (!state) continue;
    const featureId = item.externalId.toLowerCase();
    if (resolved.has(featureId)) throw new Error(`Architecture-debt prerequisite state is ambiguous for ${featureId}.`);
    resolved.set(featureId, { featureId, state });
  }
  return [...resolved.values()].sort((left, right) => left.featureId.localeCompare(right.featureId));
}

export interface RefinedFeatureReadinessDependencies {
  clockNow(): string;
  confirmReadinessSource: Pick<CardMetadataStore, "confirmFeatureReadinessSource">["confirmFeatureReadinessSource"];
  databasePath(): string | null;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  stewardId(): string | undefined;
}

/** Enforces structured architecture-debt readiness and records the source that authorized refinement. */
export class RefinedFeatureReadinessApplication {
  constructor(private readonly dependencies: RefinedFeatureReadinessDependencies) {}

  async confirm(input: {
    cardKey: string;
    feature: WorkItemCard;
    previousFeature: WorkItemCard;
    project: StoredProject;
  }): Promise<void> {
    await this.assertArchitectureDebtReady(input.feature, input.project);
    if (!input.feature.documentPath || !input.feature.specMarkdown.trim()) return;

    const sourceDocumentHash = hashText(input.feature.specMarkdown);
    const uiRequirementDecision = input.previousFeature.featureWorkflow?.uiRequirementDecision;
    const uiRequirementSourceHash = uiRequirementDecision === "no_ui" || uiRequirementDecision === "requires_ui"
      ? createUiRequirementSourceHash(sourceDocumentHash)
      : null;
    await this.dependencies.confirmReadinessSource({
      cardKey: input.cardKey,
      projectId: input.project.id,
      sourceDocumentHash,
      sourceDocumentUpdatedAt: input.feature.documentUpdatedAt,
      uiRequirementSourceHash,
    });
  }

  async assertArchitectureDebtReady(feature: WorkItemCard, project: StoredProject): Promise<void> {
    const databasePath = this.dependencies.databasePath();
    const actorId = this.dependencies.stewardId()?.trim();
    if (!databasePath) throw new Error("Architecture-debt readiness requires SQLite storage.");

    const prerequisiteStates = resolveArchitectureDebtPrerequisiteStates(await this.dependencies.scanProject(project));
    const debtStore = new ArchitectureDebtSqliteStore(databasePath);
    try {
      const result = evaluateFeatureDebtReadiness({
        featureFolderPath: feature.folderPath,
        projectId: project.id,
        featureId: feature.externalId.toLowerCase(),
        authority: actorId ? { actorId, verifiedRole: "ARCHITECTURE_STEWARD" } : null,
        store: debtStore,
        prerequisiteStates,
        clockNow: this.dependencies.clockNow(),
      });
      if (result.kind !== "ready") throw new Error(`Architecture-debt readiness blocked ${feature.externalId}: ${result.code}.`);
    } finally {
      debtStore.close();
    }
  }
}
