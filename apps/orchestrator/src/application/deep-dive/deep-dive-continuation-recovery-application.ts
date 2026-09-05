import type { CardMetadataStore } from "@hepha/db";
import type { DeepDiveSession, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  assessDeepDiveRecovery,
  buildStaleDeepDiveRecoveryQuestion,
} from "../../deep-dive-stale-recovery.js";
import type { DeepDivePreparationSource } from "./deep-dive-preparation-source.js";

type DeepDiveRecoveryStore = Pick<CardMetadataStore,
  "confirmFeatureReadinessSource" | "enabled" | "getCardMetadata"
>;

/** Reconciles Deep-Dive source freshness before an in-progress FEAT continues. */
export class DeepDiveContinuationRecoveryApplication {
  constructor(private readonly dependencies: {
    createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
    createSourceHash: (markdown: string) => string;
    createUiRequirementSourceHash: (sourceHash: string) => string;
    readPreparationSource?: (feature: WorkItemCard) => DeepDivePreparationSource;
    metadataStore: DeepDiveRecoveryStore;
    notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
    startRecoverySession: (
      input: { cardId: string; projectId: string },
      question: { prompt: string; topic: string },
    ) => Promise<DeepDiveSession>;
  }) {}

  async recover(project: StoredProject, feature: WorkItemCard): Promise<DeepDiveSession | null> {
    if (!this.dependencies.metadataStore.enabled || !feature.documentPath) return null;

    const cardKey = this.dependencies.createCardKey(feature.kind, feature.externalId);
    const metadata = await this.dependencies.metadataStore.getCardMetadata(project.id, cardKey);
    const preparationSource = this.dependencies.readPreparationSource?.(feature);
    const currentHash = preparationSource?.sourceHash ?? this.dependencies.createSourceHash(feature.specMarkdown);
    if (metadata?.lastDeepDiveSourceHash === currentHash) return null;

    const currentSemanticInput = preparationSource?.semanticSource ?? feature.specMarkdown;
    const assessment = assessDeepDiveRecovery(metadata?.lastDeepDiveSemanticSource, currentSemanticInput);
    if (assessment.classification === "lifecycle_only") {
      await this.dependencies.metadataStore.confirmFeatureReadinessSource({
        cardKey,
        projectId: project.id,
        semanticSource: assessment.currentSemanticSource,
        sourceDocumentHash: currentHash,
        sourceDocumentUpdatedAt: preparationSource?.sourceUpdatedAt ?? feature.documentUpdatedAt,
        uiRequirementSourceHash: metadata?.uiRequirementDecision
          ? this.dependencies.createUiRequirementSourceHash(this.dependencies.createSourceHash(feature.specMarkdown))
          : null,
      });
      this.dependencies.notifyChanged(project.id, "deep-dive.rebased", feature.externalId);
      return null;
    }

    return this.dependencies.startRecoverySession(
      { cardId: feature.id, projectId: project.id },
      buildStaleDeepDiveRecoveryQuestion(assessment),
    );
  }
}
