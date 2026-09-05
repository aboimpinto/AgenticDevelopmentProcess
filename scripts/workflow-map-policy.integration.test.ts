import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectWorkflowMap } from "./workflow-map-policy.js";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptsRoot, "..");
const specification = readFileSync(resolve(scriptsRoot, "generic-workflow-map-policy.feature"), "utf8");

describe("Generic workflow map policy", () => {
  it("binds the executable policy to the Gherkin acceptance contract", () => {
    expect(specification).toContain("Every mapped transition has executable ownership and evidence");
    expect(specification).toContain("Declared command workflows cannot drift from their diagram index");
    expect(specification).toContain("Workflow changes require causal justification");
    expect(specification).toContain("Declarative workflow documentation is the behavioral authority");
  });

  it("declares documentation as normative and production methods as conforming implementations", () => {
    const map = readFileSync(resolve(workspaceRoot, "docs/architecture/workflow-control-flow-map.md"), "utf8");
    const refinement = readFileSync(resolve(workspaceRoot, "docs/architecture/refinement-deep-dive-loop.md"), "utf8");
    const modelBoundaries = readFileSync(resolve(workspaceRoot, "docs/architecture/model-agnostic-authority-boundaries.md"), "utf8");

    expect(map).toContain("The workflow specification is documentation-first");
    expect(map).toMatch(/implement and enforce the decisions; they\s+do not independently redefine them/);
    expect(map).toContain("Model-Agnostic Authority Boundaries");
    expect(refinement).toContain("Unresolved user-owned decisions produce `NEEDS_DEEP_DIVE`, never `FAILED`");
    expect(refinement).toMatch(/Completing one Deep-Dive round permits another refinement round/);
    expect(modelBoundaries).toMatch(/Creativity ends at an authority[\s>]+boundary/);
    expect(modelBoundaries).toContain("The existence of `output_schema` in workflow YAML currently proves that the");
    expect(modelBoundaries).toContain("Deep-Dive questions");
    expect(modelBoundaries).toContain("Design Feature");
    expect(modelBoundaries).toContain("Refine Feature");
    expect(modelBoundaries).toContain("Cross-model conformance requirements");
  });

  it("accepts the repository workflow map, owners, tests, command definitions, and justifications", () => {
    expect(inspectWorkflowMap(workspaceRoot)).toEqual([]);
  });
});
