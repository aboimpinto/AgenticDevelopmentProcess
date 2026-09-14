import type { WorkItemCard } from "@hepha/shared";
import type { CardMetadataStore } from "@hepha/db";
import type { StoredProject } from "../../projects/stored-project.js";
import { createWorkItemCardKey } from "../work-items/work-item-card-key-policy.js";
import { resolve } from "node:path";

export function completionSourceOptions(feature: WorkItemCard, items: WorkItemCard[]) {
  const epic = items.find(item => item.kind === "epic" && feature.linkedEpicIds[0] === item.externalId);
  return { featDescriptionPath: feature.documentPath ?? resolve(feature.folderPath, "FeatureDescription.md"), epicDescriptionPath: epic?.documentPath ?? null, epicAcceptanceTestsPath: null, gherkinPaths: [] };
}

export function completionRecoveryContext(project: StoredProject, feature: WorkItemCard, items: WorkItemCard[], store: CardMetadataStore) {
  const epic = items.find((item) => item.kind === "epic" && feature.linkedEpicIds[0] === item.externalId);
  return {
    context: { projectRoot: project.rootPath, projectId: project.id, cardKey: createWorkItemCardKey("feature", feature.externalId),
      featExternalId: feature.externalId, featTitle: feature.title, epicExternalId: epic?.externalId ?? null, featFolderPath: feature.folderPath, store },
    sourceOptions: completionSourceOptions(feature, items),
  };
}
