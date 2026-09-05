import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hydrateWorkItemRelations } from "../src/application/work-items/work-item-relation-hydrator.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-work-item-relation-hydration.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const projectCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/project-work-item-applications.ts", import.meta.url)), "utf8");
const epicSynchronizationSource = readFileSync(
  fileURLToPath(new URL("../src/application/epics/epic-state-synchronization-application.ts", import.meta.url)),
  "utf8",
);

describe("generic work-item relation hydration Gherkin integration", () => {
  it("specifies reverse, missing, and fallback relationships without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds work-item queries and EPIC synchronization to the extracted relation policy", () => {
    expect(hydrateWorkItemRelations).toBeTypeOf("function");
    expect(projectCompositionSource).toContain("hydrateRelations: hydrateWorkItemRelations");
    expect(epicSynchronizationSource).toContain("resolveFeatureParentEpicIds(currentFeature)");
    expect(orchestratorSource).not.toContain("function hydrateWorkItemRelations");
    expect(orchestratorSource).not.toContain("function toWorkItemRelation");
  });
});
