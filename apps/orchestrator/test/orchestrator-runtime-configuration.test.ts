import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOrchestratorRuntimeEnvironment,
  inferOrchestratorWorkspaceRoot,
  resolveWorkflowSkillPaths,
} from "../src/runtime/orchestrator-runtime-configuration.js";

const cleanupPaths: string[] = [];
afterEach(() => {
  for (const path of cleanupPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe("orchestrator runtime configuration", () => {
  it("infers the monorepo root only from the apps/orchestrator package", () => {
    expect(inferOrchestratorWorkspaceRoot("/workspace/apps/orchestrator")).toBe("/workspace");
    expect(inferOrchestratorWorkspaceRoot("/workspace/other")).toBe("/workspace/other");
  });

  it("merges dotenv and user values without overriding process configuration", () => {
    const workspacePath = mkdtempSync(resolve(tmpdir(), "hepha-runtime-config-"));
    cleanupPaths.push(workspacePath);
    writeFileSync(resolve(workspacePath, ".env"), "OPENAI_API_KEY='dotenv-key'\nDEEPSEEK_API_KEY=dotenv-deep\n");
    const readUserEnvironmentValue = vi.fn((key: string) => key === "HEPHA_PI_COMMAND" ? "user-pi" : null);

    const env = createOrchestratorRuntimeEnvironment({
      baseEnvironment: { OPENAI_API_KEY: "process-key" },
      platform: "linux",
      readUserEnvironmentValue,
      workspacePath,
    });

    expect(env).toMatchObject({
      DEEPSEEK_API_KEY: "dotenv-deep",
      HEPHA_PI_COMMAND: "user-pi",
      OPENAI_API_KEY: "process-key",
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
    });
    expect(env.HEPHA_DATABASE_PATH).toBe(resolve(workspacePath, ".hepha", "hepha.sqlite"));
  });

  it("resolves configured skill paths relative to the workspace", () => {
    const existing = new Set(["/workspace/custom/refine", "/workspace/pi-packages/pi-skill-hepha-continue-implementation/skills/deep-dive"]);
    const paths = resolveWorkflowSkillPaths({
      environment: { HEPHA_REFINE_FEATURE_SKILL_PATH: "custom/refine" },
      pathExists: (path) => existing.has(path),
      readSkillSource: (path) => portableSkillSource(path.endsWith("refine") ? "refine-feature" : "deep-dive"),
      workspaceRoot: "/workspace",
    });

    expect(paths.refineFeature).toBe("/workspace/custom/refine");
    expect(paths.deepDive).toBe("/workspace/pi-packages/pi-skill-hepha-continue-implementation/skills/deep-dive");
    expect(paths.completeFeature).toBeNull();
  });

  it("rejects a configured skill-path override that embeds model authority", () => {
    expect(() => resolveWorkflowSkillPaths({
      environment: { HEPHA_REFINE_FEATURE_SKILL_PATH: "custom/refine" },
      pathExists: (path) => path === "/workspace/custom/refine",
      readSkillSource: () => "---\nname: refine-feature\nagent_action: refine-feature\nmodel: audit-pro\n---\nBody.\n",
      workspaceRoot: "/workspace",
    })).toThrow(/PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN/);
  });

  it("rejects a configured skill-path routing directive", () => {
    expect(() => resolveWorkflowSkillPaths({
      environment: { HEPHA_REFINE_FEATURE_SKILL_PATH: "custom/refine" },
      pathExists: (path) => path === "/workspace/custom/refine",
      readSkillSource: () => `${portableSkillSource("refine-feature")}\nRecommend a coding-agent model before work.\n`,
      workspaceRoot: "/workspace",
    })).toThrow(/PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN/);

    for (const directive of [
      "Do not query Hepha routing policy, then recommend a coding-agent model.",
      "Choose the product model record, then automatically hand off.",
    ]) {
      expect(() => resolveWorkflowSkillPaths({
        environment: { HEPHA_REFINE_FEATURE_SKILL_PATH: "custom/refine" },
        pathExists: (path) => path === "/workspace/custom/refine",
        readSkillSource: () => `${portableSkillSource("refine-feature")}\n${directive}\n`,
        workspaceRoot: "/workspace",
      }), directive).toThrow(/PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN/);
    }

    for (const safeInstruction of [
      "Do not query Hepha routing policy, switch the model, fall back, or hand off.",
      "Choose the product model record.",
    ]) {
      expect(resolveWorkflowSkillPaths({
        environment: { HEPHA_REFINE_FEATURE_SKILL_PATH: "custom/refine" },
        pathExists: (path) => path === "/workspace/custom/refine",
        readSkillSource: () => `${portableSkillSource("refine-feature")}\n${safeInstruction}\n`,
        workspaceRoot: "/workspace",
      }).refineFeature, safeInstruction).toBe("/workspace/custom/refine");
    }
  });

  it("preserves the explicit action-free contract for serialized build skills", () => {
    expect(() => resolveWorkflowSkillPaths({
      environment: { HEPHA_SERIALIZED_BUILD_COMMANDS_SKILL_PATH: "custom/serialized" },
      pathExists: (path) => path === "/workspace/custom/serialized",
      readSkillSource: () => "---\nname: serialized-build-commands\nagent_action: start-feature\n---\nBody.\n",
      workspaceRoot: "/workspace",
    })).toThrow(/PORTABLE_ASSET_ACTION_CONFLICT/);

    expect(resolveWorkflowSkillPaths({
      environment: { HEPHA_SERIALIZED_BUILD_COMMANDS_SKILL_PATH: "custom/serialized" },
      pathExists: (path) => path === "/workspace/custom/serialized",
      readSkillSource: () => "---\nname: serialized-build-commands\n---\nBody.\n",
      workspaceRoot: "/workspace",
    }).serializedBuildCommands).toBe("/workspace/custom/serialized");
  });
});

function portableSkillSource(action: string): string {
  return `---
name: portable-skill
agent_action: ${action}
---
# Procedure

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
\`direct_host\` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy. Direct
execution does not fabricate an orchestrated receipt. Only an explicit Hepha
launcher or dashboard dispatch creates an orchestrated worker.
`;
}
