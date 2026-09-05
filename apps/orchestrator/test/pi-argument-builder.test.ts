import type { AgentTask } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  buildPiArgs,
  buildPiPromptArgs,
} from "../src/runtime/pi/pi-argument-builder.js";

const model = { model: "model", provider: "provider" };

describe("Pi argument builder", () => {
  it("builds a tool-free task invocation with explicit model routing", () => {
    const task = { agent: "Planner", id: "task-1", prompt: "Plan it", title: "Plan" } as AgentTask;
    const args = buildPiArgs(task, model);

    expect(args.slice(0, 6)).toEqual(["--provider", "provider", "--model", "model", "--mode", "json"]);
    expect(args).toContain("--no-tools");
    expect(args.at(-1)).toContain("Task ID: task-1");
    expect(buildAgentPrompt(task)).toContain("You are Planner");
  });

  it("builds the isolated default prompt profile", () => {
    expect(buildPiPromptArgs("prompt", model, {}, { env: {}, skillPaths: [] })).toEqual([
      "--provider", "provider", "--model", "model", "--mode", "json", "--print",
      "--no-tools", "--no-extensions", "--no-skills", "--no-prompt-templates",
      "--no-themes", "--no-context-files", "--no-approve", "--no-session", "prompt",
    ]);
  });

  it("builds an approved implementation profile with session and skills", () => {
    const args = buildPiPromptArgs(
      "prompt", model, { implementationProfile: true, sessionFile: "session.json" },
      { env: {}, skillPaths: ["/skills/one", "/skills/two"] },
    );

    expect(args).toEqual([
      "--provider", "provider", "--model", "model", "--mode", "json", "--print",
      "--session", "session.json",
      "--skill", "/skills/one", "--skill", "/skills/two",
      "--no-themes", "--approve", "prompt",
    ]);
  });

  it("loads the explicit MCP adapter and endpoint config only for an MCP compatibility worker", () => {
    const args = buildPiPromptArgs(
      "prompt", model, { implementationProfile: true, mcpProfile: true },
      {
        env: {},
        skillPaths: [],
        mcpCompatibility: {
          configPath: "/workspace/.mcp.json",
          extensionPath: "/workspace/.pi/npm/node_modules/pi-mcp-adapter",
        },
      },
    );

    expect(args).toEqual(expect.arrayContaining([
      "--extension", "/workspace/.pi/npm/node_modules/pi-mcp-adapter",
      "--mcp-config", "/workspace/.mcp.json",
    ]));
  });

  it("honors every implementation isolation toggle", () => {
    const args = buildPiPromptArgs("prompt", model, { implementationProfile: true }, {
      env: {
        HEPHA_PI_IMPLEMENTATION_DISABLE_CONTEXT_FILES: "1",
        HEPHA_PI_IMPLEMENTATION_DISABLE_EXTENSIONS: "1",
        HEPHA_PI_IMPLEMENTATION_DISABLE_PROMPT_TEMPLATES: "1",
        HEPHA_PI_IMPLEMENTATION_DISABLE_SKILLS: "1",
        HEPHA_PI_IMPLEMENTATION_DISABLE_TOOLS: "1",
      },
      skillPaths: ["unused"],
    });

    expect(args).toEqual(expect.arrayContaining([
      "--no-tools", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files",
    ]));
    expect(args).not.toContain("--skill");
  });
});
