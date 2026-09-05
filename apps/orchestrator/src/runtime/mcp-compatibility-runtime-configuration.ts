import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePathInput } from "../path-input.js";

export interface McpCompatibilityRuntimeConfiguration {
  readonly configPath: string;
  readonly extensionPath: string;
}

/** Resolves the workspace-scoped Pi adapter only when an MCP recipe source is enabled. */
export function resolveMcpCompatibilityRuntimeConfiguration(input: {
  readonly enabled: boolean;
  readonly environment: NodeJS.ProcessEnv;
  readonly pathExists?: (path: string) => boolean;
  readonly workspaceRoot: string;
}): McpCompatibilityRuntimeConfiguration | null {
  if (!input.enabled) return null;
  const pathExists = input.pathExists ?? existsSync;
  const sharedWorkspaceRoot = resolve(input.workspaceRoot, "..");
  const configPath = resolveConfiguredPath(
    input.environment.HEPHA_DEV_CYCLE_MCP_CONFIG_PATH,
    resolve(sharedWorkspaceRoot, ".mcp.json"),
    input.workspaceRoot,
  );
  const extensionPath = resolveConfiguredPath(
    input.environment.HEPHA_MCP_ADAPTER_EXTENSION_PATH,
    resolve(sharedWorkspaceRoot, ".pi", "npm", "node_modules", "pi-mcp-adapter"),
    input.workspaceRoot,
  );
  if (!pathExists(configPath)) {
    throw new Error(`MCP_COMPATIBILITY_CONFIG_MISSING: ${configPath}`);
  }
  if (!pathExists(extensionPath)) {
    throw new Error(`MCP_COMPATIBILITY_EXTENSION_MISSING: ${extensionPath}`);
  }
  return Object.freeze({ configPath, extensionPath });
}

function resolveConfiguredPath(value: string | undefined, fallback: string, basePath: string): string {
  return value?.trim() ? resolvePathInput(value.trim(), { basePath }) : fallback;
}
