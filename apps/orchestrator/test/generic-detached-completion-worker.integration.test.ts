import { readFileSync } from "node:fs";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DetachedCompletionWorkerApplication } from "../src/workflows/phases/detached-completion-worker-application.js";

const featurePath = fileURLToPath(new URL("./generic-detached-completion-worker.feature", import.meta.url));

describe("generic detached completion worker Gherkin integration", () => {
  it("documents generic detached lifecycle behavior", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Detached Pi launches");
    expect(specification).toContain("Scenario: Detached Pi cannot launch");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("keeps an arbitrary launched worker running", async () => {
    const states: string[] = [];
    const application = new DetachedCompletionWorkerApplication({
      buildSessionFile: () => "/session", createId: () => "id", formatFailure: () => "failed",
      formatModelLabel: (key) => key, launch: async () => ({ pid: 7 }), recordAgentRun: async (entry) => { states.push(entry.status); },
      resolveModel: () => ({ model: "model", provider: "provider" }),
    });
    await application.launch({ ...inputForIntegration });
    expect(states).toEqual(["running", "running"]);
  });
});

const inputForIntegration = { agentName: "Any", agentRole: "complete-feature", cardKey: "card", feature: {} as any,
  plan: handoffPlan("model"), phaseNumber: null, phaseTitle: null, project: { id: "project", rootPath: "/project" } as any,
  prompt: "prompt", runId: "run", step: "Completing" };
