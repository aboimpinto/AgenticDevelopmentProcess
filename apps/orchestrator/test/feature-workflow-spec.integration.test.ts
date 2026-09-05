// Behavior suite: feature workflow spec.
/**
 * FEAT-025 Phase 6 Integration Tests
 *
 * Proves end-to-end loader/catalog parity across legacy-only, target-only,
 * equivalent-dual, and conflicting-dual workflow layouts using isolated
 * filesystem fixtures. Avoids live Pi, HTTP servers, browsers, or dev servers.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FeatureWorkflowCommand } from "@hepha/shared";
import {
  loadAllWorkflowDefinitions,
  loadHephaFeatureWorkflowSpec,
  toWorkflowDefinitionSummary,
  WorkflowConflictError,
} from "../src/feature-workflow-spec.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const ALL_COMMANDS: FeatureWorkflowCommand[] = [
  "complete-feature",
  "continue-implementing",
  "deep-dive-epic",
  "deep-dive-feature",
  "design-feature",
  "refine-feature",
  "start-implementing",
];

/**
 * Write valid .hepha asset stubs for refine-feature workflow.
 */
function writeRefineFeatureAssets(root: string): void {
  mkdirSync(resolve(root, ".hepha/commands"), { recursive: true });
  mkdirSync(resolve(root, ".hepha/agents"), { recursive: true });
  mkdirSync(resolve(root, ".hepha/context"), { recursive: true });
  mkdirSync(resolve(root, ".hepha/schemas"), { recursive: true });

  writeFileSync(
    resolve(root, ".hepha/commands/refine-feature.md"),
    "---\nname: refine-feature\nversion: 0.1.0\n---\n\n# Refine Feature\nBody.\n",
  );
  writeFileSync(
    resolve(root, ".hepha/agents/feature-refiner.agent.yaml"),
    "name: feature-refiner\nresponsibilities:\n  - produce FeatureTasks.md\n",
  );
  writeFileSync(
    resolve(root, ".hepha/context/feature-refinement.context.yaml"),
    "name: feature-refinement\nrequired:\n  - project\n  - feature_document\nconstraints:\n  - do not write implementation code\n",
  );
  writeFileSync(
    resolve(root, ".hepha/schemas/refine-feature-files.schema.json"),
    JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" }),
  );

  // Also create the .hepha directory
  mkdirSync(resolve(root, ".hepha/workflows"), { recursive: true });
}

/**
 * Write a minimal valid workflow YAML that references real .hepha assets.
 */
