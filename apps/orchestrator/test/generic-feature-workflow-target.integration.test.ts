import type { WorkItemCard } from "@hepha/shared";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FeatureWorkflowTargetResolver } from "../src/application/features/feature-workflow-target-resolver.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-feature-workflow-target.feature", import.meta.url));

describe("generic feature-workflow target Gherkin integration", () => {
  it("binds generic target scenarios", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Marker-free changes do not require another Deep-Dive");
    expect(feature).toContain("Scenario: Cancellation can target any running work-item kind");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
  });

  it("allows preparation and implementation when no validation markers remain", async () => {
    const project = { id: "project" } as StoredProject;
    const workItem = { id: "card", externalId: "WORK", kind: "feature", documentPath: "/doc", specMarkdown: "source", validation: { deepDiveStatus: "stale", needsValidationCount: 0 } } as WorkItemCard;
    const resolver = new FeatureWorkflowTargetResolver({ findProject: () => project, scanProject: async () => [workItem] });
    await expect(resolver.resolveImplementation({ projectId: "project", cardId: "card" })).resolves.toEqual(expect.objectContaining({ feature: workItem }));
    await expect(resolver.resolveWorkflow({ projectId: "project", cardId: "card" })).resolves.toEqual(expect.objectContaining({ feature: workItem }));
  });
});
