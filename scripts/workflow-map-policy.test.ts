import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type WorkflowChangeLog,
  type WorkflowTransitionRegistry,
  validateWorkflowMap,
} from "./workflow-map-policy.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workflow map policy", () => {
  it("accepts a mapped transition with a real owner, unit test, Gherkin scenario, YAML node, and justification", () => {
    const fixture = createFixture();
    expect(validateWorkflowMap(fixture.root, fixture.registry, fixture.map, fixture.log)).toEqual([]);
  });

  it("accepts an exported function as an authoritative transition owner", () => {
    const fixture = createFixture();
    write(fixture.root, "src/example-function.ts", "export function validateExample(): void {}");
    fixture.registry.transitions[0] = {
      ...fixture.registry.transitions[0],
      ownerPath: "src/example-function.ts",
      ownerSymbol: "validateExample",
    };

    expect(validateWorkflowMap(fixture.root, fixture.registry, fixture.map, fixture.log)).toEqual([]);
  });

  it("reports diagram drift, unknown edges, duplicate IDs, and missing production symbols", () => {
    const fixture = createFixture();
    fixture.registry.transitions.push({ ...fixture.registry.transitions[0] });
    fixture.registry.transitions[0].ownerSymbol = "ExampleApplication.missing";
    fixture.map = "```mermaid\nflowchart LR\nA -->|WF-UNKNOWN-EDGE| B\n```";

    const issues = validateWorkflowMap(fixture.root, fixture.registry, fixture.map, fixture.log);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate_id", subject: "WF-EXAMPLE-NEXT" }),
      expect.objectContaining({ code: "map_missing", subject: "WF-EXAMPLE-NEXT" }),
      expect.objectContaining({ code: "owner_missing", subject: "WF-EXAMPLE-NEXT" }),
      expect.objectContaining({ code: "unknown_transition", subject: "WF-UNKNOWN-EDGE" }),
    ]));
  });

  it("reports declared workflow node drift from YAML", () => {
    const fixture = createFixture();
    fixture.registry.workflowDefinitions[0].nodes = ["different-node"];

    expect(validateWorkflowMap(fixture.root, fixture.registry, fixture.map, fixture.log)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "definition_drift", subject: "example-command" })]),
    );
  });

  it("requires causal answers, known transitions, existing files, unit evidence, and Gherkin evidence", () => {
    const fixture = createFixture();
    fixture.log.records[0] = {
      ...fixture.log.records[0],
      whyHappened: "",
      transitionIds: ["WF-NOT-REGISTERED"],
      codeChanges: ["missing.ts"],
      testsAdded: ["evidence.txt"],
    };

    const issues = validateWorkflowMap(fixture.root, fixture.registry, fixture.map, fixture.log);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "justification_missing", message: expect.stringContaining("whyHappened") }),
      expect.objectContaining({ code: "unknown_transition", message: expect.stringContaining("WF-NOT-REGISTERED") }),
      expect.objectContaining({ code: "evidence_missing", message: expect.stringContaining("missing.ts") }),
      expect.objectContaining({ code: "evidence_missing", message: expect.stringContaining("unit-test") }),
      expect.objectContaining({ code: "evidence_missing", message: expect.stringContaining("Gherkin") }),
    ]));
  });
});

function createFixture(): {
  log: WorkflowChangeLog;
  map: string;
  registry: WorkflowTransitionRegistry;
  root: string;
} {
  const root = mkdtempSync(join(tmpdir(), "hepha-workflow-map-"));
  temporaryRoots.push(root);
  write(root, "src/example-application.ts", "export class ExampleApplication { execute(): void {} }");
  write(root, "test/example.test.ts", "// unit evidence");
  write(root, "test/example.feature", "Feature: Workflow evidence");
  write(root, "test/example.integration.test.ts", "// integration evidence");
  write(root, ".workflows/example.workflow.yaml", [
    "name: example-command",
    "nodes:",
    "  - id: first-node",
    "    action: example",
  ].join("\n"));

  const registry: WorkflowTransitionRegistry = {
    version: 1,
    workflowDefinitions: [{
      command: "example-command",
      definitionPath: ".workflows/example.workflow.yaml",
      nodes: ["first-node"],
      ownerPath: "src/example-application.ts",
      ownerSymbol: "ExampleApplication.execute",
      rationale: "Own the complete example command sequence.",
      unitTestPaths: ["test/example.test.ts"],
      gherkinPaths: ["test/example.feature"],
    }],
    transitions: [{
      id: "WF-EXAMPLE-NEXT",
      scope: "example scope",
      from: "durable example input",
      trigger: "example condition is true",
      to: "durable example output",
      ownerPath: "src/example-application.ts",
      ownerSymbol: "ExampleApplication.execute",
      rationale: "Advance the example only when its condition is satisfied.",
      unitTestPaths: ["test/example.test.ts"],
      gherkinPaths: ["test/example.feature"],
    }],
  };
  const log: WorkflowChangeLog = {
    version: 1,
    records: [{
      id: "WJ-2026-001",
      date: "2026-07-22",
      summary: "Map the example workflow transition",
      transitionIds: ["WF-EXAMPLE-NEXT"],
      whyHappened: "The example transition previously had no diagnostic map.",
      causalChain: "Unmapped behavior led from an input to an opaque decision owner.",
      testGap: "No policy linked the owner unit test to its Gherkin route.",
      missingDecision: "The repository lacked one authoritative transition registry.",
      codeChanges: ["src/example-application.ts"],
      testsAdded: ["test/example.test.ts", "test/example.feature", "test/example.integration.test.ts"],
    }],
  };
  const map = [
    "| `example-command` | `first-node` | `ExampleApplication.execute` |",
    "```mermaid",
    "flowchart LR",
    "  A -->|WF-EXAMPLE-NEXT| B",
    "```",
  ].join("\n");
  return { root, registry, log, map };
}

function write(root: string, path: string, source: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
}
