import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorkItemCardKey } from "../src/application/work-items/work-item-card-key-policy.js";

const featurePath = fileURLToPath(new URL("./generic-work-item-card-key.feature", import.meta.url));
const policyPath = fileURLToPath(new URL(
  "../src/application/work-items/work-item-card-key-policy.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const projectCompositionPath = fileURLToPath(new URL("../src/bootstrap/project-work-item-applications.ts", import.meta.url));

describe("generic work-item card key Gherkin integration", () => {
  it("binds every scenario to the canonical production policy", () => {
    const specification = readFileSync(featurePath, "utf8");
    const policy = readFileSync(policyPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const projectComposition = readFileSync(projectCompositionPath, "utf8");

    expect(specification.match(/^  Scenario:/gm)).toHaveLength(2);
    expect(specification).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(policy).toContain("externalId.toUpperCase()");
    expect(projectComposition).toContain("createCardKey: createWorkItemCardKey");
    expect(orchestrator).not.toContain("function createCardKey");
    expect(typeof createWorkItemCardKey).toBe("function");
  });
});
