import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { parseWorkflowYamlDocument } from "../src/workflow-agent-action.js";

describe("workflow YAML alias compatibility", () => {
  it("preserves ordinary anchors and aliases", () => {
    expect(parseWorkflowYamlDocument(
      "defaults: &defaults { label: inspect }\nnode: *defaults\n", "workflow.yaml",
    )).toEqual({ defaults: { label: "inspect" }, node: { label: "inspect" } });
  });

  it("rejects excessive nested alias expansion through the workflow parser", () => {
    const source = [
      "a: &a [leaf, leaf, leaf, leaf, leaf, leaf, leaf, leaf, leaf, leaf]",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
    ].join("\n");
    expect(() => parseWorkflowYamlDocument(source, "workflow.yaml"))
      .toThrow("WORKFLOW_YAML_INVALID");
  });

  it("bounds recursive YAML 1.1 merge aliases before exhausting the call stack", () => {
    // The source directive enables merge keys under the production parser's
    // existing defaults; no new merge option or product behavior is introduced.
    const source = "%YAML 1.1\n---\nbase: &base\n  <<: *base\n";
    const document = parseDocument(source, { uniqueKeys: true });
    expect(document.errors).toEqual([]);
    // Observe the dependency boundary because the workflow parser deliberately
    // translates all conversion errors to the same stable public error code.
    expect(() => document.toJS()).toThrow("Excessive alias count");
    expect(() => parseWorkflowYamlDocument(source, "workflow.yaml"))
      .toThrow("WORKFLOW_YAML_INVALID");
  });
});
