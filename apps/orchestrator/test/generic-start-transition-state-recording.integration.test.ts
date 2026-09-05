import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-start-transition-state-recording.feature"),
  "utf8",
);
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const agentRuntimeSource = readFileSync(resolve(testRoot, "../src/bootstrap/agent-runtime-applications.ts"), "utf8");
const runCompositionSource = readFileSync(resolve(testRoot, "../src/bootstrap/implementation-run-applications.ts"), "utf8");

describe("generic start-transition state recording Gherkin integration", () => {
  it("keeps the executable contract generic and complete", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("routes prerequisite persistence through the extracted application service", () => {
    expect(orchestratorSource).toContain("createAgentRuntimeApplications({");
    expect(agentRuntimeSource).toContain("new StartTransitionStateRecorder");
    expect(runCompositionSource).toContain("dependencies.startTransitionState.record");
    expect(orchestratorSource).not.toContain("function recordStartTransitionState");
    expect(orchestratorSource).not.toContain("[FEAT-039]");
  });
});
