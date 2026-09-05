import type { WorkItemCard } from "@hepha/shared";
import {
  buildUnnamedFeatureDiscoveryPrompt,
  parseDiscoveredFeatures,
  type PlannedFeature,
} from "../../feature-extraction.js";

export interface UnnamedFeatureDiscoveryDependencies {
  choosePlanningModel(): import("@hepha/shared").HandoffPlanV1;
  runPrompt(prompt: string, plan: import("@hepha/shared").HandoffPlanV1): Promise<string>;
}

/** Discovers only EPIC feature slices not represented by an existing feature card. */
export class UnnamedFeatureDiscoveryApplication {
  constructor(private readonly dependencies: UnnamedFeatureDiscoveryDependencies) {}

  async discover(epic: WorkItemCard, workItems: readonly WorkItemCard[]): Promise<PlannedFeature[]> {
    const existingFeatures = workItems
      .filter((item) => item.kind === "feature")
      .map((item) => ({
        externalId: item.externalId,
        summary: item.summary,
        title: item.title,
      }));
    const plan = this.dependencies.choosePlanningModel();
    const prompt = buildUnnamedFeatureDiscoveryPrompt({
      epicId: epic.externalId,
      epicMarkdown: epic.specMarkdown,
      epicTitle: epic.title,
      existingFeatures,
    });

    return parseDiscoveredFeatures(await this.dependencies.runPrompt(prompt, plan));
  }
}
