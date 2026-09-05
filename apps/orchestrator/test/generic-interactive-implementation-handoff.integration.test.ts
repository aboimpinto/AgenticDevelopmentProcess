import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { InteractiveImplementationHandoffApplication } from "../src/workflows/implementation/interactive-implementation-handoff-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-interactive-implementation-handoff.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/interactive-implementation-handoff-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const runComposition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");

describe("generic interactive implementation handoff Gherkin integration", () => {
  it("specifies the handoff without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns progress recording before worker execution", () => {
    expect(InteractiveImplementationHandoffApplication).toBeTypeOf("function");
    expect(source.indexOf("recordFeatureProgress")).toBeLessThan(source.indexOf("worker.execute"));
    expect(source).toContain('agentRole: "implementation-handoff"');
  });

  it("leaves only root composition and run-factory delegation", () => {
    expect(root).toContain("interactiveHandoff: interactiveImplementationHandoffApplication");
    expect(runComposition).toContain("dependencies.interactiveHandoff.execute(input)");
    expect(root).not.toContain("function runInteractiveImplementationHandoff");
  });
});
