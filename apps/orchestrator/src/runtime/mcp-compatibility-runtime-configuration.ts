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
  const configPath = resolveDevCycleRecipeConfigPath(input);
  const extensionPath = resolveConfiguredPath(
    input.environment.HEPHA_MCP_ADAPTER_EXTENSION_PATH,
    resolve(sharedWorkspaceRoot, ".pi", "npm", "node_modules", "pi-mcp-adapter"),
    input.workspaceRoot,
  );
  if (!pathExists(extensionPath)) {
    throw new Error(`MCP_COMPATIBILITY_EXTENSION_MISSING: ${extensionPath}`);
  }
  return Object.freeze({ configPath, extensionPath });
}

export function resolveDevCycleRecipeConfigPath(input: {
  environment: NodeJS.ProcessEnv; workspaceRoot: string; pathExists?: (path: string) => boolean;
}): string {
  const configPath = resolveConfiguredPath(input.environment.HEPHA_DEV_CYCLE_MCP_CONFIG_PATH,
    resolve(input.workspaceRoot, "..", ".mcp.json"), input.workspaceRoot);
  if (!(input.pathExists ?? existsSync)(configPath)) throw new Error(`MCP_COMPATIBILITY_CONFIG_MISSING: ${configPath}`);
  return configPath;
}

function resolveConfiguredPath(value: string | undefined, fallback: string, basePath: string): string {
  return value?.trim() ? resolvePathInput(value.trim(), { basePath }) : fallback;
}
