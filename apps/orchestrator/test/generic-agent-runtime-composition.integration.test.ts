import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-agent-runtime-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/agent-runtime-applications.ts", import.meta.url)), "utf8");

describe("generic agent runtime composition Gherkin integration", () => {
  it("specifies identity-blind one-shot, phase-worker, and detached execution", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds every runtime constructor to one root factory call", () => {
    expect(root).toContain("createAgentRuntimeApplications({");
    expect(root).not.toContain("new ImplementationWorkerApplication");
    expect(root).not.toContain("new AgentTaskRuntime");
    expect(composition).toContain("new RoutingPolicyService");
    expect(composition).toContain("new RoutingActionResolver");
    expect(composition).toContain("createPiOneShotPromptRunner");
    expect(composition).toContain("new ImplementationWorkerApplication");
    expect(composition).toContain("createPlanBoundDetachedPromptLauncher");
    expect(composition).toContain("new AgentTaskRuntime");
  });
});
