import { readFileSync } from "node:fs";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ImplementationWorkerApplication } from "../src/workflows/phases/implementation-worker-application.js";

const featurePath = fileURLToPath(new URL("./generic-implementation-worker-application.feature", import.meta.url));

describe("generic implementation worker application Gherkin integration", () => {
  it("documents generic worker lifecycle behavior", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A worker completes");
    expect(specification).toContain("Scenario: A declared skill contract blocks launch");
    expect(specification).toContain("Scenario: A worker is cancelled");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("runs an arbitrary worker through the production lifecycle", async () => {
    const states: string[] = [];
    const application = new ImplementationWorkerApplication({
      appendAudit: (entry) => { states.push(entry.status); }, appendProfile: (value) => value,
      assertRunActive: () => undefined, buildSessionFile: () => "/session", createId: () => "id",
      formatFailure: () => "failed", formatModelLabel: (key) => key, isCancelled: () => false,
      recordAgentRun: async (entry) => { states.push(entry.status); }, resolveModel: () => ({ model: "model", provider: "provider" }),
      runPrompt: async () => "COMPLETE", summarizeOutput: (value) => value, validateActionPlan: () => true, validateNodeSkill: () => ({ status: "valid" }),
    });
    await expect(application.execute({ ...inputForIntegration })).resolves.toBe("COMPLETE");
    expect(states).toEqual(["running", "running", "completed", "completed"]);
  });
});

const inputForIntegration = { agentAction: "continue-implementing", agentName: "Any", agentRole: "implementation", cardKey: "card", feature: {} as any,
  plan: handoffPlan("model"), phaseNumber: 88, phaseTitle: "Random", project: { id: "project", rootPath: "/project" } as any,
  prompt: "prompt", runId: "run", step: "Executing" };
