import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadHephaFeatureWorkflowSpec,
  toWorkflowDefinitionSummary,
} from "../src/feature-workflow-spec.js";

function workspace(nodeLines: readonly string[], prefix = "hepha-agent-action-"): string {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  for (const directory of [
    ".workflows", ".hepha/commands", ".hepha/agents", ".hepha/context", ".hepha/schemas",
  ]) mkdirSync(resolve(root, directory), { recursive: true });
  writeFileSync(resolve(root, ".hepha/commands/refine-feature.md"), "# Refine Feature\n\nRefine the feature.\n");
  writeFileSync(resolve(root, ".hepha/agents/feature-refiner.agent.yaml"), [
    "name: feature-refiner", "responsibilities:", "  - refine features", "",
  ].join("\n"));
  writeFileSync(resolve(root, ".hepha/context/feature-refinement.context.yaml"), [
    "name: feature-refinement", "required:", "  - feature", "constraints:", "  - remain bounded", "",
  ].join("\n"));
  writeFileSync(resolve(root, ".hepha/schemas/refine-feature-files.schema.json"), "{\"type\":\"object\"}\n");
  writeFileSync(resolve(root, ".workflows/refine-feature.workflow.yaml"), [
    "name: refine-feature",
    "nodes:",
    ...nodeLines,
    "",
  ].join("\n"));
  return root;
}

const promptNode = (actionLines: readonly string[]) => [
  "  - id: generate-artifacts",
  "    kind: prompt",
  "    prompt: refine-feature",
  ...actionLines,
  "    command: commands/refine-feature.md",
  "    agent: agents/feature-refiner.agent.yaml",
  "    context: context/feature-refinement.context.yaml",
  "    output_schema: schemas/refine-feature-files.schema.json",
  "    status: Generating artifacts",
];

const actionMessages = {
  AGENT_ACTION_MISSING: "Launch-bearing workflow node must define top-level agent_action.",
  AGENT_ACTION_DUPLICATE: "Workflow agent_action must appear exactly once.",
  AGENT_ACTION_INVALID_LOCATION: "Workflow agent action must be one top-level kebab-case agent_action on a prompt node.",
  AGENT_ACTION_UNKNOWN: "Workflow agent_action is not registered.",
} as const;

function expectSafeRejection(
  run: () => unknown,
  code: keyof typeof actionMessages | "WORKFLOW_YAML_INVALID",
  sentinels: readonly string[],
): void {
  let rejection: unknown;
  try {
    run();
  } catch (error) {
    rejection = error;
  }
  expect(rejection).toBeInstanceOf(Error);
  const error = rejection as Error & { code?: unknown; cause?: unknown };
  const message = code === "WORKFLOW_YAML_INVALID"
    ? "Workflow YAML is invalid."
    : actionMessages[code];
  expect(error.code).toBe(code);
  expect(error.message).toBe(`${code}: ${message}`);
  expect(error.cause).toBeUndefined();
  const enumerableOwnStrings = Object.values(error).filter(
    (value): value is string => typeof value === "string",
  );
  for (const sentinel of sentinels) {
    expect(error.message).not.toContain(sentinel);
    expect(String(error.cause)).not.toContain(sentinel);
    expect(enumerableOwnStrings.join("\n")).not.toContain(sentinel);
  }
}

