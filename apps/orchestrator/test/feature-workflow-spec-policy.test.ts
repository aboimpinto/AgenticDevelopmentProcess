// Behavior suite: feature workflow spec.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FeatureWorkflowCommand } from "@hepha/shared";
import {
  loadAllWorkflowDefinitions,
  loadHephaFeatureWorkflowSpec,
  resolveWorkflowCandidatePaths,
  WorkflowConflictError,
  WorkflowMissingError,
} from "../src/feature-workflow-spec.js";

/**
 * Minimal valid workflow YAML that references real committed .hepha assets.
 * Uses assets known to exist from FEAT-021: commands/refine-feature.md, etc.
 */
function createMinimalWorkflowYaml(
  overrides: Partial<{ name: string; routingModel: string; command: string }> = {},
): string {
  return [
    `name: ${overrides.name ?? "refine-feature"}`,
    overrides.command ? `command: ${overrides.command}` : "",
    overrides.routingModel ? `model: ${overrides.routingModel}` : "",
    "nodes:",
    "  - id: collect-context",
    "    kind: prompt",
    "    prompt: refine-feature",
    "    agent_action: refine-feature",
    "    command: commands/refine-feature.md",
    "    agent: agents/feature-refiner.agent.yaml",
    "    context: context/feature-refinement.context.yaml",
    "    output_schema: schemas/refine-feature-files.schema.json",
    "    status: Collecting context",
    "  - id: generate-artifacts",
    "    kind: action",
    "    action: generate-artifacts",
    "    status: Generating artifacts",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Helper: create a realistic .hepha asset directory structure with valid content
 * that passes FEAT-021 prompt asset validation.
 */
function createHephaAssets(workspaceRoot: string): void {
  mkdirSync(resolve(workspaceRoot, ".hepha/commands"), { recursive: true });
  mkdirSync(resolve(workspaceRoot, ".hepha/agents"), { recursive: true });
  mkdirSync(resolve(workspaceRoot, ".hepha/context"), { recursive: true });
  mkdirSync(resolve(workspaceRoot, ".hepha/schemas"), { recursive: true });

  writeFileSync(
    resolve(workspaceRoot, ".hepha/commands/refine-feature.md"),
    "---\nname: refine-feature\nversion: 0.1.0\n---\n\n# Refine Feature Template\nBody content.\n",
  );
  writeFileSync(
    resolve(workspaceRoot, ".hepha/agents/feature-refiner.agent.yaml"),
    "name: feature-refiner\nresponsibilities:\n  - produce FeatureTasks.md\n",
  );
  writeFileSync(
    resolve(workspaceRoot, ".hepha/context/feature-refinement.context.yaml"),
    "name: feature-refinement\nrequired:\n  - project\n  - feature_document\nconstraints:\n  - do not write implementation code\n",
  );
  writeFileSync(
    resolve(workspaceRoot, ".hepha/schemas/refine-feature-files.schema.json"),
    JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" }),
  );
}

function createFixtureDir(): string {
  return mkdtempSync(resolve(tmpdir(), "feat-025-phase3-"));
}

function cleanupFixtureDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("FEAT-025 Phase 3 - business logic", () => {
  describe("loadHephaFeatureWorkflowSpec with dual layout", () => {
    it("loads from .workflows/ when legacy directory has the file", () => {
      const dir = createFixtureDir();
      try {
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        const spec = loadHephaFeatureWorkflowSpec(dir, "refine-feature");
        expect(spec.command).toBe("refine-feature");
        expect(spec.nodes.length).toBe(2);
        expect(spec.path).toContain(".workflows/refine-feature.workflow.yaml");
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("loads from .hepha/workflows/ when only the new layout has the file", () => {
      const dir = createFixtureDir();
      try {
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        const spec = loadHephaFeatureWorkflowSpec(dir, "refine-feature");
        expect(spec.command).toBe("refine-feature");
        expect(spec.nodes.length).toBe(2);
        expect(spec.path).toContain(".hepha/workflows/refine-feature.workflow.yaml");
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("prefers .workflows/ when both layouts have equivalent definitions", () => {
      const dir = createFixtureDir();
      try {
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        const spec = loadHephaFeatureWorkflowSpec(dir, "refine-feature");
        expect(spec.command).toBe("refine-feature");
        expect(spec.path).toContain(".workflows/refine-feature.workflow.yaml");
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("throws WorkflowConflictError when both layouts have divergent definitions", () => {
      const dir = createFixtureDir();
      try {
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ name: "refine-feature" }),
        );
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ name: "refine-feature-v2" }),
        );

        expect(() => loadHephaFeatureWorkflowSpec(dir, "refine-feature")).toThrow(
          WorkflowConflictError,
        );
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("throws WorkflowMissingError when neither layout has the file", () => {
      const dir = createFixtureDir();
      try {
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        // No workflow files written

        expect(() => loadHephaFeatureWorkflowSpec(dir, "refine-feature")).toThrow(
          WorkflowMissingError,
        );
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("throws WorkflowConflictError when models differ between layouts", () => {
      const dir = createFixtureDir();
      try {
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ routingModel: "gpt-5.6-terra" }),
        );
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ routingModel: "deepseek-v4-pro" }),
        );

        expect(() => loadHephaFeatureWorkflowSpec(dir, "refine-feature")).toThrow(
          /PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN/,
        );
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  describe("loadAllWorkflowDefinitions with dual layout", () => {
    it("loads all commands when only .workflows/ has files", () => {
      // Use the real workspace (committed .workflows files)
      // This test uses the real project root
      const definitions = loadAllWorkflowDefinitions(resolve(__dirname, "../../.."));
      expect(definitions.size).toBe(7);
      for (const [command, summary] of definitions) {
        expect(summary.command).toBe(command);
        expect(summary.nodes.length).toBeGreaterThan(0);
        expect(summary.path).toContain(".workflows/");
      }
    });

    it("loads all commands from a fixture workspace with .hepha/workflows/ layout", () => {
      const dir = createFixtureDir();
      try {
        const commands: FeatureWorkflowCommand[] = [
          "complete-feature",
          "continue-implementing",
          "deep-dive-epic",
          "deep-dive-feature",
          "design-feature",
          "refine-feature",
          "start-implementing",
        ];

        // Create .hepha assets for all commands
        createHephaAssets(dir);
        mkdirSync(resolve(dir, ".hepha/commands"), { recursive: true });
        mkdirSync(resolve(dir, ".hepha/agents"), { recursive: true });
        mkdirSync(resolve(dir, ".hepha/context"), { recursive: true });
        mkdirSync(resolve(dir, ".hepha/schemas"), { recursive: true });

        // Create a minimal workflow for each command in .hepha/workflows/
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        for (const command of commands) {
          writeFileSync(
            resolve(dir, `.hepha/workflows/${command}.workflow.yaml`),
            [
              `name: ${command}`,
              "nodes:",
              "  - id: main",
              "    kind: action",
              "    action: main-action",
              "    status: Running",
            ].join("\n"),
          );
        }

        const definitions = loadAllWorkflowDefinitions(dir);
        expect(definitions.size).toBe(7);
        for (const [command, summary] of definitions) {
          expect(summary.command).toBe(command);
          expect(summary.path).toContain(".hepha/workflows/");
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });
});
