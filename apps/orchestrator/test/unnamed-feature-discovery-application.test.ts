import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import { UnnamedFeatureDiscoveryApplication } from "../src/application/epics/unnamed-feature-discovery-application.js";

const epic = {
  externalId: "PARENT-X",
  kind: "epic",
  specMarkdown: "# Parent capability\n\nA missing delivery slice is described here.",
  title: "Parent capability",
} as WorkItemCard;

describe("unnamed feature discovery application", () => {
  it("selects the planning model and supplies only existing features as duplicate context", async () => {
    let invocation: { model: string; prompt: string } | null = null;
    const application = new UnnamedFeatureDiscoveryApplication({
      choosePlanningModel: () => "planning-model",
      runPrompt: async (prompt, model) => {
        invocation = { model, prompt };
        return JSON.stringify({
          features: [{
            acceptanceCriteria: ["The result is observable"],
            description: "Deliver the missing capability slice.",
            title: "Missing capability slice",
          }],
        });
      },
    });

    const result = await application.discover(epic, [
      epic,
      { externalId: "CHILD-X", kind: "feature", summary: "Existing scope", title: "Existing slice" } as WorkItemCard,
      { externalId: "NOTE-X", kind: "epic", summary: "Not a feature", title: "Another parent" } as WorkItemCard,
    ]);

    expect(invocation).toEqual(expect.objectContaining({ model: "planning-model" }));
    expect(invocation?.prompt).toContain("CHILD-X: Existing slice - Existing scope");
    expect(invocation?.prompt).not.toContain("NOTE-X");
    expect(result).toEqual([{
      acceptanceCriteria: ["The result is observable"],
      dependencyIds: [],
      description: "Deliver the missing capability slice.",
      priority: null,
      title: "Missing capability slice",
    }]);
  });

  it("returns no candidates when the model reports that all slices are represented", async () => {
    const application = new UnnamedFeatureDiscoveryApplication({
      choosePlanningModel: () => "planner",
      runPrompt: async () => '{"features":[]}',
    });

    await expect(application.discover(epic, [])).resolves.toEqual([]);
  });
});
