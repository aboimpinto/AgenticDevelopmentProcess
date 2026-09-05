import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-feature-projection-application-composition.feature", import.meta.url)),
  "utf8",
);
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-projection-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic feature projection application composition Gherkin integration", () => {
  it("specifies identity-blind artifact and presentation paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds artifact policies and workflow projectors to one root factory call", () => {
    expect(root).toContain("createFeatureProjectionApplications({");
    expect(root).not.toContain("new FeatureWorkflowSummaryProjector");
    expect(root).not.toContain("new RefinementArtifactPolicy");
    expect(composition).toContain("new FeatureWorkflowSummaryProjector");
    expect(composition).toContain("new FeatureWorkflowProgressProjector");
    expect(composition).toContain("new DesignArtifactPolicy");
    expect(composition).toContain("new RefinementArtifactPolicy");
    expect(composition).toContain("new StartFeatureTimingPolicy");
  });
});
