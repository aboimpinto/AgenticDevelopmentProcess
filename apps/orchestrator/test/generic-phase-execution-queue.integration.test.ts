import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectPhaseExecutionQueue } from "../src/workflows/phases/phase-execution-queue-policy.js";

const featurePath = fileURLToPath(new URL("./generic-phase-execution-queue.feature", import.meta.url));

describe("generic phase execution queue Gherkin integration", () => {
  it("selects arbitrary items solely from supplied contract order and facts", () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const candidates = [
      { phase: { number: 88, title: "Wild research" }, resolved: false },
      { phase: { number: 1, title: "Completely unrelated" }, resolved: true },
      { phase: { number: 34, title: "Random evidence" }, resolved: true, forcedRecovery: true },
    ].map((candidate) => ({
      forcedRecovery: false, gitCheckpointRequired: false, gitCheckpointSatisfied: true,
      missingQualityGateCount: 0, planningArtifactMissing: false, ...candidate,
    }));
    expect(selectPhaseExecutionQueue({
      firstMissingQualityGatePhaseNumber: null,
      humanReviewPending: false,
      phases: candidates,
      usesOrderedTaskWorkflow: true,
    })).toEqual({ kind: "execute_phases", phases: [candidates[0]!.phase, candidates[2]!.phase] });
  });
});
