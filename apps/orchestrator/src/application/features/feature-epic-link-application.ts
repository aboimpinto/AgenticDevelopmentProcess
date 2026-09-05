import type {
  EpicUpdateSummary,
  LinkFeatureToEpicInput,
  LinkFeatureToEpicResponse,
  ScannerVerificationResult,
  WorkItemCard,
} from "@hepha/shared";
import type { LinkFeatureToEpicResult } from "../../feature-epic-linking-orchestrator.js";
import type { StoredProject } from "../../projects/stored-project.js";

/** Applies a FEAT/EPIC link mutation and verifies its scanner-visible read model. */
export class FeatureEpicLinkApplication {
  constructor(private readonly dependencies: {
    link: (input: {
      operation: LinkFeatureToEpicInput["operation"];
      featCardId: string;
      targetEpicCardId?: string;
    }, memoryBankPath: string) => LinkFeatureToEpicResult;
    scan: (project: StoredProject) => Promise<WorkItemCard[]>;
    syncEpic: (epic: WorkItemCard, items: WorkItemCard[]) => void;
  }) {}

  async execute(
    project: StoredProject,
    cardId: string,
    input: LinkFeatureToEpicInput,
  ): Promise<LinkFeatureToEpicResponse> {
    const result = this.dependencies.link({
      operation: input.operation,
      featCardId: cardId,
      ...(input.targetEpicCardId ? { targetEpicCardId: input.targetEpicCardId } : {}),
    }, project.memoryBankPath);
    const items = await this.dependencies.scan(project);
    const featCard = items.find((item) => item.kind === "feature" && item.externalId === cardId);
    const affectedEpicIds = [...new Set([
      ...result.previousParentEpicIds,
      ...result.newParentEpicIds,
    ])];
    const epicUpdates: Record<string, EpicUpdateSummary> = {};

    for (const epicId of affectedEpicIds) {
      const epicCard = findEpic(items, epicId);
      epicUpdates[epicId] = {
        epicId,
        epicTitle: epicCard?.title ?? epicId,
        sectionsUpdated: [],
        warnings: [],
      };
      try {
        if (epicCard) this.dependencies.syncEpic(epicCard, items);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown EPIC sync error";
        epicUpdates[epicId]?.warnings.push(`Progress sync failed: ${message}`);
      }
    }

    const actualLinkedEpicIds = featCard?.linkedEpicIds ?? [];
    const scannerVerification: ScannerVerificationResult = {
      linkedEpicIds: actualLinkedEpicIds,
      linkedFeatureIds: affectedEpicIds.filter((epicId) =>
        findEpic(items, epicId)?.linkedFeatureIds.includes(cardId),
      ),
      matched: result.newParentEpicIds.every((epicId) => actualLinkedEpicIds.includes(epicId)),
    };
    const warnings = [...result.warnings];
    if (result.success && !scannerVerification.matched) {
      warnings.push(
        `Scanner relationship check: expected EPIC IDs ${result.newParentEpicIds.join(",")}, found ${actualLinkedEpicIds.join(",")}`,
      );
    }

    return {
      affectedFeatIds: result.changedFiles.length > 0 ? [cardId] : [],
      affectedEpicIds,
      filesChanged: result.changedFiles,
      oldParentEpicIds: result.previousParentEpicIds,
      newParentEpicIds: result.newParentEpicIds,
      epicUpdates,
      scannerVerification,
      warnings,
      blockers: result.blockers,
      summary: result.summary,
    };
  }
}

function findEpic(items: WorkItemCard[], epicId: string) {
  return items.find((item) => item.kind === "epic" && item.externalId === epicId);
}
