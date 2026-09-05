import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getEpicCompletionBlockers } from "../src/application/epics/epic-completion-application.js";

const featurePath = fileURLToPath(new URL("./generic-epic-completion.feature", import.meta.url));

describe("generic aggregate completion Gherkin integration", () => {
  it("rejects ambiguous lifecycle state through production policy", () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const epic = { kind: "epic", linkedFeatureIds: ["WORK"] } as WorkItemCard;
    const left = { kind: "feature", externalId: "WORK", stateFolder: "03_IN_PROGRESS" } as WorkItemCard;
    const right = { kind: "feature", externalId: "WORK", stateFolder: "04_COMPLETED" } as WorkItemCard;
    expect(getEpicCompletionBlockers(epic, [left, right])).toEqual([
      "Ambiguous linked FEAT states: WORK (03_IN_PROGRESS, 04_COMPLETED).",
    ]);
  });
});
