import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createFeatureRecipeSourcePolicy } from "../src/workflows/recipes/feature-recipe-source-policy.js";
import { createDevCycleMcpCompatibilityRequest } from "../src/workflows/recipes/devcycle-mcp-compatibility-request.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-devcycle-mcp-compatibility.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const compatibilityApplication = readFileSync(fileURLToPath(new URL("../src/workflows/recipes/devcycle-mcp-compatibility-application.ts", import.meta.url)), "utf8");
const implementationWorker = readFileSync(fileURLToPath(new URL("../src/workflows/phases/implementation-worker-application.ts", import.meta.url)), "utf8");

describe("generic DevCycle MCP compatibility Gherkin integration", () => {
  it("defines identity-blind recipe-source behavior", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(10);
    expect(feature).toContain("human sign-off and owner-attestation tasks are rejected");
    expect(feature).toContain("External release findings do not block implementation completion");
    expect(feature).toContain("release readiness records the external dependency separately");
    expect(feature).toContain("target product workspace contains Cargo.toml");
    expect(feature).toContain("does not invent Cargo instructions");
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+/i);
  });

  it("binds MCP implementation telemetry to lifecycle phase and command-model facts", () => {
    expect(compatibilityApplication).toContain("selectExecutionPhase(input.request.operation, feature)");
    expect(compatibilityApplication).toContain("phaseNumber: phase?.number ?? null");
    expect(implementationWorker).toContain("input.plan.resolvedRoute.route.modelId");
  });

  it("binds explicit source selection to an immutable action request", () => {
    const policy = createFeatureRecipeSourcePolicy({ HEPHA_FEATURE_RECIPE_SOURCE: "devcycle-mcp" });
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "feature-id",
      featurePath: "/feature",
      operation: "designFeature",
    });

    expect(policy.sourceFor(request.operation)).toBe("devcycle-mcp");
    expect(Object.isFrozen(request)).toBe(true);
    expect(root).toContain("createFeatureRecipeSourceApplications({");
    expect(root).toContain("...featureRecipeActionRoutes");
  });
});
