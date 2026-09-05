import type { AgentTask } from "@hepha/shared";
import type { PiJsonEvent } from "./pi-event-parser.js";

export interface PiModelSelection {
  readonly model: string;
  readonly provider: string;
}

export interface PiPromptRunOptions {
  cwd?: string;
  implementationProfile?: boolean;
  mcpProfile?: boolean;
  maxRuntimeMs?: number | null;
  onPiEvent?: (event: PiJsonEvent) => void;
  sessionFile?: string;
  stallTimeoutMs?: number;
  timeoutLabel?: string;
  /** Legacy caller-owned wall-clock maximum. Prefer maxRuntimeMs for new workflows. */
  timeoutMs?: number;
  workflowRunId?: string;
}

export interface PiImplementationProfileConfig {
  readonly env: NodeJS.ProcessEnv;
  readonly skillPaths: readonly string[];
  readonly mcpCompatibility?: {
    readonly configPath: string;
    readonly extensionPath: string;
  };
}

export function buildPiArgs(task: AgentTask, model: PiModelSelection): string[] {
  return [
    "--provider", model.provider,
    "--model", model.model,
    "--mode", "json",
    "--print",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--no-session",
    buildAgentPrompt(task),
  ];
}

export function buildPiPromptArgs(
  prompt: string,
  model: PiModelSelection,
  options: PiPromptRunOptions = {},
  config: PiImplementationProfileConfig,
): string[] {
  const args = [
    "--provider", model.provider,
    "--model", model.model,
    "--mode", "json",
    "--print",
  ];
  if (!options.implementationProfile) {
    args.push(
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-approve",
      "--no-session",
      prompt,
    );
    return args;
  }

  if (options.sessionFile) args.push("--session", options.sessionFile);
  if (options.mcpProfile) {
    if (!config.mcpCompatibility) throw new Error("MCP_COMPATIBILITY_RUNTIME_UNAVAILABLE");
    args.push(
      "--extension", config.mcpCompatibility.extensionPath,
      "--mcp-config", config.mcpCompatibility.configPath,
    );
  }
  if (config.env.HEPHA_PI_IMPLEMENTATION_DISABLE_TOOLS === "1") args.push("--no-tools");
  if (config.env.HEPHA_PI_IMPLEMENTATION_DISABLE_EXTENSIONS === "1") args.push("--no-extensions");
  if (config.env.HEPHA_PI_IMPLEMENTATION_DISABLE_SKILLS === "1") {
    args.push("--no-skills");
  } else {
    for (const skillPath of config.skillPaths) args.push("--skill", skillPath);
  }
  if (config.env.HEPHA_PI_IMPLEMENTATION_DISABLE_PROMPT_TEMPLATES === "1") {
    args.push("--no-prompt-templates");
  }
  if (config.env.HEPHA_PI_IMPLEMENTATION_DISABLE_CONTEXT_FILES === "1") {
    args.push("--no-context-files");
  }
  args.push("--no-themes", "--approve", prompt);
  return args;
}

export function buildAgentPrompt(task: AgentTask): string {
  return [
    `You are ${task.agent}, a local Hepha worker agent.`,
    "",
    "Return a direct, useful answer to the task prompt. Do not claim to edit files or run tools.",
    "If the prompt asks for actions that require tools, explain the limitation and provide the best next step.",
    "",
    `Task ID: ${task.id}`,
    `Task title: ${task.title}`,
    "",
    "User prompt:",
    task.prompt,
  ].join("\n");
}
