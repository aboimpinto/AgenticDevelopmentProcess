import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export function getFeatureLessonsLearnedPath(
  project: StoredProject,
  feature: Pick<WorkItemCard, "externalId">,
): string {
  return resolve(
    project.memoryBankPath,
    "LessonsLearned",
    `${feature.externalId.toLowerCase()}-lessons-learned.md`,
  );
}
