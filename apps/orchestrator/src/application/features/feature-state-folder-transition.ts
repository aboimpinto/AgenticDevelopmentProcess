import { existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

/** Moves feature folders across the reversible Ready/In-Progress lifecycle boundary. */
export class FeatureStateFolderTransition {
  moveToInProgress(project: StoredProject, feature: WorkItemCard) {
    if (feature.stateFolder === "03_IN_PROGRESS") {
      return feature.folderPath;
    }

    if (feature.stateFolder !== "02_READY_TO_DEVELOP") {
      throw new Error("Only READY FEATs can be moved to In Progress.");
    }

    return moveFeatureFolder(project, feature, "03_IN_PROGRESS", "In Progress");
  }

  moveBackToReady(project: StoredProject, feature: WorkItemCard) {
    if (feature.stateFolder === "02_READY_TO_DEVELOP") {
      return feature.folderPath;
    }

    if (feature.stateFolder !== "03_IN_PROGRESS") {
      throw new Error("Only IN_PROGRESS FEATs can be rolled back to Ready To Develop.");
    }

    return moveFeatureFolder(project, feature, "02_READY_TO_DEVELOP", "Ready To Develop");
  }
}

function moveFeatureFolder(
  project: StoredProject,
  feature: WorkItemCard,
  targetState: "02_READY_TO_DEVELOP" | "03_IN_PROGRESS",
  targetLabel: string,
) {
  const targetPath = resolve(project.memoryBankPath, "Features", targetState, basename(feature.folderPath));

  if (existsSync(targetPath)) {
    throw new Error(`${targetLabel} folder already exists: ${targetPath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  renameSync(feature.folderPath, targetPath);

  return targetPath;
}
