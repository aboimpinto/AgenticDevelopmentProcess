import { readFileSync } from "node:fs";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HumanReviewFindingsPhaseApplication } from "../src/workflows/phases/human-review-findings-phase-application.js";

const featurePath = fileURLToPath(new URL("./generic-human-review-findings-phase.feature", import.meta.url));

describe("generic human review findings phase Gherkin integration", () => {
  it("documents generic durable findings handoff behavior", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Findings are ready for user acceptance");
    expect(specification).toContain("Scenario: The worker leaves no valid handoff state");
    expect(specification).toContain("Scenario: Durable finding evidence is incomplete");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("executes an arbitrary findings phase through the production application", async () => {
    const phase = { number: 63, title: "Random review", fileName: "phase-63-random.md" } as any;
    const application = new HumanReviewFindingsPhaseApplication({
      buildContext: () => "context", buildPrompt: () => "prompt", findHumanReviewPhase: () => phase,
      formatPhase: (item) => `Phase ${item.number}`, isAwaitingUser: () => true, isResolved: () => false,
      recordProgress: async () => undefined, refreshFeature: async (_project, _id, fallback) => fallback,
      runWorker: async () => "READY_FOR_USER", scanProject: async () => [],
      summarizeEvidence: () => ({ message: "ok", ok: true }), summarizeOutput: (output) => output,
    });
    await expect(application.execute({
      branchName: "feat/arbitrary", cardKey: "card", command: "continue-implementing",
      feature: { externalId: "ITEM" } as any, plan: handoffPlan("model"), phase, project: {} as any, runId: "run",
    })).resolves.toContain("READY_FOR_USER");
  });
});