describe("workflow agent_action public loader contract", () => {
  it("loads and projects one exact registered action on a launch-bearing node", () => {
    const root = workspace(promptNode(["    agent_action: refine-feature"]));
    const spec = loadHephaFeatureWorkflowSpec(root, "refine-feature");
    expect(spec.nodes[0]?.agentAction).toBe("refine-feature");
    expect(toWorkflowDefinitionSummary(spec).nodes[0]?.agentAction).toBe("refine-feature");
  });

  it("loads registered prompt actions while deterministic non-launch nodes remain action-free", () => {
    const root = workspace([
      "  - id: collect-context",
      "    kind: action",
      "    action: collect-context",
      "    status: Collecting context",
      ...promptNode(["    agent_action: refine-feature"]),
    ]);
    const spec = loadHephaFeatureWorkflowSpec(root, "refine-feature");
    expect(spec.nodes[0]?.agentAction).toBeUndefined();
    expect(spec.nodes[1]?.agentAction).toBe("refine-feature");
    const summary = toWorkflowDefinitionSummary(spec);
    expect(summary.nodes[0]?.agentAction).toBeNull();
    expect(summary.nodes[1]?.agentAction).toBe("refine-feature");
  });

  it.each([
    ["missing", [], "AGENT_ACTION_MISSING"],
    ["null", ["    agent_action: null"], "AGENT_ACTION_INVALID_LOCATION"],
    ["primitive", ["    agent_action: 42"], "AGENT_ACTION_INVALID_LOCATION"],
    ["camel-case alias", ["    agentAction: refine-feature"], "AGENT_ACTION_INVALID_LOCATION"],
    ["nested", ["    metadata:", "      agent_action: refine-feature"], "AGENT_ACTION_INVALID_LOCATION"],
    ["unknown", ["    agent_action: unknown-action"], "AGENT_ACTION_UNKNOWN"],
    ["duplicate", ["    agent_action: refine-feature", "    agent_action: deep-dive"], "AGENT_ACTION_DUPLICATE"],
  ])("rejects a %s action identity before launch", (_name, actionLines, code) => {
    const root = workspace(promptNode(actionLines as readonly string[]));
    expect(() => loadHephaFeatureWorkflowSpec(root, "refine-feature")).toThrow(code as string);
  });

  it("rejects agent_action on deterministic non-launch nodes", () => {
    const root = workspace([
      "  - id: collect-context",
      "    kind: action",
      "    action: collect-context",
      "    agent_action: refine-feature",
      "    status: Collecting context",
    ]);
    expect(() => loadHephaFeatureWorkflowSpec(root, "refine-feature")).toThrow("AGENT_ACTION_INVALID_LOCATION");
  });

  it("rejects malformed YAML with one constant path- and source-safe diagnostic", () => {
    const pathSentinel = "PRIVATE_PATH_SENTINEL_91c7";
    const sourceSentinel = "PRIVATE_SOURCE_SENTINEL_6af2";
    const root = workspace([
      "  - id: generate-artifacts",
      "    kind: prompt",
      `    prompt: [${sourceSentinel}`,
    ], `${pathSentinel}-`);
    const workflowPath = resolve(root, ".workflows/refine-feature.workflow.yaml");
    expectSafeRejection(
      () => loadHephaFeatureWorkflowSpec(root, "refine-feature"),
      "WORKFLOW_YAML_INVALID",
      [pathSentinel, workflowPath, sourceSentinel, "Flow sequence", "line 6, column 1"],
    );
  });

  it.each([
    ["missing", [], "AGENT_ACTION_MISSING"],
    ["null", ["    agent_action: null"], "AGENT_ACTION_INVALID_LOCATION"],
    ["primitive", ["    agent_action: 42"], "AGENT_ACTION_INVALID_LOCATION"],
    ["camel-case alias", ["    agentAction: refine-feature"], "AGENT_ACTION_INVALID_LOCATION"],
    ["nested", ["    metadata:", "      agent_action: refine-feature"], "AGENT_ACTION_INVALID_LOCATION"],
    ["unknown", ["    agent_action: unknown-action"], "AGENT_ACTION_UNKNOWN"],
    ["duplicate", ["    agent_action: refine-feature", "    agent_action: deep-dive"], "AGENT_ACTION_DUPLICATE"],
    ["nested duplicate", ["    metadata:", "      agent_action: refine-feature", "      agent_action: deep-dive"], "AGENT_ACTION_DUPLICATE"],
  ] as const)("rejects a %s action identity with a constant safe diagnostic", (name, actionLines, code) => {
    const pathSentinel = `PRIVATE_PATH_SENTINEL_${name.replaceAll(" ", "_")}`;
    const nodeSentinel = `PRIVATE_NODE_SENTINEL_${name.replaceAll(" ", "_")}`;
    const root = workspace(promptNode([
      ...actionLines,
      `    private_note: ${nodeSentinel}`,
    ]), `${pathSentinel}-`);
    expectSafeRejection(
      () => loadHephaFeatureWorkflowSpec(root, "refine-feature"),
      code,
      [pathSentinel, resolve(root, ".workflows/refine-feature.workflow.yaml"), nodeSentinel],
    );
  });

  it("rejects non-launch action misuse without disclosing node or path content", () => {
    const pathSentinel = "PRIVATE_PATH_SENTINEL_non_launch";
    const nodeSentinel = "PRIVATE_NODE_SENTINEL_non_launch";
    const root = workspace([
      "  - id: collect-context",
      "    kind: action",
      "    action: collect-context",
      "    agent_action: refine-feature",
      `    private_note: ${nodeSentinel}`,
      "    status: Collecting context",
    ], `${pathSentinel}-`);
    expectSafeRejection(
      () => loadHephaFeatureWorkflowSpec(root, "refine-feature"),
      "AGENT_ACTION_INVALID_LOCATION",
      [pathSentinel, resolve(root, ".workflows/refine-feature.workflow.yaml"), nodeSentinel],
    );
  });
});
