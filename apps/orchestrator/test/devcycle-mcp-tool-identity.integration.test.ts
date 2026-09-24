import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  createDevCycleMcpCompatibilityRequest,
  renderDevCycleMcpCompatibilityPrompt,
} from "../src/workflows/recipes/devcycle-mcp-compatibility-request.js";

// These are original names advertised by the recipe server, independent of
// HEPHA's mapping and of the gateway's configurable display prefixes.
const operations = [
  ["designFeature", "design-feature", false],
  ["refineFeature", "refine-feature", false],
  ["startImplementing", "start-feature", true],
  ["continueImplementing", "continue-implementation", true],
  ["completeFeature", "complete-feature", true],
] as const;
const displayPrefixes = ["devcycle-mcp_", "devcycle_", "", "mcp__devcycle-mcp_"];

describe("MCP tool identity boundary (AC1, AC2, AC3)", () => {
  it.each(operations)("dispatches %s using its server-scoped original name", (operation, originalName, hasMode) => {
    for (const prefix of displayPrefixes) {
      for (const autonomous of [false, true]) {
        const recipe = vi.fn((_args: Record<string, string>) => ({
          structuredContent: {
            status: "pending_execution", action: "execute_procedure",
            execution_owner: "client_llm", retry_same_tool: false,
          },
        }));
        const wrongServerRecipe = vi.fn();
        const servers = new Map([
          ["other-server", [{ name: `${prefix}${originalName}`, originalName, call: wrongServerRecipe }]],
          ["devcycle-mcp", [{ name: `${prefix}${originalName}`, originalName, call: recipe }]],
        ]);
        // Strict gateway contract: exact displayed or original name scoped to
        // the requested server. No punctuation repair or model-side guessing.
        const mcp = vi.fn((input: { server: string; tool: string; args: Record<string, string> }) => {
          const tools = servers.get(input.server) ?? [];
          const tool = tools.find(item => item.name === input.tool || item.originalName === input.tool);
          if (!tool) throw new Error("MCP_TOOL_NOT_FOUND");
          return tool.call(input.args);
        });
        const prompt = renderDevCycleMcpCompatibilityPrompt(createDevCycleMcpCompatibilityRequest({
          autonomous, featureId: "FEAT-X", featurePath: "/memory/feature-x", operation,
        }));
        const invocation = prompt.match(/```js\n(mcp\([^\n]+\))\n```/)?.[1];
        expect(invocation).toBeDefined();
        const result = runInNewContext(invocation!, { mcp }, { timeout: 1000 });
        const args = {
          feature_id: "FEAT-X", feature_path: "/memory/feature-x",
          ...(hasMode ? { workflow_mode: autonomous ? "autonomous" : "single_phase" } : {}),
        };
        expect(mcp).toHaveBeenCalledExactlyOnceWith({ server: "devcycle-mcp", tool: originalName, args });
        expect(recipe).toHaveBeenCalledExactlyOnceWith(args);
        expect(wrongServerRecipe).not.toHaveBeenCalled();
        expect(result.structuredContent.status).toBe("pending_execution");
        expect(prompt).toContain("an unavailable tool, or a missing execution contract as a blocking failure");
        expect(prompt).toContain("Do not retry the same recipe call");
      }
    }
  });
});
