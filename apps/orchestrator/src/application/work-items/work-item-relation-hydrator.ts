import type { WorkItemCard, WorkItemRelation } from "@hepha/shared";
import { extractFeatureParentEpicIds } from "../../work-item-links.js";

export function hydrateWorkItemRelations(items: WorkItemCard[]): WorkItemCard[] {
  const relationByExternalId = new Map(items.map((item) => [item.externalId, toWorkItemRelation(item)]));
  const featureItems = items.filter((item) => item.kind === "feature");
  const featureIds = new Set(featureItems.map((feature) => feature.externalId));

  return items.map((item) => {
    const linkedEpicIds = new Set(item.linkedEpicIds);
    const linkedFeatureIds = new Set(item.linkedFeatureIds);

    if (item.kind === "epic") {
      for (const feature of featureItems) {
        if (resolveFeatureParentEpicIds(feature).includes(item.externalId)) {
          linkedFeatureIds.add(feature.externalId);
        }
      }
    }

    return {
      ...item,
      linkedEpicIds: [...linkedEpicIds].sort(),
      linkedEpics: [...linkedEpicIds]
        .map((externalId) => relationByExternalId.get(externalId))
        .filter(isWorkItemRelation)
        .sort(compareRelations),
      linkedFeatureIds: [...linkedFeatureIds].sort(),
      linkedFeatures: [...linkedFeatureIds]
        .map((externalId) => relationByExternalId.get(externalId))
        .filter(isWorkItemRelation)
        .sort(compareRelations),
      missingFeatureIds: item.kind === "epic"
        ? [...linkedFeatureIds].filter((externalId) => !featureIds.has(externalId)).sort()
        : [],
    };
  });
}

export function resolveFeatureParentEpicIds(feature: WorkItemCard): string[] {
  const parentEpicIds = extractFeatureParentEpicIds(feature.specMarkdown);
  return parentEpicIds.length > 0 ? parentEpicIds : feature.linkedEpicIds;
}

export function toWorkItemRelation(item: WorkItemCard): WorkItemRelation {
  return {
    externalId: item.externalId,
    id: item.id,
    kind: item.kind,
    stateFolder: item.stateFolder,
    stateLabel: item.stateLabel,
    title: item.title,
  };
}

function isWorkItemRelation(value: WorkItemRelation | undefined): value is WorkItemRelation {
  return Boolean(value);
}

function compareRelations(left: WorkItemRelation, right: WorkItemRelation) {
  return left.externalId.localeCompare(right.externalId);
}
