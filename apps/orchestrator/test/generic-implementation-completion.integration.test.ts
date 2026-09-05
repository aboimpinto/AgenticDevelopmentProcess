import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ImplementationCompletionApplication } from "../src/workflows/phases/implementation-completion-application.js";

const featurePath = fileURLToPath(new URL("./generic-implementation-completion.feature", import.meta.url));

describe("generic implementation completion Gherkin integration", () => {
  it("documents contract-driven completion without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Every declared task is resolved");
    expect(specification).toContain("Scenario: A legacy workflow requires final verification");
    expect(specification).toContain("Scenario: Durable phase state is not terminal");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("uses refreshed terminal state and does not run undeclared verification", async () => {
    const runFinalVerification = vi.fn();
    const application = new ImplementationCompletionApplication({
      allPhasesResolved: () => true, recordProgress: vi.fn(), refreshFeature: async () => ({ externalId: "ITEM", title: "Arbitrary" }) as any,
      runFinalVerification,
    });
    const summary = await application.complete({
      cardKey: "card", command: "start-implementing", feature: { externalId: "ITEM", title: "Old" } as any,
      project: {} as any, runId: "run", summaries: [], usesOrderedPhaseWorkflow: true,
    });
    expect(summary).toBe("All declared tasks in all contract phases are resolved.");
    expect(runFinalVerification).not.toHaveBeenCalled();
  });
});
