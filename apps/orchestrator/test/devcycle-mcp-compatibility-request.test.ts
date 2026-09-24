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

  it("renders one bounded MCP call contract with host integration boundaries", () => {
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "FEAT-Z",
      featurePath: "/memory/feature-z",
      operation: "refineFeature",
    });
    const prompt = renderDevCycleMcpCompatibilityPrompt(request);

    expect(prompt).toContain('server: "devcycle-mcp"');
    expect(prompt).toContain('tool: "refine-feature"');
    expect(prompt).toContain("Call this MCP recipe tool exactly once");
    expect(prompt).toContain('status == "pending_execution"');
    expect(prompt).toContain("execute the returned instructions locally");
    expect(prompt).toContain("selected workflow mode");
    expect(prompt).toContain("The MCP response is the sole source of workflow procedure and gate instructions");
    expect(prompt).not.toContain("Phase 0");
  });

  it.each(["designFeature", "refineFeature", "startImplementing", "continueImplementing", "completeFeature"] as const)(
    "delegates %s procedures to MCP without copying workflow policies", operation => {
      const request = createDevCycleMcpCompatibilityRequest({ autonomous: true, featureId: "FEAT-R", featurePath: "/memory/feature-r", operation });
      const prompt = renderDevCycleMcpCompatibilityPrompt(request);
      expect(prompt).toContain(`tool: "${request.toolName}"`);
      expect(prompt).toContain(JSON.stringify(request.arguments));
      for (const duplicated of ["collective-verification/v2", "project-test-plan-authoring/v1", "acceptance-responsibility/v1", "Logical acceptance coverage:", "Deep-Dive owns clarification", "configured gate that prints any warning", "HEPHA_MANUAL_TEST_DEFERRAL_V1"]) {
        expect(prompt).not.toContain(duplicated);
      }
      expect(Buffer.byteLength(prompt)).toBeLessThan(4000);
    },
  );

  it("includes deterministic provider diagnostics when repairing existing refinement artifacts", () => {
    const prompt = renderDevCycleMcpCompatibilityPrompt(createDevCycleMcpCompatibilityRequest({
      autonomous: true,
      featureId: "FEAT-R",
      featurePath: "/memory/feature-r",
      operation: "refineFeature",
    }), [
      "[MANUAL_TEST_TRACEABILITY_MISMATCH] ManualTestObligations.json: taskId must bind exactly once",
    ]);

    expect(prompt).toContain("HEPHA found these deterministic validation errors");
    expect(prompt).toContain("[MANUAL_TEST_TRACEABILITY_MISMATCH] ManualTestObligations.json");
    expect(prompt).toContain("Repair every item before reporting COMPLETED");
  });

  it("preserves transport errors and the selected mode without substituting native recipes", () => {
    const prompt = renderDevCycleMcpCompatibilityPrompt(createDevCycleMcpCompatibilityRequest({ autonomous: true, featureId: "FEAT-C", featurePath: "/memory/feature-c", operation: "continueImplementing" }));
    expect(prompt).toContain('"workflow_mode":"autonomous"');
    expect(prompt).toContain("blocking failure");
    expect(prompt).toContain("do not substitute native Hepha instructions");
  });
});
