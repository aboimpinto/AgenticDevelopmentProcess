import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { EpicDeliveryState, WorkItemCard } from "@hepha/shared";
import {
  buildFeatStatusSnapshots,
  buildMermaidNodeMapping,
  computeProgressCounts,
  computeProgressPercent,
  deriveEpicStateFromFeatureStateFolders,
  deriveEpicStateFromSnapshots,
  syncEpicLifecycleRegions,
  upsertEpicState,
} from "../../epic-state.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { resolveFeatureParentEpicIds } from "../work-items/work-item-relation-hydrator.js";

interface EpicStateSynchronizationDependencies {
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
}

export class EpicStateSynchronizationApplication {
  constructor(private readonly dependencies: EpicStateSynchronizationDependencies) {}

  async syncLinkedForFeature(project: StoredProject, feature: WorkItemCard): Promise<void> {
    const workItems = await this.dependencies.scanProject(project);
    const currentFeature = workItems.find(
      (item) => item.kind === "feature" && item.externalId === feature.externalId,
    ) ?? feature;
    const linkedEpicIds = new Set(resolveFeatureParentEpicIds(currentFeature));

    for (const item of workItems) {
      if (item.kind === "epic" && item.linkedFeatureIds.includes(currentFeature.externalId)) {
        linkedEpicIds.add(item.externalId);
      }
    }

    for (const epicId of linkedEpicIds) {
      const epic = workItems.find((item) => item.kind === "epic" && item.externalId === epicId);
      if (epic) this.syncEpic(epic, workItems);
    }
  }

  syncEpic(epic: WorkItemCard, workItems: WorkItemCard[]): boolean {
    if (epic.kind !== "epic" || !epic.documentPath || !existsSync(epic.documentPath)) return false;

    const snapshots = buildFeatStatusSnapshots(epic.linkedFeatureIds, workItems);
    const ambiguousSnapshots = snapshots.filter((snapshot) => snapshot.ambiguousState);
    if (ambiguousSnapshots.length > 0) {
      const featureStateFolders = epic.linkedFeatureIds
        .map((featureId) => workItems.find(
          (item) => item.kind === "feature" && item.externalId === featureId,
        ))
        .filter((feature): feature is WorkItemCard => Boolean(feature))
        .map((feature) => feature.stateFolder);
      return writeEpicState(
        epic,
        deriveEpicStateFromFeatureStateFolders(featureStateFolders, epic.missingFeatureIds.length > 0),
      );
    }

    const derivedState = deriveEpicStateFromSnapshots(snapshots);
    const counts = computeProgressCounts(snapshots);
    const progressPercent = computeProgressPercent(counts);
    const markdown = readFileSync(epic.documentPath, "utf8");
    const mermaidMapping = buildMermaidNodeMapping(markdown, epic.linkedFeatureIds);
    const result = syncEpicLifecycleRegions(
      markdown,
      snapshots,
      counts,
      derivedState,
      progressPercent,
      mermaidMapping,
    );

    if (result.changed && result.blockers.length === 0) {
      writeFileSync(epic.documentPath, result.markdown, "utf8");
      return true;
    }
    return false;
  }
}

export function writeEpicState(epic: WorkItemCard, nextState: EpicDeliveryState): boolean {
  if (epic.kind !== "epic" || !epic.documentPath || !existsSync(epic.documentPath)) return false;
  const markdown = readFileSync(epic.documentPath, "utf8");
  const nextMarkdown = upsertEpicState(markdown, nextState);
  if (nextMarkdown === markdown) return false;
  writeFileSync(epic.documentPath, nextMarkdown, "utf8");
  return true;
}
