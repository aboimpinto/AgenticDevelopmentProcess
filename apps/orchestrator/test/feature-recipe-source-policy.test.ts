import { describe, expect, it } from "vitest";
import {
  createFeatureRecipeSourcePolicy,
  featureRecipeOperations,
} from "../src/workflows/recipes/feature-recipe-source-policy.js";

describe("feature recipe source policy", () => {
  it("keeps every supported action on native Hepha by default", () => {
    const policy = createFeatureRecipeSourcePolicy({});

    expect(featureRecipeOperations.map((operation) => policy.sourceFor(operation)))
      .toEqual(featureRecipeOperations.map(() => "native-hepha"));
    expect(policy.usesDevCycleMcp).toBe(false);
  });

  it("switches the complete feature lifecycle to DevCycle MCP as one explicit compatibility mode", () => {
    const policy = createFeatureRecipeSourcePolicy({ HEPHA_FEATURE_RECIPE_SOURCE: "devcycle-mcp" });

    expect(featureRecipeOperations.map((operation) => policy.sourceFor(operation)))
      .toEqual(featureRecipeOperations.map(() => "devcycle-mcp"));
    expect(policy.usesDevCycleMcp).toBe(true);
  });

  it("allows one operation to override the global source without deriving behavior from feature or phase prose", () => {
    const policy = createFeatureRecipeSourcePolicy({
      HEPHA_FEATURE_RECIPE_SOURCE: "devcycle-mcp",
      HEPHA_REFINE_FEATURE_RECIPE_SOURCE: "native-hepha",
    });

    expect(policy.sourceFor("refineFeature")).toBe("native-hepha");
    expect(policy.sourceFor("continueImplementing")).toBe("devcycle-mcp");
  });

  it("rejects unknown recipe sources at construction", () => {
    expect(() => createFeatureRecipeSourcePolicy({ HEPHA_FEATURE_RECIPE_SOURCE: "automatic" }))
      .toThrow("FEATURE_RECIPE_SOURCE_INVALID");
  });
});
