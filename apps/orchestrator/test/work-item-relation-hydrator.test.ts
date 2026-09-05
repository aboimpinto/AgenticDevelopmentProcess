import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import {
  hydrateWorkItemRelations,
  resolveFeatureParentEpicIds,
  toWorkItemRelation,
} from "../src/application/work-items/work-item-relation-hydrator.js";

function card(
  externalId: string,
  kind: "epic" | "feature",
  overrides: Partial<WorkItemCard> = {},
): WorkItemCard {
  return {
    externalId,
    id: `card-${externalId}`,
    kind,
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    specMarkdown: "",
    stateFolder: "02_READY_TO_DEVELOP",
    stateLabel: "Ready",
    title: `Title ${externalId}`,
    ...overrides,
  } as WorkItemCard;
}

describe("work-item relation hydrator", () => {
  it("hydrates sorted relations, reverse EPIC children, and missing feature references", () => {
    const epic = card("EPIC-701", "epic", { linkedFeatureIds: ["FEAT-999"] });
    const laterFeature = card("FEAT-902", "feature", {
      linkedEpicIds: ["EPIC-701"],
      specMarkdown: "**Parent EPICs:** EPIC-701",
    });
    const earlierFeature = card("FEAT-901", "feature", {
      specMarkdown: "| Parent EPICs | EPIC-701 |",
    });

    const hydrated = hydrateWorkItemRelations([laterFeature, epic, earlierFeature]);
    const hydratedEpic = hydrated.find((item) => item.externalId === "EPIC-701")!;
    const hydratedFeature = hydrated.find((item) => item.externalId === "FEAT-902")!;

    expect(hydratedEpic.linkedFeatureIds).toEqual(["FEAT-901", "FEAT-902", "FEAT-999"]);
    expect(hydratedEpic.linkedFeatures.map((relation) => relation.externalId)).toEqual(["FEAT-901", "FEAT-902"]);
    expect(hydratedEpic.missingFeatureIds).toEqual(["FEAT-999"]);
    expect(hydratedFeature.linkedEpics).toEqual([expect.objectContaining({ externalId: "EPIC-701", kind: "epic" })]);
  });

  it("prefers explicit parent declarations and falls back to scanned links", () => {
    expect(resolveFeatureParentEpicIds(card("FEAT-901", "feature", {
      linkedEpicIds: ["EPIC-700"],
      specMarkdown: "Parent EPICs: EPIC-701",
    }))).toEqual(["EPIC-701"]);
    expect(resolveFeatureParentEpicIds(card("FEAT-901", "feature", {
      linkedEpicIds: ["EPIC-702"],
      specMarkdown: "No parent declaration",
    }))).toEqual(["EPIC-702"]);
  });

  it("projects only stable relation fields", () => {
    expect(toWorkItemRelation(card("WORK-A", "feature"))).toEqual({
      externalId: "WORK-A",
      id: "card-WORK-A",
      kind: "feature",
      stateFolder: "02_READY_TO_DEVELOP",
      stateLabel: "Ready",
      title: "Title WORK-A",
    });
  });
});
