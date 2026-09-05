import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PhaseGitCheckpointApplication } from "../src/workflows/phases/phase-git-checkpoint-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-git-checkpoint-application.feature", import.meta.url));

describe("generic phase git checkpoint application Gherkin integration", () => {
  it("documents only generic publication behavior", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Commit and push complete after the phase exit gate");
    expect(specification).toContain("Scenario: Git publication is temporarily unavailable");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("preserves phase completion when the production application receives a git failure", async () => {
    const progress: unknown[] = [];
    const application = new PhaseGitCheckpointApplication({
      attempt: () => ({ kind: "checkpoint_pending", reason: "network unavailable" }),
      recordProgress: async (entry) => { progress.push(entry); },
    });

    const result = await application.execute({
      branchName: "feat/arbitrary", cardKey: "card", command: "continue-implementing",
      feature: { externalId: "ITEM", title: "Arbitrary work" } as any,
      phase: { number: 41, title: "Random publication", documentPath: "/memory/phase-41-random.md" } as any,
      project: { rootPath: "/project", memoryBankPath: "/memory" } as any, runId: "run",
    });

    expect(result.kind).toBe("checkpoint_pending");
    expect(progress).toEqual([expect.objectContaining({ status: "checkpoint" })]);
  });
});
