import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AutonomousImplementationWorkflowApplication } from "../src/workflows/implementation/autonomous-implementation-workflow-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-autonomous-implementation-workflow.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-worker-applications.ts", import.meta.url)), "utf8");

describe("generic autonomous implementation workflow Gherkin integration", () => {
  it("specifies reusable phase sequencing without feature-specific identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(8);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|phase-[a-z0-9-]+\.md/i);
  });

  it("keeps decisions in injected phase applications", () => {
    expect(AutonomousImplementationWorkflowApplication).toBeTypeOf("function");
    for (const seam of ["queue.prepare", "entry.prepare", "planning.prepare", "review.dispatch", "exit.execute", "failure.record", "noProgressCircuit.observe"]) {
      expect(source).toContain(seam);
    }
  });

  it("leaves root orchestration as composition and delegation", () => {
    expect(composition).toContain("new AutonomousImplementationWorkflowApplication");
    expect(root).toContain("autonomousImplementationWorkflowApplication.execute(input)");
    expect(root).not.toContain("function runAutonomousImplementationWorkflow");
  });
});
