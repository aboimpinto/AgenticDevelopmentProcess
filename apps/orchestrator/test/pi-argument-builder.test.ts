import type { AgentTask } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  buildPiArgs,
  buildPiPromptArgs,
  MODEL_REQUEST_GUARD_PATH,
} from "../src/runtime/pi/pi-argument-builder.js";

const model = { model: "model", provider: "provider" };

describe("Pi argument builder", () => {
  it("pins High reasoning for every worker profile regardless of inherited defaults", () => {
    const task = { agent: "Planner", id: "task-1", prompt: "Plan", title: "Plan" } as AgentTask;
    for (const args of [buildPiArgs(task, model),
      buildPiPromptArgs("prompt", model, {}, { env: {}, skillPaths: [] }),
      buildPiPromptArgs("prompt", model, { implementationProfile: true }, { env: { PI_THINKING_LEVEL: "low" }, skillPaths: [] })]) {
      expect(args.filter(arg => arg === "--thinking")).toHaveLength(1);
      expect(args[args.indexOf("--thinking") + 1]).toBe("high");
      expect(args).toContain("--extension");
      expect(args[args.indexOf("--extension") + 1]).toMatch(/model-request-guard\.(?:ts|js)$/);
    }
  });
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
      "--provider", "provider", "--model", "model", "--mode", "json", "--thinking", "high", "--extension", MODEL_REQUEST_GUARD_PATH, "--print",
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
      "--provider", "provider", "--model", "model", "--mode", "json", "--thinking", "high", "--extension", MODEL_REQUEST_GUARD_PATH, "--print",
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
    expect(args).not.toContain(MODEL_REQUEST_GUARD_PATH);
    expect(args.filter(arg => arg === "--thinking")).toHaveLength(1);
    expect(args[args.indexOf("--thinking") + 1]).toBe("high");
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
