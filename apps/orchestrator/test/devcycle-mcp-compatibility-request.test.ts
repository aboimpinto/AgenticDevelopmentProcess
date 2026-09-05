import { describe, expect, it } from "vitest";
import {
  createDevCycleMcpCompatibilityRequest,
  renderDevCycleMcpCompatibilityPrompt,
} from "../src/workflows/recipes/devcycle-mcp-compatibility-request.js";

describe("DevCycle MCP compatibility request", () => {
  it("maps Start Implementing to the legacy start-feature tool with autonomous mode", () => {
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "FEAT-X",
      featurePath: "/memory/feature-x",
      operation: "startImplementing",
    });

    expect(request).toEqual({
      agentAction: "start-feature",
      arguments: {
        feature_id: "FEAT-X",
        feature_path: "/memory/feature-x",
        workflow_mode: "autonomous",
      },
      command: "start-implementing",
      operation: "startImplementing",
      prefixedToolName: "devcycle_mcp_start-feature",
      serverName: "devcycle-mcp",
      toolName: "start-feature",
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.arguments)).toBe(true);
  });

  it("maps a non-autonomous continuation to explicit single-phase mode", () => {
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: false,
      featureId: "FEAT-Y",
      featurePath: "/memory/feature-y",
      operation: "continueImplementing",
    });

    expect(request.toolName).toBe("continue-implementation");
    expect(request.arguments).toHaveProperty("workflow_mode", "single_phase");
  });

  it("renders one bounded MCP call contract with Hepha lifecycle invariants", () => {
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "FEAT-Z",
      featurePath: "/memory/feature-z",
      operation: "refineFeature",
    });
    const prompt = renderDevCycleMcpCompatibilityPrompt(request);

    expect(prompt).toContain('server: "devcycle-mcp"');
    expect(prompt).toContain('tool: "devcycle_mcp_refine-feature"');
    expect(prompt).toContain("Call this MCP recipe tool exactly once");
    expect(prompt).toContain('status == "pending_execution"');
    expect(prompt).toContain("execute the returned instructions locally");
    expect(prompt).toContain("selected workflow mode");
    expect(prompt).toContain("The MCP response supplies the recipe; Hepha retains lifecycle invariants");
    expect(prompt).not.toContain("Phase 0");
  });

  it("forbids Refine Feature from publishing deferred human decisions", () => {
    const prompt = renderDevCycleMcpCompatibilityPrompt(createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "FEAT-R",
      featurePath: "/memory/feature-r",
      operation: "refineFeature",
    }));

    expect(prompt).toContain("Deep-Dive owns clarification");
    expect(prompt).toContain("MUST NOT create human-sign-off");
    expect(prompt).toContain("before publishing any refinement artifacts");
    expect(prompt).toContain("linked or contextual documents must not block the target feature");
    expect(prompt).toContain("documentation-only planning action");
    expect(prompt).toContain("Do not execute package-manager, compiler, build, test, lint, audit, dependency-search, or version-probe commands");
    expect(prompt).toContain("Discover technology and configured commands statically");
    expect(prompt).toContain("Do not modify product implementation repositories during refinement");
    expect(prompt).toContain("AUTOMATABLE or MANUAL_TEST_REQUIRED");
    expect(prompt).toContain("ManualTestObligations.json");
    expect(prompt).toContain("This test cannot be automated and the user needs to test it manually.");
  });

  it("gives autonomous continuation delegated authority instead of human approval stops", () => {
    const prompt = renderDevCycleMcpCompatibilityPrompt(createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "FEAT-C",
      featurePath: "/memory/feature-c",
      operation: "continueImplementing",
    }));

    expect(prompt).toContain("NEVER stop to request human sign-off");
    expect(prompt).toContain("delegated decision authority");
    expect(prompt).toContain("treat it as a refinement defect");
    expect(prompt).toContain("automated code review and phase acceptance");
    expect(prompt).toContain("Apply stack-specific execution constraints only when refinement activated them");
    expect(prompt).toContain("FeatureTasks.md and the active phase file");
    expect(prompt).not.toContain("Cargo discipline is turn-scoped and mandatory");
    expect(prompt).toContain("A configured gate that prints any warning is RED");
    expect(prompt).toContain("Never classify a warning as pre-existing, benign, accepted, or green");
    expect(prompt).toContain("Implementation completion and release readiness are independent outcomes");
    expect(prompt).toContain("Out-of-scope or external release dependencies are non-blocking implementation findings");
    expect(prompt).toContain("Only an in-scope task or configured executable gate");
    expect(prompt).toContain("do not stop implementation or leave the phase incomplete");
    expect(prompt).toContain("HEPHA_MANUAL_TEST_DEFERRAL_V1");
    expect(prompt).toContain("Hepha owns SKIPPED persistence");
  });
});