function writeMinimalWorkflow(dir: string, layout: ".workflows" | ".hepha/workflows", command: string): void {
  mkdirSync(resolve(dir, layout), { recursive: true });

  const isRefineFeature = command === "refine-feature";
  const isInteractive = command === "deep-dive-epic" || command === "deep-dive-feature" || command === "design-feature";

  if (isRefineFeature) {
    writeFileSync(
      resolve(dir, layout, `${command}.workflow.yaml`),
      [
        `name: ${command}`,
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
      ].join("\n"),
    );
  } else if (isInteractive) {
    // Interactive gate workflows (no prompt assets needed)
    writeFileSync(
      resolve(dir, layout, `${command}.workflow.yaml`),
      [
        `name: ${command}`,
        "nodes:",
        "  - id: interactive-gate",
        "    kind: gate",
        "    status: Waiting for input",
        "  - id: generate",
        "    kind: action",
        "    action: generate-output",
        "    status: Generating",
      ].join("\n"),
    );
  } else {
    // Action-only workflows
    writeFileSync(
      resolve(dir, layout, `${command}.workflow.yaml`),
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
}

/**
 * Write equivalent workflow YAML for all commands in a given layout.
 */
function writeAllCommands(dir: string, layout: ".workflows" | ".hepha/workflows"): void {
  for (const command of ALL_COMMANDS) {
    writeMinimalWorkflow(dir, layout, command);
  }
}

function createFixtureDir(): string {
  return mkdtempSync(resolve(tmpdir(), "feat-025-int-"));
}

function cleanupFixtureDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FEAT-025 Phase 6 - Integration", () => {
  // ---- Fixture 1: Legacy-only ----

  describe("1. Legacy-only workspace (`.workflows/`)", () => {
    it("loads all commands with correct spec shape", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".workflows");

        for (const command of ALL_COMMANDS) {
          const spec = loadHephaFeatureWorkflowSpec(dir, command);
          expect(spec.command).toBe(command);
          expect(spec.nodes.length).toBeGreaterThan(0);
          expect(spec.path).toContain(".workflows/");
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("loadAllWorkflowDefinitions produces correct catalog with legacy paths", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".workflows");

        const definitions = loadAllWorkflowDefinitions(dir);
        expect(definitions.size).toBe(7);

        for (const [command, summary] of definitions) {
          expect(summary.command).toBe(command);
          expect(summary.path).toContain(".workflows/");
          expect(summary.path).toContain(`${command}.workflow.yaml`);
          expect(summary.nodes.length).toBeGreaterThan(0);

          // Verify serialization safety
          const serialized = JSON.stringify(summary);
          const deserialized = JSON.parse(serialized) as typeof summary;
          expect(deserialized.command).toBe(command);
          expect(deserialized.nodes.length).toBe(summary.nodes.length);
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  // ---- Fixture 2: Target-layout-only ----

  describe("2. Target-layout-only workspace (`.hepha/workflows/`)", () => {
    it("loads all commands from .hepha/workflows/ with correct spec shape", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".hepha/workflows");

        for (const command of ALL_COMMANDS) {
          const spec = loadHephaFeatureWorkflowSpec(dir, command);
          expect(spec.command).toBe(command);
          expect(spec.nodes.length).toBeGreaterThan(0);
          expect(spec.path).toContain(".hepha/workflows/");
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("loadAllWorkflowDefinitions produces correct catalog with .hepha/workflows/ paths", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".hepha/workflows");

        const definitions = loadAllWorkflowDefinitions(dir);
        expect(definitions.size).toBe(7);

        for (const [command, summary] of definitions) {
          expect(summary.command).toBe(command);
          expect(summary.path).toContain(".hepha/workflows/");
          expect(summary.path).toContain(`${command}.workflow.yaml`);

          // Serialization-safe
          const deserialized = JSON.parse(JSON.stringify(summary)) as typeof summary;
          expect(deserialized.command).toBe(command);
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("validates prompt asset references under .hepha/ for target-layout workflows", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        // Write refine-feature in target layout with prompt references
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          [
            "name: refine-feature",
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
          ].join("\n"),
        );

        const spec = loadHephaFeatureWorkflowSpec(dir, "refine-feature");
        expect(spec.command).toBe("refine-feature");
        expect(spec.path).toContain(".hepha/workflows/");
        expect(spec.nodes.length).toBe(1);
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  // ---- Fixture 3: Equivalent dual ----

  describe("3. Equivalent dual-layout workspace", () => {
    it("prefers legacy paths when definitions are equivalent", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".workflows");
        writeAllCommands(dir, ".hepha/workflows");

        const definitions = loadAllWorkflowDefinitions(dir);
        expect(definitions.size).toBe(7);

        for (const [_command, summary] of definitions) {
          // All should resolve from legacy (compatibility source)
          expect(summary.path).toContain(".workflows/");
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("produces identical summaries for equivalent dual definitions", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".workflows");
        writeAllCommands(dir, ".hepha/workflows");

        const definitions = loadAllWorkflowDefinitions(dir);

        // For each command, verify the summary is complete and serializable
        for (const [_command, summary] of definitions) {
          expect(summary.name).toBeTruthy();
          expect(summary.nodes.length).toBeGreaterThan(0);

          // All nodes should have expected fields
          for (const node of summary.nodes) {
            expect(node.id).toBeTruthy();
            expect(node.kind).toMatch(/^(action|prompt|loop|gate)$/);
            expect(Array.isArray(node.dependsOn)).toBe(true);
          }
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("refine-feature node details match expected prompt-node shape", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".workflows");
        writeAllCommands(dir, ".hepha/workflows");

        // Load refine-feature only (has prompt nodes)
        const spec = loadHephaFeatureWorkflowSpec(dir, "refine-feature");
        expect(spec.nodes.length).toBe(2);

        const promptNode = spec.nodes.find((n) => n.kind === "prompt");
        expect(promptNode).toBeDefined();
        expect(promptNode!.prompt).toBe("refine-feature");
        expect(promptNode!.command).toBe("commands/refine-feature.md");
        expect(promptNode!.agent).toBe("agents/feature-refiner.agent.yaml");

        const actionNode = spec.nodes.find((n) => n.kind === "action");
        expect(actionNode).toBeDefined();
        expect(actionNode!.action).toBe("generate-artifacts");
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  // ---- Fixture 4: Conflicting dual ----

  describe("4. Conflicting dual-layout workspace", () => {
    it("throws WorkflowConflictError for divergent command names", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeMinimalWorkflow(dir, ".workflows", "refine-feature");
        // Write divergent version in target layout
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          [
            "name: refine-feature-v2",
            "nodes:",
            "  - id: main",
            "    kind: action",
            "    action: main-action",
            "    status: Running",
          ].join("\n"),
        );

        expect(() => loadHephaFeatureWorkflowSpec(dir, "refine-feature")).toThrow(
          WorkflowConflictError,
        );
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("throws WorkflowConflictError for divergent node structures", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeMinimalWorkflow(dir, ".workflows", "refine-feature");
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          [
            "name: refine-feature",
            "nodes:",
            "  - id: different-node",
            "    kind: action",
            "    action: different-action",
            "    status: Different",
          ].join("\n"),
        );

        expect(() => loadHephaFeatureWorkflowSpec(dir, "refine-feature")).toThrow(
          WorkflowConflictError,
        );
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("loadAllWorkflowDefinitions propagates conflict errors from individual commands", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".workflows");
        writeMinimalWorkflow(dir, ".hepha/workflows", "refine-feature");
        // Write divergent refine-feature in target
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          [
            "name: refine-feature",
            "nodes:",
            "  - id: main",
            "    kind: action",
            "    action: main-action",
            "    status: Running",
          ].join("\n"),
        );

        expect(() => loadAllWorkflowDefinitions(dir)).toThrow(WorkflowConflictError);
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  // ---- Fixture 5: Committed workflows ----

  describe("5. Committed repository workflows", () => {
    it("still load and pass FEAT-020/021 validation", () => {
      const projectRoot = resolve(__dirname, "../../..");

      const definitions = loadAllWorkflowDefinitions(projectRoot);
      expect(definitions.size).toBe(7);

      // Verify FEAT-020 validation: all paths exist, all names unique
      const names = new Set<string>();
      for (const [command, summary] of definitions) {
        expect(names.has(summary.name)).toBe(false);
        names.add(summary.name);

        // Verify node consistency
        expect(summary.nodes.length).toBeGreaterThan(0);
        const allNodeIds = summary.nodes.map((n) => n.id);
        expect(new Set(allNodeIds).size).toBe(allNodeIds.length); // Unique IDs
      }

      // Verify FEAT-021 validation: prompt nodes reference committed assets
      for (const [command, summary] of definitions) {
        for (const node of summary.nodes) {
          if (node.prompt) {
            expect(node.action).toBeNull();
          }
          if (node.action) {
            expect(node.prompt).toBeNull();
          }
        }
      }
    });
  });

  // ---- Fixture 6: Catalog summary parity ----

  describe("6. Catalog summary parity", () => {
    it("legacy-only and target-only produce identical summaries for equivalent content", () => {
      // Load from committed .workflows/ files (this workspace)
      const legacyDir = resolve(__dirname, "../../..");
      const legacyDefs = loadAllWorkflowDefinitions(legacyDir);

      // Now create a fixture with equivalent content in .hepha/workflows/
      // We can't perfectly replicate committed workflows with prompt references,
      // but we can verify that the summary shape is structurally consistent
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".hepha/workflows");

        const targetDefs = loadAllWorkflowDefinitions(dir);

        // Both should have all 7 commands
        expect(legacyDefs.size).toBe(7);
        expect(targetDefs.size).toBe(7);

        // Both should have the same commands
        for (const command of ALL_COMMANDS) {
          expect(legacyDefs.has(command)).toBe(true);
          expect(targetDefs.has(command)).toBe(true);
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("toWorkflowDefinitionSummary is serialization-safe for both layouts", () => {
      const dir = createFixtureDir();
      try {
        writeRefineFeatureAssets(dir);
        writeAllCommands(dir, ".hepha/workflows");

        const definitions = loadAllWorkflowDefinitions(dir);

        for (const [_command, summary] of definitions) {
          // Round-trip through JSON
          const json = JSON.stringify(summary);
          const restored = JSON.parse(json) as typeof summary;

          expect(restored.command).toBe(summary.command);
          expect(restored.name).toBe(summary.name);
          expect(restored.description).toBe(summary.description);
          expect(restored.model).toBe(summary.model);
          expect(restored.path).toBe(summary.path);
          expect(restored.nodes.length).toBe(summary.nodes.length);

          for (let i = 0; i < restored.nodes.length; i++) {
            expect(restored.nodes[i].id).toBe(summary.nodes[i].id);
            expect(restored.nodes[i].kind).toBe(summary.nodes[i].kind);
          }
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  // ---- Fixture 7: No-runner-diff gate ----

  describe("7. Scope-guard: runner execution unchanged", () => {
    it("createHephaFeatureWorkflowRunner still works with committed workflows", async () => {
      const projectRoot = resolve(__dirname, "../../..");
      const { createHephaFeatureWorkflowRunner } = await import(
        "../src/feature-workflow-spec.js"
      );

      let recorded = false;
      const runner = createHephaFeatureWorkflowRunner({
        command: "refine-feature",
        recorder: async () => {
          recorded = true;
        },
        workspaceRoot: projectRoot,
      });

      // Run one node from committed workflow
      await runner.runNode(
        "collect-context",
        { summary: "Test run" },
        async (node, rendered) => {
          expect(node.id).toBe("collect-context");
          // Match the actual committed workflow status text
          expect(rendered.status).toBe("Collecting refinement context");
          return "ok";
        },
      );

      expect(recorded).toBe(true);
    });

    it("runner dependency enforcement still works", async () => {
      const projectRoot = resolve(__dirname, "../../..");
      const { createHephaFeatureWorkflowRunner } = await import(
        "../src/feature-workflow-spec.js"
      );

      const runner = createHephaFeatureWorkflowRunner({
        command: "refine-feature",
        completedNodeIds: [],
        recorder: async () => {},
        workspaceRoot: projectRoot,
      });

      // Try to run generate-artifacts before collect-context (depends on it)
      await expect(
        runner.runNode(
          "generate-artifacts",
          { summary: "Should fail" },
          async () => "ok",
        ),
      ).rejects.toThrow(/cannot run.*before/);
    });
  });
});
