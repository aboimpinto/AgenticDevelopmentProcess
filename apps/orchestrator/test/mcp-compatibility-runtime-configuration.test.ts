import { describe, expect, it } from "vitest";
import { resolveMcpCompatibilityRuntimeConfiguration } from "../src/runtime/mcp-compatibility-runtime-configuration.js";

describe("MCP compatibility runtime configuration", () => {
  it("does not require adapter files while native Hepha owns recipes", () => {
    expect(resolveMcpCompatibilityRuntimeConfiguration({
      enabled: false,
      environment: {},
      pathExists: () => false,
      workspaceRoot: "/workspace/hepha",
    })).toBeNull();
  });

  it("returns validated explicit adapter and endpoint configuration paths", () => {
    const paths = new Set(["/config/mcp.json", "/extensions/pi-mcp-adapter"]);
    expect(resolveMcpCompatibilityRuntimeConfiguration({
      enabled: true,
      environment: {
        HEPHA_DEV_CYCLE_MCP_CONFIG_PATH: "/config/mcp.json",
        HEPHA_MCP_ADAPTER_EXTENSION_PATH: "/extensions/pi-mcp-adapter",
      },
      pathExists: (path) => paths.has(path),
      workspaceRoot: "/workspace/hepha",
    })).toEqual({
      configPath: "/config/mcp.json",
      extensionPath: "/extensions/pi-mcp-adapter",
    });
  });

  it("fails before a worker starts when an enabled MCP runtime asset is absent", () => {
    expect(() => resolveMcpCompatibilityRuntimeConfiguration({
      enabled: true,
      environment: {
        HEPHA_DEV_CYCLE_MCP_CONFIG_PATH: "/missing/mcp.json",
        HEPHA_MCP_ADAPTER_EXTENSION_PATH: "/extensions/pi-mcp-adapter",
      },
      pathExists: (path) => path === "/extensions/pi-mcp-adapter",
      workspaceRoot: "/workspace/hepha",
    })).toThrow("MCP_COMPATIBILITY_CONFIG_MISSING");
  });
});
