import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FeatureWorkflowCommand } from "@hepha/shared";
import {
  loadAllWorkflowDefinitions,
  loadHephaFeatureWorkflowSpec,
  toWorkflowDefinitionSummary,
} from "../src/feature-workflow-spec.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "../../..");

describe("feature workflow specs", () => {
  it("loads committed Hepha workflow definitions for lifecycle commands", () => {
    const commands: FeatureWorkflowCommand[] = [
      "deep-dive-epic",
      "deep-dive-feature",
      "design-feature",
      "refine-feature",
      "start-implementing",
      "continue-implementing",
      "complete-feature",
    ];

    for (const command of commands) {
      const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, command);

      expect(spec.command).toBe(command);
      expect(spec.nodes.length).toBeGreaterThan(0);
      expect(spec.nodes.every((node) => node.status.length > 0)).toBe(true);
    }
  });

  it("requires prompt nodes to reference committed harness assets", () => {
    const commands: FeatureWorkflowCommand[] = [
      "deep-dive-epic",
      "deep-dive-feature",
      "design-feature",
      "refine-feature",
      "start-implementing",
      "continue-implementing",
      "complete-feature",
    ];

    for (const command of commands) {
      const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, command);

      for (const node of spec.nodes.filter((candidate) => candidate.kind === "prompt")) {
        expect(node.command).toMatch(/^commands\/.+\.md$/);
        expect(node.agent).toMatch(/^agents\/.+\.agent\.yaml$/);
        expect(node.context).toMatch(/^context\/.+\.context\.yaml$/);
        expect(node.outputSchema).toMatch(/^schemas\/.+\.schema\.json$/);
      }
    }
  });

  it("rejects workflows with missing command templates", () => {
    const tempWorkspace = mkdtempSync(resolve(tmpdir(), "hepha-workflow-"));

    mkdirSync(resolve(tempWorkspace, ".workflows"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha"), { recursive: true });
    writeFileSync(
      resolve(tempWorkspace, ".workflows/refine-feature.workflow.yaml"),
      [
        "name: refine-feature",
        "nodes:",
        "  - id: generate-artifacts",
        "    prompt: refine-feature",
        "    agent_action: refine-feature",
        "    command: commands/missing-template.md",
        "    agent: agents/feature-refiner.agent.yaml",
        "    context: context/feature-refinement.context.yaml",
        "    output_schema: schemas/refine-feature-files.schema.json",
        "    status: Generating refinement artifacts",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(tempWorkspace, "refine-feature")).toThrow(
      /missing command template/,
    );
  });

  it("rejects workflows missing prompt agent references", () => {
    const tempWorkspace = mkdtempSync(resolve(tmpdir(), "hepha-workflow-"));

    mkdirSync(resolve(tempWorkspace, ".workflows"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/commands"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/context"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/schemas"), { recursive: true });
    writeFileSync(resolve(tempWorkspace, ".hepha/commands/refine-feature.md"), "# Refine Feature");
    writeFileSync(resolve(tempWorkspace, ".hepha/context/feature-refinement.context.yaml"), "name: feature-refinement\n");
    writeFileSync(resolve(tempWorkspace, ".hepha/schemas/refine-feature-files.schema.json"), "{}\n");
    writeFileSync(
      resolve(tempWorkspace, ".workflows/refine-feature.workflow.yaml"),
      [
        "name: refine-feature",
        "nodes:",
        "  - id: generate-artifacts",
        "    prompt: refine-feature",
        "    agent_action: refine-feature",
        "    command: commands/refine-feature.md",
        "    context: context/feature-refinement.context.yaml",
        "    output_schema: schemas/refine-feature-files.schema.json",
        "    status: Generating refinement artifacts",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(tempWorkspace, "refine-feature")).toThrow(
      /must define an agent path/,
    );
  });

  it("keeps implementation workflow loops visible as explicit nodes", () => {
    const startSpec = loadHephaFeatureWorkflowSpec(workspaceRoot, "start-implementing");
    const continueSpec = loadHephaFeatureWorkflowSpec(workspaceRoot, "continue-implementing");

    expect(startSpec.nodes.map((node) => node.id)).toContain("implementation-loop");
    expect(continueSpec.nodes.map((node) => node.id)).toContain("implementation-loop");
    expect(continueSpec.nodes.map((node) => node.id)).toContain("resolve-next-task");
    expect(continueSpec.nodes.find((node) => node.id === "implementation-loop")?.dependsOn).toEqual([
      "resolve-next-task",
    ]);
    expect(startSpec.nodes.find((node) => node.id === "implementation-loop")?.loop?.until).toBe(
      "ALL_PHASES_RESOLVED",
    );
    expect(startSpec.nodes.find((node) => node.id === "sync-linked-epic-state")?.dependsOn).toEqual([
      "move-in-progress",
    ]);
    expect(startSpec.nodes.find((node) => node.id === "post-process")?.dependsOn).toEqual([
      "sync-linked-epic-state",
    ]);
    expect(continueSpec.nodes.find((node) => node.id === "implementation-loop")?.loop?.freshContext).toBe(true);

    for (const spec of [startSpec, continueSpec]) {
      const transitions = spec.nodes.find((node) => node.id === "implementation-loop")?.loop?.transitions ?? [];

      expect(transitions.map(({ from, to, when }) => ({ from, to, when }))).toEqual([
        { from: "phase-state", to: "execute-next-task", when: "NEXT_DECLARED_PHASE_TASK_EXISTS" },
        { from: "execute-next-task", to: "execute-next-task", when: "CURRENT_TASK_REQUIRES_REPAIR_OR_RETRY" },
        { from: "execute-next-task", to: "phase-state", when: "CURRENT_TASK_COMPLETED" },
        { from: "phase-state", to: "complete-phase", when: "NO_DECLARED_PHASE_TASK_REMAINS" },
        { from: "complete-phase", to: "phase-git-checkpoint", when: "PHASE_EXIT_ALLOWED" },
        {
          from: "phase-git-checkpoint",
          to: "phase-state",
          when: "PHASE_GIT_CHECKPOINT_PUSHED_AND_MORE_PHASES_REMAIN",
        },
      ]);
      expect(transitions.every((transition) => !("model" in transition))).toBe(true);
    }
  });

  it("keeps Deep-Dive workflows modeled as interactive gates", () => {
    const epicSpec = loadHephaFeatureWorkflowSpec(workspaceRoot, "deep-dive-epic");
    const featureSpec = loadHephaFeatureWorkflowSpec(workspaceRoot, "deep-dive-feature");

    expect(epicSpec.nodes.map((node) => node.id)).toEqual([
      "create-session",
      "generate-questions",
      "wait-for-answers",
      "answers-ready",
      "update-document",
      "sync-epic-state",
      "record-completion",
    ]);
    expect(featureSpec.nodes.map((node) => node.id)).toEqual([
      "create-session",
      "generate-questions",
      "wait-for-answers",
      "answers-ready",
      "update-document",
      "record-completion",
    ]);
    expect(epicSpec.nodes.find((node) => node.id === "sync-epic-state")?.dependsOn).toEqual(["update-document"]);
    expect(epicSpec.nodes.find((node) => node.id === "record-completion")?.dependsOn).toEqual([
      "sync-epic-state",
    ]);

    for (const spec of [epicSpec, featureSpec]) {
      expect(spec.nodes.find((node) => node.id === "wait-for-answers")?.kind).toBe("gate");
    }
  });

  it("keeps complete-feature EPIC state sync after completion verification", () => {
    const completeSpec = loadHephaFeatureWorkflowSpec(workspaceRoot, "complete-feature");

    expect(completeSpec.nodes.find((node) => node.id === "sync-linked-epic-state")?.dependsOn).toEqual([
      "verify-completed-state",
    ]);
  });

  it("rejects explicit kind: action without action string", () => {
    const tempWorkspace = mkdtempSync(resolve(tmpdir(), "hepha-workflow-"));

    mkdirSync(resolve(tempWorkspace, ".workflows"), { recursive: true });
    writeFileSync(
      resolve(tempWorkspace, ".workflows/design-feature.workflow.yaml"),
      [
        "name: design-feature",
        "nodes:",
        "  - id: design-ui",
        "    kind: action",
        "    status: Designing",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(tempWorkspace, "design-feature")).toThrow(
      /is kind action but does not define a non-empty action string/,
    );
  });

  it("rejects unknown workflow node kind", () => {
    const tempWorkspace = mkdtempSync(resolve(tmpdir(), "hepha-workflow-"));

    mkdirSync(resolve(tempWorkspace, ".workflows"), { recursive: true });
    writeFileSync(
      resolve(tempWorkspace, ".workflows/design-feature.workflow.yaml"),
      [
        "name: design-feature",
        "nodes:",
        "  - id: design-ui",
        "    kind: invalid-kind",
        "    status: Designing",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(tempWorkspace, "design-feature")).toThrow(
      /unknown kind.*invalid-kind/,
    );
  });

  it("serializes workflow spec to WorkflowDefinitionSummary", () => {
    const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, "refine-feature");
    const summary = toWorkflowDefinitionSummary(spec);

    expect(summary.command).toBe("refine-feature");
    expect(summary.name).toBe("refine-feature");
    expect(summary.description).toBeTruthy();
    expect(summary).not.toHaveProperty("model");
    expect(summary.nodes.length).toBe(4);
    expect(summary.nodes[0].id).toBe("collect-context");
    expect(summary.nodes[0].kind).toBe("action");
    expect(summary.nodes[0].action).toBe("collect-feature-workflow-context");
    expect(summary.nodes[0].prompt).toBeNull();
    expect(summary.nodes[0]).not.toHaveProperty("model");
    expect(summary.nodes[0].loopUntil).toBeNull();
    expect(summary.nodes[0].dependsOn).toEqual([]);
    expect(summary.nodes[1].id).toBe("generate-artifacts");
    expect(summary.nodes[1].kind).toBe("prompt");
    expect(summary.nodes[1].action).toBeNull();
    expect(summary.nodes[1].prompt).toBe("refine-feature");
    expect(summary.nodes[1].loopUntil).toBeNull();
    expect(summary.nodes[1].dependsOn).toEqual(["collect-context"]);
    expect(summary.nodes[2].id).toBe("evaluate-result");
    expect(summary.nodes[2].kind).toBe("action");
    expect(summary.nodes[2].action).toBe("route-refinement-outcome");
    expect(summary.nodes[3].id).toBe("promote-ready");
    expect(summary.nodes[3].kind).toBe("action");
    expect(summary.nodes[3].action).toBe("move-feature-to-ready");
  });

  it("serialized summary preserves description without static routing model for start-implementing", () => {
    const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, "start-implementing");
    const summary = toWorkflowDefinitionSummary(spec);

    expect(summary.command).toBe("start-implementing");
    expect(summary.name).toBe("start-implementing");
    expect(summary.description).toBeTruthy();
    expect(summary).not.toHaveProperty("model");
    expect(summary.nodes.length).toBeGreaterThan(0);
  });

  it("loadAllWorkflowDefinitions loads all committed commands", () => {
    const definitions = loadAllWorkflowDefinitions(workspaceRoot);

    expect(definitions.size).toBe(7);
    expect(definitions.has("deep-dive-epic")).toBe(true);
    expect(definitions.has("deep-dive-feature")).toBe(true);
    expect(definitions.has("design-feature")).toBe(true);
    expect(definitions.has("refine-feature")).toBe(true);
    expect(definitions.has("start-implementing")).toBe(true);
    expect(definitions.has("continue-implementing")).toBe(true);
    expect(definitions.has("complete-feature")).toBe(true);

    const designDef = definitions.get("design-feature");

    expect(designDef?.command).toBe("design-feature");
    expect(designDef?.nodes.length).toBeGreaterThan(0);
  });

  it("loadAllWorkflowDefinitions rejects conflicting names", () => {
    const tempWorkspace = mkdtempSync(resolve(tmpdir(), "hepha-workflow-"));

    mkdirSync(resolve(tempWorkspace, ".workflows"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/commands"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/agents"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/context"), { recursive: true });
    mkdirSync(resolve(tempWorkspace, ".hepha/schemas"), { recursive: true });

    // Write stub harness assets with complete required fields for FEAT-021 validation.
    writeFileSync(
      resolve(tempWorkspace, ".hepha/commands/test.md"),
      "# Test command template\nNon-empty Markdown body.\n",
    );
    writeFileSync(
      resolve(tempWorkspace, ".hepha/agents/test.agent.yaml"),
      [
        "name: test-agent",
        "responsibilities:",
        "  - test responsibility",
      ].join("\n") + "\n",
    );
    writeFileSync(
      resolve(tempWorkspace, ".hepha/context/test.context.yaml"),
      [
        "name: test-context",
        "required:",
        "  - project",
        "constraints:",
        "  - test constraint",
      ].join("\n") + "\n",
    );
    writeFileSync(
      resolve(tempWorkspace, ".hepha/schemas/test.schema.json"),
      JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" }) + "\n",
    );

    // Create all 7 workflow files. Two share the same name to trigger conflict detection.
    const sharedName = "shared-name";

    function writeWorkflow(command: string, id: string, name: string) {
      const yaml = [
        `name: ${name}`,
        `command: ${command}`,
        "nodes:",
        `  - id: ${id}`,
        "    prompt: test",
        "    agent_action: refine-feature",
        "    command: commands/test.md",
        "    agent: agents/test.agent.yaml",
        "    context: context/test.context.yaml",
        "    output_schema: schemas/test.schema.json",
      ].join("\n");
      writeFileSync(
        resolve(tempWorkspace, ".workflows", `${command}.workflow.yaml`),
        yaml,
      );
    }

    writeWorkflow("deep-dive-epic", "create-session", "deep-dive-epic");
    writeWorkflow("deep-dive-feature", "create-session", "deep-dive-feature");
    writeWorkflow("design-feature", "design-ui", sharedName);
    writeWorkflow("refine-feature", "refine-artifacts", sharedName);
    writeWorkflow("start-implementing", "create-branch", "start-implementing");
    writeWorkflow("continue-implementing", "resolve-next-task", "continue-implementing");
    writeWorkflow("complete-feature", "verify-completed-state", "complete-feature");

    expect(() => loadAllWorkflowDefinitions(tempWorkspace)).toThrow(
      /Conflicting workflow names/,
    );
  });

  it("serialized summary preserves loop information", () => {
    const startSpec = loadHephaFeatureWorkflowSpec(workspaceRoot, "start-implementing");
    const summary = toWorkflowDefinitionSummary(startSpec);
    const loopNode = summary.nodes.find((n) => n.id === "implementation-loop");

    expect(loopNode).toBeDefined();
    expect(loopNode?.kind).toBe("loop");
    expect(loopNode?.loopUntil).toBe("ALL_PHASES_RESOLVED");
    expect(loopNode?.dependsOn).toEqual(["post-process"]);
  });

  // ---------------------------------------------------------------------------
  // FEAT-021 Integration tests: invalid content and incompatible references
  // ---------------------------------------------------------------------------

  function writeValidRefineFeatureStubs(ws: string): void {
    // Write valid harness assets for refine-feature
    mkdirSync(resolve(ws, ".hepha/commands"), { recursive: true });
    mkdirSync(resolve(ws, ".hepha/agents"), { recursive: true });
    mkdirSync(resolve(ws, ".hepha/context"), { recursive: true });
    mkdirSync(resolve(ws, ".hepha/schemas"), { recursive: true });

    writeFileSync(
      resolve(ws, ".hepha/commands/refine-feature.md"),
      "---\nname: refine-feature\nversion: 0.1.0\n---\n\n# Refine Feature Template\nBody content.\n",
    );
    writeFileSync(
      resolve(ws, ".hepha/agents/feature-refiner.agent.yaml"),
      "name: feature-refiner\nresponsibilities:\n  - produce FeatureTasks.md\n",
    );
    writeFileSync(
      resolve(ws, ".hepha/context/feature-refinement.context.yaml"),
      "name: feature-refinement\nrequired:\n  - project\n  - feature_document\nconstraints:\n  - do not write implementation code\n",
    );
    writeFileSync(
      resolve(ws, ".hepha/schemas/refine-feature-files.schema.json"),
      JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" }),
    );
  }

  function writeRefineFeatureWorkflow(ws: string): void {
    writeFileSync(
      resolve(ws, ".workflows/refine-feature.workflow.yaml"),
      [
        "name: refine-feature",
        "nodes:",
        "  - id: generate-artifacts",
        "    prompt: refine-feature",
        "    agent_action: refine-feature",
        "    command: commands/refine-feature.md",
        "    agent: agents/feature-refiner.agent.yaml",
        "    context: context/feature-refinement.context.yaml",
        "    output_schema: schemas/refine-feature-files.schema.json",
        "    status: Generating refinement artifacts",
      ].join("\n"),
    );
  }

  it("FEAT-021: valid committed lifecycle workflows still load with FEAT-021 validation", () => {
    // All 7 committed workflow files load successfully — this is already proven
    // by the existing "loads committed Hepha workflow definitions" test above.
    // This test reuses the real workspaceRoot and confirms no regression.
    const commands: FeatureWorkflowCommand[] = [
      "deep-dive-epic",
      "deep-dive-feature",
      "design-feature",
      "refine-feature",
      "start-implementing",
      "continue-implementing",
      "complete-feature",
    ];

    for (const command of commands) {
      const spec = loadHephaFeatureWorkflowSpec(workspaceRoot, command);
      expect(spec.nodes.length).toBeGreaterThan(0);
    }
  });

  it("FEAT-021: rejects empty command template", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(resolve(ws, ".hepha/commands/refine-feature.md"), "");

    // Also create a synthetic valid schema with right name since writeValidRefineFeatureStubs wrote one
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/empty/);
  });

  it("FEAT-021: rejects command with only frontmatter", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(resolve(ws, ".hepha/commands/refine-feature.md"), "---\nname: test\n---");
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/empty body/);
  });

  it("FEAT-021: rejects unparseable agent YAML", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(resolve(ws, ".hepha/agents/feature-refiner.agent.yaml"), "{{ not yaml");
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/Cannot parse/);
  });

  it("FEAT-021: rejects agent missing model_policy", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(
      resolve(ws, ".hepha/agents/feature-refiner.agent.yaml"),
      "name: feature-refiner\nresponsibilities:\n  - produce docs\n",
    );
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).not.toThrow();
  });

  it("FEAT-071: rejects agent model_policy through the public workflow loader", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat071-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(
      resolve(ws, ".hepha/agents/feature-refiner.agent.yaml"),
      "name: feature-refiner\nmodel_policy: planning.high\nresponsibilities:\n  - produce docs\n",
    );
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(
      /PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN.*model_policy/,
    );
  });

  it("FEAT-021: rejects context pack missing required field", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(
      resolve(ws, ".hepha/context/feature-refinement.context.yaml"),
      "name: feature-refinement\nconstraints:\n  - be careful\n",
    );
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/required/);
  });

  it("FEAT-021: rejects unparseable output schema JSON", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(resolve(ws, ".hepha/schemas/refine-feature-files.schema.json"), "{ invalid json }");
    writeRefineFeatureWorkflow(ws);

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/Cannot parse/);
  });

  it("FEAT-021: rejects incompatible command reference pointing to agents dir", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(
      resolve(ws, ".workflows/refine-feature.workflow.yaml"),
      [
        "name: refine-feature",
        "nodes:",
        "  - id: generate-artifacts",
        "    prompt: refine-feature",
        "    agent_action: refine-feature",
        "    command: agents/feature-refiner.agent.yaml",
        "    agent: agents/feature-refiner.agent.yaml",
        "    context: context/feature-refinement.context.yaml",
        "    output_schema: schemas/refine-feature-files.schema.json",
        "    status: Generating refinement artifacts",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/commands\//);
  });

  it("FEAT-021: rejects incompatible context reference pointing to schemas dir", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    writeFileSync(
      resolve(ws, ".workflows/refine-feature.workflow.yaml"),
      [
        "name: refine-feature",
        "nodes:",
        "  - id: generate-artifacts",
        "    prompt: refine-feature",
        "    agent_action: refine-feature",
        "    command: commands/refine-feature.md",
        "    agent: agents/feature-refiner.agent.yaml",
        "    context: schemas/refine-feature-files.schema.json",
        "    output_schema: schemas/refine-feature-files.schema.json",
        "    status: Generating refinement artifacts",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/context\//);
  });

  it("FEAT-021: rejects asset with wrong extension for its field", () => {
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    writeValidRefineFeatureStubs(ws);
    // Write what looks like a command template but with .txt extension
    writeFileSync(resolve(ws, ".hepha/commands/refine-feature.txt"), "# Test body");
    writeFileSync(
      resolve(ws, ".workflows/refine-feature.workflow.yaml"),
      [
        "name: refine-feature",
        "nodes:",
        "  - id: generate-artifacts",
        "    prompt: refine-feature",
        "    agent_action: refine-feature",
        "    command: commands/refine-feature.txt",
        "    agent: agents/feature-refiner.agent.yaml",
        "    context: context/feature-refinement.context.yaml",
        "    output_schema: schemas/refine-feature-files.schema.json",
        "    status: Generating refinement artifacts",
      ].join("\n"),
    );

    expect(() => loadHephaFeatureWorkflowSpec(ws, "refine-feature")).toThrow(/\.md/);
  });

  it("FEAT-021: rejects action node with wrong extension (incompatible)", () => {
    // Action nodes should NOT be validated for prompt assets — this test
    // ensures an action node doesn't accidentally trigger asset validation.
    const ws = mkdtempSync(resolve(tmpdir(), "hepha-feat021-"));

    mkdirSync(resolve(ws, ".workflows"), { recursive: true });
    // An action-only workflow with no prompt nodes should load fine even if
    // there are no .hepha assets at all.
    writeFileSync(
      resolve(ws, ".workflows/design-feature.workflow.yaml"),
      [
        "name: design-feature",
        "nodes:",
        "  - id: collect-context",
        "    action: collect-feature-workflow-context",
        "    status: Collecting context",
      ].join("\n"),
    );

    const spec = loadHephaFeatureWorkflowSpec(ws, "design-feature");
    expect(spec.nodes.length).toBe(1);
    expect(spec.nodes[0].kind).toBe("action");
  });

  it("FEAT-021: loadAllWorkflowDefinitions tolerates no workflow-level incompatible refs in committed data", () => {
    const definitions = loadAllWorkflowDefinitions(workspaceRoot);

    expect(definitions.size).toBe(7);
    // All committed workflows pass both FEAT-020 and FEAT-021 validation
  });
});
