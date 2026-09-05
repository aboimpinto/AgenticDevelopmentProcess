import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-project-work-item-application-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/project-work-item-applications.ts", import.meta.url)), "utf8");

describe("generic project work-item application composition Gherkin integration", () => {
  it("specifies identity-blind query, relationship, and manual verification paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds project-facing constructors to one cohesive root factory call", () => {
    expect(root).toContain("createProjectWorkItemApplications({");
    expect(root).not.toContain("new WorkItemQueryApplication");
    expect(root).not.toContain("new ProjectRegistry");
    expect(root).not.toContain("new ManualTestVerificationApplication");
    expect(composition).toContain("new WorkItemQueryApplication");
    expect(composition).toContain("new ProjectRegistry");
    expect(composition).toContain("new ManualTestVerificationApplication");
    expect(composition).toContain("new FeatureEpicLinkApplication");
  });
});
