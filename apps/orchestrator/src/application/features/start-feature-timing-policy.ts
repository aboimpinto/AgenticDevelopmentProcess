import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { normalizeImplementationPhaseStatus } from "../../workflows/phases/phase-lifecycle-policy.js";

const effortEstimatePattern = /^\s*(?:\d+(?:\.\d+)?\s*(?:m|h)?\s*-\s*)?\d+(?:\.\d+)?\s*(?:m|h)\s*$/i;

interface StartFeatureTimingPolicyDependencies {
  exists: (path: string) => boolean;
  read: (path: string) => string;
}

export class StartFeatureTimingPolicy {
  constructor(private readonly dependencies: StartFeatureTimingPolicyDependencies) {}

  assertComplete(feature: Pick<WorkItemCard, "folderPath" | "phases">): void {
    const incompletePhases = feature.phases
      .filter((phase) => phase.number !== null)
      .filter((phase) => normalizeImplementationPhaseStatus(phase.status) !== "SKIPPED")
      .filter((phase) =>
        !phase.estimatedHumanTime
        || !phase.estimatedAiTime
        || !effortEstimatePattern.test(phase.estimatedHumanTime)
        || !effortEstimatePattern.test(phase.estimatedAiTime),
      )
      .map((phase) => `Phase ${phase.number}`);
    if (incompletePhases.length > 0) {
      throw new Error(
        `Start Feature post-process did not write parseable Human and AI estimates for: ${incompletePhases.join(", ")}.`,
      );
    }

    const featureTasksPath = resolve(feature.folderPath, "FeatureTasks.md");
    const featureTasks = this.dependencies.exists(featureTasksPath)
      ? this.dependencies.read(featureTasksPath)
      : "";
    if (!/^##\s+Implementation Timing Summary\s*$/im.test(featureTasks)) {
      throw new Error("Start Feature post-process did not add the required Implementation Timing Summary to FeatureTasks.md.");
    }
  }
}
