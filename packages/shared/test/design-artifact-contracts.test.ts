import { describe, expect, it } from "vitest";
import {
  designArtifactDefinitions,
  isDesignArtifactFileName,
} from "../src/work-items/design-artifact-contracts.js";

describe("design artifact contracts", () => {
  it("defines the complete Design Feature output set once", () => {
    expect(designArtifactDefinitions.map(({ fileName }) => fileName)).toEqual([
      "UX-research-report.md",
      "Wireframes-design.md",
      "design-summary.md",
    ]);
  });

  it("accepts only contracted artifact file names", () => {
    expect(isDesignArtifactFileName("design-summary.md")).toBe(true);
    expect(isDesignArtifactFileName("FeatureDescription.md")).toBe(false);
    expect(isDesignArtifactFileName("../design-summary.md")).toBe(false);
  });
});
